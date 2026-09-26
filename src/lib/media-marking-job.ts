import fs from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import {
  BACKUP_DIR,
  MASTER_DIR,
  diskSpace,
  markedWhere,
  mediaDir,
  pendingWhere,
  processPhoto,
  type PhotoDoc,
} from './media-marking'

/**
 * Фоновая разметка уже загруженных фотографий: знак «Н15» получают снимки,
 * которые лежат в хранилище без него (см. src/lib/media-marking.ts).
 *
 * Работает порциями и в фоне: старт приложения её не ждёт, запросы посетителей
 * она не держит — между фото пауза, между проходами длинная пауза. Повторный
 * запуск безопасен: размеченное фото больше не берётся (в документе стоит
 * версия знака), поэтому задача продолжает с места остановки и после
 * перезапуска контейнера, и после падения.
 *
 * Выключается переменной окружения WATERMARK_BACKFILL=off (например, пока
 * заказчик смотрит вид знака на своих фото) — при следующем старте задача
 * просто не начнётся.
 *
 * Перед очередью задача один раз за запуск обходит фото, у которых нет чистого
 * кадра, — их разметку не починить из очереди (см. sweepWithoutMaster).
 */

/** Сколько фото берём за раз: одна порция — минута-две работы sharp */
const BATCH = 5
/**
 * Страховка от общей беды (битые файлы, кончилось место, отвалился sharp):
 * столько фото подряд могут не поддаться, прежде чем проход остановится. Иначе
 * десяток нечитаемых кадров в начале списка держал бы разметку всего каталога.
 */
const MAX_FAIL = 20
/** Пауза между фото и между порциями: процессор нужен и сайту */
const STEP_PAUSE = 300
const BATCH_PAUSE = 2000
/** Пауза между проходами, когда ждущих фото нет */
const IDLE_PAUSE = 10 * 60 * 1000
/** Пауза перед первым проходом: приложение должно подняться и ответить людям */
const START_PAUSE = 15 * 1000
/**
 * Сколько места должно остаться на диске. Чистые кадры занимают столько же,
 * сколько сами фото (в хранилище лежит и оригинал, и мастер), на маленьком VPS
 * это заметная доля диска — при нехватке места разметку лучше не начинать.
 */
const MIN_FREE_MB = 512
/** Сколько документов за раз просматривает обход прошлой разметки (см. ниже) */
const SWEEP_BATCH = 50

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function disabled(): boolean {
  return process.env.WATERMARK_BACKFILL === 'off'
}

/** Хватает ли места под чистые кадры: они занимают столько же, сколько сами фото */
async function enoughSpace(payload: Payload): Promise<boolean> {
  const space = await diskSpace(mediaDir(payload))
  if (space.freeMb && space.freeMb < MIN_FREE_MB) {
    console.error(
      `media-marking: на диске ${space.freeMb} МБ — разметка ждёт места (нужно ${MIN_FREE_MB} МБ под чистые кадры)`,
    )
    return false
  }
  return true
}

/**
 * Запустить фоновую разметку. Вызывается из payload.config.ts (onInit), не
 * ждёт результата — старт приложения не зависит от разметки.
 */
export function startWatermarkBackfill(payload: Payload): void {
  if (disabled()) return
  // При сборке приложения (next build) Payload тоже инициализируется: файлы
  // хранилища в этот момент не трогаем
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  void run(payload).catch((e) => {
    console.error('media-marking: фоновая разметка остановлена', e)
  })
}

async function run(payload: Payload): Promise<void> {
  await sleep(START_PAUSE)
  // Сначала — фото без чистого кадра: очередь их не берёт, а разметить их можно
  // только из копии прежней разметки (см. ниже)
  try {
    await sweepWithoutMaster(payload)
  } catch (e) {
    console.error('media-marking: обход прошлой разметки не удался', e)
  }
  for (;;) {
    if (disabled()) return
    try {
      await pass(payload)
    } catch (e) {
      console.error('media-marking: проход разметки не удался', e)
    }
    await sleep(IDLE_PAUSE)
  }
}

/** Есть ли файл в хранилище (мастер или копия прежней разметки) */
async function stored(dir: string, folder: string, file: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, folder, file))
    return true
  } catch {
    return false
  }
}

/**
 * Обход фото без чистого кадра — по разу за запуск, до очереди.
 *
 * У фото, размеченного прошлой версией знака, мастера может не быть: раньше знак
 * ложился только в сам оригинал, а Payload собирает размеры из оригинала
 * кадрированием — в размерах знака не было (см. src/lib/media-marking.ts).
 * Ждущими такие фото не считаются (очередь смотрит на версию знака в поле wm),
 * поэтому сами они не починятся никогда. Чистый кадр у них лежит в копии прошлой
 * разметки (media/.wm-backup) — из неё фото и размечается заново, вместе с
 * размерами, как в режиме repair маршрута /api/watermark. После разметки в
 * закрытой папке появляется мастер, и фото этот обход больше не берёт.
 *
 * Фото, у которого нет ни мастера, ни копии, не трогаем: знак пришлось бы
 * печатать поверх знака, а снять его нечем. Такие фото видны в отчёте
 * /api/watermark: мастеров в хранилище меньше, чем размеченных фото.
 */
async function sweepWithoutMaster(payload: Payload): Promise<void> {
  if (!(await enoughSpace(payload))) return
  const dir = mediaDir(payload)
  const failed = new Set<number>()
  let from = 0
  let repaired = 0

  for (;;) {
    const found = await payload.find({
      collection: 'media',
      where: { and: [markedWhere(), { id: { greater_than: from } }] },
      limit: SWEEP_BATCH,
      // По возрастанию id — так обход идёт вперёд без пропусков и повторов
      sort: 'id',
      overrideAccess: true,
      depth: 0,
    })
    const docs = found.docs as unknown as PhotoDoc[]
    if (!docs.length) break
    from = docs[docs.length - 1].id

    for (const doc of docs) {
      const file = doc.filename ? String(doc.filename) : ''
      if (!file) continue
      // Мастер на месте — фото размечено из чистого кадра, оно ни при чём
      if (await stored(dir, MASTER_DIR, file)) continue
      // Мастера нет, а копия прежней разметки есть — из неё и размечем заново
      if (!(await stored(dir, BACKUP_DIR, file))) continue

      const result = await processPhoto({ payload, doc, legacy: true, rebuild: true })
      if (result.status === 'marked') {
        repaired++
      } else {
        failed.add(doc.id)
        console.error('media-marking: фото без мастера не размечено', file, result.status, result.reason || '')
      }
      await sleep(STEP_PAUSE)
    }
    // Отказов слишком много подряд — беда общая, перебирать весь каталог незачем
    if (failed.size >= MAX_FAIL || disabled()) break
  }

  if (repaired) console.log(`media-marking: размечено заново из копии прежней разметки — ${repaired}`)
  if (failed.size) console.error(`media-marking: осталось без разметки без мастера — ${failed.size}`)
}

/** Один проход: размечаем всё, что ждёт знака, неудачное в этом проходе не трогаем */
async function pass(payload: Payload): Promise<void> {
  if (!(await enoughSpace(payload))) return

  const failed = new Set<number>()
  let marked = 0
  for (;;) {
    const found = await payload.find({
      collection: 'media',
      where: failed.size ? { and: [pendingWhere(), { id: { not_in: [...failed] } }] } : pendingWhere(),
      limit: BATCH,
      // Свежие снимки — первыми: их смотрят в первую очередь (объект только
      // завели, ссылку уже отправили), а старый каталог подождёт следующего
      // прохода. Новые загрузки знак получают сразу, минуя эту задачу
      sort: '-id',
      overrideAccess: true,
      depth: 0,
    })
    const docs = found.docs as unknown as PhotoDoc[]
    if (!docs.length) break

    for (const doc of docs) {
      const result = await processPhoto({ payload, doc, legacy: true })
      if (result.status === 'marked') {
        marked++
      } else if (result.status === 'avatar' || result.status === 'missing' || result.status === 'unreadable') {
        failed.add(doc.id)
        console.error('media-marking: фото пропущено', result.file, result.status, result.reason || '')
      } else {
        failed.add(doc.id)
        console.error('media-marking: фото не размечено', result.file, result.status, result.reason || '')
      }
      await sleep(STEP_PAUSE)
    }
    // Слишком много отказов подряд — скорее всего беда общая (место на диске,
    // битые кадры), и перебирать так весь каталог незачем
    if (failed.size >= MAX_FAIL || disabled()) break
    await sleep(BATCH_PAUSE)
  }

  if (marked) console.log(`media-marking: размечено фото — ${marked}`)
  if (failed.size) console.error(`media-marking: не размечено фото — ${failed.size} (повторим в следующий раз)`)
}

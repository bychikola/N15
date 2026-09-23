import type { Payload } from 'payload'

import { diskSpace, mediaDir, pendingWhere, processPhoto, type PhotoDoc } from './media-marking'

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function disabled(): boolean {
  return process.env.WATERMARK_BACKFILL === 'off'
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

/** Один проход: размечаем всё, что ждёт знака, неудачное в этом проходе не трогаем */
async function pass(payload: Payload): Promise<void> {
  const space = await diskSpace(mediaDir(payload))
  if (space.freeMb && space.freeMb < MIN_FREE_MB) {
    console.error(
      `media-marking: на диске ${space.freeMb} МБ — разметка ждёт места (нужно ${MIN_FREE_MB} МБ под чистые кадры)`,
    )
    return
  }

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

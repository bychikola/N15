import type { Payload } from 'payload'

import { OBJECT_SLUG_BACKFILL, buildObjectSlug, objectSlugSuffix, type ObjectSlugSource } from './object-slug'

/**
 * Перенос адресов объектов на человекочитаемые.
 *
 * У карточек, заведённых до появления публичных адресов, slug служебный —
 * «object-<uuid>», а на часть старых записей его нет вовсе. Задача один раз
 * при старте переписывает такие адреса в формат
 * «kvartira-vesennyaya-40m2-a1b2c3» (см. src/lib/object-slug.ts) — тем же
 * сборщиком, что и новые карточки. Работает порциями в фоне, старт приложения
 * её не ждёт; повторный запуск безопасен: адреса нового формата задача не
 * трогает, поэтому после перезапуска контейнера она просто не находит работы.
 *
 * Смену slug при правке документ запрещает (хук в Objects.ts стирает поле),
 * поэтому задача шлёт контекст OBJECT_SLUG_BACKFILL — по нему хук понимает,
 * что это перенос, а не форма. Никакой маршрут этот контекст не выставляет.
 *
 * Выключается переменной окружения OBJECT_SLUG_BACKFILL=off.
 */

/** Старый служебный адрес: object-<uuid> */
const LEGACY_SLUG = /^object-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Сколько карточек берём за раз */
const BATCH = 25
/** Пауза между карточками: база нужна и сайту */
const STEP_PAUSE = 120
/** Пауза перед первым проходом: приложение должно подняться и ответить людям */
const START_PAUSE = 20 * 1000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function disabled(): boolean {
  return process.env.OBJECT_SLUG_BACKFILL === 'off'
}

/**
 * Запустить перенос адресов. Вызывается из payload.config.ts (onInit), не ждёт
 * результата — старт приложения не зависит от переименования.
 */
export function startObjectSlugBackfill(payload: Payload): void {
  if (disabled()) return
  // При сборке приложения (next build) Payload тоже инициализируется: базу
  // в этот момент не трогаем
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  void run(payload).catch((e) => {
    console.error('object-slug: перенос адресов остановлен', e)
  })
}

async function run(payload: Payload): Promise<void> {
  await sleep(START_PAUSE)
  const renamed = await pass(payload)
  if (renamed > 0) {
    console.log(`object-slug: адреса объектов переписаны — ${renamed}`)
  }
}

/** Один проход: все карточки со старым или пустым адресом, по возрастанию id */
async function pass(payload: Payload): Promise<number> {
  let renamed = 0
  let from = 0

  for (;;) {
    if (disabled()) return renamed
    const found = await payload.find({
      collection: 'objects',
      where: {
        and: [
          { id: { greater_than: from } },
          { or: [{ slug: { exists: false } }, { slug: { like: 'object-' } }] },
        ],
      },
      limit: BATCH,
      // По возрастанию id — так обход идёт вперёд без пропусков и повторов
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    const docs = found.docs as unknown as { id: number; slug?: string | null }[]
    if (!docs.length) break
    from = docs[docs.length - 1].id

    for (const doc of docs) {
      const legacy = typeof doc.slug !== 'string' || LEGACY_SLUG.test(doc.slug)
      if (!legacy) continue
      const full = (await payload
        .findByID({ collection: 'objects', id: doc.id, depth: 0, overrideAccess: true })
        .catch(() => null)) as unknown as Record<string, unknown> | null
      if (!full) continue
      const candidate = await freeSlug(payload, full as unknown as ObjectSlugSource)
      await payload
        .update({
          collection: 'objects',
          id: doc.id,
          data: { slug: candidate },
          depth: 0,
          overrideAccess: true,
          context: { [OBJECT_SLUG_BACKFILL]: true },
        })
        .catch((e) => {
          console.error(`object-slug: адрес объекта #${doc.id} не изменён`, e)
        })
      renamed++
      await sleep(STEP_PAUSE)
    }
  }
  return renamed
}

/** Свободный адрес для карточки: как при создании, только с проверкой занятости */
async function freeSlug(payload: Payload, source: ObjectSlugSource): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = buildObjectSlug(source, objectSlugSuffix())
    const { docs } = await payload.find({
      collection: 'objects',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!docs.length) return candidate
  }
  return `obekt-${crypto.randomUUID()}`
}

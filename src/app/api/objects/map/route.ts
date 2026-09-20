import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'
import { geocodeAddressCached } from '@/lib/geocode-server'
import { sanitizeObjectsWhere, type ObjectsWhere } from '@/lib/objects-where'
import { mapGeocodeText, mapPointOf, validCoordinates, type ObjectMapPoint } from '@/lib/object-map-point'

/**
 * Точки объектов для карты каталога (режим «На карте», см. CatalogMap).
 *
 * Каталог отдаёт сюда те же условия, что и списку (buildWhere), а маршрут
 * возвращает готовые точки: координаты объекта, а объектам без координат
 * точку определяет геокодер по адресу (ключ YANDEX_GEOCODER_API_KEY живёт
 * на сервере). Так на карте оказывается вся выдача, а не только объекты
 * с отмеченной точкой.
 *
 * Условия из запроса проверяются по белому списку полей (objects-where.ts):
 * читаем локальным API с overrideAccess, и без проверки маршрут открыл бы
 * закрытые поля в обход полевой проверки коллекции.
 *
 * Картинка, цена и адрес объекта едут вместе с точкой — из них собирается
 * облачко метки, отдельный запрос за карточкой не нужен.
 */

// Лимит как у геокодера: карта ходит сюда при каждом изменении фильтров,
// человеку этого хватает с запасом, а перебор адресов через чужой сайт
// упирается в лимит (сам геокодер при этом ещё и кешируется на сервере)
const MAP_RATE_MAX = 60
const MAP_RATE_WINDOW_MS = 60_000

/** Потолок точек в ответе: выдача каталога ограничена, ответ не должен расти */
const MAX_POINTS = 300

/**
 * Сколько ждём геокодер внутри запроса. Адресов в выдаче десятки, а
 * отмеченные точки приходят сразу — дольше держать пользователя на
 * загрузке нельзя. Недождавшиеся адреса считаются дальше в фоне и
 * попадают в кеш: клиент повторит запрос и увидит их (см. pending).
 */
const GEOCODE_BUDGET_MS = 6_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function GET(req: NextRequest) {
  if (rateLimited(`objects-map:${clientIp(req.headers)}`, MAP_RATE_MAX, MAP_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Условия выдачи: пусто — вся опубликованная база (карта без фильтров)
  let clientWhere: ObjectsWhere = {}
  const rawWhere = req.nextUrl.searchParams.get('where')
  if (rawWhere) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawWhere)
    } catch {
      return NextResponse.json({ error: 'invalid where' }, { status: 400 })
    }
    const sanitized = sanitizeObjectsWhere(parsed)
    if (!sanitized) {
      return NextResponse.json({ error: 'invalid where' }, { status: 400 })
    }
    clientWhere = sanitized
  }

  try {
    const payload = await getPayload({ config })
    // Статус ставим сами: черновики и архив на сайте не показываются
    // (см. buildWhere в каталоге), и карта не должна выдавать их точками
    const published = { status: { equals: 'published' } }
    const where = (Object.keys(clientWhere).length ? { and: [published, clientWhere] } : published) as Where
    const { docs, totalDocs } = await payload.find({
      collection: 'objects',
      where,
      limit: MAX_POINTS,
      depth: 1,
      sort: '-createdAt',
      overrideAccess: true,
    })

    const points: ObjectMapPoint[] = []
    const withoutCoords: { doc: Record<string, unknown>; address: string }[] = []

    for (const rawDoc of docs) {
      const doc = rawDoc as unknown as Record<string, unknown>
      const coords = validCoordinates(doc.coordinates)
      if (coords) {
        const point = mapPointOf(doc, coords, false)
        if (point) points.push(point)
        continue
      }
      const address = mapGeocodeText(doc)
      if (address) withoutCoords.push({ doc, address })
    }

    // Адреса определяем параллельно: одновременность запросов к Яндексу
    // ограничивает сам геокодер (geocode-server)
    let pending = withoutCoords.length
    if (withoutCoords.length) {
      const geocoding = Promise.all(
        withoutCoords.map(async ({ doc, address }) => {
          try {
            const coords = await geocodeAddressCached(address)
            if (!coords) return
            const point = mapPointOf(doc, coords, true)
            if (point) points.push(point)
          } finally {
            pending--
          }
        }),
      )
      await Promise.race([geocoding, sleep(GEOCODE_BUDGET_MS)])
      // Не дождались бюджета — не бросаем работу: запросы продолжаются в фоне
      // и оседают в кеше, поэтому следующий вызов карты отдаст точки сразу
      void geocoding.catch(() => undefined)
    }

    return NextResponse.json({
      points: [...points].sort((a, b) => a.id - b.id),
      /** Сколько объектов нашлось по условиям (может быть больше точек) */
      total: totalDocs,
      /** Сколько точек в ответе */
      placed: points.length,
      /** Сколько адресов ещё определяется (клиент повторит запрос) */
      pending: Math.max(pending, 0),
      /** Выдача больше потолка точек — на карте показаны первые MAX_POINTS */
      truncated: totalDocs > docs.length,
    })
  } catch (error) {
    console.error('Objects map error:', error)
    return NextResponse.json({ error: 'map failed' }, { status: 500 })
  }
}

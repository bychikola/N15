import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'
import { geocodeAddressCached } from '@/lib/geocode-server'
import { sanitizeObjectsWhere, type ObjectsWhere } from '@/lib/objects-where'
import { mapAreasOf, mapGeocodeText, validCoordinates, type FoundObject } from '@/lib/object-map-point'
import { approximatePoint } from '@/lib/object-approx-point'

/**
 * Области объектов для публичной карты каталога (режим «На карте», см.
 * CatalogMap).
 *
 * Каталог отдаёт сюда те же условия, что и списку (buildWhere), а маршрут
 * возвращает области: объекты без координат получают точку от геокодера по
 * адресу (ключ YANDEX_GEOCODER_API_KEY живёт на сервере), после чего и
 * отмеченные, и найденные точки превращаются в примерную область
 * (src/lib/object-approx-point.ts), а объекты одной области собираются вместе
 * (mapAreasOf). Так на карте оказывается вся выдача, а не только объекты
 * с отмеченной точкой, — но не точными метками, а кругами областей: ни
 * координаты дома, ни улица из маршрута не уходят.
 *
 * Условия из запроса проверяются по белому списку полей (objects-where.ts):
 * читаем локальным API с overrideAccess, и без проверки маршрут открыл бы
 * закрытые поля в обход полевой проверки коллекции.
 *
 * Картинка, цена и название объекта едут вместе с областью — из них
 * собирается облачко области, отдельный запрос за карточкой не нужен. Подпись
 * области — район, город или населённый пункт (mapAreaLabel), без улицы.
 */

// Лимит как у геокодера: карта ходит сюда при каждом изменении фильтров,
// человеку этого хватает с запасом, а перебор адресов через чужой сайт
// упирается в лимит (сам геокодер при этом ещё и кешируется на сервере)
const MAP_RATE_MAX = 60
const MAP_RATE_WINDOW_MS = 60_000

/** Потолок объектов в ответе: выдача каталога ограничена, ответ не должен расти */
const MAX_OBJECTS = 300

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
    // (см. buildWhere в каталоге), и карта не должна выдавать их областями
    const published = { status: { equals: 'published' } }
    const where = (Object.keys(clientWhere).length ? { and: [published, clientWhere] } : published) as Where
    const { docs, totalDocs } = await payload.find({
      collection: 'objects',
      where,
      limit: MAX_OBJECTS,
      depth: 1,
      sort: '-createdAt',
      overrideAccess: true,
    })

    const found: FoundObject[] = []
    const withoutCoords: { doc: Record<string, unknown>; address: string }[] = []

    for (const rawDoc of docs) {
      const doc = rawDoc as unknown as Record<string, unknown>
      // Объект показывается примерной областью: точные координаты дома
      // заменяет круг клетки, в которой он стоит (см. object-approx-point)
      const area = approximatePoint(validCoordinates(doc.coordinates))
      if (area) {
        found.push({ area, doc })
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
            // Точка по адресу тоже превращается в область: геокодер ищет дом,
            // а на карту уходит клетка вокруг него
            const area = approximatePoint(coords)
            if (!area) return
            found.push({ area, doc })
          } finally {
            pending--
          }
        }),
      )
      await Promise.race([geocoding, sleep(GEOCODE_BUDGET_MS)])
      // Не дождались бюджета — не бросаем работу: запросы продолжаются в фоне
      // и оседают в кеше, поэтому следующий вызов карты отдаст области сразу
      void geocoding.catch(() => undefined)
    }

    // Числа найденных объектов в ответе нет намеренно: маршрут публичный, а
    // общее количество объектов компании сайт не показывает (карта говорит
    // только «показаны не все»). totalDocs нужен лишь для этого признака
    return NextResponse.json({
      areas: mapAreasOf(found),
      /** Сколько адресов ещё определяется (клиент повторит запрос) */
      pending: Math.max(pending, 0),
      /** Выдача больше потолка объектов — на карте показаны первые MAX_OBJECTS */
      truncated: totalDocs > docs.length,
    })
  } catch (error) {
    console.error('Objects map error:', error)
    return NextResponse.json({ error: 'map failed' }, { status: 500 })
  }
}

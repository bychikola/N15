/**
 * Объект Payload → область на публичной карте (режим «На карте», см. CatalogMap).
 *
 * Координаты объекта (objects.coordinates — их ставит карта в форме CRM) или
 * точка, найденная геокодером по адресу, превращаются в примерную область
 * (src/lib/object-approx-point.ts), а объекты одной области собираются вместе:
 * на карте рисуется круг области, в облачке — объекты этой области списком.
 * Точных меток у объектов нет: по области нельзя определить ни дом, ни улицу.
 *
 * Модуль общий для сервера (маршрут /api/objects/map его и наполняет) и
 * клиента (типы ObjectMapArea и ObjectMapPoint). Подпись области собирается
 * здесь же: район, город или населённый пункт — без улицы, дома и корпуса
 * (см. src/lib/object-public-address.ts). Точная строка адреса
 * (mapGeocodeText) нужна только серверу — по ней ищется точка, в браузер она
 * не уходит.
 */

import { publicAddressOf, publicAreaText } from './object-public-address'
import type { ApproxPoint } from './object-approx-point'

/** Объект внутри области: из этого собирается облачко области на карте */
export interface ObjectMapPoint {
  id: number
  title: string
  /** Вид сделки: sale | rent */
  type?: string
  /** Категория объекта (apartment, house, land…) */
  category?: string
  price?: number
  /** Обложка: размер card, иначе уменьшенный, иначе оригинал */
  image?: string
}

/** Примерная область карты и объекты, которые в неё попали */
export interface ObjectMapArea {
  /** Клетка сетки (см. approximatePoint) — одна область на всех её объектов */
  key: string
  /** Центр круга области: центр клетки, а не координаты объекта */
  lat: number
  lng: number
  /** Радиус области, метры: точный адрес дома по ней не определить */
  radius: number
  /** Подпись области: район, город или населённый пункт */
  label?: string
  /** Объекты области — по возрастанию id */
  points: ObjectMapPoint[]
}

/** Найденная точка объекта вместе с его документом: до сборки областей */
export interface FoundObject {
  area: ApproxPoint
  doc: Record<string, unknown>
}

interface AddressLike {
  city?: string
  district?: string
  cityDistrict?: string
  locality?: string
  snt?: string
  street?: string
  house?: string
  corpus?: string
  fullAddress?: string
}

const addressOf = (doc: Record<string, unknown>): AddressLike =>
  (doc.address && typeof doc.address === 'object' ? doc.address : {}) as AddressLike

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Координаты объекта пригодны для карты: числа в допустимых пределах */
export function validCoordinates(coordinates: unknown): [number, number] | null {
  const c = (coordinates && typeof coordinates === 'object' ? coordinates : {}) as {
    lat?: unknown
    lng?: unknown
  }
  const lat = Number(c.lat)
  const lng = Number(c.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  // 0,0 — «пустая» точка в Атлантике: так выглядят незаполненные координаты
  if (lat === 0 && lng === 0) return null
  return [lat, lng]
}

/**
 * Подпись области на карте: район, город или населённый пункт. Тот же порядок
 * частей, что в адресной строке страницы объекта, но без улицы: вместо точной
 * точки на публичной карте стоит область, и подпись называет район, а не
 * улицу (см. src/lib/object-public-address.ts).
 */
export function mapAreaLabel(doc: Record<string, unknown>): string {
  return publicAreaText(publicAddressOf(addressOf(doc)))
}

/**
 * Адрес для геокодера — строка для запроса к Яндексу, живёт только на сервере.
 * Готовый «Полный адрес» из формы CRM точнее сборки из полей (агент мог
 * записать дом, корпус и населённый пункт как удобно), поэтому он в приоритете.
 * Населённый пункт совпал с городом — не повторяем.
 *
 * Номер дома здесь нужен: геокодер ищет дом, а точнее искать и не надо —
 * результат всё равно показывается примерной областью, и точная строка в
 * браузер не уходит (см. object-approx-point.ts). Подписью области она быть
 * не может (в облачке — mapAreaLabel).
 */
export function mapGeocodeText(doc: Record<string, unknown>): string {
  const a = addressOf(doc)
  const full = text(a.fullAddress)
  if (full) return full
  const city = text(a.city)
  const locality = text(a.locality)
  const street = [text(a.street), text(a.house)].filter(Boolean).join(' ')
  const withCorpus = [street, text(a.corpus) && `корпус ${text(a.corpus)}`].filter(Boolean).join(', ')
  return [city, locality && locality !== city ? locality : '', text(a.snt), withCorpus]
    .filter(Boolean)
    .join(', ')
}

/** Обложка объекта: уменьшенный размер, если sharp его сделал */
function imageOf(doc: Record<string, unknown>): string | undefined {
  const image = doc.primaryImage
  if (!image || typeof image !== 'object') return undefined
  const media = image as { url?: string; sizes?: Record<string, { url?: string }> }
  return media.sizes?.card?.url || media.sizes?.thumbnail?.url || media.url || undefined
}

/** Документ объекта → объект для облачка области (null — объекта нет) */
function mapPointOf(doc: Record<string, unknown>): ObjectMapPoint | null {
  const id = Number(doc.id)
  if (!Number.isInteger(id)) return null
  const price = Number(doc.price)
  return {
    id,
    title: text(doc.title),
    type: text(doc.type) || undefined,
    category: text(doc.category) || undefined,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    image: imageOf(doc),
  }
}

/**
 * Найденные точки объектов → области карты. Объекты одной клетки сетки
 * собираются в одну область: подпись (район, город) у них общая, а отдельные
 * круги на соседних точках нарисовались бы друг на друге.
 *
 * Порядок обхода — по id: и объекты в облачке, и подпись области (её берём у
 * первого объекта) не должны зависеть от порядка выдачи фильтров.
 */
export function mapAreasOf(found: FoundObject[]): ObjectMapArea[] {
  const points = found
    .map(({ area, doc }) => ({ area, doc, point: mapPointOf(doc) }))
    .filter(
      (entry): entry is { area: ApproxPoint; doc: Record<string, unknown>; point: ObjectMapPoint } =>
        entry.point !== null,
    )
    .sort((a, b) => a.point.id - b.point.id)

  const areas = new Map<string, ObjectMapArea>()
  for (const { area, doc, point } of points) {
    let group = areas.get(area.key)
    if (!group) {
      group = {
        key: area.key,
        lat: area.lat,
        lng: area.lng,
        radius: area.radius,
        label: mapAreaLabel(doc) || undefined,
        points: [],
      }
      areas.set(area.key, group)
    }
    group.points.push(point)
  }
  return [...areas.values()]
}

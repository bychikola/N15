/**
 * Объект Payload → точка на карте каталога (режим «На карте», см. CatalogMap).
 *
 * Точку берём из координат объекта (objects.coordinates — их ставит карта
 * в форме CRM). Объекты без координат показываем по адресу: адрес строкой
 * определяет геокодер (src/lib/geocode-server.ts), поэтому объект попадает
 * на карту, даже если агент не отмечал точку руками.
 *
 * Модуль общий для сервера (маршрут /api/objects/map его и наполняет) и
 * клиента (тип ObjectMapPoint). Строки адреса собираются здесь же, чтобы
 * подпись в облачке карты и адрес карточки объекта читались одинаково
 * (порядок полей — как в ObjectCard).
 */

/** Точка объекта для карты каталога */
export interface ObjectMapPoint {
  id: number
  lat: number
  lng: number
  title: string
  /** Вид сделки: sale | rent */
  type?: string
  /** Категория объекта (apartment, house, land…) */
  category?: string
  price?: number
  /** Адрес одной строкой — как на карточке объекта */
  address?: string
  /** Обложка: размер card, иначе уменьшенный, иначе оригинал */
  image?: string
  /** Точка определена по адресу геокодером, а не координатами объекта */
  byAddress?: boolean
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
 * Адрес для подписи на карте: товарищество, район города (или район
 * республики), населённый пункт, улица и дом — тот же порядок, что на
 * карточке каталога.
 */
export function mapAddressText(doc: Record<string, unknown>): string {
  const a = addressOf(doc)
  const cityDistrict = text(a.cityDistrict)
  return [
    text(a.snt),
    cityDistrict && `${cityDistrict} район`,
    text(a.locality),
    text(a.district),
    text(a.street),
    text(a.house),
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * Адрес для геокодера. Готовый «Полный адрес» из формы CRM точнее сборки из
 * полей (агент мог записать дом, корпус и населённый пункт как удобно),
 * поэтому он в приоритете. Населённый пункт совпал с городом — не повторяем.
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

/** Документ объекта + точка → точка карты (null — объект нельзя показать) */
export function mapPointOf(
  doc: Record<string, unknown>,
  coords: [number, number],
  byAddress: boolean,
): ObjectMapPoint | null {
  const id = Number(doc.id)
  if (!Number.isInteger(id)) return null
  const price = Number(doc.price)
  return {
    id,
    lat: coords[0],
    lng: coords[1],
    title: text(doc.title),
    type: text(doc.type) || undefined,
    category: text(doc.category) || undefined,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    // Адрес карточки может быть и пустым: в форме заполняют только город или
    // населённый пункт, и в карточный порядок полей они не попадают. Тогда
    // подписью идёт строка, по которой определялась точка — облачко метки
    // должно объяснять, где объект
    address: mapAddressText(doc) || mapGeocodeText(doc) || undefined,
    image: imageOf(doc),
    byAddress: byAddress || undefined,
  }
}

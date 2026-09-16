// Геокодирование адреса. Ключ геокодера хранится НА СЕРВЕРЕ
// (YANDEX_GEOCODER_API_KEY, см. /api/geocode) — в браузер не попадает:
// JS API-ключ карт к геокодеру доступа не имеет (403), а открывать ключ
// геокодера в клиентском коде нельзя (квота/злоупотребление).
// Возвращает [lat, lng] или null, если адрес не найден/ошибка.
/**
 * Адресные подсказки и обратное геокодирование формы объекта в CRM.
 * Всё идёт через внутренний маршрут /api/crm/address: ключи внешних сервисов
 * остаются на сервере, а клиент получает готовые строки. Недоступность
 * подсказок не ошибка формы — поле остаётся обычным полем ввода.
 */
export interface ReversedAddress {
  locality: string
  district: string
  cityDistrict: string
  street: string
  house: string
  corpus: string
}

export interface ReversedAddressResult {
  found: boolean
  address?: ReversedAddress
  /** Полный адрес из геокодера — для строки «Адрес найден» */
  full?: string
  /** Почему адреса нет: по точке ничего не нашлось или сервис недоступен */
  reason?: 'notfound' | 'unavailable'
}

/** Подсказка адресного справочника (улица или номер дома) */
export interface AddressSuggestion {
  value: string
  hint: string
  /** Корпус дома, если справочник отличает его от номера дома */
  corpus?: string
}

async function postCrmAddress<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch('/api/crm/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Точка на карте → разобранный адрес (обратное геокодирование) */
export async function reverseGeocodePoint(lat: number, lng: number): Promise<ReversedAddressResult | null> {
  return postCrmAddress<ReversedAddressResult>({ action: 'reverse', lat, lng })
}

/** Подсказки улиц выбранного населённого пункта по первым буквам ввода */
export async function suggestStreets(params: {
  query: string
  locality?: string
  district?: string
  city?: string
}): Promise<AddressSuggestion[]> {
  const data = await postCrmAddress<{ items?: AddressSuggestion[] }>({ action: 'suggest', kind: 'street', ...params })
  return data?.items || []
}

/** Номера домов выбранной улицы, если они есть в адресном справочнике */
export async function suggestHouses(params: {
  query?: string
  street: string
  locality?: string
  district?: string
  city?: string
}): Promise<AddressSuggestion[]> {
  const data = await postCrmAddress<{ items?: AddressSuggestion[] }>({
    action: 'suggest',
    kind: 'house',
    query: params.query ?? '',
    street: params.street,
    locality: params.locality,
    district: params.district,
    city: params.city,
  })
  return data?.items || []
}

export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  if (!address.trim()) return null
  try {
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim() }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.found) return null
    return [Number(data.lat), Number(data.lng)]
  } catch {
    return null
  }
}

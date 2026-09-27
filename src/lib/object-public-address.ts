/**
 * Публичный адрес объекта — то, что видит посетитель сайта: улица без номера
 * дома, район, город или населённый пункт, товарищество. Номер дома, корпус,
 * квартиру и полный адрес одной строкой на сайте не показываем: точный адрес
 * объекта знает только агент, клиент уточняет его при просмотре. То же правило
 * действует на доске объявлений (см. boardPublicAddress в src/lib/board.ts),
 * а в CRM агент и администратор видят адрес целиком — полевой проверкой
 * коллекции Objects (см. exactAddressAccess в Objects.ts).
 *
 * Модуль общий для сервера и клиента: карточка каталога, страница объекта,
 * подпись точки на карте, главная и межрегиональная выдача собирают адрес
 * одним и тем же порядком полей.
 */

/** Части адреса, которые остаются в публичной части сайта */
export interface PublicAddress {
  city?: string
  district?: string
  cityDistrict?: string
  locality?: string
  snt?: string
  street?: string
}

/**
 * Адрес из документа Payload: публичные части плюс закрытые — дом, корпус,
 * квартира и полный адрес строкой (в документе они есть, в тип публичного
 * адреса не входят).
 */
interface AddressLike extends PublicAddress {
  house?: string
  corpus?: string
  apartment?: string
  fullAddress?: string
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Адрес объекта без закрытых частей. Возвращает undefined, если публичных
 * частей нет вовсе: у карточки тогда нет адресной строки (а не пустой
 * разделитель из запятых).
 */
export function publicAddressOf(address: unknown): PublicAddress | undefined {
  if (!address || typeof address !== 'object') return undefined
  const a = address as AddressLike
  const out: PublicAddress = {}
  const put = (key: keyof PublicAddress, value: string): void => {
    if (value) out[key] = value
  }
  put('snt', text(a.snt))
  put('city', text(a.city))
  put('district', text(a.district))
  put('cityDistrict', text(a.cityDistrict))
  put('locality', text(a.locality))
  put('street', text(a.street))
  return Object.keys(out).length ? out : undefined
}

/**
 * Адрес строкой по частям — порядок тот же, что был до скрытия номера дома
 * и что у подписи точки на карте (см. mapAddressText): товарищество, район
 * города (или район республики), населённый пункт, улица. Населённый пункт
 * стоит перед районом: у объекта в селе без него адрес читался бы как
 * городской.
 */
export function publicAddressParts(address?: PublicAddress | null): string[] {
  if (!address) return []
  const cityDistrict = text(address.cityDistrict)
  return [
    text(address.snt),
    cityDistrict && `${cityDistrict} район`,
    text(address.locality),
    text(address.district),
    text(address.street),
  ].filter(Boolean)
}

/** Адрес одной строкой для подписи: части через запятую */
export function publicAddressText(address?: PublicAddress | null): string {
  return publicAddressParts(address).join(', ')
}

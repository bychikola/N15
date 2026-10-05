/**
 * Адрес объекта из внешнего источника → адрес карточки каталога N15.
 *
 * Источник отдаёт адрес одной свободной строкой («г. Владикавказ, пр. Мира,
 * 15, кв. 42»), где вместе с городом и улицей стоят номер дома, корпуса и
 * квартиры. Публично такие уточнения показывать нельзя: точный адрес знает
 * только агент (см. exactAddressAccess в Objects.ts). Поэтому строка делится
 * на две части: полная строка целиком уходит в закрытое поле fullAddress (его
 * видят агент и администратор в CRM), а в публичную улицу попадает лишь
 * разрешённая часть — без номера дома, корпуса и квартиры.
 *
 * Разбор консервативный: кусок строки, где есть хоть одна цифра, публично не
 * показывается вовсе — лучше улица без номера, чем утечка дома. Если строку
 * уверенно разделить не удалось, публичная улица остаётся пустой, а точный
 * адрес всё равно доступен сотруднику из fullAddress.
 *
 * Той же логикой чистится и название объекта, которое партнёр часто отдаёт
 * вместе с адресом («2-к квартира, пр. Мира, 15 …»): см. stripAddressDetails.
 */
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from './districts'

const DISTRICT_SET = new Set<string>(DISTRICT_OPTIONS)
const CITY_DISTRICT_SET = new Set<string>(CITY_DISTRICT_OPTIONS)

/** Разобранные части адреса источника */
export interface SourceAddressParts {
  /** Публичные поля адреса объекта */
  city?: string
  district?: string
  cityDistrict?: string
  locality?: string
  street?: string
  /** Полная строка источника — закрытое поле (exactAddressAccess) */
  fullAddress: string
  /** Уточнения — закрытые поля (exactAddressAccess) */
  house?: string
  corpus?: string
  apartment?: string
}

/** Схлопывает пробелы и обрезает висящие разделители */
const clean = (value: string): string =>
  value.replace(/\s{2,}/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim()

/** Первое число, поймавшееся шаблоном уточнения (номер дома и т. п.) */
function firstNumber(line: string, re: RegExp): string | undefined {
  const value = line.match(re)?.[1]?.trim()
  return value || undefined
}

/**
 * Последний отдельный числовой кусок строки. Так записан дом, когда источник
 * не написал «д.»: «…ул. Мира, 15». Номер квартиры и корпуса сюда не попадают —
 * их ловят шаблоны с «кв.»/«корп.» выше и они не являются отдельным числом.
 */
function trailingHouseNumber(line: string): string | undefined {
  const tokens = line.split(/[,;]+/).map((t) => t.trim())
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (/^\d+[а-яa-z]?(?:\/\d+)?$/i.test(tokens[i])) return tokens[i]
  }
  return undefined
}

/** Район строки («Пригородный район», «Иристонский») → поле адреса */
function districtToken(token: string): { kind: 'district' | 'cityDistrict'; name: string } | null {
  const withSuffix = token.match(/^(.+?)\s+(?:район|р-н)$/i)
  if (withSuffix) {
    const name = clean(withSuffix[1])
    const full = `${name} район`
    if (DISTRICT_SET.has(full)) return { kind: 'district', name: full }
    if (CITY_DISTRICT_SET.has(name)) return { kind: 'cityDistrict', name }
    return null
  }
  if (DISTRICT_SET.has(token)) return { kind: 'district', name: token }
  if (CITY_DISTRICT_SET.has(token)) return { kind: 'cityDistrict', name: token }
  return null
}

/** Строка-аббревиатура без названия («ул.», «пр.») улицей не является */
const BARE_STREET_WORD = /^(?:ул|пр-т|пр|пер|ш|б-р|наб|туп|проезд|пл|аллея|мкр|кв-л)\.?$/i

/**
 * Свободный адрес источника → части адреса объекта. Публичные части — город,
 * район, населённый пункт и улица без уточнений; полная строка и уточнения
 * (дом, корпус, квартира) — закрытые поля.
 */
export function splitSourceAddress(line: string): SourceAddressParts {
  const fullAddress = (line || '').trim()
  const out: SourceAddressParts = { fullAddress }
  if (!fullAddress) return out

  // Уточнения — из полной строки; публично они не показываются (закрытые поля)
  const apartment = firstNumber(fullAddress, /(?:кв\.?|квартира|кв-ра)\s*№?\s*([0-9]+[а-яa-z]?)/i)
  const corpus = firstNumber(fullAddress, /(?:корп\.?|корпус|стр\.?|строение)\s*№?\s*([0-9]+[а-яa-z]?)/i)
  const house =
    firstNumber(fullAddress, /(?:д\.?\s*|дом\s*|владение\s*)№?\s*([0-9]+[а-яa-z0-9/-]*)/i) ||
    trailingHouseNumber(fullAddress)
  if (apartment) out.apartment = apartment
  if (corpus) out.corpus = corpus
  if (house) out.house = house

  const streetTokens: string[] = []
  for (const raw of fullAddress.split(/[,;]+/)) {
    let token = clean(raw)
    if (!token) continue

    // Город — публичное поле city; в улицу не дублируем
    const city = token.match(/^(?:г\.\s*|город\s+)(.+)$/i)
    if (city) {
      const name = clean(city[1])
      if (name && !out.city) out.city = name
      continue
    }

    // Населённый пункт («с. Октябрьское», «пос. Редант»)
    const place = token.match(/^(?:с\.\s*|село\s+|п\.\s*|пос\.\s*|посёлок\s+|поселок\s+|ст-ца\s+|станица\s+|аул\s+)(.+)$/i)
    if (place) {
      const name = clean(place[1])
      if (name && !/\d/.test(name) && !out.locality) out.locality = name
      continue
    }

    // Район — публичное поле district/cityDistrict; в улицу не берём
    const district = districtToken(token)
    if (district) {
      if (district.kind === 'district' && !out.district) out.district = district.name
      else if (district.kind === 'cityDistrict' && !out.cityDistrict) out.cityDistrict = district.name
      continue
    }

    // Всё от первой цифры — уточнение (дом, корпус, квартира, этаж): в улицу
    // не берём вовсе. Остаток служебного слова без номера («кв.», «д.») тоже
    // убираем.
    token = clean(token.replace(/\s*\d.*$/, ''))
    token = clean(
      token.replace(
        /(?:^|\s)(?:д\.?|дом|корп\.?|корпус|стр\.?|строение|кв\.?|квартира|кв-ра|владение)\.?\s*$/i,
        '',
      ),
    )
    if (!token || BARE_STREET_WORD.test(token)) continue
    streetTokens.push(token)
  }
  if (streetTokens.length) out.street = streetTokens.join(', ')
  return out
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Убирает из названия объекта номера дома, корпуса и квартиры, известные из
 * адреса источника. Партнёрские заголовки часто содержат адрес целиком
 * («2-к квартира, пр. Мира, 15 …»), а в публичном названии уточнения стоять не
 * должны — иначе номер дома утекает через title и публичный slug карточки.
 *
 * Снимаем число только в позиции уточнения: после разделителя (запятая,
 * пробел, начало строки) и с границей после числа, поэтому пометки вроде
 * «2-к квартира» и десятичные «2.1» не страдают. Если после чистки от названия
 * ничего не осталось, возвращаем исходное — объект без имени хуже.
 */
export function stripAddressDetails(
  title: string,
  details: { house?: string; corpus?: string; apartment?: string },
): string {
  const values = [details.apartment, details.corpus, details.house].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  if (!title || !values.length) return title

  let result = title
  for (const value of values) {
    const re = new RegExp(
      `(?<=^|[,\\s])(?:д\\.?\\s*|дом\\s*|корп\\.?\\s*|корпус\\s*|стр\\.?\\s*|строение\\s*|кв\\.?\\s*|квартира\\s*|кв-ра\\s*)?${escapeRegExp(value)}(?=$|[,\\s;)])`,
      'gi',
    )
    result = result.replace(re, '')
  }
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*(?=[,)])/g, '')
    .replace(/\s+([,)])/g, '$1')
    .replace(/,\s*\(/g, ' (')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
  return result || title
}

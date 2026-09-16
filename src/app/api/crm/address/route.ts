import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS, VLAV_OKRUG } from '@/lib/districts'
import { parseHouseNumber, streetHasTypeWord } from '@/lib/house-info'
import { rateLimited } from '@/lib/rate-limit'

/**
 * Адресные подсказки и обратное геокодирование для формы объекта в CRM.
 *
 * Форма адреса работает с адресным справочником Яндекса — тем же, по которому
 * карта объекта ищет координаты (src/lib/geocode.ts): другого полного списка
 * улиц Владикавказа и населённых пунктов республики у проекта нет, а вручную
 * такой список вести нельзя — в нём быстро заводятся несуществующие улицы.
 * Поэтому улицы и номера домов не хранятся в коде, а спрашиваются у
 * справочника по первым буквам ввода и остаются привязанными к выбранному
 * населённому пункту и району.
 *
 * Три действия (POST, JSON):
 *   reverse   — обратное геокодирование точки клика по карте: населённый
 *               пункт, район, район города, улица, дом и корпус. Если по
 *               точке нашёлся только номер дома, делается второй запрос
 *               (поиск улицы у той же точки) — форма не должна оставаться
 *               с номером дома и пустой улицей.
 *   streets   — подсказки улиц по первым буквам: только улицы выбранного
 *               населённого пункта (или района), из справочника.
 *   houses    — номера домов выбранной улицы, если они есть в справочнике.
 *
 * Ключи и сети: обратное геокодирование идёт через HTTP-геокодер отдельным
 * ключом (YANDEX_GEOCODER_API_KEY, только на сервере), подсказки — открытый
 * адресный справочник карт. Оба внешних запроса кэшируются в памяти процесса,
 * поэтому набор улицы по буквам не гоняет справочник заново, а лимит на
 * сотрудника защищает справочник от случайного потока запросов.
 *
 * Маршрут внутренний: адресные подсказки доступны только сотрудникам CRM
 * (агент и администратор) — как и остальная работа с объектами.
 */

/** Короткий кэш внешних ответов: буквы в поле набирают быстрее, чем меняется справочник */
const CACHE_TTL_MS = 30 * 60 * 1000
/** Лимит запросов на сотрудника: набор адреса идёт с паузой, это запас на опечатки */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 120
const FETCH_TIMEOUT_MS = 8000

type SuggestKind = 'street' | 'house'

interface SuggestHit {
  /** Подпись строки: «улица Кутузова» или «улица Кутузова, 15» */
  title: string
  /** Уточнение строки: «Владикавказ, Республика Северная Осетия — Алания» */
  subtitle: string
  tags: string[]
}

interface CacheEntry {
  at: number
  items: unknown
}

const cache = new Map<string, CacheEntry>()

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.items as T
}

function cacheSet(key: string, items: unknown): void {
  // Кэш маленький и живёт в памяти процесса: чистим его от старья, чтобы
  // длинная сессия не копила ответы справочника бесконечно
  if (cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.at > CACHE_TTL_MS) cache.delete(k)
    }
  }
  cache.set(key, { at: Date.now(), items })
}

// --- Разбор ответов справочника и геокодера ---------------------------------

/** Служебные слова улицы: при сравнении подсказки с выбранной улицей не нужны */
const STREET_TYPE_WORDS = new Set([
  'улица', 'ул', 'проспект', 'пр', 'пр-кт', 'переулок', 'пер', 'проезд',
  'шоссе', 'набережная', 'наб', 'аллея', 'площадь', 'пл', 'бульвар', 'тупик',
])

/** Значимые слова названия: «улица К. Хетагурова» → «хетагурова» */
function streetTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length > 1 && !STREET_TYPE_WORDS.has(token))
}

/** Название улицы в вид карточки объекта: «улица Кутузова» → «Кутузова» */
function cleanStreetName(value: string): string {
  return value.replace(/^ул(?:ица)?\.?\s+/i, '').replace(/\s+/g, ' ').trim()
}

/** Части административного адреса из ответа геокодера */
interface AddressComponents {
  street: string
  house: string
  corpus: string
  locality: string
  district: string
  cityDistrict: string
}

/** Служебные слова перед названием населённого пункта: «село Ногир» → «Ногир» */
const LOCALITY_TYPE_RE = /^(?:г|с|п|ст|д|город|село|посёлок|поселок|станица|аул|хутор|слобода)\.?\s+/i

function cleanLocality(value: string): string {
  const name = value.replace(LOCALITY_TYPE_RE, '').replace(/\s+/g, ' ').trim()
  return name || value.trim()
}

/** Район республики в значениях справочника проекта (district в адресе объекта) */
function matchDistrict(value: string): string {
  const area = (value || '').trim()
  if (!area) return ''
  const exact = DISTRICT_OPTIONS.find((d) => d === area)
  if (exact) return exact
  // «Алагирский муниципальный район» ↔ «Алагирский район»
  const norm = (s: string) => s.toLowerCase().replace(/муниципальн\w*\s+/g, '').replace(/\s+/g, ' ').trim()
  const byName = DISTRICT_OPTIONS.find((d) => norm(d) === norm(area))
  if (byName) return byName
  // «городской округ Владикавказ» — это округ республики, а не внутригородской район
  return /владикавказ/i.test(area) ? VLAV_OKRUG : ''
}

/** Внутригородской район Владикавказа: «Затеречный район» → «Затеречный» */
function matchCityDistrict(value: string): string {
  const base = (value || '').toLowerCase().replace(/\s*район\s*$/i, '').trim()
  if (!base) return ''
  return CITY_DISTRICT_OPTIONS.find((d) => d.toLowerCase() === base) || ''
}

interface GeoObject {
  components: { kind: string; name: string }[]
  text: string
  precision: string
}

/** Разбор ответа геокодера в список объектов (в порядке релевантности) */
function parseGeoObjects(data: unknown): GeoObject[] {
  const collection = (data as {
    response?: { GeoObjectCollection?: { featureMember?: unknown[] } }
  })?.response?.GeoObjectCollection
  const members = Array.isArray(collection?.featureMember) ? collection!.featureMember : []
  const out: GeoObject[] = []
  for (const member of members) {
    const meta = (member as { GeoObject?: { metaDataProperty?: { GeocoderMetaData?: Record<string, unknown> } } })
      ?.GeoObject?.metaDataProperty?.GeocoderMetaData
    if (!meta) continue
    const address = (meta.Address || {}) as { Components?: { kind?: string; name?: string }[] }
    const components = (address.Components || [])
      .filter((c) => c && typeof c.name === 'string')
      .map((c) => ({ kind: String(c.kind || ''), name: String(c.name) }))
    out.push({
      components,
      text: typeof meta.text === 'string' ? meta.text : '',
      precision: typeof meta.precision === 'string' ? meta.precision : '',
    })
  }
  return out
}

/** Части адреса из компонентов геокодера: улица, дом (с корпусом), пункт, район */
function addressParts(object: GeoObject): AddressComponents {
  const pick = (kind: string) => object.components.find((c) => c.kind === kind)?.name || ''
  const houseRaw = pick('house')
  // «15 к 2» в одном компоненте — корпус отделяем тем же разбором, что и
  // движок данных о доме (src/lib/house-info.ts): в карточке это два поля
  const parsed = parseHouseNumber(houseRaw)
  return {
    street: cleanStreetName(pick('street')),
    house: parsed.house || houseRaw.replace(/^дом\s+/i, '').trim(),
    corpus: parsed.corpus || '',
    locality: cleanLocality(pick('locality')),
    district: matchDistrict(pick('area')),
    cityDistrict: matchCityDistrict(pick('district')),
  }
}

/** Полный адрес для показа: без «Россия» и названия республики, но с районом */
function fullAddressText(parts: AddressComponents): string {
  return [
    parts.district && parts.district !== VLAV_OKRUG ? parts.district : '',
    parts.locality,
    parts.street ? (streetHasTypeWord(parts.street) ? parts.street : `ул. ${parts.street}`) : '',
    parts.house ? `д. ${parts.house}` : '',
    parts.corpus ? `корп. ${parts.corpus}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

// --- Внешние запросы --------------------------------------------------------

/** Обратное геокодирование точки: [lng, lat] у геокодера, ключ живёт на сервере */
async function reverseGeocode(lat: number, lng: number, kind: 'street' | 'house' | ''): Promise<GeoObject[]> {
  const apiKey = process.env.YANDEX_GEOCODER_API_KEY
  if (!apiKey) return []
  const url =
    'https://geocode-maps.yandex.ru/1.x/?' +
    new URLSearchParams({
      apikey: apiKey,
      geocode: `${lng},${lat}`,
      format: 'json',
      results: '5',
      lang: 'ru_RU',
      ...(kind ? { kind } : {}),
    })
  // Ключ геокодера ограничен по Referer — без него Яндекс отвечает 403
  const referer = process.env.NEXT_PUBLIC_SERVER_URL || 'https://n15-realty.ru/'
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Referer: referer },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`geocoder http ${res.status}`)
  return parseGeoObjects(await res.json())
}

/** Подсказки адресного справочника по первым буквам ввода */
async function fetchSuggest(part: string, count: number): Promise<SuggestHit[]> {
  const url =
    'https://suggest-maps.yandex.ru/suggest-geo?' +
    new URLSearchParams({ part, v: '9', lang: 'ru_RU', search_type: 'all', n: String(count) })
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json,text/javascript,*/*;q=0.5',
      'User-Agent': 'N15-Realty-AddressSuggest/1.0 (+https://n15-realty.ru)',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`suggest http ${res.status}`)
  const body = await res.text()
  // Ответ приходит обёрткой JSONP: suggest.apply({...})
  const start = body.indexOf('(')
  const end = body.lastIndexOf(')')
  if (start < 0 || end <= start) throw new Error('suggest format')
  const data = JSON.parse(body.slice(start + 1, end)) as { results?: unknown[] }
  const items = Array.isArray(data.results) ? data.results : []
  const out: SuggestHit[] = []
  for (const raw of items) {
    const item = raw as {
      title?: { text?: string }
      subtitle?: { text?: string }
      text?: string
      tags?: unknown
    }
    const title = item.title?.text || item.text || ''
    if (!title.trim()) continue
    out.push({
      title: title.trim(),
      subtitle: (item.subtitle?.text || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)) : [],
    })
  }
  return out
}

/** Улица одной строкой: название в поле «Улица» и подпись справочника рядом */
export interface StreetSuggestion {
  value: string
  hint: string
}

/** Дом улицы: номер дома и корпус, если справочник их различает */
export interface HouseSuggestion {
  value: string
  corpus: string
  hint: string
}

// --- Подсказки улиц и домов -------------------------------------------------

/**
 * Улицы выбранного населённого пункта (или района): справочник отдаёт адрес
 * целиком, поэтому подсказка отбирается по месту — иначе по первым буквам
 * прилетают одноимённые улицы других регионов. Строка без региона не
 * отбрасывается (у справочника бывают короткие подписи), но чужой регион —
 * отбрасывается: объекты Н15 — Северная Осетия — Алания.
 */
function pickStreets(hits: SuggestHit[], requireIn: string, query: string): StreetSuggestion[] {
  const tokens = streetTokens(query)
  const required = requireIn.toLowerCase().replace(/ё/g, 'е')
  const out: StreetSuggestion[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    if (!hit.tags.includes('street')) continue
    const name = cleanStreetName(hit.title.split(',')[0])
    if (!name) continue
    const haystack = `${hit.title} ${hit.subtitle}`.toLowerCase().replace(/ё/g, 'е')
    if (required && !haystack.includes(required)) continue
    if (/(республика|край|область|округ|район)/.test(haystack) && !/осетия|алания/.test(haystack)) continue
    if (seen.has(name.toLowerCase())) continue
    // Первые буквы из поля должны быть в названии — подсказка не «уводит» от ввода
    const nameTokens = streetTokens(name)
    if (tokens.length && !tokens.some((t) => nameTokens.some((n) => n.startsWith(t)))) continue
    seen.add(name.toLowerCase())
    out.push({ value: name, hint: hit.subtitle })
  }
  return out
}

/** Номера домов улицы: из справочника берём только дома этой же улицы */
function pickHouses(hits: SuggestHit[], street: string): HouseSuggestion[] {
  const streetName = streetTokens(street)
  const out: HouseSuggestion[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    if (!hit.tags.includes('house')) continue
    const cut = hit.title.lastIndexOf(',')
    if (cut < 0) continue
    const streetPart = hit.title.slice(0, cut)
    const houseRaw = hit.title.slice(cut + 1).trim()
    if (!houseRaw) continue
    const nameTokens = streetTokens(streetPart)
    if (!nameTokens.length || !streetName.length) continue
    // Пересечение слов названия: «улица Кирова» и «переулок Кирова» — разные улицы
    const same = nameTokens.every((t) => streetName.some((s) => s === t)) ||
      streetName.every((s) => nameTokens.some((t) => t === s))
    if (!same) continue
    const parsed = parseHouseNumber(houseRaw)
    const value = (parsed.house || houseRaw).toUpperCase()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push({ value, corpus: parsed.corpus || '', hint: hit.title })
  }
  // Номера по порядку: справочник отдаёт их по релевантности, и без сортировки
  // список выглядит случайным (сначала «64», потом «57», потом «38»)
  const num = (v: string): number => {
    const m = v.match(/^(\d+)/)
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
  }
  return out.sort(
    (a, b) =>
      num(a.value) - num(b.value) ||
      a.value.localeCompare(b.value, 'ru') ||
      (Number(a.corpus) || 0) - (Number(b.corpus) || 0),
  )
}

// --- Маршрут -----------------------------------------------------------------

interface SuggestBody {
  action?: string
  query?: string
  kind?: string
  /** Значения адресных полей формы — от них зависят подсказки */
  locality?: string
  district?: string
  city?: string
  street?: string
  lat?: number
  lng?: number
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    if (rateLimited(`crm-address:${user.id}`, RATE_MAX, RATE_WINDOW_MS)) {
      return NextResponse.json({ error: 'Слишком часто' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as SuggestBody | null
    const action = String(body?.action || '')

    // 1. Точка на карте → адрес: обратное геокодирование
    if (action === 'reverse') {
      const lat = Number(body?.lat)
      const lng = Number(body?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return NextResponse.json({ error: 'Не указана точка' }, { status: 400 })
      }
      const key = `rev:${lat.toFixed(6)},${lng.toFixed(6)}`
      const cached = cacheGet<{ found: boolean; address?: AddressComponents; full?: string }>(key)
      if (cached) return NextResponse.json(cached)

      // Ключа геокодера нет — это недоступность сервиса, а не «точка без
      // адреса»: агент должен видеть разницу (см. состояния формы)
      if (!process.env.YANDEX_GEOCODER_API_KEY) {
        return NextResponse.json({ found: false, reason: 'unavailable' })
      }

      let objects: GeoObject[] = []
      try {
        objects = await reverseGeocode(lat, lng, '')
      } catch {
        // Сеть/ключ недоступны: карта и координаты работают, адрес вводится вручную
        return NextResponse.json({ found: false, reason: 'unavailable' })
      }
      // Дом важнее «просто улицы»: если в ответе есть объект с домом — берём его
      const withHouse = objects.find((o) => o.components.some((c) => c.kind === 'house'))
      const withStreet = objects.find((o) => o.components.some((c) => c.kind === 'street'))
      const best = withHouse || withStreet || objects[0]
      if (!best) return NextResponse.json({ found: false, reason: 'notfound' })

      let parts = addressParts(best)
      // По точке нашёлся только номер дома (без улицы) — спрашиваем улицу у той
      // же точки отдельным запросом: форма не должна остаться с домом без улицы
      if (parts.house && !parts.street) {
        try {
          const streets = await reverseGeocode(lat, lng, 'street')
          const streetObject = streets.find((o) => o.components.some((c) => c.kind === 'street'))
          if (streetObject) {
            const streetParts = addressParts(streetObject)
            parts = {
              ...parts,
              street: streetParts.street || parts.street,
              locality: parts.locality || streetParts.locality,
              district: parts.district || streetParts.district,
              cityDistrict: parts.cityDistrict || streetParts.cityDistrict,
            }
          }
        } catch {
          // Улицу уточнить не удалось — дом, пункт и координаты уже есть
        }
      }

      const result = {
        found: Boolean(parts.street || parts.locality || parts.house || parts.district),
        address: parts,
        full: fullAddressText(parts),
      }
      cacheSet(key, result)
      return NextResponse.json(result)
    }

    // 2. Подсказки адресного справочника: улицы и номера домов
    if (action === 'suggest') {
      const kind: SuggestKind = body?.kind === 'house' ? 'house' : 'street'
      const query = String(body?.query || '').trim().slice(0, 80)
      const locality = String(body?.locality || '').trim().slice(0, 80)
      const district = String(body?.district || '').trim().slice(0, 80)
      const city = String(body?.city || '').trim().slice(0, 80)
      const street = String(body?.street || '').trim().slice(0, 120)
      // Подсказки улиц — только по введённым буквам; дома улицы спрашиваются
      // сразу после её выбора, когда в поле номера ещё пусто
      if (!query && !(kind === 'house' && street)) return NextResponse.json({ items: [] })
      // Одна буква ничего не отбирает: справочник вернёт что угодно, а фильтр
      // по вводу (см. pickStreets) на односимвольный запрос не сработает —
      // в подсказках окажутся улицы и дороги других регионов
      if (kind === 'street' && query.length < 2) return NextResponse.json({ items: [] })

      // Место подсказок: населённый пункт из формы, иначе город, иначе район
      // республики. По нему же отбираются строки справочника — подсказки
      // зависят от выбранного населённого пункта и района.
      const districtAsPlace = district && district !== VLAV_OKRUG ? district : ''
      const place = locality || city || districtAsPlace
      const part = kind === 'house' && street ? `${place}, ${street}, ${query}` : `${place}, ${query}`
      const key = `sg:${kind}:${part}`
      const cached = cacheGet<{ items: unknown[] }>(key)
      if (cached) return NextResponse.json(cached)

      let hits: SuggestHit[] = []
      try {
        hits = await fetchSuggest(part, 12)
      } catch {
        // Справочник недоступен — поле остаётся обычным вводом, форма не ломается
        return NextResponse.json({ items: [], unavailable: true })
      }

      const items = kind === 'house'
        ? pickHouses(hits, street)
        : pickStreets(hits, place, query).slice(0, 8)
      const result = { items }
      cacheSet(key, result)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (error) {
    console.error('crm address error:', error)
    return NextResponse.json({ error: 'Ошибка адресного сервиса' }, { status: 500 })
  }
}

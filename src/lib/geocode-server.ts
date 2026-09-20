/**
 * Геокодирование адреса на сервере — общий модуль маршрутов /api/geocode
 * (карта объекта) и /api/objects/map (карта каталога).
 *
 * Ключ геокодера (YANDEX_GEOCODER_API_KEY) живёт только на сервере: ключ
 * JavaScript API к HTTP-геокодеру доступа не имеет (403), а открывать ключ
 * в браузере нельзя (квота и злоупотребление чужим сайтом).
 *
 * Ответы кешируются в памяти процесса. Каталог определяет точки по адресам
 * десятков объектов, и без кеша каждый показ карты заново жёг бы квоту
 * геокодера, а объект — ещё и при каждом открытии страницы. Кеш негативный
 * тоже (адрес, который Яндекс не нашёл, не переспрашиваем каждую минуту),
 * но с коротким сроком. Одновременные обращения к Яндексу ограничены:
 * десятки параллельных запросов выглядят нагрузкой и рискуют получить 429.
 *
 * Недоступность геокодера и «адрес не найден» различаются: ошибка не
 * попадает в кеш, иначе разовый сбой сети спрятал бы точки объектов на часы.
 */

/** Срок жизни найденного адреса в кеше: адреса объектов меняются редко */
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** «Адрес не найден» — переспрашиваем заметно раньше: справочник Яндекса пополняется */
const MISS_TTL_MS = 6 * 60 * 60 * 1000
/** Потолок кеша: адресов объектов сотни, память процесса не растёт бесконечно */
const MAX_CACHE_ENTRIES = 2000
/** Сколько запросов к геокодеру держим одновременно */
const MAX_CONCURRENT = 4
const GEOCODE_TIMEOUT_MS = 8_000

interface CacheEntry {
  coords: [number, number] | null
  at: number
}

const cache = new Map<string, CacheEntry>()
/** Запросы в полёте: два компонента с одним адресом не шлют два запроса */
const pending = new Map<string, Promise<[number, number] | null>>()

let active = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}

function release(): void {
  active--
  const next = waiting.shift()
  if (next) next()
}

function remember(key: string, coords: [number, number] | null): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map хранит порядок вставки: убираем самые старые записи
    const excess = cache.size - MAX_CACHE_ENTRIES + 1
    let i = 0
    for (const old of cache.keys()) {
      cache.delete(old)
      if (++i >= excess) break
    }
  }
  cache.set(key, { coords, at: Date.now() })
}

/**
 * Один запрос к HTTP-геокодеру. Возвращает null, если адрес не найден,
 * и бросает исключение, если геокодер недоступен или не настроен.
 */
async function requestGeocode(address: string): Promise<[number, number] | null> {
  const apiKey = process.env.YANDEX_GEOCODER_API_KEY
  if (!apiKey) throw new Error('geocoder not configured')

  const url =
    'https://geocode-maps.yandex.ru/1.x/?' +
    new URLSearchParams({
      apikey: apiKey,
      geocode: address,
      format: 'json',
      results: '1',
      lang: 'ru_RU',
    })
  // Ключ геокодера ограничен по Referer — серверные запросы без Referer
  // Яндекс режет (403). Шлём свой домен (браузер послал бы его же).
  const referer = process.env.NEXT_PUBLIC_SERVER_URL || 'https://n15-realty.ru/'
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    headers: { Referer: referer },
  })
  if (!res.ok) {
    // адрес в лог не пишем (данные клиента)
    throw new Error(`yandex http ${res.status}`)
  }
  const data = await res.json()
  const meta = data?.response?.GeoObjectCollection?.metaDataProperty?.GeocoderResponseMetaData
  const pos = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
  if (typeof pos !== 'string') {
    console.warn(`geocode: empty result (yandex found: ${meta?.found ?? '?'})`)
    return null
  }
  const [lng, lat] = pos.split(' ').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

/**
 * Адрес → координаты [lat, lng] (null — адрес не найден или геокодер
 * недоступен). Повторные обращения к тому же адресу берутся из кеша.
 */
export async function geocodeAddressCached(rawAddress: string): Promise<[number, number] | null> {
  const address = rawAddress.replace(/\s+/g, ' ').trim()
  if (!address) return null
  const key = address.toLowerCase()

  const hit = cache.get(key)
  if (hit) {
    const ttl = hit.coords ? HIT_TTL_MS : MISS_TTL_MS
    if (Date.now() - hit.at < ttl) return hit.coords
  }

  const running = pending.get(key)
  if (running) return running

  const task = (async () => {
    await acquire()
    try {
      return await requestGeocode(address)
    } finally {
      release()
    }
  })()
    .then((coords) => {
      // Ошибку в кеш не кладём: см. заголовок модуля
      remember(key, coords)
      return coords
    })
    .catch((e: unknown) => {
      console.warn('geocode: request failed', e instanceof Error ? e.message : e)
      return null
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, task)
  return task
}

/** Сколько адресов сейчас ждёт геокодер — для диагностики и тестов */
export function geocodeQueueSize(): number {
  return waiting.length + active
}

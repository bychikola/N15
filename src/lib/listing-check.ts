/**
 * «Где размещён объект» — движок поиска похожих объявлений на площадках
 * недвижимости (Авито, ЦИАН, Домклик, Яндекс Недвижимость и др.).
 *
 * Идея — та же, что у парсера пересечений объектов CRM (check-duplicate и
 * хуки Objects.ts): нормализуем признаки (адрес, кадастровый, цена, площадь,
 * комнаты, этаж, фото, описание) и сравниваем «объект Н15 ↔ объявление
 * площадки» списком совпавших признаков со степенью совпадения.
 *
 * ВАЖНО про доступ к площадкам: Авито, ЦИАН, Домклик и Яндекс Недвижимость
 * запрещают автоматический сбор данных и не дают открытого API. Поэтому
 * автоматическая сверка включается только там, где есть разрешённый канал:
 * официальный API или фид (ключи задаются переменными окружения, см. PLATFORM_SPECS
 * → api.env). Без ключей площадка помечается как «требует проверки», а агенту
 * даются готовые ссылки на поиск по адресу — проверка вручную, без обхода
 * блокировок и нарушений правил площадок.
 *
 * Файл без импортов (как src/lib/valuation.ts): работает на сервере и в
 * быстрых проверках node. Серверная обвязка (запись в БД) — в placements-service.ts.
 */

// --- Площадки -----------------------------------------------------------------

export type PlatformSlug = 'avito' | 'cian' | 'domclick' | 'yandex'

export interface PlatformSpec {
  slug: PlatformSlug
  /** Отображаемое название (в CRM) */
  name: string
  /** Домены, с которых принимаются «ручные ссылки» (без www и пути) */
  domains: string[]
  /**
   * Ссылка на поиск по адресу для ручной проверки агентом.
   * query — нормализованный поисковый текст (адрес объекта).
   */
  searchUrl: (query: string) => string
  /**
   * Официальный канал (API/фид): заполняется, когда у агентства есть доступ.
   * Ключи читаются из process.env — имена переменных перечислены в env.
   * Пока канал не настроен — автоматической проверки по площадке нет.
   */
  api: {
    env: string[]
    /** human-readable подсказка, какой доступ нужен */
    note: string
  } | null
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    slug: 'avito',
    name: 'Авито',
    domains: ['avito.ru', 'www.avito.ru', 'm.avito.ru'],
    searchUrl: (q) => `https://www.avito.ru/vladikavkaz?q=${encodeURIComponent(q)}`,
    // Официальный доступ — API Авито для бизнеса (OAuth, кабинет агентства)
    api: { env: ['AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET'], note: 'API Авито (OAuth, приложение кабинета)' },
  },
  {
    slug: 'cian',
    name: 'ЦИАН',
    domains: ['cian.ru', 'www.cian.ru', 'vladikavkaz.cian.ru'],
    searchUrl: (q) => `https://vladikavkaz.cian.ru/search/?q=${encodeURIComponent(q)}`,
    // Официальный доступ — партнёрский REST API ЦИАН (по договору с площадкой)
    api: { env: ['CIAN_API_TOKEN'], note: 'Партнёрский API ЦИАН (токен по договору)' },
  },
  {
    slug: 'domclick',
    name: 'Домклик',
    domains: ['domclick.ru', 'www.domclick.ru'],
    searchUrl: () => 'https://www.domclick.ru/search',
    // Открытого официального поиска по чужим объявлениям нет; для своих
    // объявлений используется кабинет агентства (ручная выгрузка фида)
    api: null,
  },
  {
    slug: 'yandex',
    name: 'Яндекс Недвижимость',
    domains: ['realty.yandex.ru', 'realty.yandex.com', 'yandex.ru'],
    searchUrl: (q) => `https://realty.yandex.ru/search/?text=${encodeURIComponent(q)}`,
    // Официальный доступ — фид Яндекс.Недвижимости (выгрузка объявлений
    // агентства в личном кабинете, https://realty.yandex.ru/feeds)
    api: { env: ['YANDEX_REALTY_FEED_ID', 'YANDEX_REALTY_LOGIN'], note: 'Фид Яндекс.Недвижимости (кабинет)' },
  },
]

export const platformBySlug = (slug: string): PlatformSpec | undefined =>
  PLATFORM_SPECS.find((p) => p.slug === slug)

/** Определение площадки по URL объявления (для «ручной ссылки») */
export const platformByUrl = (url: string): PlatformSpec | undefined => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return PLATFORM_SPECS.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`)))
  } catch {
    return undefined
  }
}

/** Есть ли настроенный официальный канал у площадки (ключи в окружении) */
export const platformHasApi = (spec: PlatformSpec): boolean =>
  !!spec.api && spec.api.env.every((k) => process.env[k] && String(process.env[k]).trim().length > 0)

// --- Нормализация (та же идея, что в парсере пересечений CRM) ------------------

/** Слова-«шум» адреса, чтобы «ул. Кутузова» и «улица Кутузова» совпали */
const ADDR_NOISE = new Set([
  'улица', 'ул', 'проспект', 'пр', 'проезд', 'переулок', 'пер',
  'бульвар', 'бул', 'шоссе', 'набережная', 'наб', 'город', 'г', 'поселок',
  'пос', 'село', 'с', 'деревня', 'дер', 'дом', 'д', 'корпус', 'корп', 'к',
  'квартира', 'кв', 'участок', 'уч', 'литер', 'строение', 'стр',
  // Осколки сокращений после разбора по дефисам («пр-т» → «пр», «т») и одиночные
  'т', 'обл', 'респ',
])

/** Очистка адресной строки: нижний регистр, без мусора и слов-шума */
export const normAddrText = (v: string): string =>
  v
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !ADDR_NOISE.has(w))
    .join(' ')

const normCad = (v?: string | null) => (v || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '')
const normNum = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const normText = (v?: string | null) => (v || '').toLowerCase().replace(/ё/g, 'е').trim()
const normWord = (v?: string | null) =>
  (v || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/g, '')

/** Ключ «город + улица + дом» без квартиры — основа сравнения адресов */
export const addressBaseKey = (a?: { city?: string; street?: string; house?: string; locality?: string } | null): string => {
  const street = (a?.street || '').trim()
  const house = (a?.house || '').trim()
  // Город сам по себе слишком общий: совпадение адреса считаем только
  // когда есть улица с домом (как в парсере пересечений)
  if (!street || !house) return ''
  const place = (a?.locality || a?.city || '').trim()
  return normAddrText(`${place} ${street} ${house}`)
}

/** Полный ключ с квартирой/участком — для точечного совпадения */
export const addressFullKey = (a?: { city?: string; street?: string; house?: string; apartment?: string; locality?: string } | null): string => {
  const base = addressBaseKey(a)
  if (!base) return ''
  const extra = (a?.apartment || '').trim()
  return extra ? `${base} ${normAddrText(extra)}` : base
}

/** Доля пересечения множеств слов (0..1) — для улиц с опечатками и описаний */
export const wordOverlap = (a: string, b: string): number => {
  const wa = new Set(normAddrText(a).split(' ').filter(Boolean))
  const wb = new Set(normAddrText(b).split(' ').filter(Boolean))
  if (!wa.size || !wb.size) return 0
  let both = 0
  for (const w of wa) if (wb.has(w)) both++
  return (2 * both) / (wa.size + wb.size)
}

const priceRel = (a: number, b: number): number => Math.abs(a - b) / Math.max(a, b)

/**
 * Совпадение числа с допуском: в пределах tolerance — полный балл,
 * в пределах tolerance*3 — половина. Возвращает 0..1.
 */
const numWithin = (a: number, b: number, tolerance: number): number => {
  const rel = priceRel(a, b)
  if (rel <= tolerance) return 1
  if (rel <= tolerance * 3) return 0.5
  return 0
}

// --- Сравнение объекта Н15 с объявлением площадки -------------------------------

export interface ObjectLike {
  address?: { city?: string; locality?: string; street?: string; house?: string; apartment?: string } | null
  cadastralNumber?: string | null
  price?: number | null
  area?: number | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  /** URL/хэши фотографий объекта Н15 (если сравниваются) */
  photos?: string[]
  /** Текст описания объекта Н15 */
  description?: string
}

export interface ListingLike {
  address?: ObjectLike['address'] | string | null
  cadastralNumber?: string | null
  price?: number | null
  area?: number | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  photos?: string[]
  description?: string
}

/** Веса признаков: сумма 100 */
const W = {
  cadastral: 25,
  address: 30,
  price: 10,
  area: 10,
  rooms: 8,
  floor: 7,
  photos: 5,
  description: 5,
} as const

/** Русские подписи совпавших признаков для карточки CRM */
export const MATCH_PARAM_LABELS: Record<string, string> = {
  cadastral: 'кадастровый номер',
  address: 'адрес',
  price: 'цена',
  area: 'площадь',
  rooms: 'комнаты',
  floor: 'этаж',
  photos: 'фотографии',
  description: 'описание',
}

/**
 * Степень совпадения объекта Н15 с объявлением площадки.
 * Возвращает процент (0..100), список совпавших признаков и короткий вывод.
 * Кадастровый номер и точный адрес — «жёсткие» признаки: их совпадения
 * достаточно для уверенного результата даже без остальных данных.
 */
export function listingMatch(o: ObjectLike, l: ListingLike): {
  match: number
  matched: string[]
  verdict: 'none' | 'weak' | 'strong'
} {
  const matched: string[] = []
  let score = 0
  const add = (k: keyof typeof W, factor: number) => {
    if (factor <= 0) return
    matched.push(k)
    score += W[k] * Math.min(factor, 1)
  }

  // Кадастровый — жёсткий признак (как телефон в парсере пересечений)
  const oCad = normCad(o.cadastralNumber)
  const lCad = normCad(typeof l.cadastralNumber === 'string' ? l.cadastralNumber : null)
  if (oCad && lCad && oCad === lCad) add('cadastral', 1)

  // Адрес: полный ключ (с квартирой) — точное совпадение; базовый (улица+дом)
  // — сильное; улица/дом с опечатками — по пересечению слов.
  let oBase = ''
  let oFull = ''
  const oAddr = o.address as ObjectLike['address'] | null | undefined
  if (oAddr && typeof oAddr === 'object') {
    oBase = addressBaseKey(oAddr)
    oFull = addressFullKey(oAddr)
  }
  const lAddr = l.address
  const lAddrObj = lAddr && typeof lAddr === 'object' ? (lAddr as object) : null
  let lBase = ''
  let lFull = ''
  if (lAddrObj) {
    const a = lAddrObj as { city?: string; locality?: string; street?: string; house?: string; apartment?: string }
    lBase = addressBaseKey(a)
    lFull = addressFullKey(a)
  }
  if (oFull && lFull) {
    if (oFull === lFull) {
      add('address', 1)
    } else if (oBase === lBase) {
      // Дом и улица совпали, разошлись квартиры — сильное, но не точное
      add('address', 0.85)
    } else {
      const ov = wordOverlap(oBase, lBase)
      if (ov >= 0.5) add('address', ov >= 0.9 ? 0.85 : 0.6)
    }
  } else if (oAddr && lAddr && typeof lAddr === 'string') {
    // Внешний адрес строкой (без разбора на поля): по пересечению слов
    const oText = normAddrText([oAddr.locality || oAddr.city, oAddr.street, oAddr.house, oAddr.apartment].filter(Boolean).join(' '))
    const ov = wordOverlap(oText, lAddr)
    if (oText && ov >= 0.55) {
      add('address', ov >= 0.85 ? 1 : 0.7)
    }
  }

  // Цена и площадь — с допуском на торг и округления площадок
  const oPrice = normNum(o.price)
  const lPrice = normNum(typeof l.price === 'number' ? l.price : null)
  if (oPrice && lPrice && oPrice > 0 && lPrice > 0) add('price', numWithin(oPrice, lPrice, 0.05))
  const oArea = normNum(o.area)
  const lArea = normNum(typeof l.area === 'number' ? l.area : null)
  if (oArea && lArea && oArea > 0 && lArea > 0) add('area', numWithin(oArea, lArea, 0.04))

  // Комнаты и этаж
  const oRooms = normNum(o.rooms)
  const lRooms = normNum(typeof l.rooms === 'number' ? l.rooms : null)
  if (oRooms && lRooms && oRooms === lRooms) add('rooms', 1)
  const oFloor = normNum(o.floor)
  const lFloor = normNum(typeof l.floor === 'number' ? l.floor : null)
  if (oFloor && lFloor && oFloor === lFloor) add('floor', 1)

  // Фотографии: по пересечению имён/URL (если обе стороны отдают списки)
  const oPhotos = (o.photos || []).filter(Boolean)
  const lPhotos = (l.photos || []).filter(Boolean)
  if (oPhotos.length && lPhotos.length) {
    const normP = (u: string) => normWord(u.split('/').pop() || u)
    const oSet = new Set(oPhotos.map(normP))
    const inter = lPhotos.filter((u) => oSet.has(normP(u))).length
    if (inter > 0) add('photos', Math.min(1, (2 * inter) / (oPhotos.length + lPhotos.length)))
    else {
      // Списков нет пересечения, но количество близко — слабый признак
      const ratio = Math.min(oPhotos.length, lPhotos.length) / Math.max(oPhotos.length, lPhotos.length)
      if (ratio >= 0.7) add('photos', 0.35)
    }
  }

  // Описание: пересечение слов (без шума и коротких слов)
  const oDesc = normText(o.description || '')
  const lDesc = normText(typeof l.description === 'string' ? l.description : '')
  if (oDesc && lDesc) {
    const cut = (s: string) => s.replace(/[^a-zа-я0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3)
    const oWords = new Set(cut(oDesc))
    const lWords = cut(lDesc)
    if (oWords.size && lWords.length) {
      const hits = lWords.filter((w) => oWords.has(w)).length
      const ov = hits / Math.min(oWords.size, lWords.length)
      if (ov >= 0.4) add('description', Math.min(1, ov))
    }
  }

  const pct = Math.min(100, Math.round(score))
  const verdict: 'none' | 'weak' | 'strong' =
    pct >= 75 ? 'strong' : pct >= 45 ? 'weak' : 'none'
  return { match: pct, matched, verdict }
}

// --- Статусы объявлений и периодичность -----------------------------------------

export type PlacementStatus = 'active' | 'removed' | 'needsCheck'
export type PlacementSource = 'manual' | 'auto'

/** Период автоматической проверки (часы) — при работающем официальном канале */
export const CHECK_INTERVAL_HOURS = 24
/** Через сколько суток ручная ссылка без подтверждения становится «требует проверки» */
export const MANUAL_STALE_DAYS = 7
/** Период фонового прохода sweep-маршрута (минуты) — клиентский и серверный таймер */
export const SWEEP_INTERVAL_MINUTES = 30

export const hourMs = 3600_000
export const dayMs = 24 * hourMs

/** Не пора ли проверить объект (по nextCheckAt из БД) */
export const isDueForCheck = (nextCheckAt?: string | null, now = Date.now()): boolean =>
  !nextCheckAt || new Date(nextCheckAt).getTime() <= now

/** Дата следующей проверки */
export const nextCheckAfter = (now = Date.now(), hours = CHECK_INTERVAL_HOURS): string =>
  new Date(now + hours * hourMs).toISOString()

/** Сколько времени прошло с последней проверки, в сутках (для надписи) */
export const daysSince = (at?: string | null, now = Date.now()): number | null => {
  if (!at) return null
  return Math.max(0, Math.floor((now - new Date(at).getTime()) / dayMs))
}

/** Поисковые ссылки по адресу объекта — для ручной проверки агента */
export function platformSearchLinks(o: ObjectLike): { slug: string; name: string; url: string }[] {
  const addr = o.address as ObjectLike['address'] | null | undefined
  const parts = [addr?.locality || addr?.city, addr?.street, addr?.house].filter(Boolean)
  const query = parts.join(', ')
  return PLATFORM_SPECS.map((p) => ({ slug: p.slug, name: p.name, url: p.searchUrl(query) }))
}

/**
 * Состояние «сверки» по площадке без официального канала: автоматический
 * поиск запрещён правилами площадки — вернёт причину и ссылку на ручной поиск.
 */
export interface PlatformProbeResult {
  platform: string
  auto: boolean
  reason?: string
  searchUrl?: string
}

export function probePlatform(spec: PlatformSpec, o: ObjectLike): PlatformProbeResult {
  if (platformHasApi(spec)) {
    return { platform: spec.slug, auto: true }
  }
  const query = (() => {
    const addr = o.address as ObjectLike['address'] | null | undefined
    return [addr?.locality || addr?.city, addr?.street, addr?.house].filter(Boolean).join(', ')
  })()
  return {
    platform: spec.slug,
    auto: false,
    reason: spec.api
      ? `Автосбор на площадке запрещён. Для автоматической сверки подключите официальный доступ: ${spec.api.note}. Проверьте объявление вручную по ссылке`
      : 'Площадка не предоставляет официального API — объявление проверяется вручную по ссылке',
    searchUrl: spec.searchUrl(query),
  }
}

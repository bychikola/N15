/**
 * «Проверить размещение» — движок автоматической проверки того, размещён ли
 * объект карточки CRM где-то ещё (кнопка в карточке объекта, см.
 * PlacementCheckBlock). Данные объекта (адрес, город, район, тип, площадь,
 * комнаты, этаж, цена, описание, фотографии) снимаются с карточки
 * автоматически — агент ничего не вводит руками.
 *
 * ЧЕСТНОСТЬ РЕЗУЛЬТАТА (требование владельца): площадка показывается как
 * «Площадка не подключена» или «Нужен доступ администратора», если её
 * официальный канал не подключён (см. platform-integrations.ts), а не как
 * пустая карточка работающего парсера. Такой результат не имитируется —
 * вместо выдуманного «найдено/не найдено» показывается причина и
 * автоматически сформированная ссылка на поиск для ручной проверки.
 * Автопоиск выполняется только там, где канал есть: собственные публикации
 * (сайт N15, VK, Telegram), официальные каналы площадок (доступы из раздела
 * «Интеграции площадок») и сохранённые в CRM объявления рынка.
 *
 * Файл без побочных эффектов (импортирует только чистые listing-check и
 * market-parser): работает на сервере и в быстрых проверках node.
 */
import {
  MATCH_PARAM_LABELS,
  PLATFORM_SPECS,
  listingMatch,
  platformHasApi,
  type ListingLike,
  type ObjectLike,
} from './listing-check'
import { MARKET_PLATFORM_NAMES } from './market-parser'
import { INTEGRATION_SPECS, type ConnectionStatus, type PlatformListing } from './platform-integrations'

// --- Результат проверки по площадке ---------------------------------------------

/** Найдено / не найдено / площадка не подключена (без имитации) */
export type PlacementCheckStatus = 'found' | 'notFound' | 'unavailable'

/** Чем получен результат: своя публикация, официальный канал, база рынка */
export type PlacementCheckSource = 'own' | 'api' | 'market' | 'none'

export interface PlacementProbe {
  /** Код площадки (avito, cian, domclick, yandex, site, vk, telegram) */
  platform: string
  /** Название площадки для карточки */
  name: string
  status: PlacementCheckStatus
  source: PlacementCheckSource
  /** Автоматически сформированная ссылка: найденное объявление или поиск по параметрам объекта */
  url: string
  /** Прямая ссылка на найденное объявление (когда статус «найдено») */
  listingUrl?: string | null
  /** Почему такой статус: каким каналом проверяли либо почему площадка не опрошена */
  reason?: string | null
  /** Совпадение адреса и параметров, % (null — сравнения не было) */
  match?: number | null
  /** Какие признаки совпали (address, price, area, rooms, floor, photos, description) */
  matchParams?: string[]
  /** Совпадение фотографий, % (доля фотографий объекта, найденных в объявлении) */
  photoMatch?: number | null
  /** Цена в найденном объявлении, ₽ */
  price?: number | null
  /** Дата публикации найденного объявления */
  publishedAt?: string | null
  /** Вероятность, что найдено именно это объявление, % (оценка по признакам) */
  probability?: number | null
  /** Заголовок найденного объявления */
  title?: string | null
  /** Сколько объявлений площадки просмотрено */
  candidates?: number
  /**
   * Состояние подключения площадки (см. platform-integrations.ts): почему
   * проверки нет — «площадка не подключена» или «нужен доступ администратора».
   * Пустой статус без этого поля выглядел бы как работающий парсер.
   */
  connection?: ConnectionStatus | null
  /** Подпись состояния подключения для карточки */
  connectionLabel?: string | null
}

export const PLACEMENT_STATUS_LABELS: Record<PlacementCheckStatus, string> = {
  found: 'Найдено',
  notFound: 'Не найдено',
  // Площадка не опрошена (нет официального доступа) — это не результат
  // проверки, а её отсутствие: так и подписано в интерфейсе
  unavailable: 'Площадка не подключена',
}

export const PLACEMENT_SOURCE_LABELS: Record<PlacementCheckSource, string> = {
  own: 'наша публикация',
  api: 'официальный канал площадки',
  market: 'сохранённые объявления CRM',
  none: '—',
}

// --- Каналы проверки по площадкам ------------------------------------------------

/**
 * Чем площадка проверяется автоматически:
 * own  — наша собственная публикация (сайт N15, VK, Telegram): точные данные
 *        из группы publishing, поиск не нужен;
 * api  — официальный канал площадки (API по договору): доступы в разделе
 *        «Интеграции площадок» или в окружении;
 * none — программного доступа нет (фид загружается в кабинет вручную) —
 *        статус «Нужен доступ администратора».
 */
export type PlacementChannelKind = 'own' | 'api' | 'none'

export interface PlacementChannelSpec {
  slug: string
  name: string
  kind: PlacementChannelKind
  /** Ключи окружения официального канала (kind = 'api') */
  env?: string[]
  /** Что нужно, чтобы автоматическая проверка заработала */
  requirement: string
}

/** Наши собственные публикации — проверяются точно, без поиска */
export const OWN_CHANNELS: PlacementChannelSpec[] = [
  {
    slug: 'site',
    name: 'Сайт N15',
    kind: 'own',
    requirement: 'Наш собственный каталог — данные публикации берутся из карточки напрямую',
  },
  {
    slug: 'vk',
    name: 'VK',
    kind: 'own',
    requirement: 'Наше сообщество — статус поста берётся из карточки (группа publishing)',
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    kind: 'own',
    requirement: 'Наш канал — статус поста берётся из карточки (группа publishing)',
  },
]

/**
 * Площадки объявлений: официальный канал есть — сверяем по нему, нет — не
 * имитируем. Реестр каналов один — platform-integrations.ts (там же реальные
 * проверки соединения и забор своих объявлений), здесь берём площадки
 * объявлений с их требованиями к доступу.
 */
const MARKET_SLUGS = new Set<string>(PLATFORM_SPECS.map((p) => p.slug))

export const MARKET_CHANNELS: PlacementChannelSpec[] = INTEGRATION_SPECS
  .filter((spec) => MARKET_SLUGS.has(spec.slug))
  .map((spec) => ({
    slug: spec.slug,
    name: spec.name,
    kind: spec.probe ? 'api' : 'none',
    env: spec.credentials.map((c) => c.env),
    requirement: spec.channel.needs,
  }))

export const PLACEMENT_CHANNELS: PlacementChannelSpec[] = [...MARKET_CHANNELS, ...OWN_CHANNELS]

export const placementChannelBySlug = (slug: string): PlacementChannelSpec | undefined =>
  PLACEMENT_CHANNELS.find((c) => c.slug === slug)

/** Название площадки по коду (в т.ч. для записей базы рынка: vk, instagram…) */
export const placementPlatformName = (slug?: string | null): string =>
  (slug && (MARKET_PLATFORM_NAMES[slug] || placementChannelBySlug(slug)?.name)) || slug || '—'

// Настроен ли официальный канал площадки — решает platform-integration-service
// (доступы хранятся в CRM, окружение — запасной источник), см. platformChannelAccess

// --- Поисковый запрос и ссылки по данным объекта -----------------------------------

/** Тип объекта словами — для поискового запроса и подписи в карточке */
const CATEGORY_WORDS: Record<string, string> = {
  apartment: 'квартира',
  house: 'дом',
  townhouse: 'таунхаус',
  commercial: 'коммерческая недвижимость',
  land: 'земельный участок',
}

export interface SearchObjectLike extends ObjectLike {
  /** Категория объекта (apartment/house/…) и тип сделки (sale/rent) */
  category?: string | null
  dealType?: string | null
  /** Район города/округа — входит в поисковый запрос */
  district?: string | null
}

/** «1-комнатная квартира», «дом», «земельный участок» — по категории и комнатам */
export function objectKindWord(o: SearchObjectLike): string {
  const base = CATEGORY_WORDS[o.category || ''] || ''
  if (!base) return ''
  if ((o.category === 'apartment' || o.category === 'townhouse') && o.rooms && o.rooms > 0) {
    return `${o.rooms}-комнатная ${base}`
  }
  return base
}

/**
 * Поисковый текст по данным объекта: «Владикавказ, Цоколаева, 36,
 * 1-комнатная квартира, 43 м²». Без цены и номера квартиры — они мешают
 * поиску на площадках.
 */
export function objectSearchQuery(o: SearchObjectLike): string {
  const addr = o.address || {}
  const kind = objectKindWord(o)
  const area = typeof o.area === 'number' && o.area > 0 ? `${trimNum(o.area)} м²` : ''
  const parts = [
    addr.locality || addr.city,
    // Район добавляем только осмысленный (Затеречный и т.п.): формальное
    // «Владикавказский городской округ» в поиске только мешает
    o.district && o.district !== addr.locality && !/округ/i.test(o.district) ? o.district : '',
    addr.street,
    addr.house,
    kind,
    area,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean)
  return parts.join(', ')
}

const trimNum = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

/** Автоматически сформированная ссылка на поиск площадки по параметрам объекта */
export function platformSearchLink(slug: string, query: string): string {
  const spec = PLATFORM_SPECS.find((p) => p.slug === slug)
  if (!spec) return ''
  return spec.searchUrl(query)
}

/** Ссылки на поиск по всем площадкам объявлений (для ручной проверки) */
export function allPlatformSearchLinks(query: string): { slug: string; name: string; url: string }[] {
  return PLATFORM_SPECS.map((p) => ({ slug: p.slug, name: p.name, url: p.searchUrl(query) }))
}

// --- Сравнение объекта с найденным объявлением --------------------------------------

const clamp100 = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

/**
 * Совпадение фотографий: доля фотографий объекта, найденных в объявлении
 * (по имени файла в ссылке). null — сравнивать нечего (у одной из сторон
 * фотографий нет).
 */
export function photoMatchPct(objectPhotos?: string[] | null, listingPhotos?: string[] | null): number | null {
  const mine = (objectPhotos || []).filter(Boolean)
  const theirs = (listingPhotos || []).filter(Boolean)
  if (!mine.length || !theirs.length) return null
  const key = (u: string) => (u.split('/').pop() || u).toLowerCase().replace(/[^a-z0-9]/g, '')
  const inListing = new Set(theirs.map(key))
  const hits = mine.filter((u) => inListing.has(key(u))).length
  return clamp100((hits / mine.length) * 100)
}

/** Вес совпадения фотографий в итоговой вероятности (остальное — признаки) */
export const PHOTO_WEIGHT = 0.2

/**
 * Вероятность, что найдено именно это объявление: совпадение признаков
 * (адрес, цена, площадь, комнаты, этаж, описание, фото — веса listingMatch)
 * плюс отдельный вклад совпадения фотографий. Это детерминированная оценка
 * по данным карточки, а не статистическая вероятность — так она и
 * подписывается в интерфейсе.
 */
export function matchProbability(match: number, photoMatch?: number | null): number {
  const base = clamp100(match)
  if (photoMatch == null) return base
  return clamp100(base * (1 - PHOTO_WEIGHT) + clamp100(photoMatch) * PHOTO_WEIGHT)
}

export interface ListingMatchResult {
  match: number
  matched: string[]
  verdict: 'none' | 'weak' | 'strong'
  photoMatch: number | null
  probability: number
}

/** Полное сравнение объекта с объявлением площадки: признаки + фото + вероятность */
export function compareWithListing(o: SearchObjectLike, l: ListingLike): ListingMatchResult {
  const m = listingMatch(o, l)
  const photoMatch = photoMatchPct(o.photos, l.photos)
  return {
    match: m.match,
    matched: m.matched,
    verdict: m.verdict,
    photoMatch,
    probability: matchProbability(m.match, photoMatch),
  }
}

/** Порог, с которого совпадение считаем находкой (иначе — «не найдено») */
export const FOUND_MIN_MATCH = 45

/** Подписи совпавших признаков для карточки (как в блоке размещений) */
export const probeParamLabels = (params?: string[] | null): string[] =>
  (params || []).map((p) => MATCH_PARAM_LABELS[p] || p)

/** Есть ли у площадки официальный канал (для пояснений в интерфейсе) */
export const platformHasOfficialChannel = (slug: string): boolean => {
  const spec = PLATFORM_SPECS.find((p) => p.slug === slug)
  return !!spec && platformHasApi(spec)
}

// --- Проверка объекта по подключённой площадке ------------------------------------------

/**
 * Результат сверки объекта CRM с объявлениями агентства на площадке —
 * то, что видит администратор в разделе «Интеграции площадок»: найдено ли
 * объявление, ссылка, цена, дата, совпадение параметров и фотографий.
 */
export interface PlatformObjectCheck {
  platform: string
  name: string
  /** Найдено ли объявление этого объекта среди объявлений агентства */
  found: boolean
  /** Сколько объявлений площадки проверено */
  checked: number
  listingUrl: string | null
  title: string | null
  price: number | null
  publishedAt: string | null
  /** Совпадение адреса и параметров, % */
  match: number | null
  /** Совпавшие признаки (address, price, area, rooms, floor, photos, description) */
  matchParams: string[]
  /** Совпадение фотографий, % */
  photoMatch: number | null
  /** Вероятность, что это то самое объявление, % */
  probability: number | null
  /** Понятный итог: найдено, не найдено или почему проверка не выполнена */
  reason: string
}

/**
 * Данные объекта публикации (см. PublishObjectLike в publishing.ts) — только
 * те поля, что нужны для поиска. Структурный тип, чтобы чистый движок поиска
 * не зависел от модуля публикации.
 */
export interface PublishLike {
  price?: number | null
  area?: number | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  description?: string | null
  photos?: string[] | null
  type?: string | null
}

/**
 * Признаки объекта CRM для поиска: адрес из карточки, цена/площадь/комнаты/
 * этаж/описание/фотографии — из объекта публикации (данные снимаются с
 * карточки автоматически, агенту вводить нечего).
 */
export function searchObjectFromDoc(doc: Record<string, unknown>, pub: PublishLike): SearchObjectLike {
  const addr = (doc.address || {}) as Record<string, string | undefined>
  const city = (addr.locality || addr.city || '').trim()
  const district = typeof addr.district === 'string' ? addr.district : ''
  return {
    address: {
      city: addr.city || undefined,
      locality: addr.locality || undefined,
      street: addr.street || undefined,
      house: addr.house || undefined,
      apartment: addr.apartment || undefined,
    },
    cadastralNumber: typeof doc.cadastralNumber === 'string' ? doc.cadastralNumber : null,
    price: pub.price ?? null,
    area: pub.area ?? null,
    rooms: pub.rooms ?? null,
    floor: pub.floor ?? null,
    totalFloors: pub.totalFloors ?? null,
    description: pub.description || '',
    photos: pub.photos || [],
    category: typeof doc.category === 'string' ? doc.category : null,
    dealType: pub.type ?? null,
    district: district && district !== city ? district : '',
  }
}

/**
 * Поиск объявления объекта среди объявлений агентства, полученных с площадки
 * официальным каналом. Лучшее совпадение выше порога — находка; иначе честное
 * «не найдено» с числом просмотренных объявлений (пустой список — площадка не
 * отдала объявления, сверять не с чем).
 */
export function matchObjectInListings(
  object: SearchObjectLike,
  listings: PlatformListing[],
): Omit<PlatformObjectCheck, 'platform' | 'name'> {
  const ranked = listings
    .map((listing) => ({ listing, cmp: compareWithListing(object, listing) }))
    .sort((a, b) => b.cmp.probability - a.cmp.probability)
  const best = ranked[0]

  if (!best || best.cmp.match < FOUND_MIN_MATCH) {
    return {
      found: false,
      checked: listings.length,
      listingUrl: null,
      title: null,
      price: null,
      publishedAt: null,
      match: best ? best.cmp.match : null,
      matchParams: best ? best.cmp.matched : [],
      photoMatch: best ? best.cmp.photoMatch : null,
      probability: best ? best.cmp.probability : null,
      reason: listings.length
        ? `Проверено объявлений площадки: ${listings.length} — совпадений с объектом нет`
        : 'Площадка не отдала объявления агентства — сверять не с чем',
    }
  }

  return {
    found: true,
    checked: listings.length,
    listingUrl: best.listing.url,
    title: best.listing.title,
    price: typeof best.listing.price === 'number' ? best.listing.price : null,
    publishedAt: best.listing.publishedAt,
    match: best.cmp.match,
    matchParams: best.cmp.matched,
    photoMatch: best.cmp.photoMatch,
    probability: best.cmp.probability,
    reason: best.listing.url
      ? 'Объявление этого объекта найдено среди объявлений агентства на площадке'
      : 'Объявление найдено, но площадка не отдала ссылку на него — откройте кабинет площадки',
  }
}

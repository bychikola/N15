/**
 * «Проверить размещение» — движок автоматической проверки того, размещён ли
 * объект карточки CRM где-то ещё (кнопка в карточке объекта, см.
 * PlacementCheckBlock). Данные объекта (адрес, город, район, тип, площадь,
 * комнаты, этаж, цена, описание, фотографии) снимаются с карточки
 * автоматически — агент ничего не вводит руками.
 *
 * ЧЕСТНОСТЬ РЕЗУЛЬТАТА (требование владельца): площадка показывается как
 * «проверка недоступна», если у неё нет официального API/фида и её правила
 * запрещают автоматический сбор. Такой результат не имитируется — вместо
 * выдуманного «найдено/не найдено» показывается причина и автоматически
 * сформированная ссылка на поиск для ручной проверки. Автопоиск выполняется
 * только там, где канал есть: собственные публикации (сайт N15, VK,
 * Telegram), официальные каналы площадок (ключи в окружении, см. PLATFORM_SPECS)
 * и сохранённые в CRM объявления рынка.
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

// --- Результат проверки по площадке ---------------------------------------------

/** Найдено / не найдено / проверка недоступна (без имитации) */
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
  /** Почему такой статус: каким каналом проверяли либо почему проверка недоступна */
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
}

export const PLACEMENT_STATUS_LABELS: Record<PlacementCheckStatus, string> = {
  found: 'Найдено',
  notFound: 'Не найдено',
  unavailable: 'Проверка недоступна',
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
 * api  — официальный канал площадки (API/фид по договору): ключи в окружении;
 * none — официального канала нет, правила площадки запрещают автосбор —
 *        статус «проверка недоступна».
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

/** Площадки объявлений: официальный канал есть — сверяем, нет — не имитируем */
export const MARKET_CHANNELS: PlacementChannelSpec[] = PLATFORM_SPECS.map((spec) => ({
  slug: spec.slug,
  name: spec.name,
  kind: spec.api ? 'api' : 'none',
  env: spec.api?.env,
  requirement: spec.api
    ? `Доступ к объявлениям площадки: ${spec.api.note}`
    : 'Официального API/фида для поиска чужих объявлений нет, правила площадки запрещают автоматический сбор',
}))

export const PLACEMENT_CHANNELS: PlacementChannelSpec[] = [...MARKET_CHANNELS, ...OWN_CHANNELS]

export const placementChannelBySlug = (slug: string): PlacementChannelSpec | undefined =>
  PLACEMENT_CHANNELS.find((c) => c.slug === slug)

/** Название площадки по коду (в т.ч. для записей базы рынка: vk, instagram…) */
export const placementPlatformName = (slug?: string | null): string =>
  (slug && (MARKET_PLATFORM_NAMES[slug] || placementChannelBySlug(slug)?.name)) || slug || '—'

/** Настроен ли официальный канал площадки (ключи в окружении) */
export const channelConfigured = (spec: PlacementChannelSpec): boolean =>
  !!spec.env && spec.env.length > 0 && spec.env.every((k) => process.env[k] && String(process.env[k]).trim().length > 0)

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

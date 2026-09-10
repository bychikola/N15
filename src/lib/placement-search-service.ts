/**
 * «Проверить размещение» — серверная обвязка движка placement-search.ts.
 *
 * Кнопка в карточке объекта CRM вызывает маршрут /api/objects/check-placement,
 * тот зовёт searchObjectPlacements: данные объекта снимаются с карточки
 * автоматически (адрес, город, район, тип, площадь, комнаты, этаж, цена,
 * описание, фотографии — через toPublishObject, как при публикации), после
 * чего по каждой площадке определяется, размещён ли этот же объект где-то ещё.
 *
 * Источники проверки (только реальные, без имитации):
 *   • свои публикации (сайт N15, VK, Telegram) — статус из группы publishing;
 *   • сохранённые в CRM объявления рынка (market-listings) — сверка признаков;
 *   • официальный канал площадки (API/фид по договору) — при ключах в окружении.
 * Площадка без канала получает статус «проверка недоступна» с причиной и
 * автоматически сформированной ссылкой на поиск — выдуманных «найдено/не
 * найдено» здесь нет (см. src/lib/listing-check.ts о правилах площадок).
 *
 * Снимок результата сохраняется в скрытую группу placements объекта (поле
 * search), чтобы карточка показывала последнюю проверку до нажатия кнопки.
 */
import type { Payload } from 'payload'
import { toPublishObject } from './publish-service'
import {
  FOUND_MIN_MATCH,
  allPlatformSearchLinks,
  compareWithListing,
  channelConfigured,
  MARKET_CHANNELS,
  OWN_CHANNELS,
  objectSearchQuery,
  platformSearchLink,
  type PlacementChannelSpec,
  type PlacementProbe,
  type SearchObjectLike,
} from './placement-search'
import type { ListingLike } from './listing-check'
import { marketPlatformByUrl } from './market-parser'

const HARD_LIMIT_LISTINGS = 1000

/** Данные, которые система сняла с карточки для поиска (показываются в блоке) */
export interface PlacementSearchProfile {
  /** Поисковый текст, по которому сформированы ссылки площадок */
  query: string
  address: string
  city: string
  district: string
  kind: string
  area: number | null
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  price: number | null
  /** Сколько символов описания ушло в сверку */
  descriptionChars: number
  /** Сколько фотографий объекта участвует в сверке */
  photos: number
  /** Ссылки на поиск площадок по параметрам объекта */
  searchLinks: { slug: string; name: string; url: string }[]
}

export interface PlacementSearchResult {
  objectId: number | string
  checkedAt: string
  profile: PlacementSearchProfile
  probes: PlacementProbe[]
  /** Сколько площадок показали «найдено» и сколько — «проверка недоступна» */
  found: number
  unavailable: number
}

type Probe = PlacementProbe

/** Объявление-кандидат: объявление площадки плюс ссылка/заголовок/дата, если канал их дал */
type CandidateListing = ListingLike & { url?: string | null; title?: string | null; publishedAt?: string | null }

/** Итог поиска по одной площадке (до сборки строки результата) */
interface ChannelOutcome {
  found?: { listing: CandidateListing; note: string }
  candidates?: number
  unavailableReason?: string
}

// --- Источники -----------------------------------------------------------------------

/**
 * Поиск объявлений площадки по официальному каналу (API/фид по договору).
 * Формат ответа у каждой площадки свой, поэтому разбор появляется здесь по
 * мере подключения доступа. Пока адаптера нет — возвращаем причину, а не
 * выдуманные объявления: вызывающий код покажет «проверка недоступна».
 */
async function fetchChannelListings(
  spec: PlacementChannelSpec,
): Promise<{ listings: ListingLike[]; error?: string }> {
  return {
    listings: [],
    error: `Автоматический поиск по каналу «${spec.name}» не подключён. Для проверки нужен доступ: ${spec.requirement}`,
  }
}

/** Своя публикация из группы publishing: статус поста/страницы для площадки */
function ownPublication(
  doc: Record<string, unknown>,
  slug: string,
): { status: string; url: string | null; publishedAt: string | null } | null {
  const group = (doc.publishing || {}) as { items?: { platform?: string; status?: string; externalUrl?: string | null; publishedAt?: string | null }[] }
  const items = Array.isArray(group.items) ? group.items : []
  const item = items.find((it) => it?.platform === slug)
  if (!item) return null
  return {
    status: (item.status || 'off') as string,
    url: item.externalUrl || null,
    publishedAt: item.publishedAt || null,
  }
}

/** Приведение записи market-listings к объявлению площадки для сверки */
function marketListingLike(doc: Record<string, unknown>): CandidateListing {
  // Фотографии записи: в базе CRM это группы { url }, официальные каналы
  // могут отдавать просто ссылки — принимаем оба вида
  const photos = Array.isArray(doc.photoUrls)
    ? (doc.photoUrls as (string | { url?: string | null })[])
        .map((p) => (typeof p === 'string' ? p : p?.url || ''))
        .filter(Boolean)
    : []
  return {
    address: (doc.address as string) || null,
    price: typeof doc.price === 'number' ? doc.price : null,
    area: typeof doc.area === 'number' ? doc.area : null,
    rooms: typeof doc.rooms === 'number' ? doc.rooms : null,
    photos,
    // Описания у записи рынка нет (note — служебная пометка, для сверки не годится)
    description: '',
    url: (doc.url as string) || '',
    title: (doc.title as string) || null,
    publishedAt: (doc.publishedAt as string) || (doc.firstSeenAt as string) || null,
  }
}

// --- Основной прогон -------------------------------------------------------------------

/**
 * Полный прогон проверки размещения одного объекта. Возвращает снимок
 * результата; сохранение — на вызывающей стороне (persistPlacementSearch).
 */
export async function searchObjectPlacements(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<PlacementSearchResult> {
  const objectId = doc.id as number | string
  const pub = await toPublishObject(payload, doc)
  const addr = (doc.address || {}) as Record<string, string | undefined>
  const category = typeof doc.category === 'string' ? doc.category : null
  const district = typeof addr.district === 'string' ? addr.district : ''
  const city = (addr.locality || addr.city || '').trim()

  const object: SearchObjectLike = {
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
    category,
    dealType: pub.type ?? null,
    district: district && district !== city ? district : '',
  }

  const query = objectSearchQuery(object)
  const searchLinks = allPlatformSearchLinks(query)
  const linkFor = (slug: string): string => searchLinks.find((l) => l.slug === slug)?.url || platformSearchLink(slug, query)

  const probes: Probe[] = []

  // 1. Свои публикации: сайт N15, VK, Telegram — точные данные из карточки.
  // Для сайта признак публикации — статус объекта (выгрузка = публикация в
  // каталоге, см. publishing.ts), для VK/Telegram — строка группы publishing.
  for (const spec of OWN_CHANNELS) {
    const own = ownPublication(doc, spec.slug)
    const onSite = spec.slug === 'site' && doc.status === 'published'
    const url = own?.url || (spec.slug === 'site' ? pub.objectUrl : null) || linkFor(spec.slug)
    if ((own && own.status === 'published') || onSite) {
      probes.push({
        platform: spec.slug,
        name: spec.name,
        status: 'found',
        source: 'own',
        url,
        listingUrl: url,
        reason: onSite && !own
          ? 'Объект опубликован в каталоге сайта N15 (статус карточки) — это тот же объект, совпадение точное'
          : 'Наша собственная публикация — тот же объект карточки, совпадение точное',
        match: 100,
        matchParams: [],
        photoMatch: null,
        price: pub.price ?? null,
        publishedAt: own?.publishedAt || null,
        probability: 100,
        title: pub.title || null,
      })
    } else {
      probes.push({
        platform: spec.slug,
        name: spec.name,
        status: 'notFound',
        source: 'own',
        url,
        reason: own
          ? `Объект не опубликован на площадке (статус: ${own.status === 'error' ? 'ошибка публикации' : own.status === 'removed' ? 'снят' : 'выключен'})`
          : 'Объект не выгружался на площадку из карточки',
        match: null,
        // Цена объявления показывается только у найденной записи площадки
        price: null,
        publishedAt: null,
        probability: null,
        title: pub.title || null,
      })
    }
  }

  // 2. Объявления рынка, сохранённые в CRM: сверяем признаки объекта
  const marketDocs: Record<string, unknown>[] = []
  try {
    const res = await payload.find({
      collection: 'market-listings',
      where: { status: { not_equals: 'removed' } },
      limit: HARD_LIMIT_LISTINGS,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of res.docs) marketDocs.push(d as unknown as Record<string, unknown>)
  } catch (e) {
    console.error('Placement search: market-listings read failed:', e)
  }

  const byPlatform = new Map<string, { listing: CandidateListing; cmp: ReturnType<typeof compareWithListing> }[]>()
  for (const raw of marketDocs) {
    const listing = marketListingLike(raw)
    const slug = (typeof raw.platform === 'string' && raw.platform) || marketPlatformByUrl(listing.url || '')
    const cmp = compareWithListing(object, listing)
    const list = byPlatform.get(slug) || []
    list.push({ listing, cmp })
    byPlatform.set(slug, list)
  }

  // 3. Площадки объявлений: находки из базы рынка, официальный канал или «недоступна»
  for (const spec of MARKET_CHANNELS) {
    const stored = (byPlatform.get(spec.slug) || []).sort((a, b) => b.cmp.match - a.cmp.match)
    const best = stored[0]
    const outcome: ChannelOutcome = { candidates: stored.length }

    if (best && best.cmp.match >= FOUND_MIN_MATCH) {
      outcome.found = { listing: best.listing, note: 'Найдено среди сохранённых в CRM объявлений рынка' }
    } else if (spec.kind === 'api' && channelConfigured(spec)) {
      // Канал есть — спрашиваем площадку; адаптер подключается по договору
      const res = await fetchChannelListings(spec)
      outcome.candidates = (outcome.candidates || 0) + (res.listings || []).length
      const matches = (res.listings || [])
        .map((l) => ({ listing: l as CandidateListing, cmp: compareWithListing(object, l) }))
        .sort((a, b) => b.cmp.match - a.cmp.match)
      if (matches[0] && matches[0].cmp.match >= FOUND_MIN_MATCH) {
        outcome.found = { listing: matches[0].listing, note: 'Найдено официальным каналом площадки' }
      } else if (res.error) {
        outcome.unavailableReason = res.error
      }
    } else {
      outcome.unavailableReason = spec.kind === 'api'
        ? `Официальный канал не подключён. ${spec.requirement}`
        : spec.requirement
    }

    probes.push(probeForChannel(spec, outcome, linkFor(spec.slug), object))
  }

  const sorted = sortProbes(probes)
  return {
    objectId,
    checkedAt: new Date().toISOString(),
    profile: {
      query,
      address: addressLine(addr),
      city,
      district,
      kind: probeKindText(category, pub.rooms ?? null, pub.type ?? null),
      area: pub.area ?? null,
      rooms: pub.rooms ?? null,
      floor: pub.floor ?? null,
      totalFloors: pub.totalFloors ?? null,
      price: pub.price ?? null,
      descriptionChars: (pub.description || '').length,
      photos: (pub.photos || []).length,
      searchLinks,
    },
    probes: sorted,
    found: sorted.filter((p) => p.status === 'found').length,
    unavailable: sorted.filter((p) => p.status === 'unavailable').length,
  }
}

/** Строка результата по площадке: находка, «не найдено» или «недоступна» */
function probeForChannel(
  spec: PlacementChannelSpec,
  outcome: ChannelOutcome,
  searchUrl: string,
  object: SearchObjectLike,
): Probe {
  const base: Probe = {
    platform: spec.slug,
    name: spec.name,
    status: 'unavailable',
    source: 'none',
    url: searchUrl,
    price: null,
  }

  if (outcome.found) {
    const { listing, note } = outcome.found
    const cmp = compareWithListing(object, listing)
    return {
      ...base,
      status: 'found',
      source: 'market',
      url: listing.url || searchUrl,
      listingUrl: listing.url || null,
      reason: note,
      match: cmp.match,
      matchParams: cmp.matched,
      photoMatch: cmp.photoMatch,
      price: typeof listing.price === 'number' ? listing.price : null,
      publishedAt: listing.publishedAt || null,
      probability: cmp.probability,
      title: listing.title || null,
      candidates: outcome.candidates,
    }
  }

  if (outcome.unavailableReason) {
    return {
      ...base,
      status: 'unavailable',
      reason: outcome.unavailableReason,
      match: null,
      price: null,
      publishedAt: null,
      probability: null,
      candidates: outcome.candidates,
    }
  }

  // Канал был доступен, объявлений с совпадением нет
  return {
    ...base,
    status: 'notFound',
    source: spec.kind === 'api' ? 'api' : 'market',
    reason:
      outcome.candidates && outcome.candidates > 0
        ? `Просмотрено объявлений площадки: ${outcome.candidates} — совпадений с объектом нет`
        : 'Среди проверенных объявлений совпадений нет',
    match: null,
    // Цена и дата — только у найденного объявления; у «не найдено» их нет
    price: null,
    publishedAt: null,
    probability: null,
    candidates: outcome.candidates,
  }
}

/** Порядок строк: найденные, затем «не найдено», затем «проверка недоступна» */
function sortProbes(probes: Probe[]): Probe[] {
  const rank = (p: Probe): number => (p.status === 'found' ? 0 : p.status === 'notFound' ? 1 : 2)
  return [...probes].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    if (a.status === 'found' && b.status === 'found') return (b.probability || 0) - (a.probability || 0)
    return 0
  })
}

/** «Владикавказ, Цоколаева, 36» — адресная строка для подписи в блоке */
function addressLine(addr: Record<string, string | undefined>): string {
  return [addr.locality || addr.city, addr.snt, addr.street, addr.house, addr.apartment && `кв. ${addr.apartment}`]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
}

/** «Квартира, 1 комн., продажа» — тип объекта для подписи в блоке */
function probeKindText(category: string | null, rooms: number | null, dealType: string | null): string {
  const cat: Record<string, string> = {
    apartment: 'Квартира',
    house: 'Дом',
    townhouse: 'Таунхаус',
    commercial: 'Коммерческая',
    land: 'Участок',
  }
  const parts = [category ? cat[category] || category : '', rooms ? `${rooms} комн.` : '', dealType === 'rent' ? 'аренда' : dealType === 'sale' ? 'продажа' : '']
  return parts.filter(Boolean).join(', ')
}

/**
 * Сохранение снимка проверки в скрытую группу placements объекта (поле
 * search). Пишем поверх текущей группы: Payload заменяет группу целиком,
 * поэтому берём её из свежего документа. Ошибка записи не должна ломать
 * ответ кнопки — результат уже посчитан и вернётся агенту.
 */
export async function persistPlacementSearch(
  payload: Payload,
  objectId: number | string,
  result: PlacementSearchResult,
): Promise<boolean> {
  try {
    const fresh = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    const group = ((fresh as unknown as { placements?: Record<string, unknown> }).placements || {}) as Record<string, unknown>
    await payload.update({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
      data: {
        placements: {
          ...group,
          search: result.probes,
          searchAt: result.checkedAt,
        },
      },
    })
    return true
  } catch (e) {
    console.error(`Placement search: не удалось сохранить снимок для объекта ${objectId}:`, e)
    return false
  }
}

/** Последний сохранённый снимок проверки из группы placements (для карточки) */
export function savedPlacementSearch(group: unknown): { probes: Probe[]; checkedAt: string | null } {
  const g = (group || {}) as { search?: unknown; searchAt?: string | null }
  const probes = Array.isArray(g.search) ? (g.search as Probe[]) : []
  return { probes, checkedAt: g.searchAt || null }
}

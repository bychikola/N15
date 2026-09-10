/**
 * «Парсер рынка» — payload-обёртка над чистым движком market-parser.ts.
 * Живёт записи объявлений (market-listings), считает совпадения с объектами
 * Н15, ведёт историю цены и предупреждает о дублях записей. Ничего не
 * публикует наружу — это отдельный от publishing.ts модуль.
 *
 * Официальный канал площадки (API/фид) подключается позже по договору;
 * до этого объявления добавляются ссылкой вручную — автосбор запрещён
 * правилами площадок и здесь не реализован.
 */
import { getPayload } from 'payload'
import type { ObjectLike } from './listing-check'
import {
  applyPriceObservation,
  contentDupeScore,
  estimateAuthorKind,
  marketListingMatch,
  marketPlatformByUrl,
  normalizeListingUrl,
  type PriceChange,
} from './market-parser'

/** Степень совпадения, с которой автоматически связываем объявление с объектом Н15 */
export const AUTO_LINK_MATCH = 75

/** Нижняя граница отчёта: слабее — не показываем (шум) */
export const REPORT_MIN_MATCH = 45

const HARD_LIMIT_LISTINGS = 1000
const HARD_LIMIT_OBJECTS = 1000

// --- Приведение документа к чистым типам -------------------------------------------

type Payload = Awaited<ReturnType<typeof getPayload>>

export interface MarketListingDoc {
  id: number | string
  url: string
  platform?: string | null
  title?: string | null
  address?: string | null
  price?: number | null
  priceInitial?: number | null
  area?: number | null
  rooms?: number | null
  authorKind?: string | null
  status?: string | null
  photoUrls?: { url?: string | null }[] | null
  priceHistory?: { at?: string | null; price?: number | null }[] | null
  matchedObject?: number | string | null
  matchPct?: number | null
  matchedAt?: string | null
  note?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  publishedAt?: string | null
  createdAt?: string | null
}

const asDoc = (raw: Record<string, unknown>): MarketListingDoc =>
  raw as unknown as MarketListingDoc

const asHistory = (doc: MarketListingDoc): PriceChange[] =>
  (Array.isArray(doc.priceHistory) ? doc.priceHistory : [])
    .filter((e) => e && typeof e.price === 'number')
    .map((e) => ({ at: e.at || new Date(0).toISOString(), price: e.price as number }))

/** Совпадение с объектом Н15 для отчёта */
export interface MarketRow {
  objectId: number
  match: number
  matched: string[]
  verdict: 'none' | 'weak' | 'strong'
}

export interface AddListingResult {
  listing: MarketListingDoc
  created: boolean
  /** Была ли зафиксирована новая цена (изменилась с прошлого наблюдения) */
  priceChanged: boolean
  wasPrice: number | null
  platform: string
  /** Дубли по нормализованной ссылке (одно объявление, две записи) */
  urlDuplicates: { id: number | string; url: string }[]
  /** Возможные дубли по содержанию (адрес+цена) на других площадках */
  contentDuplicates: { id: number | string; url: string; score: number }[]
  /** Свежий отчёт по похожести на объекты Н15 (сильные первыми) */
  report: (MarketRow & { headline: string; price?: number | null; area?: number | null })[]
  linked?: { objectId: number; match: number } | null
}

// --- Документ объекта Н15 → ObjectLike (как в placements-service) -------------------

const asObjectLike = (doc: Record<string, unknown>): ObjectLike => ({
  address: (doc.address as ObjectLike['address']) || null,
  cadastralNumber: (doc.cadastralNumber as string) || null,
  price: typeof doc.price === 'number' ? doc.price : null,
  area: typeof doc.area === 'number' ? doc.area : null,
  rooms: typeof doc.rooms === 'number' ? doc.rooms : null,
  floor: typeof doc.floor === 'number' ? doc.floor : null,
  totalFloors: typeof doc.totalFloors === 'number' ? doc.totalFloors : null,
})

/** Короткий заголовок объекта Н15 для строки отчёта (экспорт — для ответов API) */
export function objectHeadline(doc: Record<string, unknown>): string {
  const address = doc.address as
    | { locality?: string; city?: string; snt?: string; street?: string; house?: string; apartment?: string }
    | null
    | undefined
  const parts: string[] = []
  if (address) {
    const a = address
    if (a.locality && a.locality !== 'Владикавказ') parts.push(a.locality)
    else if (a.city) parts.push(a.city)
    if (a.snt) parts.push(a.snt)
    if (a.street) {
      parts.push(`${a.street}${a.house ? `, ${a.house}` : ''}${a.apartment ? `, кв. ${a.apartment}` : ''}`)
    }
  }
  const title = (doc.title as string) || ''
  const category = (doc.category as string) || ''
  const kind = category
    ? ({ apartment: 'Квартира', house: 'Дом', townhouse: 'Таунхаус', commercial: 'Коммерческая', land: 'Участок' } as Record<string, string>)[category] || category
    : ''
  return [title || kind || (doc.id as string), parts.filter(Boolean).join(', ')].filter(Boolean).join(' · ')
}

// --- Отчёт: похожесть на объекты Н15 --------------------------------------------------

/**
 * Сравнение объявления со всеми не-архивными объектами Н15. Считается по
 * адресу, цене, площади и комнатам — как в listing-check (там же веса
 * признаков). Совпадение ≥75% считается уверенным: объявление автоматически
 * связывается с объектом (matchedObject). Остальное попадает в отчёт —
 * решение за агентом.
 */
export async function buildMatchReport(
  payload: Payload,
  listing: MarketListingDoc,
): Promise<(MarketRow & { headline: string; price?: number | null; area?: number | null })[]> {
  const { docs } = await payload.find({
    collection: 'objects',
    where: { status: { not_equals: 'archived' } },
    limit: HARD_LIMIT_OBJECTS,
    depth: 0,
    overrideAccess: true,
  })
  const rows = docs
    .map((raw) => {
      const doc = raw as unknown as Record<string, unknown>
      const res = marketListingMatch(
        {
          address: listing.address,
          price: listing.price,
          area: listing.area,
          rooms: listing.rooms,
          photoUrls: (Array.isArray(listing.photoUrls) ? listing.photoUrls : []).map((p) => p.url || '').filter(Boolean),
        },
        asObjectLike(doc),
      )
      return {
        objectId: raw.id as number,
        headline: objectHeadline(doc),
        price: typeof doc.price === 'number' ? (doc.price as number) : null,
        area: typeof doc.area === 'number' ? (doc.area as number) : null,
        match: res.match,
        matched: res.matched,
        verdict: res.verdict,
      }
    })
    .filter((r) => r.match >= REPORT_MIN_MATCH)
    .sort((a, b) => b.match - a.match)
    .slice(0, 15)
  return rows
}

/**
 * Лучшее совпадение из отчёта, если оно уверенное (≥75%) — кандидат на
 * автоматическую связь с объектом Н15. Агент видит связь в карточке и
 * может убрать её, если объявление лишь похоже.
 */
export function bestLinkCandidate(
  rows: Awaited<ReturnType<typeof buildMatchReport>>,
): { objectId: number; match: number } | null {
  const top = rows[0]
  if (top && top.match >= AUTO_LINK_MATCH) return { objectId: top.objectId, match: top.match }
  return null
}

// --- Добавление/обновление записи -----------------------------------------------------

export async function addOrUpdateListing(
  payload: Payload,
  input: {
    url: string
    title?: string | null
    address?: string | null
    price?: number | null
    area?: number | null
    rooms?: number | null
    publishedAt?: string | null
    authorKind?: string | null
    note?: string | null
  },
): Promise<AddListingResult> {
  const now = new Date().toISOString()
  // Дубликаты ловим по нормализованной ссылке (без utm-мусора); записи не
  // хранят отдельного ключа — сверяем небольшой список в памяти (объём
  // рынка в CRM мал, автосбора нет, поэтому это безопасно)
  const all = await payload.find({
    collection: 'market-listings',
    limit: HARD_LIMIT_LISTINGS,
    depth: 0,
    overrideAccess: true,
  })
  const target = normalizeListingUrl(input.url)
  const existing = all.docs.find((d) => {
    const raw = asDoc(d as unknown as Record<string, unknown>)
    return raw.url && normalizeListingUrl(raw.url) === target
  })

  if (existing) {
    const doc = asDoc(existing as unknown as Record<string, unknown>)
    const wasPrice = typeof doc.price === 'number' ? doc.price : null
    const obs = applyPriceObservation(asHistory(doc), wasPrice, input.price ?? null, now)
    // Автор уточняем только достоверными маркерами; ручной выбор агента не затираем
    const autoAuthor = input.title ? estimateAuthorKind(input.title) : null
    const authorKind =
      input.authorKind && input.authorKind !== 'unknown'
        ? input.authorKind
        : doc.authorKind === 'unknown' && autoAuthor
          ? autoAuthor
          : doc.authorKind

    const { id } = await payload.update({
      collection: 'market-listings',
      id: existing.id,
      overrideAccess: true,
      data: {
        title: input.title || doc.title,
        address: input.address || doc.address,
        price: input.price ?? doc.price,
        priceInitial: doc.priceInitial,
        priceHistory: obs.history.map((e) => ({ at: e.at, price: e.price })),
        area: typeof input.area === 'number' ? input.area : doc.area,
        rooms: typeof input.rooms === 'number' ? input.rooms : doc.rooms,
        publishedAt: input.publishedAt || doc.publishedAt,
        authorKind: authorKind || 'unknown',
        note: input.note ?? doc.note,
        status: 'active',
        lastSeenAt: now,
      },
    })
    return finishAdd(payload, id, false, obs.was, obs.changed)
  }

  // Новая запись: первый визит фиксирует первоначальную цену
  const authorKind =
    input.authorKind && input.authorKind !== 'unknown'
      ? input.authorKind
      : input.title
        ? estimateAuthorKind(input.title) || 'unknown'
        : 'unknown'
  const created = await payload.create({
    collection: 'market-listings',
    overrideAccess: true,
    data: {
      url: input.url.trim(),
      platform: marketPlatformByUrl(input.url),
      title: input.title || '',
      address: input.address || '',
      price: typeof input.price === 'number' && input.price > 0 ? input.price : null,
      priceInitial: typeof input.price === 'number' && input.price > 0 ? input.price : null,
      area: typeof input.area === 'number' && input.area > 0 ? input.area : null,
      rooms: typeof input.rooms === 'number' && input.rooms > 0 ? input.rooms : null,
      publishedAt: input.publishedAt || null,
      authorKind,
      note: input.note || '',
      status: 'active',
      firstSeenAt: now,
      lastSeenAt: now,
    },
  })
  return finishAdd(payload, created.id, true, null, false)
}

/** Общая хвостовая часть добавления: свежая запись, дубли, отчёт, авто-связь */
async function finishAdd(
  payload: Payload,
  id: number | string,
  created: boolean,
  wasPrice: number | null,
  priceChanged: boolean,
): Promise<AddListingResult> {
  const raw = await payload.findByID({
    collection: 'market-listings',
    id,
    depth: 0,
    overrideAccess: true,
  })
  const doc = asDoc(raw as unknown as Record<string, unknown>)

  // Дубли по содержанию: тот же адрес и цена у другой записи (другая ссылка/площадка)
  const all = await payload.find({
    collection: 'market-listings',
    limit: HARD_LIMIT_LISTINGS,
    depth: 0,
    overrideAccess: true,
  })
  const urlDuplicates: AddListingResult['urlDuplicates'] = []
  const contentDuplicates: AddListingResult['contentDuplicates'] = []
  const myUrl = normalizeListingUrl(doc.url)
  const target = { address: doc.address, price: doc.price, area: doc.area }
  for (const other of all.docs) {
    const d = asDoc(other as unknown as Record<string, unknown>)
    if (String(d.id) === String(id)) continue
    if (d.url && normalizeListingUrl(d.url) === myUrl) {
      urlDuplicates.push({ id: d.id, url: d.url })
      continue
    }
    const score = contentDupeScore(target, { address: d.address, price: d.price, area: d.area })
    if (score >= 100) contentDuplicates.push({ id: d.id, url: d.url, score })
  }

  // Отчёт по объектам Н15 и авто-связь при уверенном совпадении (≥75%)
  const report = await buildMatchReport(payload, doc)
  const linked = bestLinkCandidate(report)
  if (linked && (doc.matchedObject === null || doc.matchedObject === undefined || doc.matchedObject === 0)) {
    await payload.update({
      collection: 'market-listings',
      id,
      overrideAccess: true,
      data: {
        matchedObject: linked.objectId,
        matchPct: linked.match,
        matchedAt: new Date().toISOString(),
        matchParams: report[0].matched.map((p) => ({ param: p })),
      },
    })
    doc.matchedObject = linked.objectId
    doc.matchPct = linked.match
    doc.matchedAt = new Date().toISOString()
  }
  const fresh = asDoc(
    (await payload.findByID({ collection: 'market-listings', id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>,
  )
  return {
    listing: fresh,
    created,
    priceChanged,
    wasPrice,
    platform: fresh.platform || 'other',
    urlDuplicates,
    contentDuplicates,
    report,
    linked,
  }
}

// --- Повторная проверка записи --------------------------------------------------------

export async function recheckListing(payload: Payload, id: number | string) {
  const raw = await payload.findByID({ collection: 'market-listings', id, depth: 0, overrideAccess: true })
  const doc = asDoc(raw as unknown as Record<string, unknown>)
  const report = await buildMatchReport(payload, doc)
  const linked = bestLinkCandidate(report)
  if (linked) {
    await payload.update({
      collection: 'market-listings',
      id,
      overrideAccess: true,
      data: {
        matchedObject: linked.objectId,
        matchPct: linked.match,
        matchedAt: new Date().toISOString(),
        matchParams: report[0].matched.map((p) => ({ param: p })),
      },
    })
  } else if (doc.matchedObject) {
    // Объект больше не совпадает (например, изменился или ушёл в архив) — связь снимаем,
    // чтобы карточка не показывала устаревший дубль
    await payload.update({
      collection: 'market-listings',
      id,
      overrideAccess: true,
      data: { matchedObject: null, matchPct: 0, matchedAt: new Date().toISOString(), matchParams: [] },
    })
  }
  return finishAdd(payload, id, false, null, false)
}

/** Список записей для страницы «Парсер рынка» (свежие сверху) */
export async function listListings(payload: Payload, includeRemoved = false) {
  const { docs } = await payload.find({
    collection: 'market-listings',
    where: includeRemoved ? {} : { status: { not_equals: 'removed' } },
    sort: '-lastSeenAt',
    limit: HARD_LIMIT_LISTINGS,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((d) => asDoc(d as unknown as Record<string, unknown>))
}

/** Удаление записи (только администратор) */
export async function removeListing(payload: Payload, id: number | string) {
  await payload.delete({ collection: 'market-listings', id, overrideAccess: true })
}

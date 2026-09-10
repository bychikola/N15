import type { Payload } from 'payload'
import {
  adMarkingText,
  adPublishIssue,
  adTermExpired,
  adTermText,
  adVisible,
  markingReady,
  type AdLike,
  type AdMarking,
  type AdvertiserLike,
} from '@/lib/advertising'

/**
 * Серверная обвязка «Рекламы на сайте»: публикация и снятие рекламного
 * материала, выгрузка данных для раздела CRM «Реклама» и приём заявок
 * с формы страницы /advertising.
 *
 * Правила размещения живут в src/lib/advertising.ts — здесь только запись
 * в базу. Публикация идёт через payload.update: те же проверки повторяет
 * хук коллекции advertisements, поэтому обойти их нельзя ни из CRM,
 * ни из админки.
 */

/** Строка списка рекламных материалов для раздела CRM «Реклама» */
export interface AdBoardRow {
  id: number
  title: string
  advertiserName: string
  advertiserStatus: string
  advertiserId: number | null
  format: string
  status: string
  paymentStatus: string
  cost: number | null
  termText: string
  endDate: string | null
  /** Срок размещения идёт прямо сейчас */
  inTerm: boolean
  /** Срок размещения истёк */
  expired: boolean
  /** Маркировка для показа (пометка «Реклама» + рекламодатель + erid) */
  markingText: string
  /** Материал показывается на сайте (опубликован, срок идёт, маркировка собрана) */
  visible: boolean
  /** Почему нельзя опубликовать (null — можно) */
  issue: string | null
  log: { event?: string; at?: string; by?: string }[]
}

/** Строка списка заявок на рекламу */
export interface AdRequestRow {
  id: number
  name: string
  company: string
  phone: string
  email: string
  message: string
  status: string
  consentAt: string | null
  createdAt: string | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

/** Рекламодатель из глубины выборки (объект, id или пусто) */
const advertiserOf = (v: unknown): { id: number | null; data: AdvertiserLike | null } => {
  if (v && typeof v === 'object') {
    const o = v as { id?: unknown }
    return { id: typeof o.id === 'number' ? o.id : null, data: v as AdvertiserLike }
  }
  if (typeof v === 'number') return { id: v, data: null }
  return { id: null, data: null }
}

/** Результат публикации/снятия для маршрута CRM */
export interface AdActionResult {
  ok: boolean
  error?: string
  status?: string
  markingText?: string
}

/**
 * Публикация материала: проверяем условия размещения (рекламодатель,
 * содержание, оплата, срок, erid), затем ставим статус «Опубликовано» —
 * хук коллекции собирает маркировку и пишет журнал.
 */
export async function publishAdvertisement(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  const doc = (await payload.findByID({
    collection: 'advertisements',
    id,
    depth: 1,
    overrideAccess: true,
  })) as unknown as AdLike & { marking?: Partial<AdMarking>; advertiser?: unknown }

  const { data: advertiser, id: advertiserId } = advertiserOf(doc.advertiser)
  let advertiserDoc = advertiser
  if (!advertiserDoc && advertiserId) {
    try {
      advertiserDoc = (await payload.findByID({
        collection: 'advertisers',
        id: advertiserId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as AdvertiserLike
    } catch {
      advertiserDoc = null
    }
  }

  const issue = adPublishIssue(doc, advertiserDoc)
  if (issue) {
    return { ok: false, error: issue }
  }

  try {
    const updated = (await payload.update({
      collection: 'advertisements',
      id,
      data: { status: 'published' },
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string; marking?: Partial<AdMarking>; advertiserInfo?: string }
    return {
      ok: true,
      status: str(updated.status),
      markingText: adMarkingText(updated.marking),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Снятие материала с публикации (материал сразу исчезает с сайта) */
export async function unpublishAdvertisement(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  try {
    const updated = (await payload.update({
      collection: 'advertisements',
      id,
      data: { status: 'removed' },
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string }
    return { ok: true, status: str(updated.status) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Карточка рекламного материала для сайта (страница /advertising, блок на главной) */
export interface SiteAdCard {
  id: number
  title: string
  text: string
  link: string | null
  linkLabel: string | null
  imageUrl: string | null
  imageAlt: string
  markingText: string
}

/** Только http(s)-ссылки: остальные схемы в разметку не пускаем */
const safeLink = (v: unknown): string | null => {
  const s = str(v).trim()
  return /^https?:\/\/\S+$/i.test(s) ? s : null
}

/**
 * Материалы для показа на сайте: опубликованные и внутри срока размещения,
 * причём с собранной маркировкой — без пометки «Реклама» и сведений
 * о рекламодателе материал не показываем (требование ФЗ «О рекламе»).
 */
export async function visibleAdvertisements(payload: Payload, limit = 6): Promise<SiteAdCard[]> {
  const { docs } = await payload.find({
    collection: 'advertisements',
    where: { status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })

  const cards: SiteAdCard[] = []
  for (const raw of docs) {
    const doc = raw as unknown as Record<string, unknown>
    const marking = doc.marking as Partial<AdMarking> | undefined
    const ad: AdLike = {
      title: str(doc.title),
      status: str(doc.status),
      startDate: str(doc.startDate) || null,
      endDate: str(doc.endDate) || null,
    }
    if (!adVisible(ad) || !markingReady(marking)) continue
    const image = doc.image as
      | { url?: string; alt?: string; sizes?: { card?: { url?: string }; thumbnail?: { url?: string } } }
      | undefined
    cards.push({
      id: Number(doc.id),
      title: ad.title || '',
      text: str(doc.text),
      link: safeLink(doc.link),
      linkLabel: str(doc.linkLabel) || null,
      imageUrl: image?.sizes?.card?.url || image?.sizes?.thumbnail?.url || image?.url || null,
      imageAlt: str(image?.alt) || ad.title || 'Реклама',
      markingText: adMarkingText(marking),
    })
    if (cards.length >= limit) break
  }
  return cards
}

/** Материалы и заявки для раздела CRM «Реклама» (свежие сверху) */
export async function loadAdvertisingBoard(
  payload: Payload,
): Promise<{ ads: AdBoardRow[]; requests: AdRequestRow[] }> {
  const [adsRes, reqRes] = await Promise.all([
    payload.find({
      collection: 'advertisements',
      sort: '-createdAt',
      limit: 300,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'advertising-requests',
      sort: '-createdAt',
      limit: 300,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const ads: AdBoardRow[] = adsRes.docs.map((raw) => {
    const doc = raw as unknown as Record<string, unknown>
    const { id: advertiserId, data: advertiser } = advertiserOf(doc.advertiser)
    const ad: AdLike = {
      title: str(doc.title),
      status: str(doc.status),
      paymentStatus: str(doc.paymentStatus),
      cost: num(doc.cost),
      startDate: str(doc.startDate) || null,
      endDate: str(doc.endDate) || null,
      termDays: num(doc.termDays),
      contentChecked: Boolean(doc.contentChecked),
      erid: str(doc.erid),
    }
    const marking = doc.marking as Partial<AdMarking> | undefined
    const log = Array.isArray(doc.log)
      ? (doc.log as { event?: string; at?: string; by?: string }[]).map((e) => ({
          event: str(e.event),
          at: str(e.at) || null || undefined,
          by: str(e.by) || undefined,
        }))
      : []
    return {
      id: Number(doc.id),
      title: ad.title || '—',
      advertiserName: str(advertiser?.name) || '—',
      advertiserStatus: str(advertiser?.status) || 'pending',
      advertiserId,
      format: str(doc.format) || 'card',
      status: ad.status || 'draft',
      paymentStatus: ad.paymentStatus || 'unpaid',
      cost: num(doc.cost),
      termText: adTermText(ad),
      endDate: ad.endDate || null,
      inTerm: adVisible(ad, Date.now()),
      expired: adTermExpired(ad),
      markingText: adMarkingText(marking),
      visible: adVisible(ad) && markingReady(marking),
      issue: adPublishIssue(ad, advertiser),
      log,
    }
  })

  const requests: AdRequestRow[] = reqRes.docs.map((raw) => {
    const doc = raw as unknown as Record<string, unknown>
    return {
      id: Number(doc.id),
      name: str(doc.name) || '—',
      company: str(doc.company),
      phone: str(doc.phone),
      email: str(doc.email),
      message: str(doc.message),
      status: str(doc.status) || 'new',
      consentAt: str(doc.consentAt) || null,
      createdAt: str(doc.createdAt) || null,
    }
  })

  return { ads, requests }
}

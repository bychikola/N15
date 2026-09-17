import fs from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'
import nodemailer from 'nodemailer'
import {
  AD_FORMAT_LABELS,
  AD_OBJECT_TYPE_LABELS,
  adMarkingText,
  adPublishIssue,
  adRequestPublishIssue,
  adRequestTotal,
  adRequestTotalOf,
  adRequestVisible,
  adTermExpired,
  adTermText,
  adVisible,
  markingReady,
  type AdFormat,
  type AdLike,
  type AdMarking,
  type AdObjectType,
  type AdRequestLike,
  type AdRequestStatus,
  type AdvertiserLike,
} from '@/lib/advertising'
import { AD_OPERATOR } from '@/lib/advertising-legal'
import { contractNumber, renderAdContractPdf, rubText, rublesWords } from '@/lib/advertising-contract-pdf'

/** Один синтаксически валидный адрес — без списков рассылки и инъекций в заголовки */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

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

/** Фотография заявки для карточки CRM */
export interface AdRequestPhoto {
  id: number
  filename: string
  /** Ссылка на файл в закрытом хранилище (доступна только команде Н15) */
  url: string
  /** Уменьшенная копия, если Payload её сделал */
  thumbUrl: string
  /** Ссылка на видео — заполняется только у ссылок */
  video?: string
}

/** Строка списка заявок «Ваша реклама» для раздела CRM «Реклама» */
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
  /** Как обращаться: name, company, agency, developer, other */
  contactKind: string
  objectType: string
  location: string
  price: string
  description: string
  listingUrl: string | null
  /** Ссылки на видео (по одной в строке) */
  videoLinks: string[]
  /** Фотографии заявки из закрытого хранилища */
  photos: AdRequestPhoto[]
  /** Фотографии, скопированные в media при публикации (видны на сайте) */
  publicPhotos: AdRequestPhoto[]
  desiredTerm: string
  format: string
  termDays: number | null
  startDate: string | null
  endDate: string | null
  /** Дата окончания размещения в виде «01.09.2026» */
  endDateText: string
  /** Срок размещения истёк */
  expired: boolean
  cost: number | null
  discount: number | null
  totalAmount: number | null
  paymentStatus: string
  paymentWaived: boolean
  paidAt: string | null
  paymentNote: string
  contentChecked: boolean
  contentNote: string
  erid: string
  /** Три согласия формы и время их проставления */
  consents: { offer: boolean; rights: boolean; data: boolean }
  offerVersion: string
  ip: string
  /** Маркировка для показа (пометка «Реклама» + рекламодатель + erid) */
  markingText: string
  publishedAt: string | null
  contractSentAt: string | null
  contractEmail: string
  /** Есть ли сформированный PDF-договор */
  contractFileUrl: string | null
  note: string
  /** Почему нельзя опубликовать (null — можно) */
  issue: string | null
  /** Заявка показывается на сайте */
  visible: boolean
  log: { event?: string; at?: string; by?: string }[]
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

/** Ссылка на файл загрузки из связи Payload (объект, id или пусто) */
const uploadUrl = (v: unknown): string | null => {
  if (v && typeof v === 'object') {
    const url = (v as { url?: unknown }).url
    return typeof url === 'string' && url ? url : null
  }
  return null
}

/** Список вложений (фотографий) из array-поля заявки */
const photoList = (v: unknown): AdRequestPhoto[] => {
  if (!Array.isArray(v)) return []
  const out: AdRequestPhoto[] = []
  for (const item of v) {
    const file = (item as { file?: unknown })?.file
    if (!file || typeof file !== 'object') continue
    const doc = file as {
      id?: unknown
      filename?: unknown
      url?: unknown
      sizes?: { thumbnail?: { url?: unknown }; card?: { url?: unknown } }
    }
    const url = typeof doc.url === 'string' ? doc.url : ''
    if (!url) continue
    out.push({
      id: typeof doc.id === 'number' ? doc.id : 0,
      filename: str(doc.filename),
      url,
      thumbUrl:
        str(doc.sizes?.thumbnail?.url) || str(doc.sizes?.card?.url) || url,
    })
  }
  return out
}

/** Журнал записи (заявки или материала) для карточки CRM */
const logOf = (v: unknown): { event?: string; at?: string; by?: string }[] =>
  Array.isArray(v)
    ? (v as { event?: string; at?: string; by?: string }[]).map((e) => ({
        event: str(e.event),
        at: str(e.at) || undefined,
        by: str(e.by) || undefined,
      }))
    : []

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
    const log = logOf(doc.log)
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
    const req: AdRequestLike & AdLike = {
      contactKind: str(doc.contactKind),
      name: str(doc.name),
      company: str(doc.company),
      objectType: str(doc.objectType),
      status: str(doc.status) || 'new',
      format: str(doc.format),
      termDays: num(doc.termDays),
      startDate: str(doc.startDate) || null,
      endDate: str(doc.endDate) || null,
      cost: num(doc.cost),
      discount: num(doc.discount),
      totalAmount: num(doc.totalAmount),
      paymentStatus: str(doc.paymentStatus),
      paymentWaived: Boolean(doc.paymentWaived),
      contentChecked: Boolean(doc.contentChecked),
      erid: str(doc.erid),
      consent: Boolean(doc.consent),
      consentOffer: Boolean(doc.consentOffer),
      consentRights: Boolean(doc.consentRights),
    }
    const marking = doc.marking as Partial<AdMarking> | undefined
    return {
      id: Number(doc.id),
      name: str(doc.name) || '—',
      company: str(doc.company),
      phone: str(doc.phone),
      email: str(doc.email),
      message: str(doc.message),
      status: req.status || 'new',
      consentAt: str(doc.consentAt) || null,
      createdAt: str(doc.createdAt) || null,
      contactKind: str(doc.contactKind) || 'name',
      objectType: str(doc.objectType),
      location: str(doc.location),
      price: str(doc.price),
      description: str(doc.description),
      listingUrl: safeLink(doc.listingUrl),
      videoLinks: str(doc.videoLinks)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      photos: photoList(doc.photos),
      publicPhotos: photoList(doc.publicPhotos),
      desiredTerm: str(doc.desiredTerm),
      format: str(doc.format) || 'card',
      termDays: num(doc.termDays),
      startDate: req.startDate || null,
      endDate: req.endDate || null,
      endDateText: adTermText(req),
      expired: req.status === 'published' && adTermExpired(req),
      cost: req.cost ?? null,
      discount: req.discount ?? null,
      totalAmount: adRequestTotal(req.cost, req.discount),
      paymentStatus: req.paymentStatus || 'unpaid',
      paymentWaived: Boolean(req.paymentWaived),
      paidAt: str(doc.paidAt) || null,
      paymentNote: str(doc.paymentNote),
      contentChecked: Boolean(req.contentChecked),
      contentNote: str(doc.contentNote),
      erid: req.erid || '',
      consents: {
        offer: Boolean(req.consentOffer),
        rights: Boolean(req.consentRights),
        data: Boolean(req.consent),
      },
      offerVersion: str(doc.offerVersion),
      ip: str(doc.ip),
      markingText: adMarkingText(marking),
      publishedAt: str(doc.publishedAt) || null,
      contractSentAt: str(doc.contractSentAt) || null,
      contractEmail: str(doc.contractEmail),
      contractFileUrl: uploadUrl(doc.contractDocument),
      note: str(doc.note),
      issue: adRequestPublishIssue(req),
      visible: adRequestVisible(req) && markingReady(marking),
      log: logOf(doc.log),
    }
  })

  return { ads, requests }
}

// --- Действия CRM по заявкам «Ваша реклама» ---------------------------------------

/** Условия оплаты и публикации, которые заполняет менеджер */
export interface AdRequestPaymentInput {
  cost?: number | null
  discount?: number | null
  format?: string | null
  termDays?: number | null
  paymentStatus?: string | null
  paymentWaived?: boolean
  paymentNote?: string
}

/** Заявка из базы в виде, который понимает движок правил */
const requestLikeOf = (doc: Record<string, unknown>): AdRequestLike & AdLike => ({
  contactKind: str(doc.contactKind),
  name: str(doc.name),
  company: str(doc.company),
  phone: str(doc.phone),
  email: str(doc.email),
  objectType: str(doc.objectType),
  location: str(doc.location),
  price: str(doc.price),
  listingUrl: str(doc.listingUrl),
  erid: str(doc.erid),
  status: str(doc.status),
  format: str(doc.format),
  termDays: num(doc.termDays),
  startDate: str(doc.startDate) || null,
  endDate: str(doc.endDate) || null,
  cost: num(doc.cost),
  discount: num(doc.discount),
  totalAmount: num(doc.totalAmount),
  paymentStatus: str(doc.paymentStatus),
  paymentWaived: Boolean(doc.paymentWaived),
  contentChecked: Boolean(doc.contentChecked),
  consent: Boolean(doc.consent),
  consentOffer: Boolean(doc.consentOffer),
  consentRights: Boolean(doc.consentRights),
})

/** Карточка заявки из базы (одна запись, глубина 1 — фотографии и договор) */
async function findRequest(payload: Payload, id: number): Promise<Record<string, unknown> | null> {
  try {
    return (await payload.findByID({
      collection: 'advertising-requests',
      id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Смена статуса заявки: «На проверке», «Нужны уточнения», «Одобрено»,
 * «Отклонено», «Завершено». Публикация и снятие — отдельными функциями:
 * у них есть свои проверки и побочные действия.
 */
export async function setAdRequestStatus(
  payload: Payload,
  id: number,
  status: AdRequestStatus,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  if (status === 'published') {
    return { ok: false, error: 'Публикация выполняется отдельной кнопкой' }
  }
  try {
    const updated = (await payload.update({
      collection: 'advertising-requests',
      id,
      data: { status },
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string }
    return { ok: true, status: str(updated.status) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Сохранение условий размещения: стоимость, скидка, формат, срок и оплата.
 * Итоговую сумму считает хук коллекции — здесь только то, что ввёл менеджер.
 * Когда отмечают оплату, ставим дату и статус «Ожидает оплаты» → «Оплачено».
 */
export async function saveAdRequestPayment(
  payload: Payload,
  id: number,
  input: AdRequestPaymentInput,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult & { totalAmount?: number }> {
  const data: Record<string, unknown> = {}
  if (input.cost !== undefined) data.cost = input.cost
  if (input.discount !== undefined) data.discount = input.discount
  if (input.format !== undefined) data.format = input.format || null
  if (input.termDays !== undefined) data.termDays = input.termDays
  if (input.paymentWaived !== undefined) data.paymentWaived = input.paymentWaived
  if (input.paymentNote !== undefined) data.paymentNote = String(input.paymentNote).slice(0, 500)
  if (input.paymentStatus !== undefined) {
    data.paymentStatus = input.paymentStatus
    data.paidAt = input.paymentStatus === 'paid' ? new Date().toISOString() : null
  }

  try {
    const doc = await findRequest(payload, id)
    if (!doc) return { ok: false, error: 'Заявка не найдена' }
    // Заявка, одобренная и ждущая оплаты, после выставления суммы переходит
    // в «Ожидает оплаты» — так видно, какие заявки уже согласованы с клиентом
    const status = str(doc.status)
    if (status === 'approved' || status === 'clarification' || status === 'checking') {
      if (input.cost !== undefined || input.paymentStatus !== undefined) {
        data.status = input.paymentStatus === 'paid' ? 'approved' : 'awaitingPayment'
      }
    }

    const updated = (await payload.update({
      collection: 'advertising-requests',
      id,
      data,
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string; totalAmount?: number }
    return { ok: true, status: str(updated.status), totalAmount: num(updated.totalAmount) || undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Проверка содержания заявки и идентификатор интернет-рекламы: без отметки
 * «содержание проверено» и без erid заявку не опубликовать (adRequestPublishIssue),
 * поэтому обе правки должны быть доступны из CRM, а не только из админки.
 */
export async function saveAdRequestCheck(
  payload: Payload,
  id: number,
  input: { contentChecked?: boolean; contentNote?: string; erid?: string },
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  const data: Record<string, unknown> = {}
  if (input.contentChecked !== undefined) {
    data.contentChecked = input.contentChecked
    data.contentCheckedBy = input.contentChecked ? user?.name || user?.email || '' : ''
  }
  if (input.contentNote !== undefined) data.contentNote = String(input.contentNote).slice(0, 2000)
  if (input.erid !== undefined) data.erid = String(input.erid).trim().slice(0, 100)

  try {
    const updated = (await payload.update({
      collection: 'advertising-requests',
      id,
      data,
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string }
    return { ok: true, status: str(updated.status) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Копирование фотографий заявки в открытое хранилище media. Делается ровно
 * при публикации: до неё файлы лежат в закрытой папке и посетителям не
 * видны. Если файл не нашёлся (например, хранилище чистили) — публикация
 * не отменяется, просто у материала не будет этой фотографии.
 */
async function copyRequestPhotos(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<{ file: number }[]> {
  const photos = Array.isArray(doc.photos) ? doc.photos : []
  const out: { file: number }[] = []
  for (const item of photos) {
    const file = (item as { file?: unknown })?.file
    if (!file || typeof file !== 'object') continue
    const source = file as { filename?: unknown; mimeType?: unknown }
    const filename = str(source.filename)
    if (!filename) continue
    try {
      // Папка закрытого хранилища — внутри тома media (см. AdvertisingMaterials)
      const bytes = await fs.readFile(path.join(process.cwd(), 'media', 'ad-materials', filename))
      const created = await payload.create({
        collection: 'media',
        data: { alt: str(doc.name) || 'Фотография объекта' },
        file: {
          data: bytes,
          mimetype: str(source.mimeType) || 'image/jpeg',
          name: filename,
          size: bytes.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      out.push({ file: created.id as number })
    } catch (error) {
      console.error(`Advertising: не удалось скопировать фото ${filename}:`, error)
    }
  }
  return out
}

/**
 * Публикация заявки: проверяем условия размещения (одобрение, содержание,
 * три согласия, оплата, срок, erid), копируем фотографии в открытое
 * хранилище и ставим статус «Опубликовано» — хук коллекции собирает
 * маркировку и пишет журнал.
 */
export async function publishAdRequest(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  const doc = await findRequest(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }

  const req = requestLikeOf(doc)
  const issue = adRequestPublishIssue(req)
  if (issue) return { ok: false, error: issue }

  const publicPhotos = await copyRequestPhotos(payload, doc)

  try {
    const updated = (await payload.update({
      collection: 'advertising-requests',
      id,
      data: {
        status: 'published',
        // Пустой список не затирает прежние копии: при повторной публикации
        // фотографии уже лежат в media
        ...(publicPhotos.length ? { publicPhotos } : {}),
      },
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string; marking?: Partial<AdMarking> }
    return { ok: true, status: str(updated.status), markingText: adMarkingText(updated.marking) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Снятие заявки с публикации: материал сразу исчезает с сайта */
export async function unpublishAdRequest(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult> {
  try {
    const updated = (await payload.update({
      collection: 'advertising-requests',
      id,
      data: { status: 'done' },
      depth: 0,
      overrideAccess: true,
      user,
    })) as unknown as { status?: string }
    return { ok: true, status: str(updated.status) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Договор на размещение для крупных компаний: собираем PDF по данным заявки,
 * кладём его в закрытое хранилище и отправляем на почту рекламодателя.
 *
 * Это единственный документ, который формируется отдельно: остальные
 * размещения идут по договору-оферте, принятому галочкой в форме
 * (см. advertising-legal.ts). Поэтому договор — не обязательный шаг:
 * без него заявку можно одобрить, оплатить и опубликовать.
 */
export async function sendAdRequestContract(
  payload: Payload,
  id: number,
  input: { email?: string; note?: string } = {},
  user?: { id?: number | string; email?: string; name?: string },
): Promise<AdActionResult & { email?: string }> {
  const doc = await findRequest(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }

  const email = String(input.email || doc.contractEmail || doc.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.includes(',')) {
    return { ok: false, error: 'Укажите почту рекламодателя — на неё уйдёт договор' }
  }
  const total = adRequestTotalOf(requestLikeOf(doc))
  if (!(typeof total === 'number' && total > 0)) {
    return { ok: false, error: 'Сначала укажите стоимость размещения — сумма попадает в договор' }
  }

  const req = requestLikeOf(doc)
  const date = new Date().toISOString()
  const pdf = renderAdContractPdf({
    requestId: id,
    date,
    advertiser: {
      company: str(doc.company),
      name: str(doc.name),
      phone: str(doc.phone),
      email: str(doc.email) || email,
    },
    object: {
      typeLabel: AD_OBJECT_TYPE_LABELS[req.objectType as AdObjectType] || 'объект недвижимости',
      location: str(doc.location),
      price: str(doc.price),
      listingUrl: str(doc.listingUrl),
    },
    placement: {
      formatLabel: AD_FORMAT_LABELS[req.format as AdFormat] || 'карточка',
      termDays: req.termDays,
      startDate: req.startDate,
      endDate: req.endDate,
    },
    money: {
      cost: req.cost,
      discount: req.discount,
      total,
      paymentStatus: req.paymentStatus,
      paymentWaived: req.paymentWaived,
    },
    erid: str(doc.erid),
    desiredTerm: str(doc.desiredTerm),
    consentAt: str(doc.consentAt),
    offerVersion: str(doc.offerVersion),
    manager: user?.name || user?.email || null,
  })

  // Файл договора — в закрытое хранилище заявок: публичным он не становится
  let fileId: number | null = null
  const fileName = `dogovor-${contractNumber(id, date).replace('/', '-')}.pdf`
  try {
    const created = await payload.create({
      collection: 'advertising-materials',
      data: { alt: `Договор № ${contractNumber(id, date)}`, note: `Договор по заявке № ${id}` },
      file: { data: pdf, mimetype: 'application/pdf', name: fileName, size: pdf.length },
      depth: 0,
      overrideAccess: true,
    })
    fileId = created.id as number
  } catch (error) {
    return { ok: false, error: `Не удалось сохранить договор: ${String(error)}` }
  }

  // Отправка письма — настройки ящика те же, что у писем из CRM
  let sent = false
  let sendError = ''
  try {
    const settings = await payload.findGlobal({ slug: 'mail-settings', overrideAccess: true })
    if (settings.enabled && settings.username && settings.password) {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost || 'smtp.mail.ru',
        port: Number(settings.smtpPort) || 465,
        secure: true,
        auth: { user: settings.username, pass: settings.password },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 25000,
      })
      const fromName = String(settings.senderName || '').trim().replace(/"/g, '')
      const from = fromName ? `"${fromName}" <${settings.username}>` : settings.username
      const subject = `Договор № ${contractNumber(id, date)} на размещение рекламного материала`
      const text = [
        `Здравствуйте${str(doc.name) ? `, ${str(doc.name)}` : ''}!`,
        '',
        `Направляем договор № ${contractNumber(id, date)} на размещение рекламного материала на площадке ${AD_OPERATOR.site}.`,
        `Итоговая сумма: ${rubText(total)} (${rublesWords(total)}).`,
        '',
        'Договор во вложении. Если нужны правки — ответьте на это письмо.',
        '',
        `${AD_OPERATOR.name}`,
        `${AD_OPERATOR.phone} · ${AD_OPERATOR.email}`,
      ].join('\n')

      await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
      })
      transporter.close()
      sent = true

      // В «Отправленные» — только после того, как сервер принял письмо
      await payload.create({
        collection: 'emails',
        data: {
          folder: 'sent',
          toEmail: email,
          subject,
          text: `${text}\n\nВложение: ${fileName} (${Math.round(pdf.length / 1024)} КБ)`,
          receivedAt: new Date().toISOString(),
          read: true,
        },
        overrideAccess: true,
      })
    } else {
      sendError = 'Почта не подключена — договор сформирован, но письмо не отправлено'
    }
  } catch (error) {
    sendError = error instanceof Error ? error.message : String(error)
  }

  const contractNote = [str(input.note), sendError ? `Письмо: ${sendError}` : ''].filter(Boolean).join(' · ')

  try {
    await payload.update({
      collection: 'advertising-requests',
      id,
      data: {
        contractDocument: fileId,
        contractEmail: email,
        contractSentAt: sent ? date : null,
        ...(contractNote ? { contractNote } : {}),
      },
      depth: 0,
      overrideAccess: true,
      user,
    })
  } catch (error) {
    return { ok: false, error: `Договор сохранён, но заявка не обновилась: ${String(error)}` }
  }

  if (!sent) {
    return { ok: false, error: sendError || 'Договор сформирован, но письмо не отправлено', email }
  }
  return { ok: true, email }
}

/**
 * Карточки опубликованных заявок для сайта: показываем только те, у которых
 * собрана маркировка и идёт срок размещения. Фотографии берём из копий
 * в media — они появляются при публикации.
 */
export async function visibleAdRequestCards(payload: Payload, limit = 6): Promise<SiteAdCard[]> {
  const { docs } = await payload.find({
    collection: 'advertising-requests',
    where: { status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  const cards: SiteAdCard[] = []
  for (const raw of docs) {
    const doc = raw as unknown as Record<string, unknown>
    const req = requestLikeOf(doc)
    const marking = doc.marking as Partial<AdMarking> | undefined
    if (!adRequestVisible(req) || !markingReady(marking)) continue
    const publicPhoto = photoList(doc.publicPhotos)[0]
    const title = [str(doc.company), str(doc.location)].filter(Boolean).join(' · ') || str(doc.name)
    cards.push({
      id: Number(doc.id),
      title: title || 'Рекламный материал',
      text: str(doc.description).slice(0, 400) || str(doc.price).trim(),
      link: safeLink(doc.listingUrl),
      linkLabel: null,
      imageUrl: publicPhoto?.thumbUrl || publicPhoto?.url || null,
      imageAlt: publicPhoto ? `Фотография объекта: ${title}` : title,
      markingText: adMarkingText(marking),
    })
    if (cards.length >= limit) break
  }
  return cards
}

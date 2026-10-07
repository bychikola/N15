/**
 * «Отзывы клиентов» — серверная обвязка раздела: выборки для публичной
 * страницы /reviews и очереди модерации в CRM.
 *
 * Правила (что считается опубликованным, почему нельзя публиковать) живут
 * в движке src/lib/reviews.ts, работа с базой — здесь. Страницы и маршруты
 * вызывают только эти функции, поэтому проверки не расходятся между сайтом,
 * очередью и модерацией.
 *
 * Чтение публичной выдачи идёт с overrideAccess: наружу отдаётся не документ
 * Payload, а карточка с явным списком полей (имя, оценка, текст, услуга, дата).
 * Служебные поля — IP, заметка модератора, след согласия — на сайт не уходят.
 */
import type { Payload, Where } from 'payload'
import { reviewRating, type ReviewStatus } from './reviews'

/** Размер публичной выдачи: сколько отзывов показываем на странице /reviews */
export const REVIEWS_PAGE_SIZE = 30

/** Отзыв для сайта: только открытые поля */
export interface PublicReview {
  id: number
  name: string
  rating: number
  text: string
  service: string | null
  /** Дата отзыва строкой «дд.мм.гггг» — как в остальных датах сайта */
  date: string
  /** Дата для машинных атрибутов (ISO) и сортировки на клиенте */
  iso: string
}

/** Сводка по опубликованным отзывам: сколько и какая средняя оценка */
export interface ReviewStats {
  count: number
  /** Средняя оценка, округлённая до десятых; null — отзывов нет */
  average: number | null
}

/** Строка очереди модерации для CRM */
export interface ReviewQueueRow {
  id: number
  name: string
  rating: number
  text: string
  service: string | null
  status: ReviewStatus
  createdAt: string
  moderatedBy: string | null
  moderatedAt: string | null
  publishedAt: string | null
  moderationNote: string | null
  consent: boolean
  consentAt: string | null
  ip: string | null
}

/** Дата «дд.мм.гггг» из ISO — единый вид дат на сайте (§14 ux-ui-rules) */
export const reviewDate = (iso: unknown): string => {
  const d = new Date(String(iso || ''))
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

/** Строка документа Payload → открытая карточка отзыва для сайта */
const toPublicReview = (doc: Record<string, unknown>): PublicReview | null => {
  const rating = reviewRating(doc.rating)
  const name = String(doc.name || '').trim()
  const text = String(doc.text || '').trim()
  // Опубликовать без имени, оценки и текста нельзя (см. reviewPublishIssue) —
  // если такое всё же встретилось, на сайт запись не отдаём
  if (!name || !text || rating === null) return null
  const created = String(doc.publishedAt || doc.createdAt || '')
  const service = doc.service ? String(doc.service).trim() : ''
  return {
    id: Number(doc.id),
    name,
    rating,
    text,
    service: service || null,
    date: reviewDate(created),
    iso: created,
  }
}

/**
 * Опубликованные отзывы для сайта, свежие сверху, и сводка по ним. Сводка
 * считается по всей опубликованной выдаче, а не по показанной странице:
 * средняя оценка не должна меняться от того, сколько отзывов поместилось.
 */
export async function loadPublishedReviews(
  payload: Payload,
  limit: number = REVIEWS_PAGE_SIZE,
): Promise<{ reviews: PublicReview[]; stats: ReviewStats }> {
  const found = await payload.find({
    collection: 'reviews',
    where: { status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  const all = (found.docs as unknown as Record<string, unknown>[])
    .map(toPublicReview)
    .filter((r): r is PublicReview => r !== null)

  const sum = all.reduce((acc, r) => acc + r.rating, 0)
  const stats: ReviewStats = {
    count: all.length,
    average: all.length ? Math.round((sum / all.length) * 10) / 10 : null,
  }

  return { reviews: all.slice(0, limit), stats }
}

/**
 * Очередь модерации для CRM: все отзывы (или только выбранного статуса),
 * свежие сверху. Читается с overrideAccess — в записи служебные поля (IP,
 * заметка модератора), которые в публичную часть не уходят.
 */
export async function loadReviewQueue(
  payload: Payload,
  status?: string,
  limit = 200,
): Promise<ReviewQueueRow[]> {
  const where: Where | undefined = status ? { status: { equals: status } } : undefined
  const found = await payload.find({
    collection: 'reviews',
    where,
    sort: '-createdAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })

  return (found.docs as unknown as Record<string, unknown>[]).map((doc) => ({
    id: Number(doc.id),
    name: String(doc.name || ''),
    rating: reviewRating(doc.rating) ?? 0,
    text: String(doc.text || ''),
    service: doc.service ? String(doc.service) : null,
    status: (doc.status as ReviewStatus) || 'pending',
    createdAt: String(doc.createdAt || ''),
    moderatedBy: doc.moderatedBy ? String(doc.moderatedBy) : null,
    moderatedAt: doc.moderatedAt ? String(doc.moderatedAt) : null,
    publishedAt: doc.publishedAt ? String(doc.publishedAt) : null,
    moderationNote: doc.moderationNote ? String(doc.moderationNote) : null,
    consent: doc.consent === true,
    consentAt: doc.consentAt ? String(doc.consentAt) : null,
    ip: doc.ip ? String(doc.ip) : null,
  }))
}

/** Сколько отзывов ждёт проверки — для бейджа в шапке CRM (если понадобится) */
export async function countPendingReviews(payload: Payload): Promise<number> {
  const found = await payload.count({
    collection: 'reviews',
    where: { status: { equals: 'pending' } },
    overrideAccess: true,
  })
  return found.totalDocs || 0
}

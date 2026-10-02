/**
 * Отчёты по посетителям сайта — общий слой чтения для разделов CRM
 * «Аналитика → Посетители» и «Интерес к объектам».
 *
 * Данные собираются из трёх источников (пишет их сервер, см.
 * src/lib/visitor-tracking.ts):
 * — site-visits — визиты и просмотры страниц: из них считаются уникальные
 *   посетители, просмотры и повторные просмотры объектов;
 * — visitor-events — действия: избранное, нажатия «Позвонить»/WhatsApp/
 *   «Написать», фильтры, подача объявления;
 * — applications — обращения: единственный источник правды по заявкам,
 *   поэтому конверсия считается по ним, а не по событиям.
 *
 * Читают отчёты только страницы CRM под администратором: модуль ничего не
 * решает про доступ, это делают страницы (та же проверка, что у
 * /crm/site-stats) и правила коллекций visitors/visitor-events.
 */
import type { Payload } from 'payload'
import { objectPathId } from './site-stats'
// Подпись карточки («Посетитель #184») — общая с той, что ставит трекер
import { visitorTitle } from './visitor-tracking'

/** Сколько визитов максимум смотрим в одном отчёте (защита от «всё за год») */
export const MAX_VISITS = 20_000
/** Сколько событий максимум смотрим в одном отчёте */
export const MAX_EVENTS = 20_000

const PAGE_SIZE = 1_000
/** Самый длинный свой период: год */
const MAX_RANGE_DAYS = 366

export type ReportPeriod = 'today' | 'week' | 'month' | 'custom'

export interface PeriodRange {
  period: ReportPeriod
  start: Date
  /** Конец периода включительно (начало следующих суток) */
  end: Date
  /** Ключ дня YYYY-MM-DD по местному времени сервера */
  startKey: string
  endKey: string
}

/** Ключ дня YYYY-MM-DD по местному времени сервера (Europe/Moscow) */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Дата из строки YYYY-MM-DD на начало местных суток; null — строка не дата */
export function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Период отчёта из параметров адреса: сегодня / неделя (7 дней) / месяц
 * (30 дней) / свой диапазон дат. Логика та же, что в «Статистике сайта»:
 * отчёты не должны расходиться в том, что считают неделей.
 */
export function resolvePeriod(sp: { period?: string; from?: string; to?: string }): PeriodRange {
  const today = new Date()
  const todayKey = dayKey(today)
  const midnight = new Date(`${todayKey}T00:00:00`)
  const customFrom = parseDay(sp.from)
  const customTo = parseDay(sp.to)
  const period: ReportPeriod =
    sp.period === 'today' || sp.period === 'week' || sp.period === 'month'
      ? sp.period
      : sp.period === 'custom' && (customFrom || customTo)
        ? 'custom'
        : 'week'

  let start = new Date(midnight.getTime() - (period === 'today' ? 0 : period === 'week' ? 6 : 29) * 86_400_000)
  let end = new Date(today.getTime() + 1)
  if (period === 'custom') {
    // Даты в адресе могут быть любые: чиним порядок и ограничиваем длину
    const from = customFrom || customTo || midnight
    const to = customTo || customFrom || midnight
    const [a, b] = from <= to ? [from, to] : [to, from]
    start = a
    end = new Date(Math.min(b.getTime() + 86_400_000, today.getTime() + 1))
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      start = new Date(end.getTime() - MAX_RANGE_DAYS * 86_400_000)
    }
  }

  return {
    period,
    start,
    end,
    startKey: dayKey(start),
    endKey: dayKey(new Date(end.getTime() - 1)),
  }
}

/** Визит из базы — только нужные отчёту поля (см. select в запросе) */
interface VisitSlice {
  visitor?: string | null
  source?: string | null
  referrer?: string | null
  device?: string | null
  landing?: string | null
  pageviews?: number | null
  pages?: { path?: string | null; object?: number | null }[] | null
  createdAt?: string | null
  lastSeenAt?: string | null
}

/** Сводка по посетителю за период */
export interface VisitorSummary {
  visitor: string
  /** Визитов за период */
  visits: number
  /** Просмотров страниц за период */
  pageviews: number
  firstAt: string | null
  lastAt: string | null
  device: string
  source: string
  referrer: string | null
  /** Страница входа первого визита периода */
  landing: string | null
  /** Адрес → сколько раз открывал */
  pages: Map<string, number>
  /** Номер объекта → сколько раз открывал карточку */
  objects: Map<number, number>
}

/** Интерес к объекту за период (по просмотрам страниц) */
export interface ObjectViews {
  views: number
  /** Обезличенные идентификаторы посетителей, открывавших карточку */
  visitors: Set<string>
}

export interface VisitsScan {
  visitors: Map<string, VisitorSummary>
  objects: Map<number, ObjectViews>
  visitsCount: number
  pageviewsCount: number
  /** Просмотры страниц по адресам — для списка «частые страницы» */
  pages: Map<string, number>
  truncated: boolean
  readError: boolean
}

/** Одна страница визитов из базы. null — прочитать не удалось */
async function loadVisitsPage(payload: Payload, start: Date, end: Date, page: number) {
  try {
    return await payload.find({
      collection: 'site-visits',
      where: { createdAt: { greater_than_equal: start.toISOString(), less_than_equal: end.toISOString() } },
      sort: '-createdAt',
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
      select: {
        visitor: true,
        source: true,
        referrer: true,
        device: true,
        landing: true,
        pageviews: true,
        pages: true,
        createdAt: true,
        lastSeenAt: true,
      },
    })
  } catch (e) {
    console.error('[visitor-report] не удалось прочитать визиты:', e)
    return null
  }
}

/**
 * Разобрать визиты периода: сводка по каждому посетителю и по каждому объекту.
 * Страницы читаются по 1000, в памяти держим сводки, а не документы.
 */
export async function scanVisits(payload: Payload, start: Date, end: Date): Promise<VisitsScan> {
  const visitors = new Map<string, VisitorSummary>()
  const objects = new Map<number, ObjectViews>()
  const pages = new Map<string, number>()
  let visitsCount = 0
  let pageviewsCount = 0
  let truncated = false
  let readError = false

  for (let page = 1; page <= Math.ceil(MAX_VISITS / PAGE_SIZE); page++) {
    const res = await loadVisitsPage(payload, start, end, page)
    if (!res) {
      readError = true
      break
    }
    for (const visit of res.docs as unknown as VisitSlice[]) {
      const hash = (visit.visitor || '').trim()
      if (!hash) continue
      visitsCount++
      pageviewsCount += visit.pageviews || 0

      const created = visit.createdAt ? new Date(visit.createdAt).toISOString() : null
      const seen = visit.lastSeenAt ? new Date(visit.lastSeenAt).toISOString() : created
      let summary = visitors.get(hash)
      if (!summary) {
        summary = {
          visitor: hash,
          visits: 0,
          pageviews: 0,
          firstAt: created,
          lastAt: seen,
          device: visit.device || 'desktop',
          source: visit.source || 'direct',
          referrer: visit.referrer || null,
          landing: visit.landing || null,
          pages: new Map(),
          objects: new Map(),
        }
        visitors.set(hash, summary)
      }
      summary.visits++
      summary.pageviews += visit.pageviews || 0
      // Визиты приходят от новых к старым: первый встреченный — последний,
      // каждый следующий — более ранний
      if (created && (!summary.firstAt || created < summary.firstAt)) summary.firstAt = created
      if (seen && (!summary.lastAt || seen > summary.lastAt)) summary.lastAt = seen

      for (const hit of visit.pages || []) {
        const path = (hit.path || '').trim()
        if (!path) continue
        pages.set(path, (pages.get(path) || 0) + 1)
        summary.pages.set(path, (summary.pages.get(path) || 0) + 1)

        // Номер объекта: у новых записей он лежит рядом с адресом (в публичном
        // адресе номера нет), у старых — берём из адреса «/catalog/199»
        const objectId = hit.object && hit.object > 0 ? hit.object : objectPathId(path)
        if (objectId) {
          summary.objects.set(objectId, (summary.objects.get(objectId) || 0) + 1)
          const stat = objects.get(objectId) || { views: 0, visitors: new Set<string>() }
          stat.views++
          stat.visitors.add(hash)
          objects.set(objectId, stat)
        }
      }
    }
    if (!res.hasNextPage) break
    if (page === Math.ceil(MAX_VISITS / PAGE_SIZE)) truncated = true
  }

  return { visitors, objects, visitsCount, pageviewsCount, pages, truncated, readError }
}

/** Событие из базы — только нужные отчёту поля (см. select в запросе) */
interface EventSlice {
  visitor?: string | null
  kind?: string | null
  path?: string | null
  objectId?: number | null
  detail?: string | null
  createdAt?: string | null
}

export interface VisitorEventRow {
  kind: string
  path: string | null
  objectId: number | null
  detail: string | null
  at: string
}

export interface EventsScan {
  /** Событие → сколько раз за период */
  byKind: Map<string, number>
  /** Событие → сколько раз по каждому посетителю */
  byVisitor: Map<string, Map<string, number>>
  /** Номер объекта → сколько раз добавляли в избранное */
  favorites: Map<number, number>
  /** Событие → номер объекта → сколько раз (нажатия по объекту) */
  byObjectKind: Map<string, Map<number, number>>
  /** Подписи фильтров: «Каталог: Тип — Квартира…» → сколько раз */
  filters: Map<string, number>
  truncated: boolean
  readError: boolean
}

/** Одна страница событий из базы. null — прочитать не удалось */
async function loadEventsPage(payload: Payload, start: Date, end: Date, page: number) {
  try {
    return await payload.find({
      collection: 'visitor-events',
      where: { createdAt: { greater_than_equal: start.toISOString(), less_than_equal: end.toISOString() } },
      sort: '-createdAt',
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
      select: { visitor: true, kind: true, path: true, objectId: true, detail: true, createdAt: true },
    })
  } catch (e) {
    console.error('[visitor-report] не удалось прочитать события:', e)
    return null
  }
}

/** Разобрать события периода: счётчики по видам, объектам и посетителям */
export async function scanEvents(payload: Payload, start: Date, end: Date): Promise<EventsScan> {
  const byKind = new Map<string, number>()
  const byVisitor = new Map<string, Map<string, number>>()
  const favorites = new Map<number, number>()
  const byObjectKind = new Map<string, Map<number, number>>()
  const filters = new Map<string, number>()
  let truncated = false
  let readError = false

  for (let page = 1; page <= Math.ceil(MAX_EVENTS / PAGE_SIZE); page++) {
    const res = await loadEventsPage(payload, start, end, page)
    if (!res) {
      readError = true
      break
    }
    for (const event of res.docs as unknown as EventSlice[]) {
      const kind = (event.kind || '').trim()
      const hash = (event.visitor || '').trim()
      if (!kind || !hash) continue

      byKind.set(kind, (byKind.get(kind) || 0) + 1)

      let kinds = byVisitor.get(hash)
      if (!kinds) {
        kinds = new Map()
        byVisitor.set(hash, kinds)
      }
      kinds.set(kind, (kinds.get(kind) || 0) + 1)

      if (kind === 'filter_use' && event.detail) {
        const label = String(event.detail).slice(0, 300)
        filters.set(label, (filters.get(label) || 0) + 1)
      }

      const objectId = typeof event.objectId === 'number' && event.objectId > 0 ? event.objectId : null
      if (objectId) {
        if (kind === 'favorite_add') favorites.set(objectId, (favorites.get(objectId) || 0) + 1)
        const perObject = byObjectKind.get(kind) || new Map<number, number>()
        perObject.set(objectId, (perObject.get(objectId) || 0) + 1)
        byObjectKind.set(kind, perObject)
      }
    }
    if (!res.hasNextPage) break
    if (page === Math.ceil(MAX_EVENTS / PAGE_SIZE)) truncated = true
  }

  return { byKind, byVisitor, favorites, byObjectKind, filters, truncated, readError }
}

/** Все события одного посетителя (без ограничения периодом) — для карточки */
export async function loadVisitorEvents(payload: Payload, visitor: string, limit = 500): Promise<VisitorEventRow[]> {
  try {
    const res = await payload.find({
      collection: 'visitor-events',
      where: { visitor: { equals: visitor } },
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: true,
      select: { visitor: true, kind: true, path: true, objectId: true, detail: true, createdAt: true },
    })
    return (res.docs as unknown as EventSlice[]).map((e) => ({
      kind: String(e.kind || ''),
      path: e.path || null,
      objectId: typeof e.objectId === 'number' ? e.objectId : null,
      detail: e.detail || null,
      at: e.createdAt ? new Date(e.createdAt).toISOString() : '',
    }))
  } catch (e) {
    console.error('[visitor-report] не удалось прочитать события посетителя:', e)
    return []
  }
}

/** Визит посетителя для карточки: когда, откуда и сколько страниц */
export interface VisitorVisitRow {
  at: string
  source: string
  device: string
  referrer: string | null
  landing: string | null
  pageviews: number
}

export interface VisitorHistory {
  visits: VisitorVisitRow[]
  /** Адрес → сколько раз открывал за всю историю */
  pages: Map<string, number>
  /** Номер объекта → сколько раз открывал карточку за всю историю */
  objects: Map<number, number>
  visitsCount: number
  pageviewsCount: number
  truncated: boolean
  readError: boolean
}

/**
 * Вся история одного посетителя: визиты, страницы и объекты. Карточка
 * посетителя показывает её без ограничения периодом — период у отчёта,
 * а у человека «что он вообще смотрел» должен быть виден целиком.
 */
export async function loadVisitorHistory(
  payload: Payload,
  visitor: string,
  maxVisits = 2_000,
): Promise<VisitorHistory> {
  const visits: VisitorVisitRow[] = []
  const pages = new Map<string, number>()
  const objects = new Map<number, number>()
  let pageviewsCount = 0
  let truncated = false
  let readError = false

  for (let page = 1; page <= Math.ceil(maxVisits / PAGE_SIZE); page++) {
    let res
    try {
      res = await payload.find({
        collection: 'site-visits',
        where: { visitor: { equals: visitor } },
        sort: '-createdAt',
        limit: PAGE_SIZE,
        page,
        depth: 0,
        overrideAccess: true,
        select: { source: true, referrer: true, device: true, landing: true, pageviews: true, pages: true, createdAt: true },
      })
    } catch (e) {
      console.error('[visitor-report] не удалось прочитать визиты посетителя:', e)
      readError = true
      break
    }
    for (const visit of res.docs as unknown as VisitSlice[]) {
      const at = visit.createdAt ? new Date(visit.createdAt).toISOString() : ''
      visits.push({
        at,
        source: visit.source || 'direct',
        device: visit.device || 'desktop',
        referrer: visit.referrer || null,
        landing: visit.landing || null,
        pageviews: visit.pageviews || 0,
      })
      pageviewsCount += visit.pageviews || 0
      for (const hit of visit.pages || []) {
        const path = (hit.path || '').trim()
        if (!path) continue
        pages.set(path, (pages.get(path) || 0) + 1)
        // Номер объекта: у новых записей — рядом с адресом, у старых — в
        // самом адресе «/catalog/199» (см. страницы визита в SiteVisits)
        const objectId = hit.object && hit.object > 0 ? hit.object : objectPathId(path)
        if (objectId) objects.set(objectId, (objects.get(objectId) || 0) + 1)
      }
    }
    if (!res.hasNextPage) break
    if (page === Math.ceil(maxVisits / PAGE_SIZE)) truncated = true
  }

  return { visits, pages, objects, visitsCount: visits.length, pageviewsCount, truncated, readError }
}

/** Карточка посетителя из базы (см. коллекцию visitors) */
export interface VisitorRow {
  id: number
  number?: number | null
  title?: string | null
  visitor?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  visitsCount?: number | null
  pageviewsCount?: number | null
  device?: string | null
  source?: string | null
  referrer?: string | null
  region?: string | null
  lastPath?: string | null
  identified?: boolean | null
  applications?: (number | { id: number })[] | null
  user?: number | { id: number } | null
}

/**
 * Карточки посетителей по обезличенным идентификаторам. Визиты, записанные до
 * появления карточек (24.09–01.10), остались без них — такие карточки
 * заводим на месте, по первому визиту, чтобы отчёт не показывал «без номера».
 * Номер выдаёт тот же счётчик (nextVisitorNumber в visitor-tracking).
 */
export async function ensureVisitors(
  payload: Payload,
  hashes: string[],
  // Сколько карточек максимум завести за один показ отчёта: у каждого
  // недостающего хеша — свои запросы, и сотня новых карточек на один заход
  // заметно тормозила бы страницу. Остальные дозаполнятся при следующих
  // открытиях отчёта
  maxCreate = 40,
): Promise<Map<string, VisitorRow>> {
  const result = new Map<string, VisitorRow>()
  if (!hashes.length) return result

  const found = await payload.find({
    collection: 'visitors',
    where: { visitor: { in: hashes } },
    limit: hashes.length,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of found.docs as unknown as VisitorRow[]) {
    if (doc.visitor) result.set(doc.visitor, doc)
  }

  const missing = hashes.filter((hash) => !result.has(hash)).slice(0, maxCreate)
  for (const hash of missing) {
    try {
      // Карточка без визитов в базе (маячки не дошли) не создаётся: пустых
      // карточек в отчёте быть не должно
      const visits = await payload.find({
        collection: 'site-visits',
        where: { visitor: { equals: hash } },
        sort: 'createdAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { createdAt: true, device: true, source: true, referrer: true, landing: true, pageviews: true },
      })
      const first = visits.docs[0] as unknown as VisitSlice | undefined
      if (!first?.createdAt) continue

      const last = await payload.find({
        collection: 'site-visits',
        where: { visitor: { equals: hash } },
        sort: '-createdAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { createdAt: true, lastSeenAt: true },
      })
      const lastDoc = last.docs[0] as unknown as VisitSlice | undefined

      const count = await payload.count({
        collection: 'site-visits',
        where: { visitor: { equals: hash } },
        overrideAccess: true,
      })

      const prev = await payload.find({
        collection: 'visitors',
        sort: '-number',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { number: true },
      })
      const number = Number((prev.docs[0] as unknown as VisitorRow | undefined)?.number || 0) + 1

      const created = await payload.create({
        collection: 'visitors',
        data: {
          number,
          title: visitorTitle(number),
          visitor: hash,
          firstSeenAt: new Date(first.createdAt).toISOString(),
          lastSeenAt: lastDoc?.lastSeenAt || lastDoc?.createdAt || first.createdAt,
          lastPath: first.landing || undefined,
          visitsCount: count.totalDocs,
          pageviewsCount: 0,
          device: (first.device as 'desktop' | 'mobile' | 'tablet') || 'desktop',
          source: first.source || 'direct',
          referrer: first.referrer || undefined,
        },
        overrideAccess: true,
      })
      result.set(hash, created as unknown as VisitorRow)
    } catch (e) {
      // Отчёт не должен падать из-за карточки: покажем хеш без номера
      console.error('[visitor-report] не удалось завести карточку посетителя:', e)
    }
  }

  return result
}

/** Обращения периода: id заявки и номер объекта — для конверсии и списков */
export interface PeriodApplications {
  /** Всего обращений за период */
  total: number
  /** Номер объекта → сколько обращений по нему */
  byObject: Map<number, number>
}

/** Заявки периода. Читаем только id, объект и дату — персональных данных тут нет */
export async function scanApplications(payload: Payload, start: Date, end: Date): Promise<PeriodApplications> {
  const byObject = new Map<number, number>()
  let total = 0
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await payload.find({
        collection: 'applications',
        where: { createdAt: { greater_than_equal: start.toISOString(), less_than_equal: end.toISOString() } },
        sort: '-createdAt',
        limit: PAGE_SIZE,
        page,
        depth: 0,
        overrideAccess: true,
        select: { object: true },
      })
      for (const doc of res.docs as unknown as { object?: number | { id: number } | null }[]) {
        total++
        const raw = doc.object
        const objectId = typeof raw === 'object' && raw ? Number(raw.id) : Number(raw)
        if (Number.isInteger(objectId) && objectId > 0) {
          byObject.set(objectId, (byObject.get(objectId) || 0) + 1)
        }
      }
      if (!res.hasNextPage) break
    }
  } catch (e) {
    console.error('[visitor-report] не удалось прочитать заявки:', e)
  }
  return { total, byObject }
}

/** Названия объектов для отчётов: заголовок и адрес по номерам карточек */
export interface ObjectTitle {
  id: number
  title: string
  place: string
  price?: number | null
  agent?: string | null
}

export async function loadObjectTitles(payload: Payload, ids: number[]): Promise<Map<number, ObjectTitle>> {
  const map = new Map<number, ObjectTitle>()
  if (!ids.length) return map
  try {
    const res = await payload.find({
      collection: 'objects',
      where: { id: { in: ids } },
      limit: Math.min(ids.length, 1000),
      depth: 0,
      overrideAccess: true,
      select: { title: true, address: true, price: true, status: true },
    })
    for (const doc of res.docs as unknown as {
      id: number
      title?: string | null
      price?: number | null
      address?: { locality?: string | null; city?: string | null; street?: string | null; house?: string | null } | null
    }[]) {
      const id = Number(doc.id)
      const addr = doc.address || {}
      const place = [addr.locality || addr.city, addr.street, addr.house]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(', ')
      map.set(id, {
        id,
        title: (doc.title || '').trim() || `Объект №${id}`,
        place,
        price: doc.price ?? null,
      })
    }
  } catch (e) {
    console.error('[visitor-report] не удалось прочитать объекты:', e)
  }
  return map
}

/** Доля в процентах: 0 при пустом знаменателе */
export function share(value: number, total: number): number {
  return total ? Math.round((value / total) * 100) : 0
}

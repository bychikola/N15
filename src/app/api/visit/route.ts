import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { clientIp, rateLimited } from '@/lib/rate-limit'
import { isBot, objectPathId, objectPathSlug, pagePath, trackPageview, visitorHash } from '@/lib/site-stats'
import {
  CLIENT_EVENT_KINDS,
  filterLabel,
  pruneVisitorData,
  regionFromHeaders,
  touchVisitor,
  trackVisitorEvent,
  type VisitorEventKind,
} from '@/lib/visitor-tracking'

// Счётчик посещений сайта: маячок со страниц (POST) и пиксель для посетителей
// без JavaScript (GET). Данные обезличенные, отчёт — только в CRM у
// администратора (см. src/lib/site-stats.ts, src/app/crm/site-stats).
// Ни один ответ этого маршрута не отдаёт статистику наружу.
//
// Кроме просмотров страниц маячок присылает события действий (избранное,
// нажатия «Позвонить», WhatsApp, «Написать», начало подачи объявления) —
// из них собираются разделы «Аналитика → Посетители» и «Интерес к объектам»
// (см. src/lib/visitor-tracking.ts). Отсюда принимаются только события из
// белого списка: заявку и публикацию объявления ставит сервер в хуках
// коллекций, подделать их снаружи нельзя.

export const dynamic = 'force-dynamic'

/** Прозрачный GIF 1×1 — ответ для пикселя без JavaScript */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Запросов с одного IP в минуту: защита от накрутки и мусора в базе */
const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

const NO_STORE = { 'Cache-Control': 'no-store' }

/** События из браузера: белый список видов (см. CLIENT_EVENT_KINDS) */
const CLIENT_EVENTS = new Set<string>(CLIENT_EVENT_KINDS)

/** Запросы с чужих сайтов не считаем: маячок ставится только со страниц сайта */
function isForeign(req: NextRequest): boolean {
  return req.headers.get('sec-fetch-site') === 'cross-site'
}

/** Обезличенный идентификатор посетителя по заголовкам запроса */
function visitorOf(req: NextRequest, ip: string): string | null {
  const ua = req.headers.get('user-agent')
  return isBot(ua) ? null : visitorHash(ip, ua as string)
}

/**
 * Событие действия из браузера. Ошибки только в лог: страница важнее
 * статистики, и посетитель ничего не должен заметить.
 */
async function recordEvent(
  req: NextRequest,
  kind: VisitorEventKind,
  path: string | null,
  objectId: number | null,
): Promise<void> {
  try {
    if (isForeign(req)) return
    const ip = clientIp(req.headers)
    if (rateLimited(`visit:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) return
    const visitor = visitorOf(req, ip)
    if (!visitor) return

    const payload = await getPayload({ config })
    // Действие на карточке объекта: браузер присылает только путь, а номера
    // объекта в публичном адресе нет — достаём его по адресу (objectIdOfPath).
    // Кнопки в других разделах сайта передают номер сами (например, избранное)
    const resolved = objectId ?? (await objectIdOfPath(payload, path))
    await trackVisitorEvent(payload, { visitor, kind, path, objectId: resolved })
  } catch (e) {
    console.error('[visitors] не удалось записать событие:', e)
  }
}

/**
 * Номер объекта для страницы карточки каталога. В старом адресе
 * «/ru/catalog/199» он был прямо в пути, в публичном
 * «/ru/catalog/kvartira-vesennyaya-40m2-a1b2c3» его нет — связь с записью
 * базы восстанавливаем запросом (см. src/lib/object-slug.ts). Для страниц
 * без карточки — null, лишних запросов к базе нет.
 */
async function objectIdOfPath(payload: Payload, path: string | null): Promise<number | null> {
  if (!path) return null
  const byId = objectPathId(path)
  if (byId) return byId
  const slug = objectPathSlug(path)
  if (!slug) return null
  try {
    const { docs } = await payload.find({
      collection: 'objects',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const id = Number((docs[0] as { id?: unknown } | undefined)?.id)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    // База недоступна — просмотр всё равно запишем, объект в статистике
    // останется неопознанным (как у карточки, открытой по чужой ссылке)
    return null
  }
}

/**
 * Записать просмотр страницы. Кроме визита счётчик дописывает карточку
 * посетителя (первый и последний заход, число визитов) и события страницы:
 * открытие карточки объекта и применённые фильтры каталога.
 */
async function record(req: NextRequest, path: string | null, referrer?: string | null, search?: string | null): Promise<void> {
  try {
    // Запросы с чужих сайтов не считаем: маячок ставится только со страниц
    // n15-realty.ru, браузер помечает сторонние запросы как cross-site
    if (isForeign(req)) return

    const ip = clientIp(req.headers)
    if (rateLimited(`visit:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) return

    const payload = await getPayload({ config })
    const normalized = pagePath(path)
    const objectId = await objectIdOfPath(payload, normalized)
    const result = await trackPageview(payload, { path: normalized, referrer, headers: req.headers, ip, objectId })
    if (!result) return

    await touchVisitor(payload, {
      visitor: result.visitor,
      device: result.device,
      source: result.source,
      referrer: result.referrer,
      region: regionFromHeaders(req.headers),
      path: result.path,
      newVisit: result.newVisit,
    })

    // Карточка объекта — отдельное событие: по нему собирается отчёт
    // «Интерес к объектам» (уникальные посетители, повторные просмотры).
    // Номер уже найден выше (см. objectIdOfPath) — из публичного адреса его
    // сами не достать
    if (result.objectId) {
      await trackVisitorEvent(payload, { visitor: result.visitor, kind: 'object_view', path: result.path, objectId: result.objectId })
    }

    // Фильтры каталога: адрес со строкой запроса разбираем в понятную запись
    const filters = search ? filterLabel(result.path, search) : null
    if (filters) {
      await trackVisitorEvent(payload, { visitor: result.visitor, kind: 'filter_use', path: result.path, detail: filters })
    }

    await pruneVisitorData(payload)
  } catch (e) {
    console.error('[site-stats] не удалось записать просмотр:', e)
  }
}

/** Маячок со страницы: адрес, источник перехода и событие присылает браузер */
export async function POST(req: NextRequest) {
  let path: string | null = null
  let referrer: string | null = null
  let search: string | null = null
  let event: string | null = null
  let objectId: number | null = null
  try {
    const body = (await req.json().catch(() => null)) as {
      path?: unknown
      referrer?: unknown
      search?: unknown
      event?: unknown
      objectId?: unknown
    } | null
    path = typeof body?.path === 'string' ? body.path : null
    referrer = typeof body?.referrer === 'string' ? body.referrer : null
    search = typeof body?.search === 'string' ? body.search : null
    event = typeof body?.event === 'string' ? body.event : null
    objectId = typeof body?.objectId === 'number' && Number.isInteger(body.objectId) && body.objectId > 0 ? body.objectId : null
  } catch {
    // Пустое или битое тело — просто ничего не записываем
  }

  // Событие действия — отдельная запись, просмотр страницы ему не нужен
  if (event && CLIENT_EVENTS.has(event)) {
    await recordEvent(req, event as VisitorEventKind, pagePath(path), objectId)
    return new NextResponse(null, { status: 204, headers: NO_STORE })
  }

  await record(req, path, referrer, search)
  return new NextResponse(null, { status: 204, headers: NO_STORE })
}

/**
 * Пиксель для посетителей без JavaScript: адрес страницы браузер присылает в
 * Referer, в ?p= его передаёт разметка. Источник перехода здесь неизвестен —
 * такую страницу считаем прямым заходом.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('p') || req.headers.get('referer')
  await record(req, path)
  return new NextResponse(PIXEL, {
    status: 200,
    headers: { 'Content-Type': 'image/gif', 'Content-Length': String(PIXEL.length), ...NO_STORE },
  })
}

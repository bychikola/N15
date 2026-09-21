import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { clientIp, rateLimited } from '@/lib/rate-limit'
import { pagePath, trackPageview } from '@/lib/site-stats'

// Счётчик посещений сайта: маячок со страниц (POST) и пиксель для посетителей
// без JavaScript (GET). Данные обезличенные, отчёт — только в CRM у
// администратора (см. src/lib/site-stats.ts, src/app/crm/site-stats).
// Ни один ответ этого маршрута не отдаёт статистику наружу.

export const dynamic = 'force-dynamic'

/** Прозрачный GIF 1×1 — ответ для пикселя без JavaScript */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Запросов с одного IP в минуту: защита от накрутки и мусора в базе */
const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Записать просмотр. Ошибки только в лог: страница важнее статистики, и
 * посетитель ничего не должен заметить, даже если база недоступна.
 */
async function record(req: NextRequest, path: string | null, referrer?: string | null): Promise<void> {
  try {
    // Запросы с чужих сайтов не считаем: маячок ставится только со страниц
    // n15-realty.ru, браузер помечает сторонние запросы как cross-site
    if (req.headers.get('sec-fetch-site') === 'cross-site') return

    const ip = clientIp(req.headers)
    if (rateLimited(`visit:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) return

    const payload = await getPayload({ config })
    await trackPageview(payload, { path: pagePath(path), referrer, headers: req.headers, ip })
  } catch (e) {
    console.error('[site-stats] не удалось записать просмотр:', e)
  }
}

/** Маячок со страницы: адрес и внешний источник перехода присылает браузер */
export async function POST(req: NextRequest) {
  let path: string | null = null
  let referrer: string | null = null
  try {
    const body = (await req.json().catch(() => null)) as { path?: unknown; referrer?: unknown } | null
    path = typeof body?.path === 'string' ? body.path : null
    referrer = typeof body?.referrer === 'string' ? body.referrer : null
  } catch {
    // Пустое или битое тело — просто ничего не записываем
  }
  await record(req, path, referrer)
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

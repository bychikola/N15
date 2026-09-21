/**
 * Статистика посещений сайта — сбор обезличенных данных о визитах.
 *
 * Зачем свой счётчик, а не только Яндекс.Метрика: номер счётчика Метрики в
 * настройках сайта может быть не заполнен, а отчёты её Reporting API требуют
 * OAuth-токена кабинета (выдаёт только владелец). Свой счётчик пишет данные
 * в нашу же базу и работает сразу, без внешних сервисов и токенов. Код
 * счётчика Метрики при этом остаётся на месте (components/analytics) — если
 * номер появится, обе системы будут считать параллельно.
 *
 * Что НЕ сохраняется: IP-адрес, User-Agent и cookie. Из IP и браузера
 * считается необратимый хеш с секретом сайта (соль сменяется раз в месяц,
 * поэтому «посетитель» не отслеживается между месяцами). Персональных данных
 * в статистике нет — тот же принцип, что в разделе 8 политики
 * конфиденциальности: обезличенная статистика посещений.
 *
 * Отчёт по собранным данным — CRM → «Статистика сайта»
 * (src/app/crm/site-stats), раздел открыт только администраторам.
 */
import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'

/** Разрыв между хитами, после которого начинается новый визит (30 минут) */
export const SESSION_GAP_MS = 30 * 60 * 1000

/** Больше страниц в одном визите не храним (защита от зацикленного маячка) */
const MAX_PAGES_PER_VISIT = 200

/** Повторный хит по тому же пути в пределах окна — двойной маячок, не считаем */
const DOUBLE_HIT_MS = 3_000

/** Срок хранения визитов: старее — удаляем (см. pruneOldVisits) */
const RETENTION_DAYS = 400

/**
 * Поисковые роботы и превью мессенджеров: не посетители. Шаблоны намеренно
 * конкретные — «YandexBot», а не «yandex», иначе под фильтр попал бы
 * Яндекс.Браузер (YaBrowser) живого посетителя.
 */
const BOT_RE = new RegExp(
  [
    'bot', 'crawler', 'spider', 'slurp', 'crawl',
    'headless', 'lighthouse', 'pagespeed', 'pingdom', 'uptime', 'monitor',
    'curl/', 'wget/', 'python', 'okhttp', 'go-http-client', 'java/', 'axios',
    'facebookexternalhit', 'whatsapp', 'telegrambot', 'skypeuripreview',
  ].join('|'),
  'i',
)

/** Служебные разделы: CRM, админка, API, файлы — посещениями сайта не считаем */
function isServicePath(path: string): boolean {
  if (/^\/(api|_next|crm|media|admin-add)(\/|$)/i.test(path)) return true
  const adminRoute = (process.env.ADMIN_ROUTE || '/admin').toLowerCase()
  const lower = path.toLowerCase()
  return adminRoute !== '/' && (lower === adminRoute || lower.startsWith(`${adminRoute}/`))
}

/** Тип устройства по User-Agent (без клиентских подсказок и cookie) */
export function deviceFromUa(ua: string): 'desktop' | 'mobile' | 'tablet' {
  // Android без «Mobile» — планшет; проверяем планшеты раньше телефонов
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobile|iPhone|iPod|Android|Windows Phone|Opera Mini|IEMobile/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Хост-источник из строки referrer: без www, в нижнем регистре */
export function referrerHost(raw: string | null | undefined): string | null {
  const value = (raw || '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** Поисковики — переходы из поиска */
const SEARCH_HOSTS = /(^|\.)(yandex|ya|google|bing|duckduckgo|rambler|yahoo|ecosia|brave|nigma|sputnik|search\.mail|go\.mail)\./
/** Соцсети и мессенджеры — переходы из соцсетей */
const SOCIAL_HOSTS = /(^|\.)(vk|ok|t|telegram|whatsapp|instagram|facebook|fb|youtube|youtu|dzen|zen|tiktok|twitter|x|pinterest|linkedin|livejournal)\./

/** Источник визита по хосту перехода: пусто — прямой заход */
export function visitSource(host: string | null): 'direct' | 'search' | 'social' | 'referral' {
  if (!host) return 'direct'
  if (SEARCH_HOSTS.test(host)) return 'search'
  if (SOCIAL_HOSTS.test(host)) return 'social'
  return 'referral'
}

/**
 * Обезличенный идентификатор посетителя: HMAC от IP и браузера с секретом
 * сайта. Соль — календарный месяц: внутри месяца уникальность считается
 * честно, между месяцами один и тот же человек считается новым (поэтому
 * «уникальные» за период всегда немного завышены — как у любого счётчика
 * без cookie).
 */
export function visitorHash(ip: string, ua: string, now: Date = new Date()): string {
  const era = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const secret = process.env.PAYLOAD_SECRET || 'n15-dev-secret-change-in-production'
  return createHmac('sha256', secret).update(`n15-visit|${era}|${ip}|${ua}`).digest('hex').slice(0, 32)
}

/**
 * Путь страницы из запроса: только внутренние адреса без query и якорей.
 * Принимает и путь («/ru/catalog/12»), и полный URL (пиксель без JS присылает
 * адрес страницы в заголовке Referer). Служебные разделы и файлы — null.
 */
export function pagePath(raw: string | null | undefined): string | null {
  let value = (raw || '').trim()
  if (!value) return null
  if (!value.startsWith('/')) {
    try {
      value = new URL(value).pathname
    } catch {
      return null
    }
  }
  const path = value.split('?')[0].split('#')[0]
  if (!path.startsWith('/') || path.length > 200) return null
  if (isServicePath(path)) return null
  // Файлы (/sitemap.xml, /logo.png) страницами не считаем
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return null
  return path
}

/** Номер объекта в адресе карточки «/<язык>/catalog/<номер>» */
export function objectPathId(path: string): number | null {
  const m = /^\/[a-z]{2}\/catalog\/(\d+)\/?$/.exec(path)
  return m ? Number(m[1]) : null
}

/** Повторные хиты по тому же пути того же посетителя: время последнего */
const recentHits = new Map<string, number>()

/** Двойной маячок (повторный эффект React, быстрый переход) — не считаем */
function isDoubleHit(key: string, now: number): boolean {
  if (recentHits.size > 5_000) recentHits.clear()
  const last = recentHits.get(key)
  recentHits.set(key, now)
  return last != null && now - last < DOUBLE_HIT_MS
}

export interface PageviewInput {
  /** Путь страницы (уже проверенный через pagePath) */
  path: string | null
  /** Внешний источник перехода из document.referrer (пусто — прямой заход) */
  referrer?: string | null
  /** Заголовки запроса: IP за прокси и User-Agent */
  headers: Headers
  /** IP клиента (см. clientIp в lib/rate-limit) */
  ip: string
}

/**
 * Записать просмотр страницы. Визит продолжается, пока с последнего хита того
 * же посетителя прошло меньше 30 минут; иначе начинается новый визит с
 * источником перехода. Ошибки глушим: статистика не должна ломать страницу.
 */
export async function trackPageview(payload: Payload, input: PageviewInput): Promise<void> {
  const { path, ip } = input
  if (!path) return
  const ua = input.headers.get('user-agent') || ''
  if (!ua || BOT_RE.test(ua)) return

  const now = new Date()
  const visitor = visitorHash(ip, ua, now)
  if (isDoubleHit(`${visitor}|${path}`, now.getTime())) return

  // Переход внутри сайта (Referer — наша же страница) источником не считаем:
  // это продолжение визита, а не новый канал. Внешний источник берём только
  // с чужого домена.
  const ownHost = (input.headers.get('host') || '').split(':')[0].toLowerCase().replace(/^www\./, '')
  const parsedHost = referrerHost(input.referrer)
  const host = parsedHost && ownHost && parsedHost === ownHost ? null : parsedHost
  const since = new Date(now.getTime() - SESSION_GAP_MS).toISOString()

  const existing = await payload.find({
    collection: 'site-visits',
    where: { and: [{ visitor: { equals: visitor } }, { lastSeenAt: { greater_than: since } }] },
    sort: '-lastSeenAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const visit = existing.docs[0] as
    | { id: number; pageviews?: number | null; pages?: { id?: string; path?: string }[] | null }
    | undefined

  if (visit) {
    // Тот же визит: продлеваем и дописываем страницу (если есть место)
    const pages: { id?: string; path?: string }[] = (visit.pages || []).map((p) => ({ id: p.id, path: p.path }))
    if (pages.length < MAX_PAGES_PER_VISIT) pages.push({ path })
    await payload.update({
      collection: 'site-visits',
      id: visit.id,
      data: {
        lastSeenAt: now.toISOString(),
        pageviews: (visit.pageviews || 0) + 1,
        pages,
      },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'site-visits',
      data: {
        visitor,
        device: deviceFromUa(ua),
        source: visitSource(host),
        referrer: host || undefined,
        landing: path,
        lastSeenAt: now.toISOString(),
        pageviews: 1,
        pages: [{ path }],
      },
      overrideAccess: true,
    })
  }

  await pruneOldVisits(payload)
}

/** Когда последний раз чистили старые визиты (чистим не чаще раза в сутки) */
let lastPrune = 0

/**
 * Удаление визитов старше срока хранения. Счётчик не должен расти бесконечно:
 * строки копятся с каждого просмотра страницы. Запускается из trackPageview,
 * ошибки глушим — чистка не важнее самого хита.
 */
async function pruneOldVisits(payload: Payload): Promise<void> {
  const now = Date.now()
  if (now - lastPrune < 24 * 60 * 60 * 1000) return
  lastPrune = now
  try {
    const before = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await payload.delete({
      collection: 'site-visits',
      where: { createdAt: { less_than: before } },
      overrideAccess: true,
    })
  } catch (e) {
    console.error('[site-stats] не удалось удалить старые визиты:', e)
  }
}

/** Человекочитаемые названия источников для отчёта в CRM */
export const SOURCE_LABELS: Record<string, string> = {
  direct: 'Прямые заходы',
  search: 'Переходы из поиска',
  social: 'Соцсети и мессенджеры',
  referral: 'Переходы с сайтов',
}

/** Человекочитаемые названия устройств для отчёта в CRM */
export const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Компьютеры',
  mobile: 'Телефоны',
  tablet: 'Планшеты',
}

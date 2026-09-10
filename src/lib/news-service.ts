/**
 * Серверная обвязка «Новостей о недвижимости» (правила — src/lib/news.ts).
 *
 * Движок читает открытые RSS-каналы официальных источников по расписанию
 * (таймер в src/instrumentation.ts и кнопка «Проверить источники» в CRM),
 * складывает новые записи в коллекцию news со статусом «На проверке»,
 * чистит дубли и устаревшее. Публикация в блог возможна только по решению
 * сотрудника: approveNews создаёт статью блога со ссылкой на источник,
 * rejectNews и postponeNews закрывают или откладывают запись.
 */
import type { Payload } from 'payload'
import {
  NEWS_CHECK_INTERVAL_MINUTES,
  NEWS_ITEMS_PER_FEED,
  NEWS_MAX_AGE_DAYS,
  NEWS_POSTPONE_DAYS,
  NEWS_SOURCES,
  NEWS_STALE_DAYS,
  NEWS_TOPIC_LABELS,
  classifyNewsTopic,
  detectNewsRegion,
  isHttpUrl,
  newsExcerpt,
  newsPublishIssue,
  newsRichText,
  newsSourceLine,
  newsTitleKey,
  newsUrlDisplay,
  newsUrlKey,
  officialSourceByUrl,
  parseFeed,
  shortSummary,
  stripHtml,
  type FeedItem,
  type NewsLike,
  type NewsSource,
} from './news'

const DAY_MS = 86_400_000
const FETCH_TIMEOUT_MS = 15_000
// Сколько страниц за один канал добираем за лидом (см. fetchOfficialPageLead):
// запросы идут только к тем новостям, где канал не дал описания, и не чаще
// одного прохода в 6 часов — на один канал ЦБ их приходится единицы
const MAX_LEAD_PAGES_PER_FEED = 5
// Представляемся честно: официальные каналы отдают RSS для распространения,
// но вести себя надо скромно — один запрос на канал за проход, пауза между ними.
// Только латиница: fetch отвергает заголовки с кириллицей (ByteString).
const USER_AGENT = 'N15-Realty-News/1.0 (+https://n15-realty.ru; official news RSS)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

/** Загруженный документ новости в объёме, нужном сервису */
interface NewsDoc extends NewsLike {
  id: number
  status?: string | null
  postponeUntil?: string | null
  fetchedAt?: string | null
  origin?: string | null
  reviewNote?: string | null
  blogPost?: unknown
}

// --- Сеть ------------------------------------------------------------------------------

/** Запрос текста по официальному адресу с таймаутом и честным User-Agent */
async function fetchText(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.5',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 0, body: message }
  }
}

/** Метаданные страницы официального источника — только для ручного добавления */
export interface PageMeta {
  title: string
  description: string
  publishedAt: string | null
}

const metaContent = (html: string, key: string): string => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  const tag = re.exec(html)?.[0]
  if (!tag) return ''
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1]
  return content ? content.trim() : ''
}

/**
 * Заголовок и описание страницы официального источника: используется, когда
 * сотрудник добавляет новость ссылкой вручную (у Минстроя, ДОМ.РФ, Росреестра
 * и органов РСО-Алания открытого RSS нет). Полный текст страницы не сохраняем —
 * только заголовок и то короткое описание, которое сайт отдаёт сам.
 */
export async function fetchOfficialPageMeta(url: string): Promise<PageMeta | null> {
  if (!isHttpUrl(url) || !officialSourceByUrl(url)) return null
  const { ok, body } = await fetchText(url)
  if (!ok) return null
  const title = shortSummary(metaContent(body, 'og:title') || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] || ''), 180)
  const description = shortSummary(
    metaContent(body, 'og:description') || metaContent(body, 'description') || metaContent(body, 'twitter:description'),
  )
  const publishedAt =
    metaContent(body, 'article:published_time') ||
    metaContent(body, 'og:published_time') ||
    (/<time[^>]+datetime=["']([^"']+)["']/i.exec(body)?.[1] || '')
  const date = publishedAt ? new Date(publishedAt) : null
  return {
    title: title.replace(/…$/, ''),
    description,
    publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
  }
}

/**
 * Служебные абзацы, которые на страницах ведомств стоят раньше текста новости
 * («Это архивная публикация…», «Поделиться…»). Сверяем с началом абзаца:
 * по вхождению подстроки ловятся обычные слова — «включительно» внутри
 * «включите», и живой лид решения ЦБ пропадал.
 *
 * «Размещение информации осуществляется ежемесячно…» — единственный абзац на
 * страницах статистики ЦБ (ставки, интерактивные данные). Фраза одинаковая для
 * всех выпусков: без её отсева три разные новости получали одно и то же
 * «краткое содержание» ни о чём, и отличить их в очереди было нельзя.
 */
const LEAD_NOISE =
  /^(это архивная публикация|архивная публикация|поделиться|мы используем|для корректной работы|включите|версия для слабовидящих|размещение информации (осуществляется|производится))/i

/** Длина осмысленного абзаца-лида: короткие строки — подписи и навигация */
const LEAD_MIN_LENGTH = 80

/**
 * Первый содержательный абзац страницы официального источника. Нужен там, где
 * канал отдаёт в описании только картинку (так делает ФНС по РСО-Алания) —
 * без него новость приходила бы в очередь без краткого содержания, и её нельзя
 * было бы опубликовать. Полный текст страницы не сохраняем: берём один абзац
 * и обрезаем его до резюме, как и лиды из каналов.
 */
export async function fetchOfficialPageLead(url: string): Promise<string> {
  if (!isHttpUrl(url) || !officialSourceByUrl(url)) return ''
  const { ok, body } = await fetchText(url)
  if (!ok) return ''
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((text) => text.length >= LEAD_MIN_LENGTH && !LEAD_NOISE.test(text))
  if (paragraphs[0]) return paragraphs[0]
  // Запасной вариант — описание страницы (og:description), если оно содержательнее
  const meta = stripHtml(metaContent(body, 'og:description') || metaContent(body, 'description'))
  return meta.length >= LEAD_MIN_LENGTH ? meta : ''
}

// --- Сбор ------------------------------------------------------------------------------

export interface NewsSweepResult {
  ok: boolean
  added: number
  skipped: number
  removed: number
  duplicates: number
  restored: number
  /** Источники, каналы которых не ответили или не отдали записей */
  report: string[]
  /** Движок выключен галочкой в настройках */
  disabled?: boolean
  /** Проход уже идёт (кнопка + таймер) */
  busy?: boolean
  error?: string
}

const NEWS_STATUS_LABELS: Record<string, string> = {
  new: 'На проверке',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  postponed: 'Отложено',
}

// Один проход за раз: кнопка в CRM и серверный таймер не должны дублировать чтение
let sweeping = false

/** Ключи уже собранных новостей — для отсева дублей до записи в базу */
async function loadExistingKeys(payload: Payload): Promise<{ urls: Set<string>; titles: Set<string> }> {
  const { docs } = await payload.find({
    collection: 'news',
    limit: 2000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const urls = new Set<string>()
  const titles = new Set<string>()
  for (const raw of docs) {
    const doc = raw as unknown as Record<string, unknown>
    const urlKey = newsUrlKey(str(doc.url))
    const titleKey = newsTitleKey(str(doc.title))
    if (urlKey) urls.add(urlKey)
    if (titleKey) titles.add(titleKey)
  }
  return { urls, titles }
}

/** Новость из записи фида → документ коллекции news */
function itemToNews(item: FeedItem, source: NewsSource): Record<string, unknown> | null {
  if (!isHttpUrl(item.link)) return null
  const topic = classifyNewsTopic(item.title, item.description)
  if (!topic) return null
  const summary = shortSummary(item.description)
  const region = detectNewsRegion(`${item.title} ${item.description}`, source.region)
  return {
    title: item.title,
    summary,
    url: newsUrlDisplay(item.link),
    sourceName: source.name,
    sourceSlug: source.slug,
    region,
    topic,
    publishedAt: item.publishedAt || new Date().toISOString(),
    status: 'new',
    origin: 'feed',
    fetchedAt: new Date().toISOString(),
  }
}

/** Сбор по всем источникам с открытыми каналами: новые записи → «На проверке» */
async function collectFromFeeds(
  payload: Payload,
  report: string[],
): Promise<{ added: number; skipped: number }> {
  const keys = await loadExistingKeys(payload)
  let added = 0
  let skipped = 0
  const maxAge = Date.now() - NEWS_MAX_AGE_DAYS * DAY_MS

  for (const source of NEWS_SOURCES) {
    if (source.feeds.length === 0) continue
    for (const feed of source.feeds) {
      const { ok, status, body } = await fetchText(feed)
      if (!ok) {
        report.push(`${source.name}: канал недоступен (${status || body.slice(0, 80)})`)
        continue
      }
      // Сначала отсев по дате, потом предел длины: старые записи не должны
      // съедать место свежих (в канале ЦБ до 100 сообщений, см. NEWS_ITEMS_PER_FEED)
      const all = parseFeed(body)
      const when = (item: FeedItem) => (item.publishedAt ? new Date(item.publishedAt).getTime() : Date.now())
      const fresh = all.filter((item) => when(item) >= maxAge)
      const items = fresh.slice(0, NEWS_ITEMS_PER_FEED)
      const old = all.length - fresh.length
      const beyond = fresh.length - items.length
      let feedAdded = 0
      let dupes = 0
      let offTopic = 0
      let foreign = 0
      let leads = 0
      for (const item of items) {
        // Ссылка обязана вести на домен этого же официального источника:
        // чужой или неофициальный адрес в очередь не берём (пункт 10 брифа)
        if (officialSourceByUrl(item.link)?.slug !== source.slug) {
          foreign += 1
          continue
        }
        const urlKey = newsUrlKey(item.link)
        const titleKey = newsTitleKey(item.title)
        if (keys.urls.has(urlKey) || keys.titles.has(titleKey)) {
          dupes += 1
          continue
        }
        const doc = itemToNews(item, source)
        if (!doc) {
          offTopic += 1
          continue
        }
        // Канал отдал только картинку в описании (так делает ФНС) — лид
        // добираем со страницы новости, иначе публиковать будет нечего
        if (!str(doc.summary) && leads < MAX_LEAD_PAGES_PER_FEED) {
          leads += 1
          const lead = await fetchOfficialPageLead(str(doc.url))
          if (lead) doc.summary = shortSummary(lead)
          await sleep(400)
        }
        await payload.create({ collection: 'news', data: doc, overrideAccess: true })
        keys.urls.add(urlKey)
        keys.titles.add(titleKey)
        feedAdded += 1
      }
      added += feedAdded
      skipped += old + dupes + offTopic + foreign + beyond
      report.push(
        `${source.name}: найдено ${all.length}, добавлено ${feedAdded}, пропущено ${old + dupes + offTopic + foreign + beyond}` +
          ` (старых ${old}, дублей ${dupes}, не по темам ${offTopic}, чужие ссылки ${foreign}` +
          `${beyond ? `, сверх предела ${beyond}` : ''}${leads ? `, лид со страницы ${leads}` : ''})`,
      )
      await sleep(400) // пауза между каналами — не долбим сайты ведомств
    }
  }
  return { added, skipped }
}

/**
 * Чистка очереди (пункт 6 брифа): дубли (одинаковый заголовок — одна новость
 * в двух каналах, одинаковый адрес — та же ссылка) и устаревшие записи
 * (не подтвердили за NEWS_STALE_DAYS дней). Возвращённые в срок отложенные
 * новости снова становятся «На проверке». Опубликованные не трогаем — они
 * уже живут в блоге.
 */
async function cleanupNews(payload: Payload): Promise<{ removed: number; duplicates: number; restored: number }> {
  const now = Date.now()
  const { docs } = await payload.find({
    collection: 'news',
    limit: 2000,
    depth: 0,
    pagination: false,
    sort: 'fetchedAt',
    overrideAccess: true,
  })

  let restored = 0
  let removed = 0
  let duplicates = 0
  const seenUrls = new Set<string>()
  const seenTitles = new Set<string>()
  const unpublished = new Set(['new', 'rejected', 'postponed'])

  for (const raw of docs) {
    const doc = raw as unknown as NewsDoc
    const status = str(doc.status) || 'new'

    // Отложенное вернулось в срок — снова на проверку
    if (status === 'postponed' && doc.postponeUntil && new Date(doc.postponeUntil).getTime() <= now) {
      await payload.update({
        collection: 'news',
        id: doc.id,
        data: { status: 'new', postponeUntil: null },
        overrideAccess: true,
      })
      restored += 1
      continue
    }
    if (!unpublished.has(status)) continue

    const fetchedAt = doc.fetchedAt ? new Date(doc.fetchedAt).getTime() : now
    const isStale = now - fetchedAt > NEWS_STALE_DAYS * DAY_MS
    const urlKey = newsUrlKey(str(doc.url))
    const titleKey = newsTitleKey(str(doc.title))
    const isDupe = (urlKey && seenUrls.has(urlKey)) || (titleKey && seenTitles.has(titleKey))

    if (isStale || isDupe) {
      await payload.delete({ collection: 'news', id: doc.id, overrideAccess: true })
      if (isDupe) duplicates += 1
      else removed += 1
      continue
    }
    if (urlKey) seenUrls.add(urlKey)
    if (titleKey) seenTitles.add(titleKey)
  }

  return { removed, duplicates, restored }
}

/**
 * Полный проход автосбора: чтение каналов → запись новых новостей → чистка
 * дублей и устаревшего → отметка в настройках (когда проверяли и что вышло).
 * Идемпотентен: повторный запуск не создаст дублей, поэтому кнопка в CRM
 * и таймер могут вызывать его свободно.
 */
export async function runNewsSweep(payload: Payload): Promise<NewsSweepResult> {
  if (sweeping) {
    return { ok: false, busy: true, added: 0, skipped: 0, removed: 0, duplicates: 0, restored: 0, report: [] }
  }
  sweeping = true
  try {
    const settings = (await payload.findGlobal({
      slug: 'news-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as { enabled?: boolean }
    if (settings?.enabled === false) {
      return { ok: true, disabled: true, added: 0, skipped: 0, removed: 0, duplicates: 0, restored: 0, report: [] }
    }

    const report: string[] = []
    const { added, skipped } = await collectFromFeeds(payload, report)
    const { removed, duplicates, restored } = await cleanupNews(payload)

    const now = new Date()
    const next = new Date(now.getTime() + NEWS_CHECK_INTERVAL_MINUTES * 60_000)
    const stamp = now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const lines = [
      `${stamp}: добавлено ${added}, пропущено ${skipped}, удалено устаревших ${removed}, дублей ${duplicates}, возвращено из отложенных ${restored}`,
      ...report,
    ]
    await payload.updateGlobal({
      slug: 'news-settings',
      data: { lastSweepAt: now.toISOString(), nextSweepAt: next.toISOString(), lastReport: lines.join('\n') },
      overrideAccess: true,
    })

    return { ok: true, added, skipped, removed, duplicates, restored, report }
  } catch (error) {
    console.error('News sweep error:', error)
    return {
      ok: false,
      added: 0,
      skipped: 0,
      removed: 0,
      duplicates: 0,
      restored: 0,
      report: [],
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    sweeping = false
  }
}

// --- Раздел CRM «Новости на проверку» -----------------------------------------------------

/** Строка очереди для CRM */
export interface NewsRow {
  id: number
  title: string
  summary: string
  url: string
  sourceName: string
  sourceSlug: string
  region: string
  topic: string
  topicLabel: string
  publishedAt: string | null
  fetchedAt: string | null
  status: string
  statusLabel: string
  postponeUntil: string | null
  origin: string
  reviewNote: string
  blogPostId: number | null
  /** Почему нельзя опубликовать (null — можно) */
  issue: string | null
}

export interface NewsSourceRow {
  slug: string
  name: string
  kind: string
  region: string
  /** feed — читаем открытый RSS; manual — только ссылкой вручную */
  channel: 'feed' | 'manual'
  note: string
}

export interface NewsBoard {
  rows: NewsRow[]
  sources: NewsSourceRow[]
  lastSweepAt: string | null
  nextSweepAt: string | null
  lastReport: string
  enabled: boolean
}

/** Список источников для подсказки в CRM (какой канал доступен) */
export function newsSourceRows(): NewsSourceRow[] {
  return NEWS_SOURCES.map((s) => ({
    slug: s.slug,
    name: s.name,
    kind: s.kind === 'regional' ? 'регион' : 'федеральный',
    region: s.region,
    channel: s.feeds.length > 0 ? 'feed' : 'manual',
    note: s.note || '',
  }))
}

/** Очередь новостей, источники и состояние автосбора — для страницы /crm/news */
export async function loadNewsBoard(payload: Payload): Promise<NewsBoard> {
  const [newsRes, settingsRaw] = await Promise.all([
    payload.find({
      collection: 'news',
      sort: '-fetchedAt',
      limit: 400,
      depth: 0,
      overrideAccess: true,
    }),
    payload.findGlobal({ slug: 'news-settings', depth: 0, overrideAccess: true }),
  ])
  const settings = settingsRaw as unknown as Record<string, unknown>

  const rows: NewsRow[] = newsRes.docs.map((raw) => {
    const doc = raw as unknown as Record<string, unknown>
    const item: NewsLike = {
      title: str(doc.title),
      summary: str(doc.summary),
      url: str(doc.url),
      sourceSlug: str(doc.sourceSlug),
      sourceName: str(doc.sourceName),
      publishedAt: str(doc.publishedAt) || null,
    }
    const status = str(doc.status) || 'new'
    const blogPost = doc.blogPost
    return {
      id: Number(doc.id),
      title: item.title || '—',
      summary: item.summary || '',
      url: item.url || '',
      sourceName: item.sourceName || officialSourceByUrl(item.url)?.name || '—',
      sourceSlug: item.sourceSlug || '',
      region: str(doc.region) || 'Россия',
      topic: str(doc.topic),
      topicLabel: NEWS_TOPIC_LABELS[str(doc.topic)] || 'Без темы',
      publishedAt: item.publishedAt || null,
      fetchedAt: str(doc.fetchedAt) || null,
      status,
      statusLabel: NEWS_STATUS_LABELS[status] || status,
      postponeUntil: str(doc.postponeUntil) || null,
      origin: str(doc.origin) || 'feed',
      reviewNote: str(doc.reviewNote),
      blogPostId: typeof blogPost === 'number' ? blogPost : num((blogPost as { id?: unknown })?.id),
      // Уже опубликованные повторно не проверяем — их правило выполнено при публикации
      issue: status === 'published' ? null : newsPublishIssue(item),
    }
  })

  return {
    rows,
    sources: newsSourceRows(),
    lastSweepAt: str(settings?.lastSweepAt) || null,
    nextSweepAt: str(settings?.nextSweepAt) || null,
    lastReport: str(settings?.lastReport),
    enabled: settings?.enabled !== false,
  }
}

// --- Действия сотрудника ------------------------------------------------------------------

export interface NewsActionPatch {
  title?: string
  summary?: string
  topic?: string
}

/** Новость целиком (для проверки правил публикации) */
async function loadNews(payload: Payload, id: number): Promise<NewsDoc | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'news',
      id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
    if (!doc) return null
    return { ...doc, id: Number(doc.id) } as unknown as NewsDoc
  } catch {
    return null
  }
}

export interface NewsActionResult {
  ok: boolean
  error?: string
  blogPostId?: number
}

/**
 * «Одобрить и опубликовать»: создаём статью блога с кратким содержанием,
 * прямой ссылкой и обязательной строкой «Источник: …», затем помечаем новость
 * опубликованной (см. также хук коллекции news — он проверяет те же правила).
 */
export async function approveNews(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
  patch?: NewsActionPatch,
): Promise<NewsActionResult> {
  const doc = await loadNews(payload, id)
  if (!doc) return { ok: false, error: 'Новость не найдена' }

  const item: NewsLike = {
    title: (patch?.title ?? str(doc.title)).trim(),
    summary: (patch?.summary ?? str(doc.summary)).trim(),
    url: str(doc.url),
    sourceSlug: str(doc.sourceSlug),
    sourceName: str(doc.sourceName),
    publishedAt: doc.publishedAt || null,
  }
  const issue = newsPublishIssue(item)
  if (issue) return { ok: false, error: `Публикация невозможна: ${issue}` }

  const source = officialSourceByUrl(item.url) || null
  const sourceName = item.sourceName?.trim() || source?.name || 'Официальный источник'
  const topic = (patch?.topic || str(doc.topic)) as keyof typeof NEWS_TOPIC_LABELS | ''
  const sourceLine = newsSourceLine(sourceName, item.url || '')

  try {
    const post = await payload.create({
      collection: 'blog',
      data: {
        title: item.title,
        excerpt: newsExcerpt(item.summary || ''),
        content: newsRichText(item.summary || '', sourceLine),
        category: NEWS_TOPIC_LABELS[topic] || 'Новости недвижимости',
        tags: [{ tag: sourceName }, { tag: str(doc.region) || 'Россия' }],
        publishedAt: item.publishedAt,
        // Поля источника — на странице статьи под лидом выводится «Источник: …»
        sourceName,
        sourceUrl: newsUrlDisplay(item.url || ''),
      },
      overrideAccess: true,
      user,
    })
    const blogPostId = Number((post as { id?: unknown }).id)

    await payload.update({
      collection: 'news',
      id,
      // Передаём поля целиком: хук коллекции проверяет правила публикации
      data: {
        title: item.title,
        summary: item.summary,
        url: item.url,
        publishedAt: item.publishedAt,
        topic: patch?.topic || str(doc.topic) || undefined,
        status: 'published',
        blogPost: blogPostId,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.id,
        reviewNote: '',
      },
      depth: 0,
      overrideAccess: true,
      user,
    })
    return { ok: true, blogPostId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** «Отклонить»: новость не идёт в блог, причина сохраняется в заметке */
export async function rejectNews(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
  reason?: string,
): Promise<NewsActionResult> {
  try {
    await payload.update({
      collection: 'news',
      id,
      data: {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.id,
        reviewNote: (reason || '').trim(),
      },
      depth: 0,
      overrideAccess: true,
      user,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** «Отложить»: вернуть в очередь через N дней (по умолчанию NEWS_POSTPONE_DAYS) */
export async function postponeNews(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string },
  days = NEWS_POSTPONE_DAYS,
  reason?: string,
): Promise<NewsActionResult> {
  const safeDays = Math.min(60, Math.max(1, Math.round(days) || NEWS_POSTPONE_DAYS))
  const until = new Date(Date.now() + safeDays * DAY_MS)
  try {
    await payload.update({
      collection: 'news',
      id,
      data: {
        status: 'postponed',
        postponeUntil: until.toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.id,
        reviewNote: (reason || '').trim() || `Отложено на ${safeDays} дн.`,
      },
      depth: 0,
      overrideAccess: true,
      user,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Ручное добавление новости ссылкой: домен обязан входить в официальный
 * реестр (пункт 10 брифа). Если заголовок не передан, пробуем взять его со
 * страницы источника; недоступен серверу — сотрудник заполняет заголовок сам.
 */
export async function addNewsByLink(
  payload: Payload,
  rawUrl: string,
  user?: { id?: number | string; email?: string; name?: string },
  patch?: NewsActionPatch & { publishedAt?: string | null },
): Promise<NewsActionResult & { created?: boolean; id?: number }> {
  const url = newsUrlDisplay((rawUrl || '').trim())
  if (!isHttpUrl(url)) return { ok: false, error: 'Нужна обычная http(s)-ссылка на новость' }
  const source = officialSourceByUrl(url)
  if (!source) {
    return {
      ok: false,
      error: 'Домен не входит в реестр официальных источников — такую новость публиковать нельзя',
    }
  }

  // Сверяем не строку адреса, а нормализованный ключ (newsUrlKey): так дубль
  // ловится и когда источник повторил ту же ссылку с utm-метками или слэшем.
  const key = newsUrlKey(url)
  const existing = await payload.find({
    collection: 'news',
    limit: 2000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const sameKey = existing.docs.find((d) => newsUrlKey(str((d as unknown as Record<string, unknown>).url)) === key)
  if (sameKey) {
    return { ok: false, error: 'Эта ссылка уже есть в очереди', id: Number((sameKey as { id?: unknown }).id), created: false }
  }

  const meta = patch?.title ? null : await fetchOfficialPageMeta(url)
  const title = (patch?.title || meta?.title || '').trim()
  if (!title) {
    return {
      ok: false,
      error: 'Заголовок не удалось прочитать со страницы — впишите его вручную',
    }
  }
  const description = (patch?.summary || meta?.description || '').trim()
  const summary = shortSummary(description)
  const topic = classifyNewsTopic(title, summary) || 'market'
  return {
    ok: true,
    created: true,
    id: await createManualNews(payload, {
      title,
      summary,
      url,
      sourceName: source.name,
      sourceSlug: source.slug,
      region: detectNewsRegion(`${title} ${summary}`, source.region),
      topic: patch?.topic || topic,
      publishedAt: patch?.publishedAt || meta?.publishedAt || new Date().toISOString(),
      origin: 'manual',
      status: 'new',
      fetchedAt: new Date().toISOString(),
      reviewedBy: user?.id,
    }),
  }
}

/** Запись ручной новости (вынесено, чтобы addNewsByLink читался линейно) */
async function createManualNews(payload: Payload, data: Record<string, unknown>): Promise<number> {
  const doc = await payload.create({ collection: 'news', data, overrideAccess: true })
  return Number((doc as { id?: unknown }).id)
}

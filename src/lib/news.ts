/**
 * «Новости о недвижимости» — движок сбора официальных новостей для блога Н15.
 *
 * Идея: сайт не публикует ничего автоматически. Движок по расписанию читает
 * официальные RSS-каналы (Банк России, Правительство России, ФНС по РСО-Алания
 * и др.), складывает найденное в очередь «на проверку» и только после
 * подтверждения сотрудника материал уходит в блог (см. news-service.ts).
 *
 * Правила, заложенные здесь:
 *   — только официальные источники: список закрыт (NEWS_SOURCES), домен каждой
 *     записи обязан совпадать с реестром, иначе публикация невозможна;
 *   — никакого обхода блокировок и закрытых страниц: читаются лишь открытые
 *     RSS-каналы, которые источники сами отдают для распространения;
 *   — полные тексты не копируются: сохраняется заголовок, короткое резюме
 *     (лид из официального сообщения, обрезанный до нескольких предложений)
 *     и прямая ссылка на первоисточник; в публикации всегда стоит
 *     «Источник: …»;
 *   — дубли (одна новость в разных каналах) и устаревшие записи удаляются
 *     (см. cleanupNews в news-service.ts).
 *
 * Файл без импортов (как listing-check.ts и valuation.ts): работает и на
 * сервере, и в быстрых проверках node. Серверная обвязка — news-service.ts.
 */

// --- Темы новостей -------------------------------------------------------------------

export type NewsTopic =
  | 'mortgage'
  | 'rates'
  | 'deals'
  | 'registration'
  | 'taxes'
  | 'construction'
  | 'land'
  | 'legislation'
  | 'market'

/**
 * Темы из брифа (ипотека, ставки, сделки, регистрация прав, налоги,
 * строительство, участки, законодательство, региональный рынок) и словари
 * для автоматической классификации. Порядок важен: берётся первая совпавшая
 * тема, поэтому частные темы идут раньше общих.
 */
export const NEWS_TOPICS: { slug: NewsTopic; label: string; stems: string[] }[] = [
  {
    slug: 'mortgage',
    label: 'Ипотека',
    // «ипоте(к|чн)»: прилагательное теряет «к» — «ипотечный», «ипотечным»
    // (одна основа на «ипотека/ипотеки» и «ипотечный/ипотечным»)
    stems: ['ипоте(к|чн)', 'жилищн.{0,12}кредит', 'семейн.{0,12}ипоте(к|чн)'],
  },
  {
    slug: 'rates',
    label: 'Ставки и банковские программы',
    // «став(к|ок)»: родительный падеж множественного («процентных ставок»)
    stems: ['став(к|ок)', 'ключев', 'процентн', 'банковск', 'рефинанс', 'льготн', 'вклад', 'кредит'],
  },
  {
    slug: 'registration',
    label: 'Регистрация прав',
    stems: ['регистрац', 'егрн', 'кадастр', 'росреестр', 'выписк', 'правоустанавлива', 'госрегистрац'],
  },
  {
    slug: 'taxes',
    label: 'Налоги',
    stems: ['налог', 'ндфл', 'вычет', 'госпошлин', 'имущественн.{0,15}налог'],
  },
  {
    slug: 'land',
    label: 'Земельные участки',
    stems: ['земел', 'земл', 'участк', 'снт', 'ижс', 'садовод', 'дачн', 'соток', 'гектар'],
  },
  {
    slug: 'construction',
    label: 'Строительство и новостройки',
    stems: ['строит', 'новостройк', 'застройщик', 'проектн.{0,12}финансир', 'долев.{0,12}строит', 'апартамент', 'капремонт', 'ввод.{0,10}жил'],
  },
  {
    slug: 'deals',
    label: 'Сделки с недвижимостью',
    stems: ['сдел(к|ок)', 'купл', 'продаж', 'задат', 'эскроу', 'дду', 'долев.{0,12}участ', 'аукцион'],
  },
  {
    slug: 'legislation',
    label: 'Изменения законодательства',
    stems: ['закон', 'поправк', 'постановлен', 'указ', 'приказ', 'норматив', 'регулиро', 'вступает в силу'],
  },
  {
    slug: 'market',
    label: 'Региональные новости рынка недвижимости',
    stems: ['недвижим', 'рынок.{0,15}жил', 'аренд', 'квартир', 'жиль', 'цены на жил', 'владикавказ', 'осети', 'алани'],
  },
]

export const NEWS_TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  NEWS_TOPICS.map((t) => [t.slug, t.label]),
)

/**
 * Признак того, что новость вообще про недвижимость, жильё или жилищные
 * финансы. Без него пресс-релизы ведомств о монетах, вакансиях и совещаниях
 * не по теме попадали бы в очередь, поэтому сначала проверяем этот список,
 * и только потом определяем тему.
 *
 * Две группы: недвижимость и жильё (REALTY) и жилищные финансы (FINANCE) —
 * решение ЦБ по ключевой ставке важно для ипотеки, даже если слова «жильё»
 * в сообщении нет. Одиночные «налог» и «ставка» в список не входят: налог
 * берём только имущественный/земельный, ставку — ключевую или по кредитам.
 */
// «ипоте(к|чн)»: прилагательное теряет «к» — «ипотечным» иначе не находится,
// а это самая частая форма в сообщениях ведомств. С «сделками» наоборот:
// у ЦБ «сделки» — биржевые («сделок „валютный своп“»), поэтому в заголовочном
// фильтре остаётся узкая форма, а широкая «сдел(к|ок)» живёт только в темах
// (там она применяется уже после отбора и настоящую сделку с жильём называет).
const REALTY =
  /ипоте(к|чн)|недвижим|жилищн|жиль|квартир|застройщик|новостройк|долев|кадастр|росреестр|егрн|земл|сделк|регистрац|многоквартир|апартамент|градостроит|реновац|эскроу|дду|ижс|снт|аренд|строит|имущественн.{0,15}налог|налог.{0,15}(недвижим|земл|имуществ|вычет)/
// «Ключевая ставка» — только парой слов: одиночное «ключев» ловит «ОСАГО:
// ключевые факты» и прочие пресс-релизы, где ставки нет вовсе
const FINANCE =
  /ключев.{0,12}став(к|ок)|процентн.{0,12}став(к|ок)|став(к|ок).{0,12}(ипоте(к|чн)|кредит|вклад|банк|жилищ)|банковск.{0,15}(программ|услуг|став(к|ок))|рефинанс|льготн.{0,15}(ипоте(к|чн)|кредит)|вклад|кредитн.{0,15}(лини|программ)/
const TITLE_SIGNAL = new RegExp(`${REALTY.source}|${FINANCE.source}`)

/**
 * Однозначно «наши» слова: если они есть хоть где-то в сообщении, новость
 * берём, даже когда заголовок обезличен («Подписано постановление»).
 * Список намеренно узкий — то, что не встречается в пресс-релизах о бирже,
 * вкладах и налогах компаний.
 */
const STRONG =
  /недвижим|ипоте(к|чн)|жилищн|жиль|квартир|застройщик|новостройк|кадастр|росреестр|егрн|многоквартир|апартамент|эскроу|дду|ижс|снт|градостроит|реновац/

/**
 * Новость про недвижимость, жильё или жилищные финансы. Тему новости
 * определяет заголовок, поэтому общие слова («сделка», «ставка», «налог»,
 * «регистрация», «строительство») засчитываются только из него: ЦБ пишет
 * «сделки» про биржевые торги, «ставки» — про вклады, «налог» — про
 * налоговый мониторинг компаний, и такие пресс-релизы в очередь не нужны.
 * Однозначные слова отрасли (STRONG) принимаются в любом месте сообщения.
 */
export const isRelevantNews = (
  title: string | null | undefined,
  description?: string | null | undefined,
): boolean => {
  const head = normalizeNewsText([title])
  return TITLE_SIGNAL.test(head) || STRONG.test(normalizeNewsText([title, description]))
}

const normalizeNewsText = (parts: (string | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ').toLowerCase().replace(/ё/g, 'е')

/**
 * Тема новости по тексту (заголовок + резюме). null — новость не про
 * недвижимость либо ни одна тема не подошла: в очередь такие записи не берём.
 */
export function classifyNewsTopic(
  title: string | null | undefined,
  description?: string | null | undefined,
): NewsTopic | null {
  const text = normalizeNewsText([title, description])
  if (!text.trim() || !isRelevantNews(title, description)) return null
  for (const topic of NEWS_TOPICS) {
    for (const stem of topic.stems) {
      if (new RegExp(stem).test(text)) return topic.slug
    }
  }
  return null
}

// --- Официальные источники -------------------------------------------------------------

export interface NewsSource {
  slug: string
  /** Отображаемое название — оно же идёт в публикацию после «Источник:» */
  name: string
  kind: 'federal' | 'regional'
  /** Регион по умолчанию для новостей источника */
  region: string
  /** Домены, которым доверяем: ссылка с другого домена в блог не попадёт */
  domains: string[]
  /** Открытые RSS/Atom-каналы источника (пусто — канала нет, см. note) */
  feeds: string[]
  /** Почему канала нет / как добавлять новости источника */
  note?: string
}

/**
 * Закрытый реестр официальных источников (пункт 10 брифа). Каналы проверены
 * с сервера сайта: у части ведомств RSS недоступен или сайт не отвечает —
 * такие источники помечены note, их новости добавляются ссылкой вручную
 * (домен всё равно сверяется с реестром).
 */
export const NEWS_SOURCES: NewsSource[] = [
  {
    slug: 'cbr',
    name: 'Банк России',
    kind: 'federal',
    region: 'Россия',
    domains: ['cbr.ru'],
    feeds: ['https://www.cbr.ru/rss/RssPress', 'https://www.cbr.ru/rss/RssNews'],
  },
  {
    slug: 'government',
    name: 'Правительство России',
    kind: 'federal',
    region: 'Россия',
    domains: ['government.ru'],
    feeds: ['http://government.ru/news/rss/'],
  },
  {
    slug: 'fns15',
    name: 'ФНС России по Республике Северная Осетия — Алания',
    kind: 'regional',
    region: 'Северная Осетия — Алания',
    domains: ['nalog.gov.ru'],
    feeds: ['https://www.nalog.gov.ru/rn15/rss/'],
  },
  {
    slug: 'minstroy',
    name: 'Минстрой России',
    kind: 'federal',
    region: 'Россия',
    domains: ['minstroyrf.gov.ru'],
    feeds: [],
    note: 'RSS-канал не отдаётся (ответ 403) — новости добавляются прямой ссылкой с сайта ведомства',
  },
  {
    slug: 'domrf',
    name: 'ДОМ.РФ',
    kind: 'federal',
    region: 'Россия',
    domains: ['дом.рф', 'xn--d1aqf.xn--p1ai', 'domrf.ru'],
    feeds: [],
    note: 'RSS-канала нет, сайт просит crawl-delay 30 с — новости добавляются прямой ссылкой',
  },
  {
    slug: 'rosreestr',
    name: 'Росреестр',
    kind: 'federal',
    region: 'Россия',
    domains: ['rosreestr.gov.ru'],
    feeds: [],
    note: 'Сайт не отвечает с сервера сайта — новости добавляются прямой ссылкой (домен проверяется)',
  },
  {
    slug: 'alania',
    name: 'Правительство Республики Северная Осетия — Алания',
    kind: 'regional',
    region: 'Северная Осетия — Алания',
    domains: ['alania.gov.ru'],
    feeds: [],
    note: 'Сайт не отвечает с сервера сайта — новости добавляются прямой ссылкой (домен проверяется)',
  },
  {
    slug: 'vladikavkaz',
    name: 'Администрация города Владикавказа',
    kind: 'regional',
    region: 'Северная Осетия — Алания',
    domains: ['vladikavkaz-osetia.ru'],
    feeds: [],
    note: 'RSS-канал не найден — новости добавляются прямой ссылкой (домен проверяется)',
  },
]

/** Название региона для региональных новостей */
export const NEWS_REGION_ALANIA = 'Северная Осетия — Алания'
export const NEWS_REGION_RUSSIA = 'Россия'

export const newsSourceBySlug = (slug: string | null | undefined): NewsSource | null =>
  NEWS_SOURCES.find((s) => s.slug === slug) || null

/** Хост ссылки без www, в нижнем регистре и без punycode-варианта дом.рф */
function urlHost(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Домен принадлежит источнику (с учётом поддоменов: rn15.nalog.gov.ru и т.п.) */
export function sourceOwnsHost(source: NewsSource, host: string): boolean {
  if (!host) return false
  return source.domains.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Источник по ссылке: null — домен не входит в официальный реестр, такую
 * новость публиковать нельзя (пункт 10 брифа). Используется и при сборе,
 * и как повторная проверка перед публикацией.
 */
export function officialSourceByUrl(url: string | null | undefined): NewsSource | null {
  if (!url) return null
  const host = urlHost(url)
  if (!host) return null
  return NEWS_SOURCES.find((s) => sourceOwnsHost(s, host)) || null
}

export const isOfficialNewsUrl = (url: string | null | undefined): boolean =>
  officialSourceByUrl(url) !== null

/** Только http(s)-ссылки: остальные схемы (javascript:, data:) не принимаем */
export const isHttpUrl = (url: string | null | undefined): boolean =>
  !!url && /^https?:\/\/\S+$/i.test(url.trim())

// --- RSS/Atom ------------------------------------------------------------------------

export interface FeedItem {
  title: string
  link: string
  description: string
  publishedAt: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', times: '×',
}

/** Раскодирование HTML-сущностей (именованных и числовых) */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const key = code.toLowerCase()
    if (key.startsWith('#x')) {
      const n = parseInt(key.slice(2), 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    if (key.startsWith('#')) {
      const n = parseInt(key.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[key] ?? m
  })
}

/** HTML → плоский текст: без скриптов, стилей и тегов, с раскодированием сущностей */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return ''
  const noBlocks = input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Сноски-надстрочники («…Банка России¹») смысла в резюме не несут
    .replace(/<(sup|sub)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const noTags = noBlocks.replace(/<\/?[a-z][^>]*>/gi, ' ')
  // Сущности раскодируем дважды: в фидах ЦБ разметка экранирована (&lt;p&gt;)
  return decodeEntities(decodeEntities(noTags))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?»)])/g, '$1')
    .trim()
}

/** Внутренность тега (с учётом CDATA) */
function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = re.exec(block)
  if (!m) return ''
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

/** Ссылка элемента Atom: <link rel="alternate" href="…"/> */
function atomLink(block: string): string {
  const all = block.match(/<link\b[^>]*>/gi) || []
  let fallback = ''
  for (const tag of all) {
    const href = /href="([^"]+)"/i.exec(tag)?.[1]
    if (!href) continue
    const rel = /rel="([^"]+)"/i.exec(tag)?.[1] || 'alternate'
    if (rel === 'alternate') return decodeEntities(href)
    if (!fallback) fallback = decodeEntities(href)
  }
  return fallback
}

/** Дата из фида → ISO-строка (null — дата не распознана) */
export function parseFeedDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const ru = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s)
  if (ru) {
    const [, d, m, y, hh = '00', mm = '00'] = ru
    const iso = new Date(`${y}-${m}-${d}T${hh}:${mm}:00+03:00`)
    return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
  }
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Разбор RSS 2.0 и Atom: заголовок, ссылка, описание, дата. Полные тексты
 * (content:encoded) намеренно игнорируются — копировать статьи целиком нельзя.
 */
export function parseFeed(xml: string): FeedItem[] {
  if (!xml || typeof xml !== 'string') return []
  const blocks = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ]
  const items: FeedItem[] = []
  for (const [, block] of blocks) {
    const title = cleanNewsTitle(stripHtml(tagText(block, 'title')))
    const link = decodeEntities(tagText(block, 'link')) || atomLink(block)
    const description = stripHtml(tagText(block, 'description') || tagText(block, 'summary'))
    const publishedAt =
      parseFeedDate(tagText(block, 'pubDate')) ||
      parseFeedDate(tagText(block, 'published')) ||
      parseFeedDate(tagText(block, 'updated')) ||
      parseFeedDate(tagText(block, 'dc:date'))
    if (!title || !isHttpUrl(link)) continue
    items.push({ title, link: link.trim(), description, publishedAt })
  }
  return items
}

/** Заголовок без хвостовой даты в скобках («… (10.09.2026)» — так отдаёт ЦБ) */
export function cleanNewsTitle(title: string): string {
  return stripHtml(title)
    .replace(/\s*\(\d{2}\.\d{2}\.\d{4}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- Резюме --------------------------------------------------------------------------

/** Длина краткого содержания (символы). Больше — уже не «кратко» */
export const NEWS_SUMMARY_MAX = 320

/**
 * Короткое резюме из лида официального сообщения: берём первые предложения
 * до NEWS_SUMMARY_MAX символов, обрезаем по границе предложения или слова.
 * Полный текст не копируется — только начало сообщения с ссылкой на источник,
 * готовое резюме сотрудник подтверждает (или переписывает) в CRM.
 */
export function shortSummary(text: string | null | undefined, max = NEWS_SUMMARY_MAX): string {
  const flat = stripHtml(text)
  if (!flat) return ''
  if (flat.length <= max) return flat
  // Первые предложения целиком, начиная строго с начала текста. Обычный
  // поиск предложений (/[^.!?]+[.!?]+/) пропускает начало, если первая точка
  // стоит внутри числа — «…части 1 статьи 9.2 Федерального закона…» — и резюме
  // собиралось с середины фразы.
  const sentences: string[] = []
  let pos = 0
  while (pos < flat.length) {
    const next = /^[^.!?]+[.!?]+(?:\s|$)/.exec(flat.slice(pos))
    if (!next || !next[0].length) break
    sentences.push(next[0])
    pos += next[0].length
  }
  let out = ''
  for (const s of sentences) {
    if ((out + s).trim().length > max) break
    out += s
  }
  out = out.trim()
  if (!out) {
    // Одно длинное предложение — режем по слову
    out = flat.slice(0, max)
    const cut = out.lastIndexOf(' ')
    if (cut > max * 0.6) out = out.slice(0, cut)
  }
  return `${out.replace(/[,;:\-–—\s]+$/, '')}…`
}

// --- Ссылки, дубли и устаревание --------------------------------------------------------

const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'from', 'erid', 'yclid', 'source', 'nw']

/**
 * Ключ ссылки для дедупликации: без схемы, www, tracking-параметров, якорей
 * и хвостового слэша. http и https одного адреса считаются одной новостью.
 */
export function newsUrlKey(url: string | null | undefined): string {
  const raw = (url || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw)
    u.hash = ''
    for (const key of TRACKING_PARAMS) u.searchParams.delete(key)
    const query = u.searchParams.toString()
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${path}${query ? `?${query}` : ''}`.toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

/**
 * Ссылка для показа в публикации: официальные домены отдаём по https
 * (ФНС в фиде даёт http), сам адрес не переписываем.
 */
export function newsUrlDisplay(url: string): string {
  const trimmed = url.trim()
  const host = urlHost(trimmed)
  if (host && officialSourceByUrl(trimmed) && trimmed.startsWith('http://') && !host.endsWith('.onion')) {
    return `https://${trimmed.slice('http://'.length)}`
  }
  return trimmed
}

/** Ключ заголовка для поиска дублей: без регистра, кавычек, пунктуации и дат */
export function newsTitleKey(title: string | null | undefined): string {
  return cleanNewsTitle(title || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'“”‘’`]/g, '')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Регион новости: упоминание Осетии/Владикавказа важнее региона источника */
export function detectNewsRegion(text: string, sourceRegion: string): string {
  const t = (text || '').toLowerCase().replace(/ё/g, 'е')
  const alania = /осети|алани|владикавказ|беслан|моздок|алагир|ардон|дигор|рсо|северн(ая|ой) осет/
  if (alania.test(t)) return NEWS_REGION_ALANIA
  return sourceRegion
}

// --- Параметры расписания и хранения -----------------------------------------------------

/** Как часто читаем каналы (минуты) — таймер в src/instrumentation.ts */
export const NEWS_CHECK_INTERVAL_MINUTES = 360
/** Старше этого срока непроверенные новости удаляются как устаревшие */
export const NEWS_STALE_DAYS = 30
/** Новости старше этого срока в очередь не берём вовсе */
export const NEWS_MAX_AGE_DAYS = 45
/**
 * Предел записей, которые смотрим в канале за проход, — уже после отсева
 * старых по дате (см. collectFromFeeds). Прежние 12 записей были ошибкой:
 * канал новостей Банка России отдаёт до 100 сообщений за раз (это ~десять
 * дней), и релевантные — бюллетень по рынку ипотечного кредитования, решение
 * по ипотечным МКК — оставались за срезом, в очередь не попадало ничего.
 * Настоящий отбор задаёт окно NEWS_MAX_AGE_DAYS, а предел оставлен только
 * как защита от канала-«простыни» с сотнями записей за срок хранения.
 */
export const NEWS_ITEMS_PER_FEED = 100
/** На сколько дней откладывается публикация по кнопке «Отложить» */
export const NEWS_POSTPONE_DAYS = 7

// --- Проверки и текст публикации ---------------------------------------------------------

/** Новость в объёме, нужном для проверки (полный документ шире) */
export interface NewsLike {
  title?: string | null
  summary?: string | null
  url?: string | null
  sourceSlug?: string | null
  sourceName?: string | null
  publishedAt?: string | null
  region?: string | null
  topic?: string | null
}

/**
 * Почему новость нельзя публиковать (null — можно). Повторяет правила брифа:
 * официальный источник, заголовок, дата, ссылка и краткое содержание.
 */
export function newsPublishIssue(item: NewsLike): string | null {
  const source = officialSourceByUrl(item.url) || newsSourceBySlug(item.sourceSlug)
  if (!isOfficialNewsUrl(item.url) && !source) {
    return 'ссылка не с официального источника — публикация запрещена'
  }
  if (!isHttpUrl(item.url)) return 'нет прямой ссылки на источник'
  if (!(item.title || '').trim()) return 'нет заголовка'
  if (!(item.publishedAt || '').trim()) return 'нет даты публикации'
  if ((item.summary || '').trim().length < 20) return 'нужно краткое содержание (минимум 20 символов)'
  return null
}

/** Строка «Источник: …» — она обязана быть в каждой публикации */
export function newsSourceLine(sourceName: string, url: string): string {
  return `Источник: ${sourceName} — ${newsUrlDisplay(url)}`
}

/** Текст новости для блога (параграфы lexical JSON) */
export function newsRichText(summary: string, sourceLine: string): unknown {
  const para = (text: string) => ({
    children: [{ text, type: 'text', version: 1 }],
    type: 'paragraph',
    version: 1,
  })
  return {
    root: {
      children: [para(summary.trim()), para(sourceLine.trim())],
      type: 'root',
      version: 1,
    },
  }
}

/** Резюме для анонса в блоге (одна строка) */
export const newsExcerpt = (summary: string): string => summary.trim().replace(/\s+/g, ' ')

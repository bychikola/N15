/**
 * Поиск по сайту — чистые помощники и типы движка (серверная часть и обвязка
 * выборки лежат в src/lib/site-search-service.ts, маршрут — /api/search,
 * поле ввода — src/components/layout/SiteSearch.tsx).
 *
 * Ищем слово или часть слова без учёта регистра среди опубликованных
 * объектов, жилых комплексов, застройщиков, услуг и статей: по названиям,
 * адресам и описаниям. В поиск не попадают черновики, архивные материалы,
 * закрытые поля CRM, телефоны и имена собственников — выдача собирается только
 * из открытых полей (см. site-search-service.ts).
 *
 * Файл без побочных эффектов: работает и на сервере, и в клиентском коде.
 */

/** Вид материала в выдаче — подпись берётся из словаря (search.types) */
export type SearchResultType = 'complex' | 'developer' | 'object' | 'service' | 'article'

/** Строка выдачи: название, вид материала, короткий фрагмент и ссылка */
export interface SearchResult {
  type: SearchResultType
  title: string
  snippet: string
  href: string
}

/** Порядок, в котором материалы показываются в выдаче */
export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  'complex',
  'developer',
  'object',
  'service',
  'article',
]

/** Потолок выдачи: длинный список неудобен, остальное — уточняющим словом */
export const SEARCH_MAX_RESULTS = 30

/** Минимальная длина запроса (короче — поиск не запускаем) */
export const SEARCH_MIN_QUERY = 2

/**
 * Приведение строки к виду для сравнения: нижний регистр, «ё» → «е»,
 * схлопнутые пробелы. Регистр не учитывается, часть слова находится
 * подстрокой.
 */
export const searchNormalize = (value: string): string =>
  value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/**
 * Совпадает ли текст с запросом. Запрос уже нормализован вызывающей стороной
 * (searchNormalize) — иначе «Ёлка» не нашлась бы по «елка».
 */
export function searchMatches(text: unknown, needle: string): boolean {
  if (!needle || typeof text !== 'string' || !text) return false
  return searchNormalize(text).includes(needle)
}

/**
 * Короткий фрагмент вокруг найденного слова: вырезаем окно вокруг совпадения
 * и помечаем обрезку многоточием. Нет совпадения — начало текста.
 */
export function searchSnippet(text: string, needle: string, max = 160): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const at = searchNormalize(clean).indexOf(needle)
  if (at < 0) {
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
  }
  const start = Math.max(0, at - Math.floor((max - needle.length) / 2))
  const end = Math.min(clean.length, start + max)
  const body = clean.slice(start, end).trim()
  return `${start > 0 ? '…' : ''}${body}${end < clean.length ? '…' : ''}`
}

/**
 * Первый подходящий фрагмент из списка полей: берём поле, где нашлось
 * совпадение, иначе — запасной текст. Так фрагмент показывает то место, по
 * которому материал нашёлся.
 */
export function bestSearchSnippet(fields: string[], needle: string, fallback = ''): string {
  const hit = fields.find((field) => searchMatches(field, needle))
  return searchSnippet(hit || fallback || fields.find(Boolean) || '', needle)
}

/**
 * Плоский текст из Rich Text (Lexical): обходим узлы и собираем текстовые
 * фрагменты. Нужен, чтобы искать по описаниям объектов и статей, которые
 * хранятся как Rich Text, а не строкой. Строка принимается как есть.
 */
export function richTextToPlain(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const obj = node as Record<string, unknown>
    if (obj.type === 'text' && typeof obj.text === 'string') {
      out.push(obj.text)
      return
    }
    if (Array.isArray(obj.children)) (obj.children as unknown[]).forEach(walk)
  }
  walk(value)
  return out.join(' ')
}

/**
 * Услуги — не коллекция, а страницы сайта, поэтому их список для поиска
 * задаётся здесь: подпись берётся из словаря (как в меню), `keywords` —
 * слова-синонимы, по которым услугу тоже находят («ипотека» → страница
 * ипотеки, хотя её заголовок может быть другим).
 */
export interface ServiceSearchEntry {
  title: string
  href: string
  keywords: string
}

/** Разделы услуг и кредитные страницы — то, что посетитель ищет по словам */
export function serviceSearchEntries(t: import('@/i18n/dictionaries').Dict, lang: string): ServiceSearchEntry[] {
  const s = t.services
  const nav = t.nav
  const p = (path: string): string => `/${lang}${path}`
  return [
    { title: s.buyers.title, href: p('/services/buyers'), keywords: 'покупателям подбор проверка приемка ипотека' },
    { title: s.owners.title, href: p('/services/owners'), keywords: 'владельцам продажа оценка продвижение сделка' },
    { title: s.tenants.title, href: p('/services/tenants'), keywords: 'арендаторам аренда договор передача' },
    { title: s.mortgage.title, href: p('/services/mortgage'), keywords: 'ипотека кредит банк заявка документы расчет' },
    { title: s.broker.title, href: p('/services/broker'), keywords: 'брокер кредит ипотека сопровождение' },
    { title: s.legal.title, href: p('/services/legal'), keywords: 'юридические услуги проверка объекта перепланировка приватизация наследство риски' },
    { title: s.design.title, href: p('/services/design'), keywords: 'дизайн интерьер проект планировка визуализация комплектация надзор' },
    { title: s.build.title, href: p('/services/build'), keywords: 'строительство дом подряд проектирование смета отделка коммуникации' },
    { title: s.valuation.title, href: p('/services/valuation'), keywords: 'оценка недвижимости квартира дом участок коммерческая' },
    { title: nav.mortgage, href: p('/mortgage'), keywords: 'ипотека кредит выгодные условия' },
    { title: nav.installment, href: p('/installment'), keywords: 'рассрочка платежи' },
    { title: nav.sell, href: p('/sell'), keywords: 'продажа продать квартиру дом' },
    { title: nav.buy, href: p('/catalog?type=sale'), keywords: 'покупка купить квартиру дом' },
    { title: nav.rent, href: p('/catalog?type=rent'), keywords: 'аренда снять квартиру дом' },
    { title: s.viewAll, href: p('/services'), keywords: 'все услуги услуги направления' },
  ]
}

/**
 * Поиск по сайту — серверная выборка (маршрут /api/search, движок и типы —
 * src/lib/site-search.ts).
 *
 * Только открытые материалы: опубликованные объекты (status = published),
 * жилые комплексы опубликованного застройщика, компании с включённым
 * «Показывать на сайте», статьи с датой публикации в прошлом и страницы услуг.
 * Черновики, архив, черновики статей, заявки и закрытые поля CRM (телефоны и
 * имена собственников, точный номер дома) в выдачу не попадают: у объекта
 * адрес собирается публичной функцией publicAddressText — без дома и корпуса.
 * Справочники developers/complexes закрыты на чтение для гостя, поэтому
 * выборку собирает сервер с overrideAccess, а в ответ уходят только открытые
 * поля.
 */
import type { Payload } from 'payload'
import type { Dict } from '@/i18n/dictionaries'
import { publicAddressOf, publicAddressText } from './object-public-address'
import {
  bestSearchSnippet,
  richTextToPlain,
  searchMatches,
  searchNormalize,
  searchSnippet,
  serviceSearchEntries,
  SEARCH_MAX_RESULTS,
  SEARCH_MIN_QUERY,
  SEARCH_TYPE_ORDER,
  type SearchResult,
} from './site-search'

/** Потолки выборки: сайт небольшой, читаем страницы целиком и фильтруем в памяти */
const LIMIT_OBJECTS = 500
const LIMIT_COMPLEXES = 500
const LIMIT_DEVELOPERS = 200
const LIMIT_BLOG = 200

/** Связь при depth 1 — документ; иначе null */
const rel = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Опубликован ли застройщик: «Показывать на сайте» и не архив */
const developerPublished = (dev: Record<string, unknown> | null): boolean =>
  !!dev && dev.showOnSite === true && dev.status !== 'archived'

/**
 * Полная выдача поиска: собираем совпадения по всем материалам, убираем
 * лишнее, сортируем по виду (ЖК, застройщик, объект, услуга, статья) и
 * ограничиваем длину списка.
 */
export async function searchSite(
  payload: Payload,
  query: string,
  lang: string,
  t: Dict,
): Promise<SearchResult[]> {
  const needle = searchNormalize(query)
  if (needle.length < SEARCH_MIN_QUERY) return []

  const results: SearchResult[] = []

  // --- Жилые комплексы: показываются только у опубликованного застройщика ---
  const { docs: complexDocs } = await payload.find({
    collection: 'complexes',
    limit: LIMIT_COMPLEXES,
    depth: 1,
    overrideAccess: true,
  })
  for (const raw of complexDocs as unknown as Record<string, unknown>[]) {
    const developer = rel(raw.developer)
    if (!developerPublished(developer)) continue
    const name = text(raw.name)
    if (!name) continue
    const place = [text(raw.locality), text(raw.street)].filter(Boolean).join(', ')
    const description = text(raw.description)
    const planning = text(raw.planningText)
    const fields = [name, place, description, planning]
    if (!fields.some((field) => searchMatches(field, needle))) continue
    results.push({
      type: 'complex',
      title: name,
      snippet: bestSearchSnippet([description, planning, place], needle),
      href: `/${lang}/newbuildings/complexes/${Number(raw.id)}`,
    })
  }

  // --- Застройщики: только опубликованные компании ---
  const { docs: developerDocs } = await payload.find({
    collection: 'developers',
    where: {
      and: [{ showOnSite: { equals: true } }, { status: { not_equals: 'archived' } }],
    },
    limit: LIMIT_DEVELOPERS,
    depth: 0,
    overrideAccess: true,
  })
  for (const raw of developerDocs as unknown as Record<string, unknown>[]) {
    const name = text(raw.name)
    if (!name) continue
    const description = text(raw.description)
    if (![name, description].some((field) => searchMatches(field, needle))) continue
    results.push({
      type: 'developer',
      title: name,
      snippet: bestSearchSnippet([description], needle),
      href: `/${lang}/newbuildings/developers/${Number(raw.id)}`,
    })
  }

  // --- Объекты: опубликованные карточки. Ищем по названию, публичному адресу,
  // описанию и по названию ЖК/застройщика — так «Суворовский» находит квартиры
  // этого ЖК, даже если в самой карточке его название не написано ---
  const { docs: objectDocs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'published' } },
    limit: LIMIT_OBJECTS,
    depth: 1,
    overrideAccess: true,
  })
  for (const raw of objectDocs as unknown as Record<string, unknown>[]) {
    const title = text(raw.title)
    const place = publicAddressText(publicAddressOf(raw.address))
    const description = richTextToPlain(raw.description)
    const complexName = text(rel(raw.complex)?.name)
    const developerName = text(rel(raw.developer)?.name)
    // «ЖК» приписываем, только если название комплекса его ещё не содержит,
    // иначе во фрагменте выходило «ЖК ЖК «Суворовский»»
    const complexLabel =
      complexName && !/(^|\s)жк(\s|$)/i.test(complexName) ? `ЖК ${complexName}` : complexName
    const linked = [complexLabel, developerName].filter(Boolean)
    const fields = [title, place, description, ...linked]
    if (!fields.some((field) => searchMatches(field, needle))) continue
    const slug = text(raw.slug)
    results.push({
      type: 'object',
      title: title || t.siteSearch.types.object,
      // Запасной фрагмент — публичный адрес: объект нашёлся по названию ЖК,
      // и адрес полезнее, чем повтор названия
      snippet: bestSearchSnippet([place, description, ...linked], needle, place),
      href: slug ? `/${lang}/catalog/${slug}` : `/${lang}/catalog`,
    })
  }

  // --- Статьи блога: опубликованные (дата публикации уже наступила) ---
  const now = Date.now()
  const { docs: blogDocs } = await payload.find({
    collection: 'blog',
    limit: LIMIT_BLOG,
    depth: 0,
    overrideAccess: true,
  })
  for (const raw of blogDocs as unknown as Record<string, unknown>[]) {
    const publishedAt = text(raw.publishedAt)
    // Черновик (без даты) и отложенная публикация на сайте не видны
    if (!publishedAt || Date.parse(publishedAt) > now) continue
    const title = text(raw.title)
    if (!title) continue
    const excerpt = text(raw.excerpt)
    const category = text(raw.category)
    const body = richTextToPlain(raw.content)
    const tags = (Array.isArray(raw.tags) ? raw.tags : [])
      .map((item) => text((item as Record<string, unknown>)?.tag))
      .filter(Boolean)
      .join(' ')
    const fields = [title, excerpt, category, tags, body]
    if (!fields.some((field) => searchMatches(field, needle))) continue
    results.push({
      type: 'article',
      title,
      snippet: bestSearchSnippet([excerpt, body], needle),
      href: `/${lang}/blog/${Number(raw.id)}`,
    })
  }

  // --- Услуги: страницы услуг и кредитные разделы (см. serviceSearchEntries) ---
  for (const entry of serviceSearchEntries(t, lang)) {
    if (!searchMatches(`${entry.title} ${entry.keywords}`, needle)) continue
    results.push({
      type: 'service',
      title: entry.title,
      snippet: searchSnippet(entry.keywords, needle, 120),
      href: entry.href,
    })
  }

  const rank = (type: SearchResult['type']): number => {
    const index = SEARCH_TYPE_ORDER.indexOf(type)
    return index < 0 ? SEARCH_TYPE_ORDER.length : index
  }
  return results
    .sort((a, b) => rank(a.type) - rank(b.type) || a.title.localeCompare(b.title, 'ru'))
    .slice(0, SEARCH_MAX_RESULTS)
}

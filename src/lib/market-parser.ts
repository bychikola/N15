/**
 * «Парсер рынка» — движок учёта и анализа чужих объявлений (мониторинг
 * рынка). Модуль намеренно отделён от автоматической публикации наших
 * объектов (см. publishing.ts): парсер ничего не выгружает наружу.
 *
 * Объявления попадают в базу только разрешёнными путями — ручной ссылкой
 * агента или официальным каналом площадки (API/фид по договору). Автосбор
 * страниц Авито/ЦИАН/Домклик/Яндекс запрещён правилами площадок, поэтому
 * здесь его нет (та же позиция, что в listing-check.ts). Автоматика — только
 * детерминированный анализ уже сохранённых данных: определение площадки по
 * ссылке, похожесть на объекты Н15 и на другие записи (дубли), маркеры
 * автора, история цены.
 *
 * Файл зависит только от чистого listing-check.ts — работает на сервере
 * и в быстрых проверках node.
 */
import { addressFullKey, listingMatch, platformByUrl, type ListingLike, type ObjectLike } from './listing-check'

// --- Площадки объявлений рынка -----------------------------------------------------

/** Площадки, которые умеем распознавать по ссылке (сверх справочника listing-check) */
const EXTRA_PLATFORM_DOMAINS: { slug: string; domains: string[] }[] = [
  { slug: 'vk', domains: ['vk.com', 'm.vk.com', 'vk.me'] },
  { slug: 'telegram', domains: ['t.me', 'telegram.me'] },
  { slug: 'instagram', domains: ['instagram.com', 'www.instagram.com'] },
  { slug: 'ok', domains: ['ok.ru'] },
]

/** Названия площадок для карточек (slug из listing-check + свои) */
export const MARKET_PLATFORM_NAMES: Record<string, string> = {
  avito: 'Авито',
  cian: 'ЦИАН',
  domclick: 'Домклик',
  yandex: 'Яндекс Недвижимость',
  vk: 'VK',
  telegram: 'Telegram',
  instagram: 'Instagram',
  ok: 'Одноклассники',
  other: 'Другая площадка',
  site: 'Сайт Н15',
}

/** Определение площадки по ссылке: справочник listing-check + VK/Telegram/… */
export function marketPlatformByUrl(url: string): string {
  const known = platformByUrl(url)
  if (known) return known.slug
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const extra of EXTRA_PLATFORM_DOMAINS) {
      if (extra.domains.some((d) => host === d || host.endsWith(`.${d}`))) return extra.slug
    }
  } catch {
    // не URL — площадка неизвестна
  }
  return 'other'
}

/**
 * Нормализация ссылки для дедупликации: убираем tracking-параметры (utm,
 * from, erid), якоря и хвостовой слэш; мобильные поддомены — к основным.
 */
export function normalizeListingUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'from' || key === 'erid' || key === 'yclid' || key === 'source') {
        u.searchParams.delete(key)
      }
    }
    let host = u.hostname.toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    if (host.startsWith('m.')) host = host.slice(2)
    u.hostname = host
    const out = u.toString().replace(/\/+$/, '')
    return out
  } catch {
    return url.trim()
  }
}

// --- Автор объявления ---------------------------------------------------------------

/**
 * Определение автора — собственник или агент — только по достоверным
 * маркерам в тексте объявления (обычно в заголовке: «продаю сам»,
 * «агентство …», «ИП»). Если маркеров нет или они противоречат друг другу —
 * null («не видно»), чтобы не гадать.
 */
export function estimateAuthorKind(text?: string | null): 'owner' | 'agent' | null {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return null
  // «Достоверные» слова, за которыми обычно стоит тип автора. Сначала агент
  // (объявление от агентства), затем собственник («без посредников» и пр.)
  const agentLike =
    /\b(агентств|агент|риэлт|риелт|брокер)\b|ип\s|салон недвижимости|компания н15|\bн15\b|кабинет агентств/.test(t)
  const ownerLike = /собственник|хозяин|владелец|без посредников|продаю сам|сдаю сам|прямо от хозяина|от собственника/.test(t)
  if (agentLike && !ownerLike) return 'agent'
  if (ownerLike && !agentLike) return 'owner'
  return null
}

// --- Похожесть и дубли ---------------------------------------------------------------

/** Адрес объявления как ключ для поиска дублей в базе рынка */
export const listingAddressKey = (address?: string | null): string =>
  (address || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Сравнение объявления с объектом Н15: возвращает степень совпадения
 * и совпавшие признаки (обёртка над listingMatch из listing-check).
 * Адрес объявления — строкой: сравнение по пересечению слов; у объектов
 * Н15 адрес структурирован — listingMatch это умеет (см. listing-check).
 */
export function marketListingMatch(
  listing: { address?: string | null; price?: number | null; area?: number | null; rooms?: number | null; photoUrls?: string[] | null },
  object: ObjectLike,
): { match: number; matched: string[]; verdict: 'none' | 'weak' | 'strong' } {
  const addr = listing.address
  const listingLike: ListingLike = {
    address: addr ? String(addr) : null,
    price: typeof listing.price === 'number' && listing.price > 0 ? listing.price : null,
    area: typeof listing.area === 'number' && listing.area > 0 ? listing.area : null,
    rooms: typeof listing.rooms === 'number' && listing.rooms > 0 ? listing.rooms : null,
    photos: listing.photoUrls || [],
  }
  return listingMatch(object, listingLike)
}

/** Проверка «не дубль ли это уже имеющейся записи» — по нормализованной ссылке */
export const sameListingUrl = (a: string, b: string): boolean => normalizeListingUrl(a) === normalizeListingUrl(b)

/**
 * Возможный дубль по содержанию (адрес+цена/площадь): для предупреждения,
 * когда одно и то же объявление добавили разными ссылками (разные площадки).
 */
export function contentDupeScore(
  a: { address?: string | null; price?: number | null; area?: number | null },
  b: { address?: string | null; price?: number | null; area?: number | null },
): number {
  const aAddr = listingAddressKey(a.address)
  const bAddr = listingAddressKey(b.address)
  if (!aAddr || !bAddr) return 0
  // Точный адрес (с квартирой/участком) — «жёсткий» признак: цена нужна с допуском
  const addrSame = aAddr === bAddr
  const priceDiff = a.price && b.price ? Math.abs(a.price - b.price) / Math.max(a.price, b.price) : null
  const priceOk = priceDiff === null || priceDiff <= 0.05
  const areaOk = !a.area || !b.area || Math.abs(a.area - b.area) / Math.max(a.area, b.area) <= 0.04
  if (addrSame && priceOk && areaOk) return 100
  if (!addrSame) return 0
  return 0
}

// --- История цены ---------------------------------------------------------------------

export interface PriceChange {
  at: string
  price: number
}

/**
 * Добавление наблюдения цены в историю: цена не изменилась — история не
 * растёт; изменилась — дописываем запись (и возвращаем её для журнала).
 */
export function applyPriceObservation(
  history: PriceChange[],
  currentPrice: number | null | undefined,
  newPrice: number | null | undefined,
  at = new Date().toISOString(),
): { history: PriceChange[]; changed: boolean; was: number | null } {
  const h = Array.isArray(history) ? history : []
  if (typeof newPrice !== 'number' || !Number.isFinite(newPrice) || newPrice <= 0) {
    return { history: h, changed: false, was: currentPrice ?? null }
  }
  const was = typeof currentPrice === 'number' && Number.isFinite(currentPrice) ? currentPrice : null
  if (was === newPrice) return { history: h, changed: false, was }
  return { history: [...h, { at, price: newPrice }].slice(-50), changed: true, was }
}

// Переэкспорт адресного ключа — для сверки адресов объектов в отчётах
export { addressFullKey }

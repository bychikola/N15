/**
 * Серверная обвязка модуля «Где размещён объект» (см. listing-check.ts).
 *
 * Прогон проверки объекта: читает текущую группу placements (привязанные
 * объявления площадок), обновляет статусы по возрасту ручных ссылок и при
 * настроенных официальных каналах площадок — сверяет их по пересечению
 * признаков (listingMatch). Группу пишет целиком: Payload при обновлении
 * group заменяет её содержимое, поэтому сервис всегда собирает полный объект
 * группы перед payload.update (как recalcValuationHook в Objects.ts).
 *
 * Автоматического поиска по чужим объявлениям здесь нет намеренно: Авито,
 * ЦИАН, Домклик и Яндекс Недвижимость запрещают автосбор и не дают открытого
 * поиска. Официальный канал (API/фид по договору) подключается в
 * fetchOfficialListings — при появлении ключей в окружении (см. PLATFORM_SPECS).
 */
import type { Payload } from 'payload'
import {
  CHECK_INTERVAL_HOURS,
  MANUAL_STALE_DAYS,
  PLATFORM_SPECS,
  daysSince,
  listingMatch,
  nextCheckAfter,
  platformHasApi,
  type ListingLike,
  type ObjectLike,
  type PlacementSource,
  type PlacementStatus,
} from './listing-check'

export interface PlacementItem {
  /** slug площадки (avito/cian/domclick/yandex…) */
  platform?: string
  /** Прямая ссылка на объявление */
  url?: string
  /** Название объявления на площадке (если известно) */
  title?: string
  /** Откуда запись: ручная ссылка агента или автосверка по каналу */
  source?: PlacementSource
  /** Активно / снято / требует проверки */
  status?: PlacementStatus
  /** Степень совпадения с объектом Н15, % (null — не вычислялась) */
  match?: number | null
  /** Какие признаки совпали (address, price, …) */
  matchParams?: string[]
  /** Текущая цена в объявлении, ₽ */
  price?: number | null
  /** Цена при первом обнаружении, ₽ (для «изменения цены») */
  priceInitial?: number | null
  firstSeenAt?: string | null
  /** Когда объявление в последний раз реально проверено (каналом или агентом) */
  lastCheckedAt?: string | null
  /** Служебная пометка */
  note?: string
  /** id массива Payload (для точечных правок через REST) */
  id?: number | string
}

export interface PlacementsGroup {
  lastCheckedAt?: string | null
  nextCheckAt?: string | null
  /** Почему автоматическая сверка не выполнялась (для подсказки в UI) */
  note?: string | null
  items?: PlacementItem[] | null
}

const iso = (ms: number): string => new Date(ms).toISOString()

const asGroup = (p: unknown): PlacementsGroup =>
  p && typeof p === 'object' ? (p as PlacementsGroup) : {}

const asItems = (p: unknown): PlacementItem[] => {
  const items = asGroup(p).items
  return Array.isArray(items) ? (items as PlacementItem[]) : []
}

const asObjectLike = (doc: Record<string, unknown>): ObjectLike => ({
  address: (doc.address as ObjectLike['address']) || null,
  cadastralNumber: (doc.cadastralNumber as string) || null,
  price: typeof doc.price === 'number' ? doc.price : null,
  area: typeof doc.area === 'number' ? doc.area : null,
  rooms: typeof doc.rooms === 'number' ? doc.rooms : null,
  floor: typeof doc.floor === 'number' ? doc.floor : null,
  totalFloors: typeof doc.totalFloors === 'number' ? doc.totalFloors : null,
  description: '',
})

/**
 * Официальный канал площадки: при подключённом API/фиде (ключи в env)
 * возвращает список объявлений как ListingLike[]; без канала — null.
 * Реализация зависит от договора с площадкой и появляется здесь, когда
 * доступ получен (формат ответа у площадок разный, маппинг — в этом switch).
 */
async function fetchOfficialListings(): Promise<{ listings: ListingLike[]; error?: string }> {
  return { listings: [], error: 'Официальный канал не подключён (см. переменные окружения площадки)' }
}

/** Прогон сверки одной записи: статус и пометка по возрасту проверки */
function refreshItem(it: PlacementItem, now: number): PlacementItem {
  const item: PlacementItem = { ...it }
  const source = item.source || 'manual'
  const last = item.lastCheckedAt
  const age = daysSince(last, now)

  if (source === 'auto') {
    // Автозапись сверяется только официальным каналом. Канала нет — наружу
    // ничего не обещаем: устаревшая запись уходит в «требует проверки».
    if (last && age !== null && age >= MANUAL_STALE_DAYS) {
      item.status = 'needsCheck'
      item.note = 'Автоматическая сверка недоступна — подтвердите статус вручную'
    }
    return item
  }

  // Ручная ссылка: «свежая» (агент подтверждал недавно) — статус не трогаем;
  // устаревшая (не проверялась 7+ дней) — «требует проверки»
  if (last && age !== null && age >= MANUAL_STALE_DAYS) {
    item.status = 'needsCheck'
    item.note = `Не проверялось ${age} дн. — откройте объявление и подтвердите статус`
  }
  return item
}

export interface CheckResult {
  objectId: number | string
  placements: PlacementsGroup
  /** Сколько площадок сейчас в статусе «активно» (для сводки в CRM) */
  activePlatforms: number
  itemsTotal: number
}

/**
 * Полный прогон проверки объекта. Читает doc (полный документ из БД),
 * возвращает новую группу placements — вызывающий маршрут сохраняет её.
 */
export async function checkObjectPlacements(
  doc: Record<string, unknown>,
): Promise<CheckResult> {
  const now = Date.now()
  const prevItems = asItems(doc.placements)

  const items: PlacementItem[] = []
  const seenUrls = new Set<string>()
  for (const raw of prevItems) {
    if (!raw || !raw.platform) continue
    const url = (raw.url || '').trim()
    if (url && seenUrls.has(url)) continue // защита от дублей ссылок
    if (url) seenUrls.add(url)
    items.push(refreshItem(raw, now))
  }

  // Официальные каналы площадок: настроен канал — ищем похожие объявления
  // по пересечению признаков и привязываем к карточке (без дублей: запись
  // обновляется, если совпала ссылка или площадка со «сильным» совпадением).
  const objectLike = asObjectLike(doc)
  for (const spec of PLATFORM_SPECS) {
    if (!platformHasApi(spec)) continue
    const res = await fetchOfficialListings()
    const listed = res.listings || []
    for (const listing of listed) {
      const lUrl = ((listing as unknown as { url?: string }).url || '').trim()
      const exists = items.find((it) => it.platform === spec.slug && it.url && lUrl && it.url === lUrl)
      if (exists) {
        exists.status = 'active'
        exists.lastCheckedAt = iso(now)
        if (typeof listing.price === 'number') exists.price = listing.price
        if (exists.match == null) {
          const m = listingMatch(objectLike, listing)
          exists.match = m.match
          exists.matchParams = m.matched
        }
        continue
      }
      const m = listingMatch(objectLike, listing)
      if (m.match >= 45) {
        items.push({
          platform: spec.slug,
          url: lUrl || undefined,
          title: (listing as unknown as { title?: string }).title,
          source: 'auto',
          status: 'active',
          match: m.match,
          matchParams: m.matched,
          price: typeof listing.price === 'number' ? listing.price : null,
          priceInitial: typeof listing.price === 'number' ? listing.price : null,
          firstSeenAt: iso(now),
          lastCheckedAt: iso(now),
          note: m.verdict === 'strong' ? 'Найдено по пересечению признаков' : 'Совпадение частичное — проверьте вручную',
        })
      }
    }
  }

  const group: PlacementsGroup = {
    lastCheckedAt: iso(now),
    nextCheckAt: nextCheckAfter(now, CHECK_INTERVAL_HOURS),
    items,
  }
  // Каналов нет — помечаем, почему блок «не находит» объявления сам
  const anyApi = PLATFORM_SPECS.some(platformHasApi)
  if (!anyApi) {
    group.note =
      'Площадки не дают открытого доступа к объявлениям (автосбор запрещён их правилами). ' +
      'Привяжите объявление вручную ссылкой или подключите официальный канал площадки — и кнопка «Проверить сейчас» будет сверять его автоматически.'
  }

  const activeSet = new Set(items.filter((it) => it.status === 'active').map((it) => it.platform))
  return { objectId: doc.id as number | string, placements: group, activePlatforms: activeSet.size, itemsTotal: items.length }
}

/**
 * Фоновый проход: объекты, которым пора на проверку (nextCheckAt наступил или
 * проверки ещё не было), по очереди — не более limit за один проход. Перед
 * прогоном объект «бронируется» (nextCheckAt сдвигается вперёд), чтобы два
 * таймера не обработали его дважды.
 */
export async function runPlacementsSweep(
  payload: Payload,
  limit = 5,
): Promise<{ checked: number; skipped: number }> {
  const now = Date.now()
  const { docs, totalDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { status: { not_equals: 'archived' } },
        {
          or: [
            { 'placements.nextCheckAt': { less_than: iso(now) } },
            { placements: { exists: false } },
            { 'placements.lastCheckedAt': { exists: false } },
          ],
        },
      ],
    },
    sort: 'createdAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })
  if (!totalDocs) return { checked: 0, skipped: 0 }

  let checked = 0
  let skipped = 0
  for (const d of docs) {
    const doc = d as unknown as Record<string, unknown>
    const id = doc.id as number
    // Бронирование: отодвигаем следующий прогон, пока обрабатываем
    const reserve = asGroup(doc.placements)
    await payload.update({
      collection: 'objects',
      id,
      data: {
        placements: {
          ...reserve,
          nextCheckAt: iso(now + 30 * 60_000),
        },
      },
      depth: 0,
      overrideAccess: true,
    })
    try {
      const result = await checkObjectPlacements(doc)
      await payload.update({
        collection: 'objects',
        id,
        data: { placements: result.placements },
        depth: 0,
        overrideAccess: true,
      })
      checked++
    } catch (e) {
      console.error(`Placements sweep error for object ${id}:`, e)
      skipped++
    }
  }
  return { checked, skipped }
}

/** Одна проверка по кнопке «Проверить сейчас» (объект уже открыт в CRM) */
export async function checkOneObject(payload: Payload, id: number): Promise<CheckResult | null> {
  const d = await payload.findByID({
    collection: 'objects',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!d) return null
  const doc = d as unknown as Record<string, unknown>
  const result = await checkObjectPlacements(doc)
  await payload.update({
    collection: 'objects',
    id,
    data: { placements: result.placements },
    depth: 0,
    overrideAccess: true,
  })
  return result
}

/** Хук Objects.ts: при создании объекта планируем первую проверку площадок */
export function initPlacementsOnCreate(data: Record<string, unknown>): Record<string, unknown> {
  const now = Date.now()
  const current = asGroup(data.placements)
  data.placements = {
    ...current,
    nextCheckAt: nextCheckAfter(now + 60_000), // первая проверка — почти сразу
    lastCheckedAt: current.lastCheckedAt || null,
  }
  return data
}

/** Статусы и текст для сводки в карточке CRM (чтобы не дублировать логику в UI) */
export function placementsSummary(group: PlacementsGroup | null | undefined): {
  found: boolean
  checked: boolean
  activePlatforms: number
  itemsTotal: number
  lastCheckedAt: string | null
} {
  const g = group || {}
  const items = Array.isArray(g.items) ? g.items : []
  const active = new Set(items.filter((it) => it.status === 'active').map((it) => it.platform))
  return {
    found: active.size > 0,
    checked: !!g.lastCheckedAt,
    activePlatforms: active.size,
    itemsTotal: items.length,
    lastCheckedAt: g.lastCheckedAt || null,
  }
}

/** Обновление ручной записи (статус/цена/подтверждение) — без полного прогона */
export function touchManualItem(
  group: PlacementsGroup | null | undefined,
  itemId: number | string | null,
  patch: { status?: PlacementStatus; price?: number | null; confirm?: boolean },
): PlacementsGroup {
  const now = Date.now()
  const g: PlacementsGroup = { ...(group || {}) }
  const items = Array.isArray(g.items) ? [...g.items] : []
  const target = itemId != null ? items.find((it) => String(it.id) === String(itemId)) : undefined
  if (target) {
    if (patch.status) target.status = patch.status
    if (patch.price !== undefined) {
      if (target.priceInitial == null && typeof patch.price === 'number') target.priceInitial = patch.price
      target.price = patch.price
    }
    if (patch.confirm) {
      // Агент подтвердил объявление вручную — обновляем дату проверки
      target.status = patch.status || 'active'
      target.lastCheckedAt = iso(now)
      target.note = undefined
    }
  }
  g.items = items
  return g
}

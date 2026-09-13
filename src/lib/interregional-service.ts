/**
 * Данные раздела «Межрегиональная недвижимость» из CRM.
 *
 * Источник истины — коллекции regions и settlements (см.
 * src/payload/collections): сотрудник правит справочник в CRM, сайт читает
 * его здесь. Список из кода (SEED_REGIONS в src/lib/interregional.ts) только
 * заполняет пустые коллекции при старте — дальше он не участвует.
 *
 * Объекты населённого пункта подбираются по его фильтру: город в адресах
 * (address.city), категория (по умолчанию «квартира») и тип сделки
 * (по умолчанию «продажа»). Сравнение городов терпимое — регистр, лишние
 * пробелы и «ё» не мешают (cityKey), потому что адреса объектов агенты
 * вводят руками. Счётчики в списке регионов и выдача страницы населённого
 * пункта считаются по одному индексу опубликованных объектов, поэтому
 * «объектов 3» и три карточки на странице всегда совпадают.
 */
import type { Payload } from 'payload'
import {
  SEED_REGIONS,
  SETTLEMENT_DEFAULT_CATEGORY,
  SETTLEMENT_DEFAULT_DEAL_TYPE,
  cityKey,
  type InterregionalOtherCity,
  type InterregionalRegion,
  type InterregionalSettlement,
} from './interregional'
import { translitSlug } from './slug'

/** Сколько объектов показываем на странице населённого пункта (остальные — в каталоге) */
export const SETTLEMENT_OBJECTS_LIMIT = 24

/** Строка индекса опубликованных объектов: минимум полей для подбора по фильтру */
interface PublishedObjectRow {
  id: number
  city: string
  category: string
  type: string
}

export interface InterregionalDirectory {
  regions: InterregionalRegion[]
  /** Города с объектами, которых нет в справочнике CRM */
  otherCities: InterregionalOtherCity[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Индекс опубликованных объектов по городам — один запрос на страницу.
 * Полей немного (адрес, категория, сделка), поэтому выгружаем весь список
 * опубликованных: объекты каталога Н15 в базу пишутся по одному, и на таких
 * объёмах это дешевле, чем запрос на каждый населённый пункт.
 */
async function publishedObjectRows(payload: Payload): Promise<PublishedObjectRow[]> {
  const { docs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'published' } },
    select: { address: { city: true }, category: true, type: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as { id: number; address?: { city?: string }; category?: string; type?: string }[]).map(
    (doc) => ({
      id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
      city: str(doc.address?.city),
      category: str(doc.category),
      type: str(doc.type),
    }),
  )
}

/** Подходит ли объект фильтру населённого пункта (город, категория, тип сделки) */
function matchesSettlement(
  row: PublishedObjectRow,
  filter: { city: string; category: string; dealType: string },
): boolean {
  if (cityKey(row.city) !== cityKey(filter.city)) return false
  if (filter.category && row.category !== filter.category) return false
  if (filter.dealType && filter.dealType !== 'any' && row.type !== filter.dealType) return false
  return true
}

/** Условие фильтра населённого пункта — так же понимает его каталог (/catalog) */
export function settlementFilter(s: Pick<InterregionalSettlement, 'city' | 'category' | 'dealType'>): {
  city: string
  category: string
  dealType: string
} {
  return {
    city: s.city,
    category: s.category || SETTLEMENT_DEFAULT_CATEGORY,
    dealType: s.dealType || SETTLEMENT_DEFAULT_DEAL_TYPE,
  }
}

/**
 * Заполнение справочника из кода. Вызывается при старте (onInit в
 * payload.config): если в коллекции regions уже есть записи, справочник
 * считается заполненным и трогать его нельзя — данные CRM важнее сида.
 * Повторный запуск на пустой или частично заполненной базе безопасен.
 */
export async function seedInterregional(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({ collection: 'regions', overrideAccess: true })
  if (totalDocs > 0) return 0

  let created = 0
  for (const [index, region] of SEED_REGIONS.entries()) {
    const doc = await payload.create({
      collection: 'regions',
      data: { title: region.title, slug: translitSlug(region.title), order: index + 1 },
      overrideAccess: true,
    })
    created += 1
    let order = 0
    for (const group of region.groups) {
      const places = [
        ...group.cities.map((name) => ({ name, alwaysVisible: true })),
        ...(group.extra ?? []).map((name) => ({ name, alwaysVisible: false })),
      ]
      for (const place of places) {
        await payload.create({
          collection: 'settlements',
          data: {
            name: place.name,
            region: doc.id,
            group: group.label ?? null,
            city: place.name,
            category: SETTLEMENT_DEFAULT_CATEGORY,
            dealType: SETTLEMENT_DEFAULT_DEAL_TYPE,
            alwaysVisible: place.alwaysVisible,
            order,
          },
          overrideAccess: true,
        })
        order += 1
        created += 1
      }
    }
  }
  return created
}

/** Записи справочника как есть (включая скрытые населённые пункты) */
interface RawSettlement {
  id: number
  name: string
  slug: string
  city: string
  group: string
  category: string
  dealType: string
  alwaysVisible: boolean
  order: number
  regionId: number
}

async function directoryRows(payload: Payload): Promise<{
  regions: { id: number; title: string; slug: string; order: number }[]
  settlements: RawSettlement[]
}> {
  const [regions, settlements] = await Promise.all([
    payload.find({
      collection: 'regions',
      sort: 'order',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'settlements',
      sort: 'order',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const regionRows = (regions.docs as unknown as Record<string, unknown>[]).map((doc) => ({
    id: Number(doc.id),
    title: str(doc.title),
    slug: str(doc.slug),
    order: typeof doc.order === 'number' ? doc.order : 0,
  }))
  const settlementRows = (settlements.docs as unknown as Record<string, unknown>[]).map((doc) => {
    const region = doc.region
    const regionId = typeof region === 'object' && region !== null
      ? Number((region as { id?: unknown }).id)
      : Number(region)
    const name = str(doc.name)
    return {
      id: Number(doc.id),
      name,
      slug: str(doc.slug),
      city: str(doc.city) || name,
      group: str(doc.group),
      category: str(doc.category) || SETTLEMENT_DEFAULT_CATEGORY,
      dealType: str(doc.dealType) || SETTLEMENT_DEFAULT_DEAL_TYPE,
      alwaysVisible: doc.alwaysVisible === true,
      order: typeof doc.order === 'number' ? doc.order : 0,
      regionId,
    }
  })
  return { regions: regionRows, settlements: settlementRows }
}

const toSettlement = (row: RawSettlement, count: number): InterregionalSettlement => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  city: row.city,
  group: row.group,
  category: row.category,
  dealType: row.dealType,
  count,
})

/**
 * Справочник для страницы «Межрегиональная недвижимость» и блока на главной:
 * регионы с населёнными пунктами и счётчиками объектов. В список попадают
 * населённые пункты «показывать всегда» и те, где есть опубликованные
 * объекты, — остальные ждут первого объекта (см. src/lib/interregional.ts).
 * Города с объектами, которых нет в справочнике CRM, отдаются отдельно:
 * страницы у них нет, но показать их честнее, чем потерять.
 */
export async function loadInterregionalDirectory(payload: Payload): Promise<InterregionalDirectory> {
  const [{ regions: regionRows, settlements: settlementRows }, objects] = await Promise.all([
    directoryRows(payload),
    publishedObjectRows(payload),
  ])

  const counts = new Map<number, number>()
  for (const row of settlementRows) {
    const filter = settlementFilter({
      city: row.city,
      category: row.category,
      dealType: row.dealType,
    })
    let count = 0
    for (const object of objects) {
      if (matchesSettlement(object, filter)) count += 1
    }
    counts.set(row.id, count)
  }

  const regions: InterregionalRegion[] = regionRows.map((region) => {
    const own = settlementRows
      .filter((row) => row.regionId === region.id)
      .sort((a, b) => a.order - b.order)
    const visible = own.filter((row) => row.alwaysVisible || (counts.get(row.id) ?? 0) > 0)
    const groups: InterregionalRegion['groups'] = []
    for (const row of visible) {
      const label = row.group
      const group = groups.find((g) => g.label === label)
      const settlement = toSettlement(row, counts.get(row.id) ?? 0)
      if (group) group.settlements.push(settlement)
      else groups.push({ label, settlements: [settlement] })
    }
    return {
      id: region.id,
      title: region.title,
      slug: region.slug,
      groups,
      settlements: visible.map((row) => toSettlement(row, counts.get(row.id) ?? 0)),
    }
  })

  // Города с объектами, которых нет в справочнике: подпись «и другие
  // населённые пункты» работает по реальным данным, а не по догадке
  const knownCities = new Set(settlementRows.map((row) => cityKey(row.city)))
  const otherByKey = new Map<string, InterregionalOtherCity>()
  for (const row of objects) {
    if (!row.city || row.category !== SETTLEMENT_DEFAULT_CATEGORY) continue
    const key = cityKey(row.city)
    if (knownCities.has(key)) continue
    const existing = otherByKey.get(key)
    if (existing) existing.count += 1
    else otherByKey.set(key, { name: row.city.trim(), count: 1 })
  }
  const otherCities = [...otherByKey.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'),
  )

  return {
    regions: regions.filter((region) => region.title),
    otherCities,
  }
}

/** Регионы для блока на главной и карточек: название, путь и число населённых пунктов */
export async function loadInterregionalRegions(payload: Payload): Promise<InterregionalRegion[]> {
  const { regions } = await loadInterregionalDirectory(payload)
  return regions
}

/**
 * Населённые пункты для фильтра «Город» каталога: группы по регионам и общий
 * список значений для сверки параметров ссылок. Отдаём весь справочник,
 * включая скрытые населённые пункты: со страницы такого пункта в каталог
 * ведёт ссылка с его городом, и фильтр не должен её отбрасывать.
 */
export async function loadInterregionalCityOptions(payload: Payload): Promise<{
  groups: { label: string; options: { value: string; label: string }[] }[]
  cities: string[]
}> {
  const { regions, settlements } = await directoryRows(payload)
  const groups: { label: string; options: { value: string; label: string }[] }[] = []
  const cities: string[] = []
  for (const region of regions) {
    const own = settlements
      .filter((row) => row.regionId === region.id)
      .sort((a, b) => a.order - b.order)
    for (const row of own) {
      const label = row.group || region.title
      let group = groups.find((g) => g.label === label)
      if (!group) {
        group = { label, options: [] }
        groups.push(group)
      }
      const value = row.city || row.name
      group.options.push({ value, label: row.name })
      cities.push(value)
    }
  }
  return { groups, cities }
}

export interface SettlementPageData {
  region: { title: string; slug: string }
  settlement: InterregionalSettlement
  /** Опубликованные объекты по фильтру населённого пункта, свежие первыми */
  objects: Record<string, unknown>[]
  /** Сколько всего объектов подходит под фильтр (может быть больше показанных) */
  total: number
}

/**
 * Страница населённого пункта: регион и населённый пункт по путям из адреса
 * плюс объекты по его фильтру. Путь населённого пункта уникален внутри
 * региона — сначала находим регион, потом населённый пункт в нём.
 * null — если такого населённого пункта в справочнике нет (страница 404).
 */
export async function loadSettlementPage(
  payload: Payload,
  regionSlug: string,
  citySlug: string,
): Promise<SettlementPageData | null> {
  const regions = await payload.find({
    collection: 'regions',
    where: { slug: { equals: regionSlug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const region = regions.docs[0] as unknown as Record<string, unknown> | undefined
  if (!region) return null

  const settlements = await payload.find({
    collection: 'settlements',
    where: { and: [{ slug: { equals: citySlug } }, { region: { equals: Number(region.id) } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = settlements.docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc) return null

  const name = str(doc.name)
  const settlement = toSettlement(
    {
      id: Number(doc.id),
      name,
      slug: str(doc.slug),
      city: str(doc.city) || name,
      group: str(doc.group),
      category: str(doc.category) || SETTLEMENT_DEFAULT_CATEGORY,
      dealType: str(doc.dealType) || SETTLEMENT_DEFAULT_DEAL_TYPE,
      alwaysVisible: doc.alwaysVisible === true,
      order: typeof doc.order === 'number' ? doc.order : 0,
      regionId: Number(region.id),
    },
    0,
  )

  const filter = settlementFilter(settlement)
  const rows = await publishedObjectRows(payload)
  const matched = rows.filter((row) => matchesSettlement(row, filter))
  settlement.count = matched.length
  const ids = matched
    .map((row) => row.id)
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => b - a)
    .slice(0, SETTLEMENT_OBJECTS_LIMIT)

  const found = ids.length
    ? (
        await payload.find({
          collection: 'objects',
          where: { id: { in: ids } },
          limit: ids.length,
          depth: 2,
          overrideAccess: true,
        })
      ).docs
    : []
  // Выдачу БД выстраиваем в порядке id (свежие первыми): where с in порядок
  // не сохраняет
  const byId = new Map(found.map((doc) => [Number((doc as { id: unknown }).id), doc]))
  const objects = ids
    .map((id) => byId.get(id))
    .filter((doc): doc is (typeof found)[number] => doc != null)

  return {
    region: { title: str(region.title), slug: str(region.slug) },
    settlement,
    objects: objects as unknown as Record<string, unknown>[],
    total: matched.length,
  }
}

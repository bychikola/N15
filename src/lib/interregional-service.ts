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
import {
  CITY_FILTER_REGIONS,
  OTHER_REGIONS_KEY,
  OTHER_REGIONS_LABEL,
  OSSETIA_CITY,
  OSSETIA_TOWNS,
  type CityFilterField,
  type CityFilterMatch,
  type CityFilterPlace,
  type CityFilterRegion,
} from './city-filter'
// Населённые пункты республики — тот же справочник, что в фильтре каталога и
// форме CRM (см. src/lib/districts.ts): в списке Осетии показываем те из них,
// где уже есть опубликованные объекты
import { LOCALITY_OPTIONS } from './districts'
import { translitSlug } from './slug'

/** Сколько объектов показываем на странице населённого пункта (остальные — в каталоге) */
export const SETTLEMENT_OBJECTS_LIMIT = 24

/** Строка индекса опубликованных объектов: минимум полей для подбора по фильтру */
interface PublishedObjectRow {
  id: number
  /** Город (address.city): межрегиональные города и «Владикавказ» у объектов Осетии */
  city: string
  /** Населённый пункт (address.locality): так записан адрес в Осетии */
  locality: string
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
 * Индекс опубликованных объектов по городам и населённым пунктам — один запрос
 * на страницу. Полей немного (адрес, категория, сделка), поэтому выгружаем
 * весь список опубликованных: объекты каталога Н15 в базу пишутся по одному, и
 * на таких объёмах это дешевле, чем запрос на каждый населённый пункт.
 */
async function publishedObjectRows(payload: Payload): Promise<PublishedObjectRow[]> {
  const { docs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'published' } },
    select: { address: { city: true, locality: true }, category: true, type: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as {
    id: number
    address?: { city?: string; locality?: string }
    category?: string
    type?: string
  }[]).map((doc) => ({
    id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
    city: str(doc.address?.city),
    locality: str(doc.address?.locality),
    category: str(doc.category),
    type: str(doc.type),
  }))
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

/** Ключ названия (cityKey) → написания, встреченные в адресах объектов */
type PlaceSpellings = Map<string, Map<string, number>>

/**
 * Разбор названий из адресов объектов. Ключ — cityKey: регистр, «ё» и лишние
 * пробелы не мешают, поэтому «Химки», «химки» и «Химки » — одно название, а
 * написания из базы становятся значениями фильтра (см. spellingValues) — так
 * объект находится, как бы агент ни записал адрес.
 */
function spellingIndex(names: string[]): PlaceSpellings {
  const index: PlaceSpellings = new Map()
  for (const name of names) {
    if (!name) continue
    const key = cityKey(name)
    const spellings = index.get(key) ?? new Map<string, number>()
    spellings.set(name, (spellings.get(name) ?? 0) + 1)
    index.set(key, spellings)
  }
  return index
}

/** Сколько опубликованных объектов записано таким названием */
function spellingsCount(index: PlaceSpellings, name: string): number {
  let count = 0
  for (const own of index.get(cityKey(name))?.values() ?? []) count += own
  return count
}

/** Значения фильтра для названия: каноническое (из справочника) и написания из базы */
function spellingValues(index: PlaceSpellings, name: string): string[] {
  const values = [name.trim()]
  for (const spelling of index.get(cityKey(name))?.keys() ?? []) {
    if (!values.includes(spelling)) values.push(spelling)
  }
  return values
}

/** Условие фильтра по готовым значениям: поле адреса → значения. Пусто — не из чего строить */
const matchValues = (field: CityFilterField, values: string[]): CityFilterMatch[] => {
  const unique = [...new Set(values.filter(Boolean))]
  return unique.length ? [{ field, values: unique }] : []
}

/** Адрес объекта, приведённый к ключам сравнения, — для счётчиков */
interface PlaceKeyRow {
  city: string
  locality: string
}

/** Сколько объектов подходит под условия фильтра (условия складываются «или») */
function countByMatch(rows: PlaceKeyRow[], match: CityFilterMatch[]): number {
  const fields = match.map((m) => ({ field: m.field, keys: new Set(m.values.map(cityKey)) }))
  return rows.filter((row) => fields.some((f) => f.keys.has(row[f.field]))).length
}

export interface CatalogCityFilter {
  /** Регионы фильтра «Город» в порядке показа (см. src/lib/city-filter.ts) */
  regions: CityFilterRegion[]
  /** Допустимые значения фильтра — города справочника и «других регионов»:
   *  по ним сверяются города из ссылок (в том числе на скрытые населённые
   *  пункты: со страницы такого пункта в каталог ведёт ссылка с его городом) */
  cities: string[]
}

/**
 * Иерархия фильтра «Город» каталога: регионы с населёнными пунктами и
 * счётчиками опубликованных объектов. Регионы и их порядок — по списку
 * заданий (CITY_FILTER_REGIONS в src/lib/city-filter.ts), населённые пункты —
 * из справочника CRM, счётчики — по адресам опубликованных объектов. Счётчики
 * считаются по тем же значениям, что уходят в фильтр, поэтому число рядом с
 * пунктом совпадает с выдачей каталога, когда больше ничего не выбрано.
 *
 * Регион справочника, которого нет в списке заданий, показывается после
 * заданных строк — заведённый сотрудником регион не теряется. Города с
 * объектами вне справочника собираются в последнюю строку «Другие регионы».
 *
 * Строки списка — весь справочник региона: населённый пункт виден и без
 * опубликованных объектов (счётчика у него тогда нет), чтобы справочник
 * фильтра совпадал со справочником CRM, а не пустел до первых объектов.
 * Счётчик строки «все населённые пункты региона» при этом считается по всему
 * справочнику, включая пункты, которых в списке нет (у Осетии — по всем
 * населённым пунктам республики из src/lib/districts.ts).
 */
export async function loadCatalogCityFilter(payload: Payload): Promise<CatalogCityFilter> {
  const [{ regions: regionRows, settlements: settlementRows }, objects] = await Promise.all([
    directoryRows(payload),
    publishedObjectRows(payload),
  ])

  const cityIndex = spellingIndex(objects.map((o) => o.city))
  const localityIndex = spellingIndex(objects.map((o) => o.locality))
  const rows: PlaceKeyRow[] = objects.map((o) => ({ city: cityKey(o.city), locality: cityKey(o.locality) }))
  const indexOf = (field: CityFilterField): PlaceSpellings => (field === 'city' ? cityIndex : localityIndex)

  /** Населенный пункт справочника как строка фильтра */
  const placeOf = (value: string, label: string, field: CityFilterField): CityFilterPlace => ({
    value,
    label,
    field,
    count: spellingsCount(indexOf(field), value),
    values: spellingValues(indexOf(field), value),
  })

  const usedCrmRegions = new Set<number>()

  /** Строка региона из справочника CRM — целиком или по подгруппе («Москва») */
  const crmRegion = (
    key: string,
    label: string,
    source: { crmRegion: string; crmGroup?: string },
  ): CityFilterRegion | null => {
    const crm = regionRows.find((row) => row.title === source.crmRegion)
    if (!crm) return null
    usedCrmRegions.add(crm.id)
    const own = settlementRows
      .filter((row) => row.regionId === crm.id && (!source.crmGroup || row.group === source.crmGroup))
      .sort((a, b) => a.order - b.order)
    // Условие региона собираем по всему справочнику, включая скрытые пункты:
    // объект в них — всё равно объект региона
    const match = matchValues('city', own.flatMap((row) => spellingValues(cityIndex, row.city || row.name)))
    // Строки списка — весь справочник региона, а не только ключевые населённые
    // пункты и те, где уже есть объекты: справочник и есть список мест, где
    // работает Н15, поэтому заведённый в CRM населённый пункт виден в фильтре
    // сразу. У пункта без опубликованных объектов счётчика нет (см. PlaceCount)
    const places = own.map((row) => placeOf(row.city || row.name, row.name, 'city'))
    return { key, label, ossetian: false, count: countByMatch(rows, match), match, places }
  }

  /**
   * Осетия — регион без справочника CRM: населённые пункты республики лежат в
   * address.locality. В списке — ключевые города (видны всегда) и остальные
   * населённые пункты с опубликованными объектами. Строка «весь регион» ищет
   * и по ним, и по городу Владикавказ (OSSETIA_CITY) — так находятся объекты
   * республики с незаполненным населённым пунктом.
   */
  const ossetiaRegion = (key: string, label: string): CityFilterRegion => {
    const places: CityFilterPlace[] = []
    const added = new Set<string>()
    for (const town of OSSETIA_TOWNS) {
      places.push(placeOf(town, town, 'locality'))
      added.add(cityKey(town))
    }
    for (const name of LOCALITY_OPTIONS) {
      if (added.has(cityKey(name)) || spellingsCount(localityIndex, name) === 0) continue
      places.push(placeOf(name, name, 'locality'))
      added.add(cityKey(name))
    }
    // Условие региона — весь справочник населённых пунктов республики, а не
    // только строки списка: выбранная Осетия находит все свои объекты, в том
    // числе в населённых пунктах, которых в списке нет. Написания берём из
    // базы (spellingValues): адрес агент вводит руками, и объект находится,
    // как бы он ни был записан
    const knownLocalities = [...new Set([...OSSETIA_TOWNS, ...LOCALITY_OPTIONS])]
    const match = [
      ...matchValues('city', spellingValues(cityIndex, OSSETIA_CITY)),
      ...matchValues('locality', knownLocalities.flatMap((name) => spellingValues(localityIndex, name))),
    ]
    return { key, label, ossetian: true, count: countByMatch(rows, match), match, places }
  }

  const regions: CityFilterRegion[] = []
  for (const source of CITY_FILTER_REGIONS) {
    const region = source.crmRegion
      ? crmRegion(source.key, source.label, { crmRegion: source.crmRegion, crmGroup: source.crmGroup })
      : ossetiaRegion(source.key, source.label)
    if (region) regions.push(region)
  }

  // Регионы справочника, которых нет в списке заданий: показываем как есть,
  // после заданных строк — новый регион в CRM не теряется
  for (const crm of regionRows) {
    if (usedCrmRegions.has(crm.id)) continue
    const region = crmRegion(`crm-${crm.slug || crm.id}`, crm.title, { crmRegion: crm.title })
    if (region) regions.push(region)
  }

  // «Другие регионы» — города с объектами, которых нет в справочнике. Строка
  // есть всегда, даже пустая: она последняя в списке регионов
  const knownCityKeys = new Set([
    ...settlementRows.map((row) => cityKey(row.city || row.name)),
    cityKey(OSSETIA_CITY),
  ])
  const otherPlaces: CityFilterPlace[] = []
  for (const [key, spellings] of cityIndex) {
    if (!key || knownCityKeys.has(key)) continue
    // Подпись строки — самое частое написание названия в адресах объектов
    const label = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))[0][0]
    otherPlaces.push({
      value: label,
      label,
      field: 'city',
      count: spellingsCount(cityIndex, label),
      values: [...spellings.keys()],
    })
  }
  otherPlaces.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
  const otherMatch = matchValues('city', otherPlaces.flatMap((item) => item.values))
  regions.push({
    key: OTHER_REGIONS_KEY,
    label: OTHER_REGIONS_LABEL,
    ossetian: false,
    count: countByMatch(rows, otherMatch),
    match: otherMatch,
    places: otherPlaces,
  })

  return {
    regions,
    cities: [...new Set([
      ...settlementRows.map((row) => row.city || row.name),
      ...otherPlaces.map((place) => place.label),
    ])],
  }
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

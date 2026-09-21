'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
// Садовые товарищества (СНТ/СНО/ДНТ) — те же справочники, что в подразделе
// лендинга: категории из GARDENING_AREAS, всё внутри Владикавказского округа
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS, GARDENING_CATEGORY_ORDER, GARDENING_AREAS, LAND_CITY_OPTIONS } from '@/lib/districts'
import { SNT_AREAS } from '@/components/home/landing-data'
// Иерархия фильтра «Город» — регионы с населёнными пунктами и счётчиками —
// приходит готовой с сервера (см. loadCatalogCityFilter в
// src/lib/interregional-service.ts): здесь только показ и выбор, списков в
// клиентском компоненте нет
import type { CityFilterField, CityFilterPlace, CityFilterRegion } from '@/lib/city-filter'
// Конвертация площади участков: 1 сотка = 100 м², 1 га = 10000 м²
// (те же хелперы, что в форме CRM, — см. src/lib/area-format.ts)
import { SQM_PER_UNIT, areaNumberText, areaUnitOf, parseAreaNumber, sqmToUnit, unitToSqm, type AreaUnit } from '@/lib/area-format'
// Варианты покупки: коды и правила показа — общие с карточкой объекта и
// формой CRM (см. src/lib/purchase-options.ts)
import { PURCHASE_OPTIONS, PURCHASE_OPTION_VALUES, purchaseCategoriesApply } from '@/lib/purchase-options'
// Категории объектов — общий справочник со схемой коллекции и формой CRM
// (см. src/lib/object-categories.ts): список значений совпадает с опциями
// select-поля category. Подкатегории домов (отдельные дома, дома с участком,
// дачи, коттеджи, таунхаусы, части домов) — оттуда же
import { OBJECT_CATEGORY_VALUES, HOUSE_TYPES, houseTypeOf, houseTypeCategory, isHouseCategoryCode } from '@/lib/object-categories'
// Подкатегории коммерции — общий справочник со схемой (Objects.commercialType)
// и формой CRM: готовый бизнес, офис, торговое помещение и т.д.
import { COMMERCIAL_TYPES, isCommercialType } from '@/lib/commercial-types'

// Допустимые значения select-фильтров — опции одноимённых полей объекта
// (src/payload/collections/Objects.ts). Где-запрос к /api/objects с чужим
// значением (мусорный или устаревший параметр URL) падает серверной
// ошибкой, поэтому такие значения отбрасываем, а не отправляем.
export const OBJECT_TYPES = ['sale', 'rent']
export const OBJECT_CATEGORIES = OBJECT_CATEGORY_VALUES
export const OBJECT_ROOMS = ['1', '2', '3', '4']

/**
 * Фильтр «Отопление»: в базе поле текстовое (агент вводит значение списком
 * CRM или своими словами), поэтому точного равенства тут мало — ищем
 * узнаваемый фрагмент слова. Первую букву не пишем: «ентральн» находит и
 * «Центральное», и «центральное». Коды и подписи — из словаря
 * (t.object.heatingOptions). Значение, которого нет в списке (например
 * «Печное»), фильтром не находится — это осознанное упрощение.
 */
export const HEATING_FILTERS = [
  { value: 'central', match: 'ентральн' },
  { value: 'autonomous', match: 'втономн' },
  { value: 'gas', match: 'азов' },
  { value: 'electric', match: 'лектрич' },
] as const

/** Значения фильтра «Отопление» — коды HEATING_FILTERS */
export const OBJECT_HEATING = HEATING_FILTERS.map((h) => h.value) as readonly string[]
const isKnown = (v: string, options: readonly string[]) => options.includes(v)

/**
 * Фильтр «Материал дома»: поле buildingType в базе тоже текстовое — агент
 * пишет «Кирпичный», «кирпич», «Кирпич», поэтому ищем узнаваемый фрагмент
 * слова (как в HEATING_FILTERS). «Блочный» и «Брус» попадают в свои пункты
 * по первым буквам корня. Подписи — из словаря (t.catalog.buildingOptions).
 */
export const BUILDING_FILTERS = [
  { value: 'brick', match: 'ирпич' },
  { value: 'monolith', match: 'онолит' },
  { value: 'panel', match: 'анель' },
  { value: 'block', match: 'лок' },
  { value: 'wood', match: 'ерев' },
] as const

/** Значения фильтра «Материал дома» — коды BUILDING_FILTERS */
export const OBJECT_BUILDING = BUILDING_FILTERS.map((b) => b.value) as readonly string[]

/**
 * Фильтр «Газ»: поле gas текстовое, ищем фрагмент значения (как выше).
 * «Есть» и «Подключён» — первое, «Магистральный» и «Баллонный» — способ
 * подключения: у них свои пункты, потому что это разные вопросы покупателя.
 */
export const GAS_FILTERS = [
  { value: 'yes', match: 'сть' },
  { value: 'main', match: 'агистрал' },
  { value: 'bottled', match: 'аллон' },
] as const

/** Значения фильтра «Газ» — коды GAS_FILTERS */
export const OBJECT_GAS = GAS_FILTERS.map((g) => g.value) as readonly string[]

/**
 * Признаки объекта (лифт, закрытый двор, индивидуальное отопление): в базе это
 * текстовые поля, а покупателю важен факт «есть». Фрагменты — как у прочих
 * текстовых фильтров: «лифт» ловит «Лифт», «Лифт пассажирский» и «Есть лифт»,
 * «закрыт» — «Закрытый», «закрытый двор». Значение, которого нет в списке
 * (например «Нет» у лифта), такой фильтр не находит — это осознанное
 * упрощение, как у отопления и материала дома.
 */
const ELEVATOR_MATCHES = ['сть', 'ифт']
const CLOSED_YARD_MATCHES = ['акрыт']
const INDIVIDUAL_HEATING_MATCHES = ['ндивидуальн', 'втономн']

/** Имя URL-параметра фильтра «Объекты агента» — ссылки с карточек команды
 *  на странице агентства ведут в /catalog?agent=<id> */
export const AGENT_URL_PARAM = 'agent'

export interface FiltersState {
  type: string
  category: string
  rooms: string
  /** Этаж — диапазон «от/до»: у квартиры, комнаты и гаража это этаж в доме */
  floorMin: string
  floorMax: string
  /** Этажность — диапазон «от/до»: у дома и таунхауса это этажи дома
   *  (поле totalFloors), у квартиры — этажность её дома */
  floorsMin: string
  floorsMax: string
  /** Отопление — код из HEATING_FILTERS: в базе поле текстовое, совпадение
   *  ищем по узнаваемому фрагменту значения (см. buildWhere) */
  heating: string
  /** Материал дома — код из BUILDING_FILTERS (в базе текстовое поле
   *  buildingType, ищем фрагмент значения) */
  building: string
  /** Газ — код из GAS_FILTERS: «есть», «магистральный», «баллонный» */
  gas: string
  /** Признаки объекта: '1' — искать только объекты с признаком, '' — не
   *  фильтровать. Индивидуальное отопление, лифт и закрытый двор лежат
   *  в текстовых полях (heating, elevator, yard) — совпадение по фрагменту */
  individualHeating: string
  elevator: string
  closedYard: string
  /** Улица — свободный ввод: совпадение в address.street */
  street: string
  /** Кадастровый номер участка — свободный ввод, только у категории «участок».
   *  Поле закрыто для посетителей (см. buildWhere): по номеру каталог
   *  спрашивает отдельный серверный маршрут и фильтрует по id найденных
   *  объектов, а не по самому полю */
  cadastral: string
  /** Жилая площадь и площадь кухни, м² — диапазоны «от/до» (поля livingArea
   *  и kitchenArea). В базе всегда м², единица не переключается */
  livingAreaMin: string
  livingAreaMax: string
  kitchenAreaMin: string
  kitchenAreaMax: string
  priceMin: string
  priceMax: string
  areaMin: string
  areaMax: string
  /** Единица площади в фильтре: '' — не выбрана (= м²), 'are' — сотки,
   *  'ha' — гектары. Имеет смысл только для категории «участок»; у остальных
   *  категорий площадь всегда в м². */
  areaUnit: '' | AreaUnit
  district: string
  cityDistrict: string
  locality: string
  snt: string
  /** Город вне Северной Осетии (межрегиональные объекты) либо Владикавказ
   *  у участков (межрегиональных направлений у земли нет). Взаимоисключается
   *  с осетинскими адресными фильтрами: район/нас. пункт/товарищество —
   *  кроме участков, где город — часть той же структуры поиска.
   *  Населённые пункты Осетии из фильтра «Город» живут в locality: это то же
   *  поле адреса, что у фильтра «Населённый пункт» (см. city-filter.ts) */
  city: string
  /** «Все населённые пункты региона» — ключ региона фильтра «Город»
   *  (см. CityFilterRegion.key). Взаимоисключается с выбранным городом и
   *  населённым пунктом: фильтр «Город» выбирает что-то одно */
  cityRegion: string
  /** Подкатегория дома — код HOUSE_TYPES: отдельные дома, дома с участком,
   *  дачи, коттеджи, таунхаусы, части домов. Задаёт категорию объекта: в
   *  фильтре по категории такой пункт не значится (см. houseTypeCategory) */
  houseType: string
  /** Подкатегория коммерции — код COMMERCIAL_TYPES (готовый бизнес, офис,
   *  торговое помещение…). Категория у неё одна — «коммерческая» */
  commercialType: string
  /** id агента: показываем только его объекты. Постоянного поля в панели
   *  фильтров у него нет — фильтр приходит ссылкой с карточек команды,
   *  а снимается чипом «Объекты агента» над выдачей */
  agent: string
  /** Варианты покупки — множественный выбор: коды (purchase-options.ts)
   *  через запятую. Пусто — фильтр не выбран; объект подходит, если у него
   *  отмечен любой из выбранных вариантов. Взаимоисключается с арендой и
   *  участками: у них вариантов покупки не бывает, фильтр снимается */
  purchase: string
}

export const emptyFilters: FiltersState = {
  type: '', category: '', rooms: '', floorMin: '', floorMax: '', floorsMin: '', floorsMax: '', heating: '', building: '', gas: '',
  individualHeating: '', elevator: '', closedYard: '', street: '', cadastral: '', livingAreaMin: '', livingAreaMax: '', kitchenAreaMin: '', kitchenAreaMax: '',
  priceMin: '', priceMax: '', areaMin: '', areaMax: '', areaUnit: '', district: '', cityDistrict: '', locality: '', snt: '', city: '', cityRegion: '',
  houseType: '', commercialType: '', agent: '', purchase: '',
}

/**
 * Фильтры второго ряда панели («Показать ещё фильтры»): характеристики
 * объекта — улица, жилая площадь, площадь кухни, этаж, этажность, отопление,
 * материал дома, газ, индивидуальное отопление, лифт и закрытый двор.
 * В первом ряду им тесно: покупатель ищет по сделке, категории, месту и цене,
 * а эти поля уточняют выбор. Ряд показывается по кнопке; если хоть один из
 * фильтров задан (в том числе ссылкой из каталога или блока на главной),
 * он раскрыт — работающих фильтров в свёрнутом виде быть не должно.
 */
export const MORE_FILTER_KEYS = [
  'street', 'cadastral', 'livingAreaMin', 'livingAreaMax', 'kitchenAreaMin', 'kitchenAreaMax',
  'floorMin', 'floorMax', 'floorsMin', 'floorsMax', 'heating', 'building', 'gas',
  'individualHeating', 'elevator', 'closedYard',
] as const satisfies readonly (keyof FiltersState)[]

/** Задан ли хоть один фильтр второго ряда (см. MORE_FILTER_KEYS) */
export const hasMoreFilters = (f: FiltersState): boolean => MORE_FILTER_KEYS.some((k) => Boolean(f[k]))

/**
 * Выбранные варианты покупки из значения фильтра: в URL это коды через
 * запятую. Чужие и устаревшие значения отбрасываем, как у прочих
 * select-фильтров; порядок приводим к порядку списка вариантов — одна и та
 * же отметка даёт одну и ту же строку фильтра (ссылки и сравнение в URL).
 */
export const purchaseValues = (v: string): string[] => {
  const parts = v.split(',')
  return PURCHASE_OPTION_VALUES.filter((code) => parts.includes(code))
}

/**
 * Есть ли варианты покупки у объектов с таким типом сделки и категорией.
 * Отличие от purchaseOptionsApply: не выбранный тип сделки («Любой») здесь
 * считается подходящим — фильтр показывает и продажу, и аренду сразу, и
 * снимать его из-за этого нельзя.
 */
const purchaseRelevant = (type: string, category: string): boolean =>
  type !== 'rent' && (!category || purchaseCategoriesApply(category))

// Число из фильтра: позволяет и «600», и «11,5» (запятая — как вводят вручную)
const numOf = (v: string): number | null => parseAreaNumber(v)

/**
 * Допустимые значения фильтра «Город» для категории: у участков — только
 * Владикавказ (земля Н15 вне межрегиональных направлений, см. districts.ts),
 * у остальных категорий — города межрегионального справочника из CRM.
 * Чужое значение отбрасываем: where по несуществующему городу молча даёт
 * пустую выдачу, а ссылка с ним живёт в закладках.
 */
export const cityValuesFor = (category: string, knownCities: readonly string[]): readonly string[] =>
  category === 'land' ? LAND_CITY_OPTIONS : knownCities

/**
 * Допустимые ключи регионов фильтра «Город» для категории: у участков — только
 * Осетия (межрегиональных направлений у земли нет), у остальных категорий — всё
 * дерево регионов. Чужой ключ из ссылки отбрасываем, как и чужой город.
 * Регион без населённых пунктов (пустые «Другие регионы») в списке не значится:
 * выбрать его нельзя, а ссылка с ним ничего не фильтрует — снимаем ключ, чтобы
 * в поле не оставался выбор без действия.
 */
export const regionValuesFor = (category: string, regions: readonly CityFilterRegion[]): readonly string[] =>
  (category === 'land' ? regions.filter((r) => r.ossetian) : regions)
    .filter((r) => r.match.length > 0)
    .map((r) => r.key)

/**
 * Значения адреса для пункта фильтра: каноническое название и написания из
 * базы (адреса агенты вводят руками, см. city-filter.ts). Для значения,
 * которого в справочнике нет (старая ссылка на скрытый населённый пункт), —
 * само значение: фильтр по нему ищет точным совпадением, как раньше.
 */
const placeValues = (regions: readonly CityFilterRegion[], field: CityFilterField, value: string): string[] =>
  regions.flatMap((r) => r.places).find((p) => p.field === field && p.value === value)?.values ?? [value]

export function buildWhere(
  f: FiltersState,
  q: string,
  regions: readonly CityFilterRegion[],
  knownCities: readonly string[],
  /**
   * id объектов, найденных по кадастровому номеру (см. фильтр «Кадастровый
   * номер»). Поле cadastralNumber закрыто для посетителей: публичный API его
   * не только не отдаёт, но и не принимает в where, поэтому номер ищет
   * серверный маршрут (/api/objects/by-cadastral), а каталог фильтрует выдачу
   * по id найденного. null — номер ещё ищется; каталог в это время не грузит
   * выдачу, поэтому null до where не доходит (см. CatalogContent)
   */
  cadastralIds?: number[] | null,
): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  // На сайте показываем только опубликованные (черновики и архив скрыты)
  conds.push({ status: { equals: 'published' } })
  // Select-поля фильтруем только значениями из их опций (см. isKnown выше)
  if (f.type && isKnown(f.type, OBJECT_TYPES)) conds.push({ type: { equals: f.type } })
  // Категория: подкатегория дома её и задаёт («дом с участком» — та же
  // категория «дом», см. houseTypeCategory), поэтому category и houseType
  // не спорят друг с другом — подкатегория важнее
  const houseType = houseTypeOf(f.houseType)
  const category = houseType ? houseType.category : f.category
  if (category && isKnown(category, OBJECT_CATEGORIES)) conds.push({ category: { equals: category } })
  // «Дома с участком» — дома с заполненной площадью участка: отдельной
  // категории в базе нет (см. HOUSE_TYPES)
  if (houseType?.plot) conds.push({ plotArea: { greater_than: 0 } })
  // Подкатегория коммерции: поля нет у объектов других категорий, поэтому
  // условие ставим только у коммерции (категория не выбрана — фильтр её сам
  // и задаёт, см. apply в CatalogFilters)
  if (isCommercialType(f.commercialType) && (!category || category === 'commercial')) {
    conds.push({ commercialType: { equals: f.commercialType } })
  }
  if (f.district && isKnown(f.district, DISTRICT_OPTIONS)) conds.push({ 'address.district': { equals: f.district } })
  if (f.cityDistrict && isKnown(f.cityDistrict, CITY_DISTRICT_OPTIONS)) conds.push({ 'address.cityDistrict': { equals: f.cityDistrict } })
  // Населённый пункт Осетии — это address.locality. Рядом с каноническим
  // названием шлём написания из базы (city-filter.ts): объект находится, как
  // бы агент ни записал адрес
  if (f.locality) conds.push({ 'address.locality': { in: placeValues(regions, 'locality', f.locality) } })
  // Улица — свободный ввод: адреса агенты пишут руками, поэтому ищем
  // совпадение, а не точное равенство («Ленина» найдёт «ул. Ленина»)
  if (f.street.trim()) conds.push({ 'address.street': { contains: f.street.trim() } })
  // Кадастровый номер участка: условие ставим по id найденных объектов, а не
  // по самому полю (см. cadastralIds выше). Пустой список — «ничего не
  // найдено»: без него фильтр по несуществующему номеру молча показывал бы
  // весь каталог. Несуществующий id вместо пустого in — у пустого списка
  // в SQL получается некорректное «id in ()»
  if (f.cadastral.trim()) conds.push({ id: { in: cadastralIds?.length ? cadastralIds : [-1] } })
  if (f.snt && isKnown(f.snt, SNT_AREAS)) conds.push({ 'address.snt': { equals: f.snt } })
  // Города: у участков список свой (только Владикавказ), у остальных — CRM
  if (f.city && isKnown(f.city, cityValuesFor(f.category, knownCities))) {
    conds.push({ 'address.city': { in: placeValues(regions, 'city', f.city) } })
  }
  // «Все населённые пункты региона»: условие региона из справочника — по
  // одному или нескольким полям адреса (у Осетии это город и населённый пункт)
  if (f.cityRegion) {
    const region = regions.find((r) => r.key === f.cityRegion)
    if (region?.match.length) {
      conds.push({ or: region.match.map((m) => ({ [`address.${m.field}`]: { in: m.values } })) })
    }
  }
  if (isKnown(f.rooms, OBJECT_ROOMS)) {
    conds.push(f.rooms === '4'
      ? { rooms: { greater_than_equal: 4 } }
      : { rooms: { equals: parseInt(f.rooms, 10) } })
  }
  // Этаж и этажность: диапазоны «от/до» по числовым полям floor и
  // totalFloors. Значения отрицательные и дробные отбрасываем — этаж и
  // этажность целые и положительные
  const floorMin = floorNumber(f.floorMin)
  if (floorMin != null) conds.push({ floor: { greater_than_equal: floorMin } })
  const floorMax = floorNumber(f.floorMax)
  if (floorMax != null) conds.push({ floor: { less_than_equal: floorMax } })
  const floorsMin = floorNumber(f.floorsMin)
  if (floorsMin != null) conds.push({ totalFloors: { greater_than_equal: floorsMin } })
  const floorsMax = floorNumber(f.floorsMax)
  if (floorsMax != null) conds.push({ totalFloors: { less_than_equal: floorsMax } })
  // Отопление: поле в базе текстовое, поэтому ищем узнаваемый фрагмент
  // значения (см. HEATING_FILTERS) — «Центральное», «центральное отопление»
  const heating = HEATING_FILTERS.find((h) => h.value === f.heating)
  if (heating) conds.push({ heating: { contains: heating.match } })
  // Материал дома и газ — такие же текстовые поля (см. BUILDING_FILTERS)
  const building = BUILDING_FILTERS.find((b) => b.value === f.building)
  if (building) conds.push(matchesAny('buildingType', [building.match]))
  const gas = GAS_FILTERS.find((g) => g.value === f.gas)
  if (gas) conds.push(matchesAny('gas', [gas.match]))
  // Признаки объекта: индивидуальное отопление, лифт и закрытый двор —
  // переключатели «есть». У них по несколько фрагментов значения
  // («Есть» / «Лифт пассажирский», «Автономное» / «Индивидуальное»)
  if (f.individualHeating === '1') conds.push(matchesAny('heating', INDIVIDUAL_HEATING_MATCHES))
  if (f.elevator === '1') conds.push(matchesAny('elevator', ELEVATOR_MATCHES))
  if (f.closedYard === '1') conds.push(matchesAny('yard', CLOSED_YARD_MATCHES))
  const priceMin = parseInt(f.priceMin, 10)
  if (f.priceMin && Number.isFinite(priceMin)) conds.push({ price: { greater_than_equal: priceMin } })
  const priceMax = parseInt(f.priceMax, 10)
  if (f.priceMax && Number.isFinite(priceMax)) conds.push({ price: { less_than_equal: priceMax } })
  // Площадь в базе всегда в м²; выбраны сотки/гектары — переводим
  // (1 сотка = 100 м², 1 га = 10000 м²). У не-участков единица не действует
  const areaMul = f.category === 'land' ? SQM_PER_UNIT[areaUnitOf(f.areaUnit)] : 1
  if (f.areaMin) {
    const min = numOf(f.areaMin)
    if (min != null && Number.isFinite(min)) conds.push({ area: { greater_than_equal: Math.round(min * areaMul * 100) / 100 } })
  }
  if (f.areaMax) {
    const max = numOf(f.areaMax)
    if (max != null && Number.isFinite(max)) conds.push({ area: { less_than_equal: Math.round(max * areaMul * 100) / 100 } })
  }
  // Жилая площадь и площадь кухни — диапазоны «от/до» в м²: единица у них
  // одна, переключателя соток и гектаров нет
  pushRange(conds, 'livingArea', f.livingAreaMin, f.livingAreaMax)
  pushRange(conds, 'kitchenArea', f.kitchenAreaMin, f.kitchenAreaMax)
  // Варианты покупки: множественный выбор — объект подходит, если отмечен
  // любой из выбранных вариантов (в базе поле хранится списком)
  const purchase = purchaseValues(f.purchase)
  if (purchase.length) conds.push({ purchaseOptions: { in: purchase } })
  const agent = agentId(f.agent)
  if (agent != null) conds.push({ agent: { equals: agent } })
  if (q) conds.push({ or: [{ title: { contains: q } }, { 'address.street': { contains: q } }] })
  return conds.length ? { and: conds } : {}
}

// id агента: только целое положительное число (в базе они такие). Мусорные
// значения из ссылки отбрасываем — серверный where с нецелым id падает
function agentId(v: string): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Условие «в текстовом поле встречается один из фрагментов»: характеристики
 * дома агент пишет словами («Кирпичный», «кирпич», «Есть», «Лифт
 * пассажирский»), поэтому точного равенства мало — ищем узнаваемый фрагмент
 * значения (см. BUILDING_FILTERS, GAS_FILTERS).
 */
const matchesAny = (field: string, fragments: readonly string[]): Record<string, unknown> =>
  ({ or: fragments.map((match) => ({ [field]: { contains: match } })) })

/**
 * Диапазон «от/до» по числовому полю объекта (жилая площадь, площадь кухни):
 * пустые и мусорные границы пропускаем молча — фильтр с ними ничего не
 * уточняет, а пустую выдачу объяснить нечем.
 */
function pushRange(conds: Record<string, unknown>[], field: string, min: string, max: string) {
  const from = numOf(min)
  if (from != null && Number.isFinite(from)) conds.push({ [field]: { greater_than_equal: from } })
  const to = numOf(max)
  if (to != null && Number.isFinite(to)) conds.push({ [field]: { less_than_equal: to } })
}

/**
 * Этаж или этажность из фильтра: целое положительное число либо null.
 * «1,5» и «−2» — не этаж: такие значения в where не отправляем, иначе
 * фильтр молча даёт пустую выдачу.
 */
function floorNumber(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return Number.isInteger(n) && n > 0 ? n : null
}

// Подписи фильтров — до двух строк: длинная подпись («Садоводческие
// товарищества») переносится на вторую строку, а не выходит за рамку кнопки.
// Слот подписи у всех фильтров одинаковый — высота двух строк (min-height),
// поэтому прямоугольники остаются одного размера, а подписи и строки значений
// («Любой») стоят на одних линиях. Для длинных подписей (например «Населённый
// пункт» и «Садоводческие товарищества») — компактный вариант с меньшим кеглем.
const labelCls = (compact = false) =>
  `${compact ? 'text-[9px] tracking-[0.15em]' : 'text-[10px] tracking-[0.2em]'} uppercase leading-[1.5] min-h-[30px] text-[var(--n15-muted)]`
const ddBtnCls = 'flex items-center justify-between gap-3 w-full px-4 py-2.5 text-sm text-[var(--n15-silver)] border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 hover:border-[var(--n15-gold)]/40 transition-colors'

/** Одна строка раскрытого списка: заголовок группы (СНТ/СНО/ДНТ — не
 *  выбирается) или пункт с названием товарищества/нас. пункта */
type DropdownEntry =
  | { kind: 'header'; label: string }
  | { kind: 'option'; value: string; label: string }

/** Стрелка выпадающего списка: у открытого — вверх, у закрытого — вниз.
 *  Все списки панели (сделка, тип, город, район…) и строки регионов внутри
 *  фильтра «Город» показывают её одинаково (кегль и цвет задаёт className) */
function DdArrow({ open, className = 'text-[10px]' }: { open: boolean; className?: string }) {
  return (
    <span className={`shrink-0 transition-transform ${className} ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
  )
}

/** Выпадающий список панели фильтров. Открытым его держит родитель (см.
 *  openId в CatalogFilters): одновременно открыт ровно один список, поэтому
 *  состояние «открыт» приходит пропом, а не живёт внутри */
function Dropdown({ label, value, options, groups, onSelect, compactLabel, open, onToggle, onClose }: {
  label: string
  value: string
  /** Простые пункты без групп (сделка, тип, район…) */
  options?: { value: string; label: string }[]
  /** Группы с заголовками — например категории СНТ/СНО/ДНТ садовых
   *  товариществ. Если заданы, options не используется */
  groups?: { label: string; options: { value: string; label: string }[] }[]
  onSelect: (v: string) => void
  compactLabel?: boolean
  /** Открыт ли список (открытым держит панель фильтров) */
  open: boolean
  /** Нажатие на кнопку: открыть список или свернуть открытый */
  onToggle: () => void
  /** Закрыть список: выбор пункта, Escape, клик вне панели */
  onClose: () => void
}) {
  const entries: DropdownEntry[] = groups
    ? groups.flatMap((g) => [
        { kind: 'header', label: g.label },
        ...g.options.map((o) => ({ kind: 'option' as const, ...o })),
      ])
    : (options ?? []).map((o) => ({ kind: 'option' as const, ...o }))
  const current = entries.find((e): e is Extract<DropdownEntry, { kind: 'option' }> => e.kind === 'option' && e.value === value)
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={ddBtnCls} aria-expanded={open} aria-haspopup="listbox">
        {/* min-w-0 — колонка подписи сжимается под ширину кнопки, подпись и
            значение переносятся по словам (break-words) и не выходят за рамку */}
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(compactLabel) + ' break-words'}>{label}</span>
          <span className="break-words">{current?.label ?? 'Любой'}</span>
        </span>
        <DdArrow open={open} />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 py-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg">
          <button type="button" onClick={() => { onSelect(''); onClose() }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === '' ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
            Любой
          </button>
          {entries.map((e, i) => (
            e.kind === 'header' ? (
              /* Заголовок категории в списке — раздел сам не выбирается */
              <div key={`${e.label}-${i}`} className="px-4 pt-2 pb-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--n15-muted)]">
                {e.label}
              </div>
            ) : (
              <button key={e.value} type="button" onClick={() => { onSelect(e.value); onClose() }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === e.value ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                {e.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Фильтр «Варианты покупки»: множественный выбор — отметить можно несколько
 * вариантов сразу (например, ипотека и рассрочка). Отличие от остальных
 * списков панели: выбор пункта список не закрывает, отметки ставят одну за
 * другой; закрыть можно повторным нажатием на кнопку, Escape или кликом вне
 * панели — как у прочих фильтров (см. openId в CatalogFilters).
 *
 * Сводка на кнопке — выбранные варианты через запятую, а не один пункт, как
 * у одиночных фильтров.
 */
function PurchaseDropdown({ label, anyLabel, value, onToggleOption, onClear, open, onToggle, onClose }: {
  label: string
  /** Сводка, когда ничего не выбрано («Любой») */
  anyLabel: string
  /** Значение фильтра: коды вариантов через запятую */
  value: string
  onToggleOption: (value: string) => void
  onClear: () => void
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const selected = purchaseValues(value)
  const current = selected.length ? selected.map((o) => PURCHASE_OPTIONS.find((opt) => opt.value === o)?.label).filter(Boolean).join(', ') : anyLabel
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={ddBtnCls} aria-expanded={open} aria-haspopup="listbox">
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(true) + ' break-words'}>{label}</span>
          <span className="break-words">{current}</span>
        </span>
        <DdArrow open={open} />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 py-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg">
          {/* «Любой» снимает все отметки и закрывает список — как выбор
              пункта в одиночных фильтрах; отметки вариантов список не
              закрывают, их ставят одну за другой */}
          <button type="button" onClick={() => { onClear(); onClose() }} aria-pressed={selected.length === 0}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${selected.length === 0 ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
            {anyLabel}
          </button>
          {PURCHASE_OPTIONS.map((option) => {
            const on = selected.includes(option.value)
            return (
              <button key={option.value} type="button" aria-pressed={on} onClick={() => onToggleOption(option.value)}
                className={`flex items-center gap-2 w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${on ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                {/* Квадратик отметки: множественный выбор виден сразу, в
                    отличие от галочки-переключателя одиночных списков */}
                <span aria-hidden="true" className="shrink-0 w-3.5 h-3.5 flex items-center justify-center border border-[var(--n15-gold)]/40 text-[9px] leading-none">
                  {on ? '✓' : ''}
                </span>
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Ключ сравнения названий (регистр, «ё», лишние пробелы) — тот же cityKey, что
 *  в справочнике (src/lib/interregional.ts): поиск не зависит от написания */
const nameKey = (v: string): string => v.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

/** Строка списка: у всех одна высота (min-h-9) и одинаковые отступы. Отступ
 *  слева задаётся отдельно (cityRowTop/cityRowSub): в одной строке классов не
 *  должно быть двух значений padding-left — какой из них победит, решает
 *  порядок правил в таблице стилей, а не порядок классов */
const cityRowCls = 'flex items-center gap-3 w-full min-h-9 pr-3 py-1.5 text-left text-sm transition-colors cursor-pointer'
/** Строка верхнего уровня: регион, «Любой», найденный населённый пункт */
const cityRowTop = `${cityRowCls} pl-4`
/** Строка внутри раскрытого региона: населённые пункты и строка «весь регион» */
const cityRowSub = `${cityRowCls} pl-9`

/**
 * Фильтр «Город»: иерархия регион → населённые пункты. При открытии — только
 * регионы; населённые пункты региона показываются по стрелке: раскрыт может
 * быть только один регион, повторное нажатие на открытый его сворачивает.
 * У строки — счётчик опубликованных объектов (у пунктов без объектов счётчика
 * нет). Последняя строка раскрытого региона — «Все населённые пункты региона»:
 * фильтр по региону целиком. Поиск ищет населённые пункты во всех регионах
 * сразу и подписывает, из какого они региона — плоский список городов при этом
 * не возвращается: без запроса в списке только регионы.
 *
 * Список прокручивается внутри себя (max-h): на телефоне, где фильтры стоят
 * столбцом, он не растягивает страницу и не уходит за пределы экрана.
 * Открытым фильтр держит панель (см. openId в CatalogFilters): нажатие на
 * другой фильтр, клик вне панели и Escape закрывают список.
 */
function CityDropdown({ label, regions, place, regionKey, onPlace, onRegion, onClear, t, open, onToggle, onClose }: {
  label: string
  /** Регионы фильтра в порядке показа (см. CityFilterRegion) */
  regions: CityFilterRegion[]
  /** Выбранный населённый пункт (значение фильтра) либо '' */
  place: string
  /** Выбранный регион «все населённые пункты» либо '' */
  regionKey: string
  onPlace: (place: CityFilterPlace) => void
  onRegion: (region: CityFilterRegion) => void
  onClear: () => void
  t: Dict
  /** Открыт ли список (открытым держит панель фильтров) */
  open: boolean
  /** Нажатие на кнопку: открыть список или свернуть открытый */
  onToggle: () => void
  /** Закрыть список: выбор пункта, Escape, клик вне панели */
  onClose: () => void
}) {
  const currentPlace = place ? regions.flatMap((r) => r.places).find((p) => p.value === place) : undefined
  const currentRegion = regionKey ? regions.find((r) => r.key === regionKey) : undefined
  // Значение фильтра может быть и не из списка (ссылка на скрытый населённый
  // пункт) — показываем его как есть, чтобы выбор не выглядел потерянным
  const currentLabel = currentPlace?.label || currentRegion?.label || place || 'Любой'

  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={ddBtnCls} aria-expanded={open}
        aria-haspopup="listbox">
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(true) + ' break-words'}>{label}</span>
          <span className="break-words">{currentLabel}</span>
        </span>
        <DdArrow open={open} />
      </button>
      {/* Список живёт, пока открыт: закрытие (выбор пункта, повторное нажатие,
          Escape, клик вне панели) размонтирует его, и раскрытый регион вместе
          с поиском сбрасываются сами — фильтр открывается списком регионов */}
      {open && (
        <CityList label={label} regions={regions} place={place} regionKey={regionKey}
          onPlace={onPlace} onRegion={onRegion} onClear={onClear} onClose={onClose} t={t} />
      )}
    </div>
  )
}

/** Раскрытый список фильтра «Город»: поиск и регионы. Запрос и раскрытый
 *  регион живут здесь и пропадают вместе со списком (см. CityDropdown) */
function CityList({ label, regions, place, regionKey, onPlace, onRegion, onClear, onClose, t }: {
  label: string
  regions: CityFilterRegion[]
  place: string
  regionKey: string
  onPlace: (place: CityFilterPlace) => void
  onRegion: (region: CityFilterRegion) => void
  onClear: () => void
  onClose: () => void
  t: Dict
}) {
  const [query, setQuery] = useState('')
  // Раскрыт один регион, а не список: открытие другого сворачивает прежний,
  // повторное нажатие на открытый — сворачивает его самого
  const [expanded, setExpanded] = useState<string | null>(null)
  const q = nameKey(query)
  const matches = useMemo(
    () => (q
      ? regions.flatMap((region) => region.places
          .filter((p) => nameKey(p.label).includes(q))
          .map((p) => ({ region, place: p })))
      : []),
    [q, regions],
  )

  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key))
  const pick = (p: CityFilterPlace) => { onPlace(p); onClose() }
  const pickRegion = (r: CityFilterRegion) => { onRegion(r); onClose() }
  const clear = () => { onClear(); onClose() }

  return (
    <div
      className="absolute z-30 top-full left-0 right-0 mt-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain"
      role="group" aria-label={label}
    >
      {/* Поиск по названию населённого пункта: sticky — список под полем
          прокручивается, а поле остаётся на виду */}
      <div className="sticky top-0 z-10 p-2 bg-[var(--n15-charcoal)] border-b border-[var(--n15-gold)]/10">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t.catalog.citySearch} aria-label={t.catalog.citySearch}
          className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
      </div>
      <button type="button" onClick={clear}
        className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${!place && !regionKey ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
        Любой
      </button>
      {q ? (
        /* Поиск: найденные населённые пункты всех регионов, с подписью региона */
        matches.length ? (
          matches.map(({ region, place: found }) => (
            <button key={`${region.key}-${found.value}`} type="button" onClick={() => pick(found)}
              className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${found.value === place ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
              <span className="min-w-0 flex-1">
                <span className="block break-words">{found.label}</span>
                <span className="block text-[10px] text-[var(--n15-muted)]">{region.label}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="px-4 py-3 text-sm text-[var(--n15-muted)]">{t.catalog.nothingFound}</p>
        )
      ) : (
        regions.map((region) => {
          const isOpen = expanded === region.key
          return (
            <div key={region.key}>
              {/* Регион: нажатие раскрывает вложенный список населённых пунктов,
                  повторное — сворачивает его */}
              <button type="button" onClick={() => toggle(region.key)} aria-expanded={isOpen}
                className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${regionKey === region.key ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                <DdArrow open={isOpen} className="text-[9px] text-[var(--n15-gold)]" />
                <span className="min-w-0 flex-1 break-words">{region.label}</span>
              </button>
              {isOpen && (
                <div className="pb-1">
                  {region.places.map((p) => (
                    <button key={p.value} type="button" onClick={() => pick(p)}
                      className={`${cityRowSub} hover:bg-[var(--n15-gold)]/8 ${p.value === place ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                      <span className="min-w-0 flex-1 break-words">{p.label}</span>
                    </button>
                  ))}
                  {/* Региона без населённых пунктов (пустые «Другие регионы»)
                      эта строка не касается: фильтровать не по чему */}
                  {region.match.length > 0 && (
                    <button type="button" onClick={() => pickRegion(region)}
                      className={`${cityRowSub} hover:bg-[var(--n15-gold)]/8 ${regionKey === region.key ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-gold)]/80'}`}>
                      <span className="min-w-0 flex-1 break-words">{t.catalog.allRegionPlaces}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

interface CatalogFiltersProps {
  state: FiltersState
  onChange: (patch: Partial<FiltersState>) => void
  t: Dict
  /** Регионы фильтра «Город» — иерархия регион → населённые пункты со
   *  счётчиками объектов (см. loadCatalogCityFilter) */
  cityRegions: CityFilterRegion[]
  /** Допустимые значения фильтра «Город» — для сверки городов из ссылок */
  knownCities: readonly string[]
  /** Нажатие «Подобрать»: выдача обновляется сразу при смене фильтра,
   *  поэтому кнопка только показывает её (каталог прокручивает к списку) */
  onSubmit?: () => void
  /** Нажатие «Показать на карте»: каталог переключает вид выдачи на карту */
  onShowMap?: () => void
}

/** Ключи выпадающих списков панели — по одному на фильтр. Открытым может быть
 *  только один: ключ лежит в openId, остальные списки закрыты */
type DropdownId = 'type' | 'category' | 'houseType' | 'commercialType' | 'purchase' | 'city' | 'district'
  | 'cityDistrict' | 'locality' | 'snt' | 'heating' | 'building' | 'gas'

/** Переключатель-признак («Лифт», «Закрытый двор», «Индивидуальное
 *  отопление»): в базе это текстовые поля, а покупателю важен факт «есть».
 *  Нажатие ставит признак, повторное — снимает (условие см. в buildWhere) */
function FeatureToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      className={`px-3 py-2 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
        on
          ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
          : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
      }`}>
      {label}
    </button>
  )
}

/** Поле диапазона «от/до»: цена, площадь, жилая площадь, площадь кухни, этаж
 *  и этажность выглядят и работают одинаково — разметка одна на всех */
const rangeInputCls = 'w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

function RangeInputs({ from, to, onFrom, onTo, step = 'any', min = '0', fromHint = 'от', toHint = 'до' }: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  /** Шаг и минимум: у площади дробные, у этажа — целые от единицы */
  step?: string
  min?: string
  /** Подписи полей: у площади участка — «от, сотки» (см. areaPh) */
  fromHint?: string
  toHint?: string
}) {
  return (
    <div className="flex gap-2">
      <input type="number" min={min} step={step} placeholder={fromHint} value={from}
        onChange={(e) => onFrom(e.target.value)} className={rangeInputCls} />
      <input type="number" min={min} step={step} placeholder={toHint} value={to}
        onChange={(e) => onTo(e.target.value)} className={rangeInputCls} />
    </div>
  )
}

export default function CatalogFilters({ state, onChange, t, cityRegions, knownCities, onSubmit, onShowMap }: CatalogFiltersProps) {
  // Открытый выпадающий список панели. Один на все фильтры: открытие нового
  // закрывает прежний, повторное нажатие на кнопку — закрывает открытый.
  // Списки рисуются поверх друг друга, и несколько открытых окон сразу
  // перекрывали бы фильтры под ними
  const [openId, setOpenId] = useState<DropdownId | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggle = (id: DropdownId) => setOpenId((prev) => (prev === id ? null : id))
  const close = () => setOpenId(null)

  // Второй ряд панели («Показать ещё фильтры»): характеристики объекта. Ряд
  // раскрывается по кнопке, но если хоть один его фильтр задан — ссылкой из
  // каталога, блоком на главной или вручную — он показывается раскрытым:
  // работающих фильтров в свёрнутом виде быть не должно (см. hasMoreFilters).
  // Приход фильтра вместе с новым state — тот же приём, что в CatalogContent
  // («adjusting state when props change»): setState во время рендера, а не в
  // эффекте (правило react-hooks/set-state-in-effect)
  const [moreOpen, setMoreOpen] = useState(() => hasMoreFilters(state))
  const [prevState, setPrevState] = useState(state)
  if (prevState !== state) {
    setPrevState(state)
    if (!moreOpen && hasMoreFilters(state)) setMoreOpen(true)
  }

  // Закрытие открытого списка по Escape и по клику вне панели фильтров:
  // слушатели висят на документе, пока список открыт (клик по элементам
  // самого списка и по кнопкам фильтров панель считает своими)
  useEffect(() => {
    if (!openId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current
      if (panel && e.target instanceof Node && panel.contains(e.target)) return
      setOpenId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [openId])

  const typeOptions = Object.entries(t.typeLabels).map(([value, label]) => ({ value, label }))
  const categoryOptions = Object.entries(t.categoryLabels).map(([value, label]) => ({ value, label }))
  // Пункты зависят от выбранного района: показываем только его нас. пункты
  const localityOptions = state.district
    ? (LOCALITIES_BY_DISTRICT[state.district] || []).map((l) => ({ value: l, label: l }))
    : LOCALITY_OPTIONS.map((l) => ({ value: l, label: l }))
  // Единица площади действует только для участков; не выбрана — подразумеваются м²
  const isLand = state.category === 'land'
  const areaUnit: AreaUnit = isLand ? areaUnitOf(state.areaUnit) : 'sqm'
  // Задан ли хоть один фильтр — от него зависит кнопка «Сбросить». Пустая
  // строка у каждого поля означает «не выбран» (см. emptyFilters), поэтому
  // проверка одна на все поля и не разъедется со списком фильтров
  const hasFilters = Object.values(state).some(Boolean)
  // Подкатегории показываем у своей категории: «Тип дома» — у домовых
  // категорий (дом, таунхаус, дача, коттедж, часть дома), «Тип коммерции» —
  // у коммерции. Категория не выбрана — показываем оба: клиент может начать
  // поиск с подкатегории, категорию ей задаёт сам выбор (см. apply)
  const showHouseType = !state.category || isHouseCategoryCode(state.category)
  const showCommercialType = !state.category || state.category === 'commercial'
  const houseTypeOptions = HOUSE_TYPES.map((h) => ({ value: h.value, label: t.catalog.houseTypes[h.value] }))
  const commercialTypeOptions = COMMERCIAL_TYPES.map((c) => ({ value: c.value, label: t.catalog.commercialTypes[c.value] }))
  // Сколько фильтров второго ряда задано — видно на кнопке: свёрнутый ряд не
  // должен скрывать то, что уже фильтрует выдачу
  const moreCount = MORE_FILTER_KEYS.filter((k) => Boolean(state[k])).length
  // Варианты покупки есть только у продажи жилья и коммерции: при аренде и
  // участках фильтра нет (значение снимается в apply)
  const showPurchase = purchaseRelevant(state.type, state.category)
  // У участков регионов, кроме Осетии, нет: межрегиональных направлений у
  // земли не бывает (см. regionValuesFor)
  const shownRegions = useMemo(
    () => (isLand ? cityRegions.filter((r) => r.ossetian) : cityRegions),
    [isLand, cityRegions],
  )
  // Значение фильтра «Город» на кнопке: межрегиональный город лежит в city, а
  // населённый пункт Осетии — в locality (это то же поле адреса, что у фильтра
  // «Населённый пункт», см. city-filter.ts)
  const cityPlace = state.city || state.locality

  // Межрегиональный город (Москва, Химки…) и осетинские адресные фильтры
  // взаимоисключающие: выбран один — снимается другой. У участков город один —
  // Владикавказ, и он не спорит с районом, населённым пунктом и товариществом
  // (структура поиска участков: Владикавказ → населённые пункты →
  // товарищества) — такие фильтры рядом с ним остаются
  const dropInterregionalCity = (v: string): Partial<FiltersState> => (v && !isLand ? { city: '' } : {})

  /**
   * Район для населённого пункта Осетии: если пункт входит в выбранный район —
   * район не трогаем; если он лежит в одном районе республики — ставим его
   * (каскад, как в форме CRM); если в нескольких (одноимённые сёла) — снимаем,
   * чтобы фильтр не противоречил сам себе и не давал пустую выдачу.
   */
  const districtFor = (locality: string): Partial<FiltersState> => {
    if (state.district && (LOCALITIES_BY_DISTRICT[state.district] || []).includes(locality)) return {}
    const owners = DISTRICT_OPTIONS.filter((d) => (LOCALITIES_BY_DISTRICT[d] || []).includes(locality))
    return { district: owners.length === 1 ? owners[0] : '' }
  }

  /**
   * Выбор населённого пункта в фильтре «Город». Значение ложится в то поле
   * адреса, где оно живёт: межрегиональный город — в city, населённый пункт
   * Осетии — в locality. Остальные фильтры (сделка, тип, цена, комнаты,
   * площадь) не трогаются: меняется только место поиска.
   */
  const pickPlace = (place: CityFilterPlace) => {
    if (place.field === 'city') {
      // Межрегиональный город: осетинские адресные фильтры снимаются — они
      // взаимоисключающие
      apply({ city: place.value, cityRegion: '', district: '', cityDistrict: '', locality: '', snt: '' })
      return
    }
    apply({
      locality: place.value,
      city: '',
      cityRegion: '',
      cityDistrict: '',
      snt: '',
      ...districtFor(place.value),
    })
  }

  /**
   * «Все населённые пункты региона»: место поиска — регион целиком, поэтому
   * район, нас. пункт, товарищество и город снимаются (выбор в фильтре «Город»
   * один), а сделка, тип, цена и остальные фильтры остаются как были.
   */
  const pickRegion = (region: CityFilterRegion) =>
    apply({ cityRegion: region.key, city: '', district: '', cityDistrict: '', locality: '', snt: '' })

  /** «Любой» в фильтре «Город»: снимаем и город, и регион, и нас. пункт Осетии */
  const clearCity = () => apply({ city: '', cityRegion: '', locality: '' })

  /**
   * Смена единицы площади (кнопки «м²/сотки/га»): числа в полях «от/до»
   * пересчитываются, чтобы фильтр сохранял тот же диапазон площади —
   * 600 м² становятся 6 соток или 0,06 га, и наоборот. Вне участков
   * единица всегда м². Дробные значения — норма («5,5», «1,2»).
   */
  const convertArea = (text: string, from: AreaUnit, to: AreaUnit): string => {
    const v = parseAreaNumber(text)
    if (v == null) return text
    return areaNumberText(from === to ? v : sqmToUnit(unitToSqm(v, from), to))
  }

  const apply = (patch: Partial<FiltersState>) => {
    const out: Partial<FiltersState> = { ...patch }
    // Смена единицы: переводим уже введённые от/до в новую единицу
    if (patch.areaUnit && patch.areaUnit !== areaUnit) {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, areaUnit, patch.areaUnit) : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, areaUnit, patch.areaUnit) : state.areaMax
    }
    // Категория сменилась с участков: числа были в сотках/гектарах — вернём
    // в м², чтобы при следующем входе в «участки» они читались однозначно
    if (patch.category !== undefined && patch.category !== 'land' && areaUnit !== 'sqm') {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, areaUnit, 'sqm') : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, areaUnit, 'sqm') : state.areaMax
      out.areaUnit = 'sqm'
    }
    // Категория сменилась: у новой категории свой список городов и регионов
    // (у участков — только Владикавказ и Осетия), и прежний выбор в нём может
    // не значиться. Сбрасываем его, иначе в поле остаётся чужое значение, а
    // фильтр по нему молча ничего не находит. Остальные фильтры не трогаем
    if (patch.category !== undefined && patch.category !== state.category) {
      if (state.city && !cityValuesFor(patch.category, knownCities).includes(state.city)) out.city = ''
      if (state.cityRegion && !regionValuesFor(patch.category, cityRegions).includes(state.cityRegion)) {
        out.cityRegion = ''
      }
    }
    // Аренда или участки: вариантов покупки у таких объектов не бывает —
    // отметки снимаем, иначе фильтр остался бы в поле без действия (выдача
    // по нему была бы всегда пустой)
    const nextType = patch.type !== undefined ? patch.type : state.type
    const nextCategory = patch.category !== undefined ? patch.category : state.category
    if (!purchaseRelevant(nextType, nextCategory)) out.purchase = ''
    // Смена категории и подкатегорий: подкатегория дома и коммерции уточняет
    // категорию, а не спорит с ней. Выбрана другая категория — подкатегория,
    // которой она не подходит, снимается (иначе в поле остался бы выбор,
    // который ничего не фильтрует)
    if (patch.houseType === undefined && patch.category !== undefined && houseTypeCategory(state.houseType) !== patch.category) {
      out.houseType = ''
    }
    if (patch.commercialType === undefined && patch.category !== undefined && patch.category !== 'commercial') {
      out.commercialType = ''
    }
    // Кадастровый номер — фильтр только участков: у других категорий поля
    // нет, и условие по нему дало бы пустую выдачу. Сменившаяся категория
    // снимает номер вместе с полем
    if (patch.category !== undefined && patch.category !== 'land') {
      out.cadastral = ''
    }
    onChange(out)
  }

  /** Название единицы площади: подписи полей и плейсхолдеры «от, сотки» */
  const unitName = areaUnit === 'are' ? t.catalog.areName : areaUnit === 'ha' ? t.catalog.hectareName : t.catalog.sqm
  const areaPh = (edge: 'от' | 'до') => `${edge}, ${unitName}`
  // Участок: площадь объекта — это и есть площадь участка, поэтому подпись
  // «Площадь участка, сотки/га/м²» (у остальных категорий — просто «Площадь»)
  const areaLabel = isLand ? `${t.catalog.plotAreaLabel}, ${unitName}` : t.catalog.areaLabel
  const unitBtn = (u: AreaUnit) =>
    `px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
      areaUnit === u
        ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
        : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
    }`

  return (
    <div ref={panelRef} className="flex flex-wrap items-end gap-3 p-4 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
      <div className="w-48">
        <Dropdown label={t.catalog.dealLabel} value={state.type} options={typeOptions}
          open={openId === 'type'} onToggle={() => toggle('type')} onClose={close}
          onSelect={(v) => apply({ type: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.typeLabel} value={state.category} options={categoryOptions}
          open={openId === 'category'} onToggle={() => toggle('category')} onClose={close}
          onSelect={(v) => apply({ category: v })} />
      </div>
      {/* «Тип дома» — подкатегории домов (отдельные дома, дома с участком,
          дачи, коттеджи, таунхаусы, части домов). Подкатегория уточняет
          категорию, поэтому выбор ставит и её (см. houseTypeCategory), а
          сменившаяся на чужую категория снимает подкатегорию (см. apply) */}
      {showHouseType && (
        <div className="w-48">
          <Dropdown label={t.catalog.houseTypeLabel} value={state.houseType} options={houseTypeOptions}
            compactLabel
            open={openId === 'houseType'} onToggle={() => toggle('houseType')} onClose={close}
            onSelect={(v) => apply(v ? { houseType: v, category: houseTypeCategory(v) ?? '' } : { houseType: v })} />
        </div>
      )}
      {/* «Тип коммерции» — подкатегории категории «коммерческая»: готовый
          бизнес, офис, торговое помещение, свободное назначение, склад,
          производство. Категория у них одна, и выбор её ставит */}
      {showCommercialType && (
        <div className="w-56">
          <Dropdown label={t.catalog.commercialTypeLabel} value={state.commercialType} options={commercialTypeOptions}
            compactLabel
            open={openId === 'commercialType'} onToggle={() => toggle('commercialType')} onClose={close}
            onSelect={(v) => apply(v ? { commercialType: v, category: 'commercial' } : { commercialType: v })} />
        </div>
      )}
      {/* «Варианты покупки» — множественный выбор отметками: объект подходит,
          если у него отмечен любой из выбранных вариантов. У аренды и
          участков фильтра нет: вариантов покупки у них не бывает */}
      {showPurchase && (
        <div className="w-full sm:w-64">
          <PurchaseDropdown label={t.catalog.purchaseLabel} anyLabel={t.catalog.purchaseAny} value={state.purchase}
            open={openId === 'purchase'} onToggle={() => toggle('purchase')} onClose={close}
            onToggleOption={(v) => {
              const selected = purchaseValues(state.purchase)
              // Отметка уже стоит — снимаем её, иначе добавляем
              const next = selected.includes(v) ? selected.filter((code) => code !== v) : [...selected, v]
              // Порядок кодов — как в списке вариантов: один и тот же набор
              // отметок даёт одну и ту же строку фильтра (см. purchaseValues)
              apply({ purchase: purchaseValues(next.join(',')).join(',') })
            }}
            onClear={() => apply({ purchase: '' })} />
        </div>
      )}
      {/* «Город» — иерархия регионов: Осетия и межрегиональные направления Н15
          (Москва, Краснодарский край…). При открытии — только регионы, их
          населённые пункты показываются по стрелке, у каждого — счётчик
          объектов и строка «Все населённые пункты региона». Выбор города или
          региона снимает осетинские адресные фильтры — и наоборот. У участков
          межрегиональных направлений нет: в списке только Осетия (см.
          regionValuesFor), а район, населённые пункты и товарищества рядом с
          ней остаются — это и есть структура поиска участков */}
      <div className="w-full sm:w-64">
        <CityDropdown label={t.catalog.cityLabel} regions={shownRegions} place={cityPlace}
          regionKey={state.cityRegion} onPlace={pickPlace} onRegion={pickRegion} onClear={clearCity} t={t}
          open={openId === 'city'} onToggle={() => toggle('city')} onClose={close} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.districtLabel} value={state.district}
          options={DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
          open={openId === 'district'} onToggle={() => toggle('district')} onClose={close}
          onSelect={(v) => {
            const patch: Partial<FiltersState> = { district: v }
            // Если выбранный пункт не входит в новый район — сбрасываем его
            if (v && state.locality && !(LOCALITIES_BY_DISTRICT[v] || []).includes(state.locality)) {
              patch.locality = ''
            }
            apply({ ...patch, ...dropInterregionalCity(v) })
          }} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.cityDistrictLabel} value={state.cityDistrict}
          options={CITY_DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
          open={openId === 'cityDistrict'} onToggle={() => toggle('cityDistrict')} onClose={close}
          onSelect={(v) => apply({ cityDistrict: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-48">
        {/* «Населённый пункт» — длинная подпись: компактный шрифт, чтобы помещалась в одну строку */}
        <Dropdown label={t.catalog.localityLabel} value={state.locality}
          options={localityOptions} compactLabel
          open={openId === 'locality'} onToggle={() => toggle('locality')} onClose={close}
          onSelect={(v) => apply({ locality: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-56">
        {/* Садоводческие товарищества: список сгруппирован по категориям
            СНТ/СНО/ДНТ — товарищества живут только внутри Владикавказского
            городского округа и не относятся к районам республики */}
        <Dropdown label={t.catalog.sntLabel} value={state.snt} compactLabel
          groups={GARDENING_CATEGORY_ORDER
            .filter((c) => GARDENING_AREAS[c].length > 0)
            .map((c) => ({ label: c, options: GARDENING_AREAS[c].map((s) => ({ value: s, label: s })) }))}
          open={openId === 'snt'} onToggle={() => toggle('snt')} onClose={close}
          onSelect={(v) => apply({ snt: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-48">
        <div className={labelCls() + ' mb-1'}>{t.catalog.priceLabel}</div>
        <RangeInputs from={state.priceMin} to={state.priceMax}
          onFrom={(v) => apply({ priceMin: v })} onTo={(v) => apply({ priceMax: v })} />
      </div>
      <div className="w-52">
        {/* Площадь: диапазон «от/до». У участков это «Площадь участка» и
            единицу можно переключить на сотки или гектары (в базе площадь
            всё равно в м² — пересчитывает buildWhere), дробные значения
            разрешены. У остальных категорий — всегда м², кнопок нет. */}
        <div className={labelCls() + ' mb-1'}>{areaLabel}</div>
        <RangeInputs from={state.areaMin} to={state.areaMax} fromHint={areaPh('от')} toHint={areaPh('до')}
          onFrom={(v) => apply({ areaMin: v })} onTo={(v) => apply({ areaMax: v })} />
        {isLand && (
          <div className="flex gap-1 mt-2">
            <button type="button" onClick={() => apply({ areaUnit: 'sqm' })} className={unitBtn('sqm')}>
              {t.catalog.sqm}
            </button>
            <button type="button" onClick={() => apply({ areaUnit: 'are' })} className={unitBtn('are')}>
              {t.catalog.areName}
            </button>
            <button type="button" onClick={() => apply({ areaUnit: 'ha' })} className={unitBtn('ha')}>
              {t.catalog.hectareName}
            </button>
          </div>
        )}
      </div>
      <div>
        <div className={labelCls() + ' mb-1'}>{t.catalog.roomsLabel}</div>
        <div className="flex gap-1">
          {['', '1', '2', '3', '4'].map((r) => (
            <button key={r} type="button" onClick={() => apply({ rooms: state.rooms === r ? '' : r })}
              className={`px-3 py-2 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
                state.rooms === r
                  ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
                  : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
              }`}>
              {r === '' ? t.common.all : r === '4' ? '4+' : r}
            </button>
          ))}
        </div>
      </div>
      {/* ——— Второй ряд — характеристики объекта. Ширина во весь ряд:
          фильтров много, и в первом ряду им тесно; показывается по кнопке
          «Показать ещё фильтры» (см. moreOpen) ——— */}
      {moreOpen && (
        <div className="w-full flex flex-wrap items-end gap-3 pt-4 mt-1 border-t border-[var(--n15-gold)]/10">
          <div className="w-56">
            {/* Улица — свободный ввод: адреса агенты пишут руками, поэтому
                ищем вхождение, а не точное совпадение (см. buildWhere) */}
            <div className={labelCls() + ' mb-1'}>{t.catalog.streetLabel}</div>
            <input type="text" value={state.street} placeholder={t.catalog.streetPlaceholder}
              onChange={(e) => apply({ street: e.target.value })} className={rangeInputCls} />
          </div>
          {/* Кадастровый номер — только у участков: у земли номер участка
              хранится в cadastralNumber (у дома в этом поле номер строения,
              номер участка — отдельным полем, см. коллекцию objects), и
              фильтр ищет именно участки. Поиск точный: номер сверяется с
              найденным сервером списком id (см. buildWhere) */}
          {isLand && (
            <div className="w-56">
              <div className={labelCls(true) + ' mb-1'}>{t.catalog.cadastralLabel}</div>
              <input type="text" value={state.cadastral} placeholder={t.catalog.cadastralPlaceholder}
                inputMode="numeric" onChange={(e) => apply({ cadastral: e.target.value })} className={rangeInputCls} />
            </div>
          )}
          <div className="w-44">
            <div className={labelCls() + ' mb-1'}>{t.catalog.livingAreaLabel}</div>
            <RangeInputs from={state.livingAreaMin} to={state.livingAreaMax}
              onFrom={(v) => apply({ livingAreaMin: v })} onTo={(v) => apply({ livingAreaMax: v })} />
          </div>
          <div className="w-44">
            <div className={labelCls() + ' mb-1'}>{t.catalog.kitchenAreaLabel}</div>
            <RangeInputs from={state.kitchenAreaMin} to={state.kitchenAreaMax}
              onFrom={(v) => apply({ kitchenAreaMin: v })} onTo={(v) => apply({ kitchenAreaMax: v })} />
          </div>
          {/* Этаж и этажность — диапазоны «от/до»: этаж у квартиры, комнаты и
              гаража, этажность у дома и у дома квартиры. Числа целые, ввод
              фильтруется в buildWhere (floorNumber) */}
          <div className="w-40">
            <div className={labelCls() + ' mb-1'}>{t.catalog.floorLabel}</div>
            <RangeInputs from={state.floorMin} to={state.floorMax} step="1" min="1"
              onFrom={(v) => apply({ floorMin: v })} onTo={(v) => apply({ floorMax: v })} />
          </div>
          <div className="w-40">
            <div className={labelCls() + ' mb-1'}>{t.catalog.floorsLabel}</div>
            <RangeInputs from={state.floorsMin} to={state.floorsMax} step="1" min="1"
              onFrom={(v) => apply({ floorsMin: v })} onTo={(v) => apply({ floorsMax: v })} />
          </div>
          {/* Отопление: список из четырёх значений словаря (t.object.heatingOptions),
              в базе поле текстовое — совпадение ищется по фрагменту (HEATING_FILTERS) */}
          <div className="w-48">
            <Dropdown label={t.catalog.heatingLabel} value={state.heating} compactLabel
              options={HEATING_FILTERS.map((h) => ({ value: h.value, label: t.object.heatingOptions[h.value] }))}
              open={openId === 'heating'} onToggle={() => toggle('heating')} onClose={close}
              onSelect={(v) => apply({ heating: v })} />
          </div>
          {/* Материал дома и газ — такие же текстовые поля (BUILDING_FILTERS,
              GAS_FILTERS): «кирпич» найдёт «Кирпичный» и «кирпич» */}
          <div className="w-48">
            <Dropdown label={t.catalog.buildingLabel} value={state.building} compactLabel
              options={BUILDING_FILTERS.map((b) => ({ value: b.value, label: t.catalog.buildingOptions[b.value] }))}
              open={openId === 'building'} onToggle={() => toggle('building')} onClose={close}
              onSelect={(v) => apply({ building: v })} />
          </div>
          <div className="w-44">
            <Dropdown label={t.catalog.gasLabel} value={state.gas} compactLabel
              options={GAS_FILTERS.map((g) => ({ value: g.value, label: t.catalog.gasOptions[g.value] }))}
              open={openId === 'gas'} onToggle={() => toggle('gas')} onClose={close}
              onSelect={(v) => apply({ gas: v })} />
          </div>
          {/* Признаки объекта — переключатели «есть»: у каждого свой фрагмент
              значения в текстовом поле (см. buildWhere) */}
          <div>
            <div className={labelCls() + ' mb-1'}>{t.catalog.featuresLabel}</div>
            <div className="flex flex-wrap gap-1">
              <FeatureToggle label={t.catalog.individualHeatingLabel} on={state.individualHeating === '1'}
                onToggle={() => apply({ individualHeating: state.individualHeating === '1' ? '' : '1' })} />
              <FeatureToggle label={t.catalog.elevatorLabel} on={state.elevator === '1'}
                onToggle={() => apply({ elevator: state.elevator === '1' ? '' : '1' })} />
              <FeatureToggle label={t.catalog.closedYardLabel} on={state.closedYard === '1'}
                onToggle={() => apply({ closedYard: state.closedYard === '1' ? '' : '1' })} />
            </div>
          </div>
        </div>
      )}
      {/* Кнопки панели: подобрать (показать выдачу), свернуть/раскрыть второй
          ряд, посмотреть выдачу на карте и сбросить всё. Сброс — у правого
          края: это не действие поиска, а его отмена */}
      <div className="w-full flex flex-wrap items-center gap-3 pt-4 mt-1 border-t border-[var(--n15-gold)]/10">
        <button type="button" onClick={onSubmit}
          className="px-6 py-3 text-xs uppercase tracking-wider bg-[var(--n15-gold)] text-[var(--n15-black)] hover:bg-[var(--n15-gold)]/90 transition-colors cursor-pointer">
          {t.catalog.submitFilters}
        </button>
        <button type="button" onClick={() => setMoreOpen((prev) => !prev)} aria-expanded={moreOpen}
          className="px-4 py-3 text-xs uppercase tracking-wider border border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)] transition-colors cursor-pointer">
          {moreOpen ? t.catalog.filtersHide : t.catalog.filtersMore}{moreCount ? ` (${moreCount})` : ''}
        </button>
        <button type="button" onClick={onShowMap}
          className="px-4 py-3 text-xs uppercase tracking-wider border border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)] transition-colors cursor-pointer">
          {t.catalog.showOnMap}
        </button>
        {hasFilters && (
          <button type="button" onClick={() => onChange(emptyFilters)}
            className="ml-auto text-xs text-[var(--n15-gold)] underline uppercase tracking-wider">
            {t.catalog.resetFilters}
          </button>
        )}
      </div>
    </div>
  )
}

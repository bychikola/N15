// Категории объектов — единый справочник: схема коллекции Objects
// (select «Категория»), фильтры и чипы каталога, параметры подбора на главной
// и форма объекта в CRM. Значения — как в базе (поле objects.category).
//
// Порядок значений совпадает с порядком enum в базе: новые категории
// дописываются в конец списка, иначе drizzle-push пытается пересобрать
// enum-тип (ALTER TYPE ... ADD VALUE он не умеет) — см. memory
// payload-schema-autopush. Русские подписи дублируются в словаре
// (t.categoryLabels) — на сайте показываются они, здесь — для схемы и CRM.
export const OBJECT_CATEGORIES = [
  { value: 'apartment', label: 'Квартира' },
  { value: 'house', label: 'Дом' },
  { value: 'townhouse', label: 'Таунхаус' },
  { value: 'commercial', label: 'Коммерческая' },
  { value: 'land', label: 'Участок' },
  { value: 'room', label: 'Комната' },
  { value: 'garage', label: 'Гараж' },
  { value: 'dacha', label: 'Дача' },
  { value: 'cottage', label: 'Коттедж' },
  { value: 'part_house', label: 'Часть дома' },
] as const

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number]['value']

export const OBJECT_CATEGORY_VALUES: readonly string[] = OBJECT_CATEGORIES.map((c) => c.value)

/** Подпись категории по коду: неизвестный код показываем как есть */
export const categoryLabel = (value: string): string =>
  OBJECT_CATEGORIES.find((c) => c.value === value)?.label || value

/**
 * Категории с земельным участком: дом, таунхаус, коммерция (у базы отдыха
 * площадь здания и площадь земли — разные величины), а также коттедж, дача и
 * часть дома — у них участок вокруг дома. У квартиры, комнаты и гаража
 * участка нет, у земельного участка площадь самого объекта хранится
 * в «Площади».
 */
export const isPlotCategoryCode = (category: unknown): boolean =>
  category === 'house' || category === 'townhouse' || category === 'commercial' ||
  category === 'cottage' || category === 'dacha' || category === 'part_house'

/**
 * Домовые категории — у них площадь объекта это площадь дома, этажность
 * считается этажами дома, а поэтажные описания помещений имеют смысл.
 * Квартира, комната и гараж — «этажные»: у них виден этаж дома.
 */
export const isHouseCategoryCode = (category: unknown): boolean =>
  category === 'house' || category === 'townhouse' || category === 'cottage' ||
  category === 'dacha' || category === 'part_house'

/**
 * «Частный дом» для формы CRM: дом, дача, коттедж и часть дома — у них блок
 * кадастровых данных дома и подпись номера дома (строения) как у частного
 * дома. Таунхаус сюда не входит: у него свой блок «Кадастровый номер».
 */
export const isPrivateHouseCode = (category: unknown): boolean =>
  category === 'house' || category === 'cottage' || category === 'dacha' || category === 'part_house'

/**
 * Жилые категории: у них бывает количество комнат. У гаража, участка и
 * коммерции комнат нет — в фильтре «Комнаты» такие объекты не показываются.
 */
export const isLivingCategoryCode = (category: unknown): boolean =>
  category === 'apartment' || category === 'room' || isHouseCategoryCode(category)

/**
 * Подкатегории домов для каталога: отдельные дома, дома с участком, дачи,
 * коттеджи, таунхаусы и части домов.
 *
 * Отдельной категории «дом с участком» в базе нет: это дом, у которого
 * заполнена площадь участка (plotArea) — участок вокруг дома. Поэтому
 * подкатегория описывает условие фильтра, а не значение поля category:
 * у остальных пунктов списка оно одноимённо категории объекта.
 *
 * Подписи — для схемы и CRM; на сайте показываются из словаря
 * (t.catalog.houseTypes).
 */
export const HOUSE_TYPES = [
  { value: 'house', label: 'Отдельные дома', category: 'house', plot: false },
  { value: 'house_plot', label: 'Дома с участком', category: 'house', plot: true },
  { value: 'dacha', label: 'Дачи', category: 'dacha', plot: false },
  { value: 'cottage', label: 'Коттеджи', category: 'cottage', plot: false },
  { value: 'townhouse', label: 'Таунхаусы', category: 'townhouse', plot: false },
  { value: 'part_house', label: 'Части домов', category: 'part_house', plot: false },
] as const

export type HouseType = (typeof HOUSE_TYPES)[number]['value']

/** Коды подкатегорий домов — сверка значений из ссылок и запросов */
export const HOUSE_TYPE_VALUES: readonly string[] = HOUSE_TYPES.map((t) => t.value)

/** Подкатегория дома по коду: null — код чужой (мусорный параметр ссылки) */
export const houseTypeOf = (value: string): (typeof HOUSE_TYPES)[number] | null =>
  HOUSE_TYPES.find((t) => t.value === value) ?? null

/**
 * Категория объекта по подкатегории дома: «дом с участком» — та же категория
 * «дом», у остальных пунктов она своя. Нужна фильтру: выбранная подкатегория
 * и поле category в базе не должны спорить друг с другом.
 */
export const houseTypeCategory = (value: string): string | null => houseTypeOf(value)?.category ?? null

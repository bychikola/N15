/**
 * Подкатегории коммерческой недвижимости: готовый бизнес, офис, торговое
 * помещение, помещение свободного назначения, склад и производственное
 * помещение.
 *
 * Хранятся в отдельном поле объекта (Objects.commercialType) — поле показывается
 * только у категории «коммерческая». Список один на всё: схема коллекции, форма
 * CRM и фильтр каталога берут коды и правила отсюда, подписи на сайте — из
 * словаря (t.catalog.commercialTypes).
 *
 * Категория объекта при выборе подкатегории остаётся «коммерческая»: подтип её
 * уточняет, а не заменяет.
 */

/** Подкатегория коммерции: код в базе и подпись для CRM (админка и форма
 *  работают по-русски; сайт переводит подписи сам) */
export const COMMERCIAL_TYPES = [
  { value: 'business', label: 'Готовый бизнес' },
  { value: 'office', label: 'Офис' },
  { value: 'retail', label: 'Торговое помещение' },
  { value: 'freePurpose', label: 'Помещение свободного назначения' },
  { value: 'warehouse', label: 'Склад' },
  { value: 'industrial', label: 'Производственное помещение' },
] as const

export type CommercialType = (typeof COMMERCIAL_TYPES)[number]['value']

/** Все коды подкатегорий — сверка значений из ссылок и запросов (мусорные
 *  отбрасываем, как у прочих select-фильтров каталога) */
export const COMMERCIAL_TYPE_VALUES: readonly string[] = COMMERCIAL_TYPES.map((t) => t.value)

export const isCommercialType = (v: unknown): v is CommercialType =>
  typeof v === 'string' && COMMERCIAL_TYPE_VALUES.includes(v)

/** Подпись подкатегории по коду: неизвестный код показываем как есть */
export const commercialTypeLabel = (value: string): string =>
  COMMERCIAL_TYPES.find((t) => t.value === value)?.label || value

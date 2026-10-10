/**
 * Объекты новостройки — машино-места и коммерческие помещения в составе ЖК.
 *
 * Владелец (администратор) заводит их прямо в карточке комплекса в CRM
 * (см. CrmDevelopers.tsx, ComplexUnitsEditor.tsx). Это обычные карточки
 * коллекции objects с привязкой к застройщику и комплексу: характеристики,
 * цена, фото и планировка переиспользуют поля объекта, отдельно заведены
 * только статус готовности и условия оплаты (см. Objects.unitStatus и
 * Objects.paymentTerms). Так машино-место или помещение попадает в общую
 * подборку застройщика и каталог без второй сущности-дубля.
 *
 * Здесь — общий список категорий и статусов: схема коллекции, форма CRM и
 * показ на сайте берут коды и подписи отсюда.
 */

/** Категории, которыми описываются объекты новостройки в ЖК */
export const UNIT_CATEGORIES = ['garage', 'commercial'] as const

export type UnitCategory = (typeof UNIT_CATEGORIES)[number]

/** Категория объекта — машино-место (гараж) или коммерческое помещение */
export const isUnitCategory = (value: unknown): value is UnitCategory =>
  value === 'garage' || value === 'commercial'

/** Статус готовности объекта новостройки: код в базе и подпись для CRM
 *  (админка и форма работают по-русски; сайт переводит подписи сам) */
export const UNIT_STATUSES = [
  { value: 'available', label: 'Доступен' },
  { value: 'reserved', label: 'Забронирован' },
  { value: 'sold', label: 'Реализован' },
] as const

export type UnitStatus = (typeof UNIT_STATUSES)[number]['value']

/** Все коды статусов — сверка значений из запросов (мусорные отбрасываем) */
export const UNIT_STATUS_VALUES: readonly string[] = UNIT_STATUSES.map((s) => s.value)

export const isUnitStatus = (v: unknown): v is UnitStatus =>
  typeof v === 'string' && UNIT_STATUS_VALUES.includes(v)

/** Подпись статуса по коду: неизвестный код показываем как есть */
export const unitStatusLabel = (value: string): string =>
  UNIT_STATUSES.find((s) => s.value === value)?.label || value

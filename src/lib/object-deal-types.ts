/**
 * Типы сделки объекта — поле type коллекции objects. Общий справочник для
 * схемы коллекции, формы CRM и правил «что к какому типу применимо»: список
 * и порядок значений в форме совпадают со значениями в базе.
 *
 * Кроме продажи и долгосрочной аренды есть посуточная аренда («daily»): это
 * отдельный тип, а не пометка к аренде — у неё свой набор условий (стоимость
 * за сутки, число гостей, время заезда и выезда, залог и сборы). Поля условий
 * живут в группе dailyRent коллекции Objects и показываются только у этого
 * типа; стоимость суток хранится в общем поле price (как цена у продажи и
 * аренды) — так карточка каталога, фильтры и оценка читают её без развилок.
 *
 * Порядок значений совпадает с порядком enum в базе: новый тип дописывается
 * в конец списка, иначе drizzle-push пытается пересобрать enum-тип
 * (см. src/lib/object-categories.ts).
 */

export const OBJECT_DEAL_TYPES = [
  { value: 'sale', label: 'Продажа' },
  { value: 'rent', label: 'Аренда' },
  // Посуточная аренда — новый тип, дописан в конец (см. шапку файла)
  { value: 'daily', label: 'Посуточная аренда' },
] as const

export type ObjectDealType = (typeof OBJECT_DEAL_TYPES)[number]['value']

/** Все коды типов сделки — сверка значений из запросов и справочника формы */
export const OBJECT_DEAL_TYPE_VALUES: readonly string[] = OBJECT_DEAL_TYPES.map((t) => t.value)

export const isObjectDealType = (value: unknown): value is ObjectDealType =>
  typeof value === 'string' && OBJECT_DEAL_TYPE_VALUES.includes(value)

/** Подпись типа сделки по коду: неизвестный код показываем как есть */
export const dealTypeLabel = (value: string): string =>
  OBJECT_DEAL_TYPES.find((t) => t.value === value)?.label || value

/** Посуточная аренда: у объекта с таким типом показаны условия проживания */
export const isDailyRent = (type?: string | null): boolean => type === 'daily'

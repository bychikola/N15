/**
 * Происхождение объекта — откуда карточка пришла в базу (поле origin
 * коллекции objects). Общий справочник для формы CRM и настроек коллекции:
 * список и порядок значений в форме совпадают со значениями в базе.
 *
 * Пометка служебная: посетителю источник объекта не показывается, в
 * публичном API поля нет — его закрывает полевой доступ коллекции
 * (privateFieldsAccess в Objects.ts, проверка — scripts/check-object-privacy.mjs).
 * Значение необязательное: у карточек, заведённых до появления поля,
 * происхождение остаётся неизвестным.
 */
export const OBJECT_ORIGINS = [
  { value: 'n15', label: 'Н15 (свой объект)' },
  { value: 'owner', label: 'Собственник' },
  { value: 'nmarket', label: 'NMarket.PRO' },
  { value: 'developer', label: 'Застройщик' },
  { value: 'partner', label: 'Партнёр' },
  { value: 'other', label: 'Другая площадка' },
] as const

export type ObjectOrigin = (typeof OBJECT_ORIGINS)[number]['value']

/** Значение поля origin из ответа API — один из кодов справочника */
export const isObjectOrigin = (value: unknown): value is ObjectOrigin =>
  typeof value === 'string' && OBJECT_ORIGINS.some((origin) => origin.value === value)

/**
 * Владелец карточки объекта: личный агент или офис Н15 (поле ownership
 * коллекции objects).
 *
 * Объект офиса — карточка агентства: личного ответственного агента у неё нет,
 * на публичной странице вместо имени сотрудника показывается агентство
 * («Агентство недвижимости Н15»), а кнопки «Позвонить» и «WhatsApp» ведут на
 * основной контакт офиса (см. src/lib/call-routing.ts). Кто фактически завёл
 * карточку, администратор видит по полю createdBy.
 *
 * Справочник общий: форма CRM, фильтр списка объектов и разметка карточки
 * читают одни и те же коды — подписи и значения не разъезжаются. Значение
 * необязательное: у карточек, заведённых до появления поля, владелец считается
 * «Агент» (agent) — поведение прежнее.
 */
export const OBJECT_OWNERSHIPS = [
  { value: 'agent', label: 'Агент' },
  { value: 'office', label: 'Офис Н15' },
] as const

export type ObjectOwnership = (typeof OBJECT_OWNERSHIPS)[number]['value']

/** Значение поля ownership из документа или ответа API — код справочника */
export const isObjectOwnership = (value: unknown): value is ObjectOwnership =>
  typeof value === 'string' && OBJECT_OWNERSHIPS.some((o) => o.value === value)

/**
 * Объект принадлежит офису Н15: владелец — агентство, а не конкретный агент.
 * Всё остальное (включая отсутствующее значение у старых карточек) — «Агент».
 */
export const isOfficeOwnership = (value: unknown): boolean => value === 'office'

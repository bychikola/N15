/**
 * «Застройщики» — справочник компаний-застройщиков и их жилых комплексов
 * (коллекции developers и complexes, раздел CRM /crm/developers).
 *
 * Справочник внутренний: карточки читают только сотрудники CRM (застройщик
 * выбирается в карточке объекта), а контакт ответственного представителя —
 * только администратор (полевой доступ в коллекции Developers). Публичных
 * страниц застройщиков на этом этапе нет, в публичный API сведения не
 * отдаются. Персональных данных храним минимум — имя представителя и его
 * служебные контакты (ст. 5 152-ФЗ).
 *
 * Модуль без зависимостей (как src/lib/object-origins.ts): те же подписи
 * используют и коллекция админки, и интерфейс CRM — значения не разъезжаются.
 */

export const DEVELOPER_STATUS_OPTIONS = [
  { label: 'Активный', value: 'active' },
  { label: 'Архивный', value: 'archived' },
] as const

export type DeveloperStatus = (typeof DEVELOPER_STATUS_OPTIONS)[number]['value']

/** Подписи статусов застройщика для списков и карточек CRM */
export const DEVELOPER_STATUS_LABELS: Record<DeveloperStatus, string> = {
  active: 'Активный',
  archived: 'Архивный',
}

/** Статус застройщика из ответа API: неизвестное значение читаем активным */
export const developerStatusOf = (value: unknown): DeveloperStatus =>
  value === 'archived' ? 'archived' : 'active'

/** Является ли статус архивным (архивных не предлагаем в карточке объекта) */
export const isDeveloperArchived = (value: unknown): boolean =>
  developerStatusOf(value) === 'archived'

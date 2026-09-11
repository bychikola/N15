/**
 * Раздел CRM «Архив объектов» — общие данные модуля.
 *
 * Объект не удаляется из базы: кнопка «Переместить в архив» карточки CRM
 * переводит его в статус archived и записывает в скрытую группу archive
 * причину, комментарий, дату и автора переноса, а также прежний статус —
 * по нему объект возвращается из архива («Восстановить объект»). Архивные
 * объекты скрыты с сайта, из каталога, поиска и с площадок публикации,
 * но остаются видны сотрудникам в разделе /crm/archive.
 *
 * Здесь только константы и типы (файл импортируют и клиентские компоненты,
 * и коллекция Objects — без серверных зависимостей).
 */

/** Причины переноса объекта в архив (значение — код, label — подпись в CRM) */
export const ARCHIVE_REASONS = [
  { value: 'ownerRefused', label: 'Собственник передумал продавать' },
  { value: 'postponed', label: 'Продажа отложена' },
  { value: 'sold', label: 'Объект продан' },
  { value: 'withdrawn', label: 'Объект снят с продажи' },
  { value: 'other', label: 'Другая причина' },
] as const

export type ArchiveReason = (typeof ARCHIVE_REASONS)[number]['value']

/** Код — одна из причин архива? */
export const isArchiveReason = (v: unknown): v is ArchiveReason =>
  typeof v === 'string' && ARCHIVE_REASONS.some((r) => r.value === v)

/** Подпись причины по коду (неизвестный код показываем как «Другая причина») */
export const archiveReasonLabel = (v?: string | null): string =>
  ARCHIVE_REASONS.find((r) => r.value === v)?.label || ARCHIVE_REASONS[ARCHIVE_REASONS.length - 1].label

/** Событие журнала архива: перенос или восстановление */
export type ArchiveEvent = 'archive' | 'restore'

/** Одна запись истории изменений архива */
export interface ArchiveLogEntry {
  at?: string | null
  event?: ArchiveEvent | null
  /** Причина на момент события (у восстановления — по какой причине лежал объект) */
  reason?: string | null
  comment?: string | null
  by?: string | null
}

/** Группа archive документа (скрытая, читают только сотрудники) */
export interface ArchiveGroup {
  reason?: string | null
  comment?: string | null
  archivedAt?: string | null
  archivedBy?: string | null
  /** Статус до переноса — в него объект возвращает кнопка «Восстановить» */
  previousStatus?: string | null
  log?: ArchiveLogEntry[] | null
}

/** Статусы, в которые допустимо возвращать объект из архива */
export const RESTORABLE_STATUSES = ['draft', 'published'] as const

/** Сколько последних записей истории храним в карточке архива */
export const ARCHIVE_LOG_LIMIT = 50

/** Безопасное чтение группы архива из документа (REST/local API) */
export const archiveFromDoc = (o: Record<string, unknown>): ArchiveGroup => {
  const a = o.archive as ArchiveGroup | undefined
  return a && typeof a === 'object' ? a : {}
}

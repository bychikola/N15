/**
 * Раздел CRM «Архив объектов» — серверные операции.
 *
 * Объект из базы не удаляется: «Переместить в архив» переводит его в статус
 * archived и записывает причину, комментарий, дату, автора и прежний статус
 * (журнал группы archive ведёт хук коллекции Objects — см. archiveTransition
 * Hook в src/payload/collections/Objects.ts). Архивные объекты скрыты с сайта
 * (каталог, поиск, прямые ссылки) и снимаются с площадок публикации
 * (src/lib/publish-service.ts), но остаются видны сотрудникам в /crm/archive.
 *
 * Права: агент управляет архивом только своих объектов (профиль агента в
 * поле agent привязан к его учётной записи, agents.user), администратор —
 * любыми; «Удалить окончательно» доступно только администратору.
 */
import type { Payload } from 'payload'
import { archiveFromDoc, RESTORABLE_STATUSES, type ArchiveGroup } from './archive'

export interface ArchiveActor {
  id: number
  name: string
  email: string
  role: string
}

/** Строка списка архива (сервер → клиентская часть раздела) */
export interface ArchiveRow {
  id: number
  title: string
  category: string
  price: number | null
  /** Миниатюра (главное фото) */
  thumb?: string
  /** Адрес одной строкой */
  address: string
  /** Ответственный агент */
  agentId: number | null
  agentName: string
  archive: ArchiveGroup
  /** Дата переноса (архивная), запасная — дата последнего изменения */
  at: string
}

export interface ArchiveResult {
  ok: boolean
  error?: string
  /** Статус объекта после операции */
  status?: string
  archive?: ArchiveGroup
}

/** id профилей агентов пользователя (в архиве агент работает со своими объектами) */
async function myAgentIds(payload: Payload, userId: number): Promise<Set<number>> {
  const ids = new Set<number>()
  try {
    const { docs } = await payload.find({
      collection: 'agents',
      where: { user: { equals: userId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const agent of docs) {
      if (typeof agent.id === 'number') ids.add(agent.id)
    }
  } catch {
    // профилей нет — своих объектов у сотрудника тоже нет
  }
  return ids
}

/** id агента из relationship-поля документа (id или объект) */
const agentIdOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/** Может ли сотрудник распоряжаться архивом этого объекта (см. шапку файла) */
export async function canManageArchive(
  payload: Payload,
  actor: ArchiveActor,
  doc: Record<string, unknown>,
): Promise<boolean> {
  if (actor.role === 'admin') return true
  if (actor.role !== 'agent') return false
  const agentId = agentIdOf(doc.agent)
  if (agentId == null) return false
  const mine = await myAgentIds(payload, actor.id)
  return mine.has(agentId)
}

/** Документ объекта или null (с проверкой прав на архив) */
async function manageableDoc(
  payload: Payload,
  objectId: number,
  actor: ArchiveActor,
): Promise<{ doc?: Record<string, unknown>; error?: string }> {
  // findByID на удалённом объекте бросает NotFound — в карточке архива это
  // обычная ситуация (объект удалили в другой вкладке), поэтому не 500,
  // а понятное сообщение (см. архивный раздел CRM)
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return { error: 'Объект не найден' }
  const d = doc as unknown as Record<string, unknown>
  if (!(await canManageArchive(payload, actor, d))) {
    return { error: 'Перемещать и восстанавливать можно только свои объекты' }
  }
  return { doc: d }
}

/**
 * «Переместить в архив»: объект остаётся в базе, меняется только статус.
 * Снятие объявлений с сайта и площадок выполняет модуль публикации (хук
 * afterChange видит переход в archived и снимает опубликованное).
 */
export async function archiveObject(
  payload: Payload,
  objectId: number,
  actor: ArchiveActor,
  input: { reason?: string; comment?: string },
): Promise<ArchiveResult> {
  const { doc, error } = await manageableDoc(payload, objectId, actor)
  if (!doc) return { ok: false, error }
  if (doc.status === 'archived') {
    return { ok: false, error: 'Объект уже в архиве', status: 'archived', archive: archiveFromDoc(doc) }
  }

  const updated = await payload.update({
    collection: 'objects',
    id: objectId,
    data: {
      status: 'archived',
      archive: {
        reason: input.reason,
        comment: (input.comment || '').trim(),
      },
    },
    depth: 0,
    overrideAccess: true,
    // Автор переноса: имя и почта сотрудника попадают в историю изменений
    user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
  })
  const d = updated as unknown as Record<string, unknown>
  return { ok: true, status: 'archived', archive: archiveFromDoc(d) }
}

/**
 * «Восстановить объект»: возврат в прежний статус (previousStatus) — объект
 * снова доступен для публикации; если прежний статус не сохранён, вернётся
 * черновиком. Причина и комментарий остаются в истории изменений.
 */
export async function restoreObject(
  payload: Payload,
  objectId: number,
  actor: ArchiveActor,
): Promise<ArchiveResult> {
  const { doc, error } = await manageableDoc(payload, objectId, actor)
  if (!doc) return { ok: false, error }
  if (doc.status !== 'archived') {
    return { ok: false, error: 'Объект не в архиве', status: doc.status as string, archive: archiveFromDoc(doc) }
  }

  const archive = archiveFromDoc(doc)
  const prev = archive.previousStatus
  const target = prev && (RESTORABLE_STATUSES as readonly string[]).includes(prev) ? prev : 'draft'

  const updated = await payload.update({
    collection: 'objects',
    id: objectId,
    data: { status: target },
    depth: 0,
    overrideAccess: true,
    user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
  })
  const d = updated as unknown as Record<string, unknown>
  return { ok: true, status: target, archive: archiveFromDoc(d) }
}

/**
 * «Удалить окончательно» — только администратор: объект исчезает из базы
 * без возможности восстановления. Объявления на площадках снимает хук
 * afterDelete (src/lib/publish-service.ts).
 */
export async function deleteObjectForever(
  payload: Payload,
  objectId: number,
  actor: ArchiveActor,
): Promise<ArchiveResult> {
  if (actor.role !== 'admin') {
    return { ok: false, error: 'Удалить объект навсегда может только администратор' }
  }
  // Объект, удалённый в другой вкладке, — не ошибка сервера (см. manageableDoc)
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return { ok: false, error: 'Объект не найден' }

  await payload.delete({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
  return { ok: true }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Адрес объекта одной строкой — для поиска и показа в списке архива */
export function archiveAddressLine(doc: Record<string, unknown>): string {
  const addr = (doc.address || {}) as Record<string, unknown>
  const parts = [
    str(addr.city),
    str(addr.locality) !== str(addr.city) ? str(addr.locality) : '',
    str(addr.snt),
    str(addr.street),
    str(addr.house) ? `д. ${str(addr.house)}` : '',
    str(addr.apartment) ? `кв. ${str(addr.apartment)}` : '',
  ]
  return parts.filter(Boolean).join(', ')
}

/**
 * Список архива для раздела «Архив объектов»: архивные объекты с агентом,
 * причиной, датой, комментарием и историей изменений (свежие переносы —
 * сверху). Поиск и фильтры выполняет клиентская часть раздела.
 */
export async function loadArchiveBoard(payload: Payload, limit = 500): Promise<ArchiveRow[]> {
  const { docs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'archived' } },
    sort: '-updatedAt',
    limit,
    depth: 1,
    overrideAccess: true,
  })

  const rows = (docs as unknown as Record<string, unknown>[]).map((o) => {
    const archive = archiveFromDoc(o)
    const img = o.primaryImage as { url?: string } | undefined
    const agent = o.agent as { id?: number; name?: string } | undefined
    const agentId = agentIdOf(o.agent)
    return {
      id: o.id as number,
      title: str(o.title) || `Объект #${String(o.id)}`,
      category: str(o.category),
      price: typeof o.price === 'number' ? o.price : null,
      thumb: img?.url,
      address: archiveAddressLine(o),
      agentId,
      agentName: str(agent?.name),
      archive,
      at: archive.archivedAt || str(o.updatedAt),
    }
  })

  // Свежие переносы сверху (date-поле Payload может прийти с точностью до
  // секунды — сортируем по факту, а не только запросом)
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

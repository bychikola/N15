/**
 * Права на объект в CRM — общее правило для коллекции Objects, маршрутов API
 * и серверных сервисов (архив, публикация, площадки, данные о доме).
 *
 * «Свой» объект сотрудника — тот, где он ответственный агент (в карточке
 * стоит профиль из коллекции agents, привязанный к его учётной записи,
 * agents.user = пользователь) или который он завёл (createdBy — его учётная
 * запись). Администратору доступны любые объекты.
 *
 * Раньше «своим» считался только объект с профилем агента в карточке, и
 * объект, заведённый агентом, терялся для него после передачи другому
 * агенту; теперь у карточки есть автор (createdBy, см. Objects), и правило
 * одно для интерфейса и для прямых запросов к API.
 */

import type { Where } from 'payload'

/** Текущий пользователь в доступе/хуке: id и роль (клиент, агент, админ) */
export type ObjectActor = { id?: number | string; role?: string } | null | undefined

/** id из relationship-поля: id либо объект с id; null — связи нет */
export const relationIdOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/**
 * Свой ли объект сотруднику. agentIds — профили агентов этого пользователя
 * (коллекция agents, agents.user = пользователь): их ищет вызывающая сторона
 * своим запросом (в access-функциях коллекции он мемоизирован на запрос).
 */
export function isOwnObjectDoc(
  doc: unknown,
  user: ObjectActor,
  agentIds: Set<number>,
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role !== 'agent') return false
  if (doc && typeof doc === 'object') {
    const d = doc as Record<string, unknown>
    // Автор карточки: объект, заведённый этим сотрудником, остаётся ему
    // доступен, даже если администратор передал ведение другому агенту
    const authorId = relationIdOf(d.createdBy)
    if (authorId != null && user.id != null && String(authorId) === String(user.id)) return true
    const agentId = relationIdOf(d.agent)
    if (agentId != null) return agentIds.has(agentId)
  }
  return false
}

/**
 * Условие выборки «своих» объектов для запросов (Payload where): по профилям
 * агентов пользователя или по автору карточки. null — если пользователю
 * доступны только чужие объекты (ни профиля, ни авторства нет).
 */
export function ownObjectsWhere(
  userId: number | string | undefined,
  agentIds: Set<number>,
): Where | null {
  const or: Where[] = []
  if (agentIds.size) or.push({ agent: { in: [...agentIds] } })
  if (userId != null) or.push({ createdBy: { equals: userId } })
  return or.length ? { or } : null
}

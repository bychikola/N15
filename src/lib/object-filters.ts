/**
 * Фильтры списка объектов в CRM (раздел «Объекты»): ответственный агент и
 * статус карточки.
 *
 * Условие уходит в запрос к /api/objects (Payload REST, параметр where) —
 * список фильтрует сервер, как и счётчики категорий в каталоге. Поэтому в
 * списке оказывается ровно выбранная выборка: он не «возвращается ко всей
 * базе» при любом обновлении, а счётчик показывает число найденных объектов.
 *
 * Права фильтр не расширяет: объекты по-прежнему отдаёт сервер по правилу
 * «своего» объекта (см. access коллекции Objects и src/lib/object-access.ts),
 * а фильтр только сужает то, что и так доступно сотруднику.
 */

import type { Where } from 'payload'

/** Статусы объектов в фильтре CRM (пустая строка — «все статусы») */
export const OBJECT_STATUS_CODES = ['draft', 'published', 'archived'] as const

export type ObjectStatusCode = (typeof OBJECT_STATUS_CODES)[number]

/** Выбранные фильтры списка: id агента и код статуса строкой — как в форме */
export interface ObjectListFilters {
  /** Ответственный агент ('' — все агенты) */
  agent: string
  /** Статус объекта ('' — все статусы) */
  status: string
}

/**
 * Условие выборки объектов по фильтрам CRM. undefined — фильтры не выбраны,
 * запрос идёт без where (весь доступный сотруднику список).
 */
export function objectListWhere({ agent, status }: ObjectListFilters): Where | undefined {
  const and: Where[] = []
  const agentId = Number(agent)
  // id агента приходит из списка агентов строкой: пустое значение и мусор
  // условием не становятся — иначе фильтр молча показал бы пустой список
  if (agent && Number.isInteger(agentId) && agentId > 0) {
    and.push({ agent: { equals: agentId } })
  }
  if (status) and.push({ status: { equals: status } })
  if (!and.length) return undefined
  return and.length === 1 ? and[0] : { and }
}

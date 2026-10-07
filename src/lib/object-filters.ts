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

/**
 * Особое значение фильтра «ответственный»: объекты офиса Н15 (карточки без
 * личного агента, см. src/lib/object-ownership.ts). Приходит строкой из того
 * же выпадающего списка, что id агента, но числом не является — поэтому
 * проверяется отдельно, до разбора id.
 */
export const OBJECT_FILTER_OFFICE = 'office'

/** Выбранные фильтры списка: ответственный (агент / офис Н15) и статус */
export interface ObjectListFilters {
  /** Ответственный: id агента, 'office' — объекты офиса, '' — все */
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
  // Ответственный приходит из выпадающего списка строкой: 'office' —
  // отдельная ветка, id агента — числом. Пустое значение и мусор условием не
  // становятся — иначе фильтр молча показал бы пустой список
  if (agent === OBJECT_FILTER_OFFICE) {
    and.push({ ownership: { equals: 'office' } })
  } else if (agent && Number.isInteger(agentId) && agentId > 0) {
    and.push({ agent: { equals: agentId } })
  }
  if (status) and.push({ status: { equals: status } })
  if (!and.length) return undefined
  return and.length === 1 ? and[0] : { and }
}

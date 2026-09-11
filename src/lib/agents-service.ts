/**
 * Раздел CRM «Агенты» — серверные операции.
 *
 * Список риелторов агентства (фото или инициалы, имя, должность, телефон,
 * число активных объектов) и профиль агента со списком его объектов по
 * категориям: активные, на модерации, архивные, проданные/закрытые.
 *
 * Доступ: раздел открыт всем сотрудникам CRM — агенту и администратору
 * (страницы проверяют это через canAccessCrm, см. src/app/crm/agents).
 * Клиентам и посетителям раздел не показывается вовсе. Объекты коллег
 * сотрудник видит на чтение, а редактирование остаётся у ответственного
 * агента и администратора — те же права, что в разделе «Объекты»
 * (access коллекции Objects и ownObjectIds в CrmObjects).
 *
 * Персональные данные в раздел не попадают. Чтение идёт с overrideAccess
 * (нужны объекты всех агентов сразу), поэтому поля с закрытым доступом
 * срезает сам сервис, а не правила Payload: строки объектов собираются
 * явным списком полей — без собственника, его телефона и кадастрового
 * номера (ownerName, ownerPhone, cadastralNumber — только администратор,
 * см. Objects.ts), без внутренних комментариев архива и без отчётов
 * юридической экспертизы (коллекция legal-reports — только администратор).
 */
import type { Payload } from 'payload'
import { archiveAddressLine } from './archive-service'
import { archiveFromDoc, type ArchiveReason } from './archive'
import { sortAgents } from './agents-sort'

/** Категории объектов в профиле агента (см. objectBucket) */
export const AGENT_OBJECT_BUCKETS = ['active', 'moderation', 'archive', 'sold'] as const

export type AgentObjectBucket = (typeof AGENT_OBJECT_BUCKETS)[number]

/**
 * Категория объекта по статусу и причине архива. В базе у объекта один
 * статус — draft / published / archived: отдельной «модерации» и отметки
 * «продан» в схеме нет. Поэтому черновик показываем как «на модерации»
 * (объект ещё не опубликован — ждёт проверки и публикации), а проданным
 * или закрытым считаем архивный объект с причиной «Объект продан»
 * (ARCHIVE_REASONS, src/lib/archive.ts). Остальной архив — архивные.
 */
export const objectBucket = (status: string, archiveReason?: string | null): AgentObjectBucket => {
  if (status === 'archived') return archiveReason === 'sold' ? 'sold' : 'archive'
  return status === 'published' ? 'active' : 'moderation'
}

/** Карточка агента: список агентства и шапка профиля */
export interface AgentCard {
  id: number
  name: string
  position: string
  phone: string
  photo?: string
  /** Инициалы для карточки без фото — «Ибрагим Дзгоев» → «ИД» */
  initials: string
  isActive: boolean
  /** Объекты агента по категориям (см. objectBucket) */
  counts: Record<AgentObjectBucket, number>
}

/** Строка объекта в профиле агента: только рабочие поля карточки */
export interface AgentObjectRow {
  id: number
  title: string
  category: string
  /** Тип сделки: sale / rent */
  type: string
  status: string
  bucket: AgentObjectBucket
  price: number | null
  area: number | null
  /** Единица площади: у участков агент вводит сотки (см. «Единица площади») */
  areaUnit: string
  rooms: number | null
  /** Миниатюра (главное фото) */
  thumb?: string
  /** Адрес одной строкой — как в разделе «Архив объектов» */
  address: string
  /** Район: район республики или район Владикавказа (см. districts.ts) */
  district: string
  /** Город или населённый пункт объекта */
  city: string
  /** Дата последнего изменения (ISO) */
  at: string
  /** Причина архива — у архивных и проданных объектов */
  archiveReason: ArchiveReason | null
}

export interface AgentProfile {
  agent: AgentCard
  rows: AgentObjectRow[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** id агента из relationship-поля документа (id или объект) */
const agentIdOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/** Инициалы для карточки без фото (тот же вид, что на сайте — см. about/agents) */
export const agentInitials = (name: string): string =>
  name
    .split(' ')
    .map((word) => word.trim().charAt(0))
    .filter(Boolean)
    .join('')
    .slice(0, 2)

export const emptyAgentCounts = (): Record<AgentObjectBucket, number> => ({
  active: 0,
  moderation: 0,
  archive: 0,
  sold: 0,
})

/** Карточка агента из документа коллекции agents */
function cardOf(doc: Record<string, unknown>, counts: Record<AgentObjectBucket, number>): AgentCard {
  const name = str(doc.name)
  const photo = doc.photo as { url?: string } | undefined
  return {
    id: doc.id as number,
    name,
    position: str(doc.position),
    // Телефон агента читают только сотрудники (access поля в Agents.ts):
    // посетителям и клиентам раздел не отдаётся вовсе
    phone: str(doc.phone),
    photo: photo?.url,
    initials: agentInitials(name),
    isActive: doc.isActive !== false,
    counts,
  }
}

/** Строка объекта из документа коллекции objects */
function objectRow(doc: Record<string, unknown>): AgentObjectRow {
  const addr = (doc.address || {}) as Record<string, unknown>
  const img = doc.primaryImage as { url?: string } | undefined
  const status = str(doc.status) || 'draft'
  const archiveReason = (archiveFromDoc(doc).reason || null) as ArchiveReason | null
  return {
    id: doc.id as number,
    title: str(doc.title) || `Объект #${String(doc.id)}`,
    category: str(doc.category),
    type: str(doc.type),
    status,
    bucket: objectBucket(status, archiveReason),
    price: num(doc.price),
    area: num(doc.area),
    areaUnit: str(doc.areaUnit) || 'sqm',
    rooms: num(doc.rooms),
    thumb: img?.url,
    address: archiveAddressLine(doc),
    district: str(addr.district) || str(addr.cityDistrict),
    // Населённый пункт важнее города: у объектов вне Владикавказа город
    // остаётся значением по умолчанию, а место продажи — в «Населённом пункте»
    city: str(addr.locality) || str(addr.city),
    at: str(doc.updatedAt),
    archiveReason,
  }
}

/**
 * Список агентства для раздела «Агенты»: все профили (в том числе
 * неактивные — за ними остались объекты) в алфавитном порядке по фамилии
 * и счётчики объектов по категориям. Счётчики считаем одним запросом:
 * у объектов берём только статус, причину архива и агента — карточки
 * объектов (описания, фото) для списка не нужны.
 */
export async function loadAgentRoster(payload: Payload): Promise<AgentCard[]> {
  const [agentsRes, objectsRes] = await Promise.all([
    payload.find({ collection: 'agents', limit: 300, depth: 1, overrideAccess: true }),
    payload.find({
      collection: 'objects',
      select: { status: true, agent: true, archive: { reason: true } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const counts = new Map<number, Record<AgentObjectBucket, number>>()
  for (const doc of objectsRes.docs as unknown as Record<string, unknown>[]) {
    const agentId = agentIdOf(doc.agent)
    if (agentId == null) continue
    const bucket = objectBucket(str(doc.status), archiveFromDoc(doc).reason ?? null)
    const row = counts.get(agentId) ?? emptyAgentCounts()
    row[bucket] += 1
    counts.set(agentId, row)
  }

  const cards = (agentsRes.docs as unknown as Record<string, unknown>[]).map((doc) =>
    cardOf(doc, counts.get(doc.id as number) ?? emptyAgentCounts()),
  )
  // Единый порядок с сайтом и CRM: по фамилии (src/lib/agents-sort.ts)
  return sortAgents(cards)
}

/**
 * Профиль агента: карточка и объекты со всеми категориями (активные,
 * на модерации, архивные, проданные/закрытые). Поиск и фильтры по типу,
 * статусу, району и городу выполняет клиентская часть раздела.
 * null — профиля нет (удалён в другой вкладке): это не ошибка сервера.
 */
export async function loadAgentProfile(
  payload: Payload,
  agentId: number,
  limit = 500,
): Promise<AgentProfile | null> {
  const agent = await payload
    .findByID({ collection: 'agents', id: agentId, depth: 1, overrideAccess: true })
    .catch(() => null)
  if (!agent) return null

  const { docs } = await payload.find({
    collection: 'objects',
    where: { agent: { equals: agentId } },
    sort: '-updatedAt',
    limit,
    depth: 1,
    overrideAccess: true,
  })

  const rows = (docs as unknown as Record<string, unknown>[]).map(objectRow)
  const counts = emptyAgentCounts()
  for (const row of rows) counts[row.bucket] += 1

  return { agent: cardOf(agent as unknown as Record<string, unknown>, counts), rows }
}

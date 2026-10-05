/**
 * «Источники объектов» — серверная обвязка реестра object-sources.ts.
 *
 * Раздел хранит настройки источников (глобал object-source-settings, читает и
 * меняет только администратор, см. src/payload/globals/ObjectSourceSettings.ts)
 * и очередь кандидатов (коллекция source-objects). Наружу значения доступов не
 * отдаются: только признак «заполнено» и хвост значения.
 *
 * В основе модуля НЕТ реального забора: у всех источников реестра fetch: null,
 * поэтому importFromObjectSource ничего не загружает и честно отвечает, что
 * канал не реализован. Сеть здесь не вызывается. Когда появится первый канал,
 * его функция забора пройдёт те же проверки: источник разрешён правилами,
 * включён и доступы заданы — иначе забор не запускается.
 *
 * Выборочная публикация: кандидат из очереди становится объектом каталога
 * только после явного решения сотрудника (decideSourceObject). Перенос в
 * каталог — следующий шаг модуля, здесь он не выполняется.
 */
import type { Payload } from 'payload'
import { maskValue } from './platform-integrations'
import {
  canImportFromObjectSource,
  OBJECT_SOURCE_SPECS,
  objectSourceBySlug,
  sourceCredentialsComplete,
  sourceImportNotImplemented,
  type ObjectSourceKind,
  type ObjectSourcePolicy,
  type ObjectSourceSpec,
  type SourceCandidateStatus,
  type SourceCredentialField,
  type SourceImportResult,
} from './object-sources'
import type { ObjectOrigin } from './object-origins'

/** Настройки источников из глобала (группы источников + журнал попыток) */
export type ObjectSourceSettingsData = Record<string, unknown>

/** Читает глобал настроек: сервису нужен полный доступ, включая секреты */
export async function loadObjectSourceSettings(payload: Payload): Promise<ObjectSourceSettingsData> {
  try {
    return (await payload.findGlobal({
      slug: 'object-source-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as ObjectSourceSettingsData
  } catch (e) {
    // Таблицы ещё нет (схема не досоздана) — работаем как без настроек: все
    // источники покажутся выключенными, при этом секреты не теряются
    console.error('Object sources: не удалось прочитать настройки источников:', e)
    return {}
  }
}

/** Группа источника в глобале (enabled + сохранённые доступы) */
function sourceGroup(spec: ObjectSourceSpec, settings: ObjectSourceSettingsData): Record<string, unknown> {
  const group = settings[spec.slug]
  return group && typeof group === 'object' ? (group as Record<string, unknown>) : {}
}

/** Включён ли источник: из настроек, иначе — значение по умолчанию из реестра */
export function isObjectSourceEnabled(spec: ObjectSourceSpec, settings: ObjectSourceSettingsData): boolean {
  const value = sourceGroup(spec, settings).enabled
  return typeof value === 'boolean' ? value : spec.enabledByDefault
}

/** Сохранённые в CRM значения доступа источника (без запасного окружения) */
function storedCredentials(spec: ObjectSourceSpec, settings: ObjectSourceSettingsData): Record<string, string> {
  const group = sourceGroup(spec, settings)
  const out: Record<string, string> = {}
  for (const field of spec.credentials) {
    const v = group[field.key]
    out[field.key] = typeof v === 'string' ? v : ''
  }
  return out
}

/**
 * Доступы источника: значения из CRM, пустые — из окружения сервера. Так
 * работают оба способа подключения: через раздел и через .env.
 */
export function sourceCredentialsFor(spec: ObjectSourceSpec, settings: ObjectSourceSettingsData): Record<string, string> {
  const stored = storedCredentials(spec, settings)
  const out: Record<string, string> = {}
  for (const field of spec.credentials) {
    out[field.key] = (stored[field.key] || '').trim() || String(process.env[field.env] || '').trim()
  }
  return out
}

// --- Состояние источника для интерфейса --------------------------------------------------

export interface SourceCredentialState {
  key: string
  label: string
  hint: string
  secret: boolean
  /** Значение задано (в CRM или в окружении) */
  filled: boolean
  /** Источник значения: сохранено в CRM или взято из окружения сервера */
  from: 'crm' | 'env' | null
  /** Что показываем не-секретным полем; для секретов — только хвост значения */
  preview: string
}

export interface ObjectSourceState {
  slug: string
  name: string
  summary: string
  kind: ObjectSourceKind
  policy: ObjectSourcePolicy
  origin: ObjectOrigin | null
  reason: string
  gives: string
  limits: string
  needs: string
  docsUrl: string | null
  /** Источник включён */
  enabled: boolean
  /** Разрешён правилами (не запрещён) */
  allowed: boolean
  /** Обязательные доступы заданы */
  configured: boolean
  /** Канал забора реализован */
  channelReady: boolean
  /** Можно ли запустить забор сейчас */
  canImport: boolean
  /** Что мешает забору — готовая формулировка (пусто, если не мешает) */
  importReason: string
  /** Поля доступа: заполнены ли и откуда взяты (значения не отдаём) */
  credentials: SourceCredentialState[]
}

/** Состояние источника: правовой статус, включённость, доступы и готовность канала */
export function objectSourceState(spec: ObjectSourceSpec, settings: ObjectSourceSettingsData): ObjectSourceState {
  const group = sourceGroup(spec, settings)
  const values = sourceCredentialsFor(spec, settings)
  const enabled = isObjectSourceEnabled(spec, settings)
  const configured = sourceCredentialsComplete(spec, values)
  const credentials: SourceCredentialState[] = spec.credentials.map((field: SourceCredentialField) => {
    const fromCrm = (typeof group[field.key] === 'string' ? (group[field.key] as string) : '').trim()
    const fromEnv = String(process.env[field.env] || '').trim()
    const value = fromCrm || fromEnv
    return {
      key: field.key,
      label: field.label,
      hint: field.hint,
      secret: field.secret,
      filled: value.length > 0,
      from: fromCrm ? 'crm' : fromEnv ? 'env' : null,
      preview: value ? maskValue(value, field.secret) : '',
    }
  })
  const gate = canImportFromObjectSource(spec, values, { enabled })
  return {
    slug: spec.slug,
    name: spec.name,
    summary: spec.summary,
    kind: spec.kind,
    policy: spec.policy,
    origin: spec.origin,
    reason: spec.reason,
    gives: spec.gives,
    limits: spec.limits,
    needs: spec.needs,
    docsUrl: spec.docsUrl,
    enabled,
    allowed: spec.policy !== 'forbidden',
    configured,
    channelReady: !!spec.fetch,
    canImport: gate.ok,
    importReason: gate.reason || '',
    credentials,
  }
}

/** Состояние всех источников реестра */
export async function objectSourceStates(payload: Payload): Promise<ObjectSourceState[]> {
  const settings = await loadObjectSourceSettings(payload)
  return OBJECT_SOURCE_SPECS.map((spec) => objectSourceState(spec, settings))
}

/** Состояние одного источника (после сохранения или переключения) */
export async function objectSourceStateFor(payload: Payload, slug: string): Promise<ObjectSourceState | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec) return null
  const settings = await loadObjectSourceSettings(payload)
  return objectSourceState(spec, settings)
}

// --- Изменение настроек ------------------------------------------------------------------

/**
 * Сохранение доступов источника. Пустая строка стирает поле, отсутствующее в
 * values — оставляет как было: форма не должна затирать секрет, который в неё
 * не вводили. Запрещённый источник настроить нельзя.
 */
export async function saveObjectSourceCredentials(
  payload: Payload,
  slug: string,
  values: Record<string, string | undefined>,
): Promise<ObjectSourceState | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec || spec.policy === 'forbidden') return null
  const settings = await loadObjectSourceSettings(payload)
  const group: Record<string, string | boolean> = { ...sourceGroup(spec, settings) } as Record<string, string | boolean>
  for (const field of spec.credentials) {
    const v = values[field.key]
    if (typeof v === 'string') group[field.key] = v.trim()
  }
  await payload.updateGlobal({
    slug: 'object-source-settings',
    data: { [spec.slug]: group },
    depth: 0,
    overrideAccess: true,
  })
  return objectSourceStateFor(payload, slug)
}

/** Отключение источника: доступы стираются, канал закрывается */
export async function clearObjectSourceCredentials(payload: Payload, slug: string): Promise<ObjectSourceState | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec || spec.policy === 'forbidden') return null
  const group: Record<string, string | boolean> = { enabled: false }
  for (const field of spec.credentials) group[field.key] = ''
  await payload.updateGlobal({
    slug: 'object-source-settings',
    data: { [spec.slug]: group },
    depth: 0,
    overrideAccess: true,
  })
  return objectSourceStateFor(payload, slug)
}

/**
 * Включение/выключение источника. Запрещённый источник включить нельзя:
 * возвращаем null, вызывающий маршрут отвечает отказом.
 */
export async function setObjectSourceEnabled(
  payload: Payload,
  slug: string,
  enabled: boolean,
): Promise<ObjectSourceState | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec || spec.policy === 'forbidden') return null
  const settings = await loadObjectSourceSettings(payload)
  const group: Record<string, string | boolean> = { ...sourceGroup(spec, settings) } as Record<string, string | boolean>
  group.enabled = enabled
  await payload.updateGlobal({
    slug: 'object-source-settings',
    data: { [spec.slug]: group },
    depth: 0,
    overrideAccess: true,
  })
  return objectSourceStateFor(payload, slug)
}

// --- Забор объектов -----------------------------------------------------------------------

/** Запись попытки забора в журнал глобала (последние 20 записей источника) */
async function persistRun(
  payload: Payload,
  slug: string,
  at: string,
  found: number,
  added: number,
  message: string,
): Promise<void> {
  try {
    const settings = await loadObjectSourceSettings(payload)
    const runs = Array.isArray(settings.runs) ? (settings.runs as Record<string, unknown>[]) : []
    const next = [
      ...runs.filter((r) => r && r.source !== slug).map((r) => ({
        source: r.source,
        at: r.at,
        found: r.found,
        added: r.added,
        message: r.message,
      })),
      { source: slug, at, found, added, message },
    ].slice(-20)
    await payload.updateGlobal({ slug: 'object-source-settings', data: { runs: next }, depth: 0, overrideAccess: true })
  } catch (e) {
    // Результат забора важнее записи в журнал — ошибку только логируем
    console.error(`Object sources: не удалось сохранить журнал забора «${slug}»:`, e)
  }
}

/**
 * Забор объектов с источника. Проверяет правовой статус, включённость и
 * доступы; пока канал не реализован (fetch: null — так у всех источников в
 * основе модуля), возвращает честный ответ «не реализовано» и ничего не
 * загружает. Возвращает null только для неизвестного источника.
 */
export async function importFromObjectSource(payload: Payload, slug: string): Promise<SourceImportResult | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec) return null
  const settings = await loadObjectSourceSettings(payload)
  const enabled = isObjectSourceEnabled(spec, settings)
  const gate = canImportFromObjectSource(spec, sourceCredentialsFor(spec, settings), { enabled })
  if (!gate.ok || !spec.fetch) {
    return { candidates: [], implemented: false, message: gate.reason || sourceImportNotImplemented(spec.name).message }
  }

  // Реальный канал забора (появится, когда источник будет подключён)
  const result = await spec.fetch(sourceCredentialsFor(spec, settings))
  await persistRun(payload, slug, new Date().toISOString(), result.rawCount ?? result.candidates.length, result.candidates.length, result.message)
  return result
}

/** Короткая сводка по источникам — для интерфейса */
export function objectSourcesSummary(states: ObjectSourceState[]): {
  total: number
  allowed: number
  enabled: number
  ready: number
  forbidden: number
} {
  return {
    total: states.length,
    allowed: states.filter((s) => s.allowed).length,
    enabled: states.filter((s) => s.allowed && s.enabled).length,
    ready: states.filter((s) => s.canImport).length,
    forbidden: states.filter((s) => !s.allowed).length,
  }
}

// --- Очередь кандидатов и выборочная публикация --------------------------------------------

export interface SourceQueueItem {
  id: number | string
  source: string
  externalId: string | null
  title: string | null
  address: string | null
  price: number | null
  status: SourceCandidateStatus
  importedAt: string | null
}

/** Очередь кандидатов: по умолчанию — ждущие решения */
export async function sourceQueue(
  payload: Payload,
  status: SourceCandidateStatus = 'pending',
  limit = 100,
): Promise<SourceQueueItem[]> {
  const res = await payload.find({
    collection: 'source-objects',
    where: { status: { equals: status } },
    sort: '-importedAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return (res.docs as unknown as Record<string, unknown>[]).map((doc) => ({
    id: doc.id as number | string,
    source: String(doc.source || ''),
    externalId: typeof doc.externalId === 'string' ? doc.externalId : null,
    title: typeof doc.title === 'string' ? doc.title : null,
    address: typeof doc.address === 'string' ? doc.address : null,
    price: typeof doc.price === 'number' ? doc.price : null,
    status: (typeof doc.status === 'string' ? doc.status : 'pending') as SourceCandidateStatus,
    importedAt: typeof doc.importedAt === 'string' ? doc.importedAt : null,
  }))
}

export interface DecisionResult {
  ok: boolean
  /** Почему решение не принято (если не принято) */
  error?: string
  status?: SourceCandidateStatus
}

/**
 * Решение по кандидату: одобрить или отклонить. Это единственный путь
 * выборочной публикации — без решения сотрудника объект в каталог не идёт.
 * Опубликованный кандидат решение изменить не может. Перенос в каталог —
 * следующий шаг модуля (status 'published'), здесь он не выполняется.
 */
export async function decideSourceObject(
  payload: Payload,
  id: number | string,
  decision: 'approved' | 'rejected',
  userId?: number | string | null,
): Promise<DecisionResult> {
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({ collection: 'source-objects', id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
  } catch {
    doc = null
  }
  if (!doc) return { ok: false, error: 'Кандидат не найден в очереди' }
  if (doc.status === 'published') return { ok: false, error: 'Кандидат уже опубликован — решение изменить нельзя' }

  await payload.update({
    collection: 'source-objects',
    id,
    data: {
      status: decision,
      decidedAt: new Date().toISOString(),
      ...(userId ? { decidedBy: userId } : {}),
    },
    depth: 0,
    overrideAccess: true,
  })
  return { ok: true, status: decision }
}

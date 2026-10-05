/**
 * «Источники объектов» — серверная обвязка реестра object-sources.ts.
 *
 * Раздел хранит настройки источников (глобал object-source-settings, читает и
 * меняет только администратор, см. src/payload/globals/ObjectSourceSettings.ts)
 * и очередь кандидатов (коллекция source-objects). Наружу значения доступов не
 * отдаются: только признак «заполнено» и хвост значения.
 *
 * Подключены два канала: «Заявки собственников» (читает открытые заявки из
 * своей базы) и «Партнёрские агентства» (читает согласованный JSON-фид по
 * договору, см. fetchPartnerFeed в object-sources.ts). importFromObjectSource
 * проводит любой канал через одни и те же проверки: источник разрешён
 * правилами, включён и доступы заданы — иначе забор не запускается.
 * У остальных источников fetch: null, поэтому они честно отвечают «канал не
 * реализован»: API, XML и NMarket в этом этапе не подключаются.
 *
 * Дедупликация: повторный забор ищет кандидата по паре «источник + externalId»
 * и обновляет его, а не создаёт второго. Выборочная публикация: кандидат
 * становится объектом каталога только после явного решения сотрудника
 * (decideSourceObject), а переносит его отдельное действие
 * (publishSourceCandidate) — объект заводится черновиком. Автоматической
 * публикации нет.
 */
import type { Payload } from 'payload'
import { maskValue } from './platform-integrations'
import { DISTRICT_OPTIONS } from './districts'
import { splitSourceAddress, stripAddressDetails } from './object-source-address'
import {
  canImportFromObjectSource,
  OBJECT_SOURCE_SPECS,
  objectSourceBySlug,
  objectSourceName,
  sourceCredentialsComplete,
  sourceImportNotImplemented,
  type ObjectSourceKind,
  type ObjectSourcePolicy,
  type ObjectSourceSpec,
  type SourceCandidate,
  type SourceCandidateStatus,
  type SourceCredentialField,
  type SourceDataClient,
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

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Поля кандидата для хранения в очереди: характеристики объекта как есть */
function candidateFields(c: SourceCandidate, importedAt: string): Record<string, unknown> {
  return {
    externalId: text(c.externalId) || undefined,
    title: c.title || undefined,
    region: c.region || undefined,
    address: c.address || undefined,
    price: c.price ?? undefined,
    area: c.area ?? undefined,
    rooms: c.rooms ?? undefined,
    description: c.description || undefined,
    url: c.url || undefined,
    photos: c.photos.map((url) => ({ url })),
    commission: c.commission || undefined,
    actualAt: c.actualAt || undefined,
    raw: c.raw ?? undefined,
    // Дата получения ставится при первом заборе (см. enqueueSourceCandidates:
    // при обновлении поле сохраняется)
    importedAt,
  }
}

/**
 * Постановка кандидатов в очередь. Новый кандидат кладётся в source-objects
 * со статусом «Ждёт решения» (pending) — автоматической публикации нет.
 *
 * Дедупликация по паре «источник + externalId»: повторная загрузка того же
 * объекта не создаёт второго кандидата, а обновляет существующего (название,
 * адрес, регион, цену, площадь, комнаты, описание, фото, ссылку, комиссию,
 * актуальность) и сохраняет его решение — одобрение или отказ не
 * сбрасываются, дата первого получения не перезаписывается. Кандидат, уже
 * перенесённый в каталог, не трогается вовсе:
 * с ним связана карточка каталога. Записи без externalId дедуплицировать
 * нечем — они добавляются как есть (исключение, а не правило: оба канала
 * идентификатор источника отдают).
 */
async function enqueueSourceCandidates(
  payload: Payload,
  slug: string,
  candidates: SourceCandidate[],
): Promise<{ added: number; updated: number; skipped: number }> {
  const existing = await payload.find({
    collection: 'source-objects',
    where: { source: { equals: slug } },
    limit: 2000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const existingByKey = new Map<string, { id: number | string; status: string }>()
  for (const doc of existing.docs as unknown as Record<string, unknown>[]) {
    const key = text(doc.externalId)
    if (key) existingByKey.set(key, { id: doc.id as number | string, status: text(doc.status) })
  }
  // Ключи, уже встреченные в этом заборе: отсекают дубль внутри самого фида
  const seen = new Set(existingByKey.keys())

  let added = 0
  let updated = 0
  let skipped = 0
  const importedAt = new Date().toISOString()
  for (const c of candidates) {
    const key = text(c.externalId)
    const data = candidateFields(c, importedAt)
    const prev = key ? existingByKey.get(key) : undefined

    if (prev) {
      // Уже в каталоге: карточка каталога — источник правды, кандидата не перезаписываем
      if (prev.status === 'published') {
        skipped += 1
        continue
      }
      // Дату получения при обновлении не трогаем: она остаётся первой, а
      // свежесть забора видна по штатному updatedAt записи
      delete data.importedAt
      await payload.update({
        collection: 'source-objects',
        id: prev.id,
        data,
        depth: 0,
        overrideAccess: true,
      })
      updated += 1
      continue
    }
    // Дубль внутри одной выдачи фида — второй раз не создаём
    if (key && seen.has(key)) {
      skipped += 1
      continue
    }

    await payload.create({
      collection: 'source-objects',
      data: { ...data, source: slug, status: 'pending' },
      overrideAccess: true,
    })
    if (key) seen.add(key)
    added += 1
  }
  return { added, updated, skipped }
}

/**
 * Забор объектов с источника. Проверяет правовой статус, включённость и
 * доступы; если канал не реализован (fetch: null — так у остальных
 * источников), возвращает честный ответ «не реализовано». У подключённого
 * канала полученные кандидаты кладутся в очередь со статусом «Ждёт решения»,
 * без публикации. Возвращает null только для неизвестного источника.
 */
export async function importFromObjectSource(payload: Payload, slug: string): Promise<SourceImportResult | null> {
  const spec = objectSourceBySlug(slug)
  if (!spec) return null
  const settings = await loadObjectSourceSettings(payload)
  const enabled = isObjectSourceEnabled(spec, settings)
  const creds = sourceCredentialsFor(spec, settings)
  const gate = canImportFromObjectSource(spec, creds, { enabled })
  if (!gate.ok || !spec.fetch) {
    return { candidates: [], implemented: false, message: gate.reason || sourceImportNotImplemented(spec.name).message }
  }

  // Реальный канал забора: источник читает свои данные, публикации не делает
  const result = await spec.fetch({ creds, client: payload as unknown as SourceDataClient })
  if (!result.implemented) return result

  const { added, updated, skipped } = await enqueueSourceCandidates(payload, slug, result.candidates)
  const parts: string[] = []
  if (added) parts.push(`добавлено в очередь ${added}`)
  if (updated) parts.push(`обновлено ${updated}`)
  if (skipped) parts.push(`без изменений ${skipped}`)
  const message = result.candidates.length ? `${result.message}; ${parts.join(', ') || 'изменений нет'}` : result.message
  await persistRun(
    payload,
    slug,
    new Date().toISOString(),
    result.rawCount ?? result.candidates.length,
    added,
    message,
  )
  return { ...result, message }
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

/**
 * Карточка очереди для CRM: характеристики кандидата и закрытые поля
 * (ссылка на источник, комиссия, разбор) — их отдаём только администратору,
 * который и открывает раздел (проверка в маршруте /api/object-sources).
 */
export interface SourceQueueItem {
  id: number | string
  source: string
  /** Название источника по реестру — для подписи в очереди */
  sourceName: string
  externalId: string | null
  title: string | null
  region: string | null
  address: string | null
  price: number | null
  area: number | null
  rooms: number | null
  description: string | null
  /** Ссылка на объект у источника — закрытое поле, только для CRM */
  url: string | null
  photos: string[]
  /** Партнёрская комиссия — закрытое условие сделки */
  commission: string | null
  actualAt: string | null
  status: SourceCandidateStatus
  importedAt: string | null
  /** Объект каталога, если кандидат уже перенесён */
  publishedObject: number | null
}

const relId = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'number') {
    return (v as { id: number }).id
  }
  return null
}

const photoUrls = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [])
    .map((p) => (p && typeof p === 'object' ? text((p as { url?: unknown }).url) : ''))
    .filter(Boolean)

function queueItem(doc: Record<string, unknown>): SourceQueueItem {
  const source = String(doc.source || '')
  return {
    id: doc.id as number | string,
    source,
    sourceName: objectSourceName(source),
    externalId: typeof doc.externalId === 'string' ? doc.externalId : null,
    title: typeof doc.title === 'string' ? doc.title : null,
    region: typeof doc.region === 'string' ? doc.region : null,
    address: typeof doc.address === 'string' ? doc.address : null,
    price: typeof doc.price === 'number' ? doc.price : null,
    area: typeof doc.area === 'number' ? doc.area : null,
    rooms: typeof doc.rooms === 'number' ? doc.rooms : null,
    description: typeof doc.description === 'string' ? doc.description : null,
    url: typeof doc.url === 'string' ? doc.url : null,
    photos: photoUrls(doc.photos),
    commission: typeof doc.commission === 'string' ? doc.commission : null,
    actualAt: typeof doc.actualAt === 'string' ? doc.actualAt : null,
    status: (typeof doc.status === 'string' ? doc.status : 'pending') as SourceCandidateStatus,
    importedAt: typeof doc.importedAt === 'string' ? doc.importedAt : null,
    publishedObject: relId(doc.publishedObject),
  }
}

/** Очередь кандидатов: по умолчанию — ждущие решения и одобренные к переносу */
export async function sourceQueue(
  payload: Payload,
  status: SourceCandidateStatus | SourceCandidateStatus[] = ['pending', 'approved'],
  limit = 200,
): Promise<SourceQueueItem[]> {
  const statuses = Array.isArray(status) ? status : [status]
  const res = await payload.find({
    collection: 'source-objects',
    where: { status: { in: statuses } },
    sort: '-importedAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return (res.docs as unknown as Record<string, unknown>[]).map(queueItem)
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
 * Опубликованный кандидат решение изменить не может. Перенос одобренного
 * кандидата в каталог — отдельное действие (publishSourceCandidate).
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

// --- Перенос одобренного кандидата в каталог ----------------------------------------------

/** Текст → описание объекта (richText lexical, как в форме CRM) */
const descriptionLexical = (value: string) => ({
  root: {
    children: value
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => ({
        children: [{ text: block, type: 'text', version: 1 }],
        type: 'paragraph',
        version: 1,
      })),
    type: 'root',
    version: 1,
  },
})

const DISTRICT_SET = new Set<string>(DISTRICT_OPTIONS)

/**
 * Регион и адрес кандидата → поля адреса объекта каталога. Регион, совпавший
 * с районом республики, становится районом; иначе — населённым пунктом.
 *
 * Адрес источника — свободная строка с номером дома и квартиры, и в публичную
 * улицу она попадать не должна: строку разбирает splitSourceAddress
 * (src/lib/object-source-address.ts). Публично уходят только город, район,
 * населённый пункт и улица без уточнений, а полная строка и номер дома/корпуса/
 * квартиры — в закрытые поля (exactAddressAccess в Objects.ts): в CRM их видит
 * агент, на сайте — никто.
 */
function sourceObjectAddress(item: SourceQueueItem): Record<string, unknown> {
  const parsed = splitSourceAddress(item.address || '')
  const region = (item.region || '').trim()
  const address: Record<string, unknown> = {}
  // Полная строка источника — только закрытое поле: сотрудник видит её в CRM
  if (parsed.fullAddress) address.fullAddress = parsed.fullAddress
  address.city = parsed.city || 'Владикавказ'
  if (region && DISTRICT_SET.has(region)) address.district = region
  else if (region) address.locality = region
  // Район и пункт из самой строки дополняют регион, если тот их не задал
  if (parsed.district && !address.district) address.district = parsed.district
  if (parsed.cityDistrict && !address.cityDistrict) address.cityDistrict = parsed.cityDistrict
  if (parsed.locality && !address.locality) address.locality = parsed.locality
  // Публичная улица — без номера дома, корпуса и квартиры
  if (parsed.street) address.street = parsed.street
  // Уточнения — закрытые поля адреса
  if (parsed.house) address.house = parsed.house
  if (parsed.corpus) address.corpus = parsed.corpus
  if (parsed.apartment) address.apartment = parsed.apartment
  return address
}

const PHOTO_MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PHOTO_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_MAX_COUNT = 10
const PHOTO_TIMEOUT_MS = 15_000

/** Имя файла для копии фото источника: из пути ссылки, иначе — по номеру */
function sourcePhotoName(url: string, index: number, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  try {
    const base = new URL(url).pathname.split('/').filter(Boolean).pop() || ''
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '').slice(-60)
    if (/\.(jpe?g|png|webp)$/i.test(clean)) return clean
  } catch {
    // Некорректная ссылка — имя соберём сами
  }
  return `source-photo-${index}.${ext}`
}

/**
 * Фото источника → файлы коллекции media. Ссылки скачиваются по http/https,
 * проверяются тип и размер; недоступное или неподходящее фото не роняет
 * перенос — пропускается с записью в лог, как и у заявок собственников
 * (см. copyOwnerPhotos). Больше PHOTO_MAX_COUNT фото не берём.
 */
async function importSourcePhotos(payload: Payload, photos: string[], alt: string): Promise<number[]> {
  const out: number[] = []
  let index = 0
  for (const url of photos.slice(0, PHOTO_MAX_COUNT)) {
    index += 1
    if (!/^https?:\/\//i.test(url)) continue
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (!res.ok) continue
      const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!PHOTO_MIME_OK.has(mime)) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) continue
      const created = await payload.create({
        collection: 'media',
        data: { alt: `${alt} — фото ${index}` },
        file: {
          data: bytes,
          mimetype: mime,
          name: sourcePhotoName(url, index, mime),
          size: bytes.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      out.push(Number(created.id))
    } catch (e) {
      console.error(`Object sources: не удалось скачать фото ${url}:`, e)
    } finally {
      clearTimeout(timer)
    }
  }
  return out
}

export interface PublishResult {
  ok: boolean
  error?: string
  /** Объект каталога, созданный из кандидата */
  objectId?: number
}

/** Числовой id из значения формы/связи; null — если его нет */
const toId = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Ответственный агент для нового объекта каталога.
 *
 * У нового объекта агент обязателен (validateResponsibleAgent в Objects.ts):
 * по нему маршрутизируются звонки и строится доступ к карточке. Перенос
 * выполняет администратор, а хук objectsOwnershipHook подставляет агента
 * только агентской учётке — администратору его надо выбрать. Порядок:
 *   1. агент, выбранный в форме (agents — профиль агентства, не учётка);
 *   2. иначе — профиль агента, привязанный к учётной записи того, кто
 *      переносит (администратор может быть и агентом, agents.user);
 *   3. иначе — ошибка: без ответственного объект создавать нельзя.
 * Проверку validateResponsibleAgent это не обходит — поле просто заполняется
 * до неё, как и при обычном создании карточки агентом.
 */
async function resolveResponsibleAgent(
  payload: Payload,
  userId: number | string | null | undefined,
  agentId: number | string | null | undefined,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const explicit = toId(agentId)
  if (explicit != null) {
    try {
      const found = await payload.findByID({ collection: 'agents', id: explicit, depth: 0, overrideAccess: true })
      if (found?.id != null) return { ok: true, id: explicit }
    } catch {
      // не нашли профиль — сообщим выбору, а не создадим «агента-призрака»
    }
    return { ok: false, error: 'Выбранный ответственный агент не найден — выберите агента из списка' }
  }

  const owner = toId(userId)
  if (owner != null) {
    try {
      const { docs } = await payload.find({
        collection: 'agents',
        where: { user: { equals: owner } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const own = toId(docs[0]?.id)
      if (own != null) return { ok: true, id: own }
    } catch {
      // связи нет — переходим к сообщению о выборе агента
    }
  }
  return {
    ok: false,
    error: 'Выберите ответственного агента: по нему маршрутизируются звонки и строится доступ к объекту',
  }
}

/**
 * Перенос одобренного кандидата в основной каталог N15.
 *
 * Условия: кандидат существует, одобрен сотрудником (status 'approved') и ещё
 * не перенесён — неодобренный или уже опубликованный кандидат возвращает
 * ошибку. Объект заводится черновиком (status 'draft') с происхождением
 * источника: в каталоге он появляется только после обычной публикации в CRM,
 * автоматической публикации из источника нет. Ответственный агент
 * обязателен: его передаёт администратор (agentId) или он определяется по
 * учётной записи переносящего — см. resolveResponsibleAgent; без агента
 * создание отклоняет validateResponsibleAgent, обходить её нельзя.
 * Характеристики, описание и фото переносятся; фото скачиваются в media.
 * Адрес источника разбирается так, чтобы публично ушли только город, район и
 * улица без уточнений, а полная строка с домом и квартирой осталась в закрытых
 * полях (см. sourceObjectAddress); название чистится от тех же уточнений
 * (stripAddressDetails). Ссылка на источник и партнёрская комиссия в публичные
 * поля объекта не попадают: комиссия остаётся закрытым условием объекта
 * (privateFieldsAccess), а ссылки у объекта каталога нет вовсе — она хранится
 * только у кандидата и доступна администратору. После успеха кандидат
 * получает статус 'published' и связывается с карточкой (publishedObject).
 */
export async function publishSourceCandidate(
  payload: Payload,
  id: number | string,
  userId?: number | string | null,
  agentId?: number | string | null,
): Promise<PublishResult> {
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({
      collection: 'source-objects',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    doc = null
  }
  if (!doc) return { ok: false, error: 'Кандидат не найден в очереди' }
  if (doc.status === 'published' && relId(doc.publishedObject)) {
    return { ok: false, error: 'Кандидат уже перенесён в каталог' }
  }
  if (doc.status !== 'approved') {
    return { ok: false, error: 'В каталог переносится только одобренный объект — сначала одобрите кандидата' }
  }

  const agent = await resolveResponsibleAgent(payload, userId, agentId)
  if (!agent.ok) return { ok: false, error: agent.error }

  const item = queueItem(doc)
  const spec = objectSourceBySlug(item.source)
  // Название от источника может содержать адрес целиком — убираем уточнения,
  // иначе номер дома утёк бы через заголовок и публичный slug карточки
  const parsedAddress = splitSourceAddress(item.address || '')
  const title = stripAddressDetails(item.title || `Объект из источника №${id}`, {
    house: parsedAddress.house,
    corpus: parsedAddress.corpus,
    apartment: parsedAddress.apartment,
  })
  const photoIds = await importSourcePhotos(payload, item.photos, title)

  let objectId: number
  try {
    const created = await payload.create({
      collection: 'objects',
      data: {
        title,
        // Вид сделки и категорию источник не передаёт: черновик заводится
        // квартирой-продажей, сотрудник уточняет их при проверке карточки
        type: 'sale',
        category: 'apartment',
        status: 'draft',
        origin: spec?.origin || 'other',
        price: item.price ?? 0,
        area: item.area ?? undefined,
        rooms: item.rooms ?? undefined,
        // Ответственный агент обязателен для нового объекта; проверку
        // validateResponsibleAgent поле проходит, а не обходит
        agent: agent.id,
        address: sourceObjectAddress(item),
        description: item.description ? descriptionLexical(item.description) : undefined,
        // Партнёрское вознаграждение — закрытое условие объекта, на сайте не показывается
        commission: item.commission || undefined,
        internalComment: `Перенесено из источника «${spec?.name || item.source}»${
          item.externalId ? `, запись №${item.externalId}` : ''
        }. Черновик: проверьте категорию, вид сделки и адрес.`,
        images: photoIds.length ? photoIds : undefined,
        primaryImage: photoIds[0],
      },
      depth: 0,
      overrideAccess: true,
    })
    objectId = Number(created.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    await payload.update({
      collection: 'source-objects',
      id,
      data: {
        status: 'published',
        publishedObject: objectId,
        decidedAt: new Date().toISOString(),
        ...(userId ? { decidedBy: userId } : {}),
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (e) {
    // Объект уже создан — бросать его без связи с кандидатом нельзя, сообщаем
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, objectId }
}

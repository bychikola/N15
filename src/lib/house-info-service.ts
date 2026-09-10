// ---------------------------------------------------------------------------
// «Данные о доме» — серверная обвязка движка src/lib/house-info.ts: сетевые
// запросы к официальному реестру, кэш, сохранение снимка в карточку объекта,
// подтверждение значений агентом и публикация подтверждённых характеристик.
//
// Что важно в правилах работы с реестром:
//   — к порталу идёт не больше трёх запросов на одну проверку (поиск,
//     паспорт дома, управление), с паузой между ними и честным User-Agent;
//   — результат проверки кэшируется на 30 минут: повторное нажатие кнопки
//     не дёргает портал заново;
//   — если реестр не ответил, снимок сохраняется со статусом «проверка
//     недоступна» — значения не выдумываются;
//   — подтверждение агентом — единственный путь к клиенту: в публичную
//     группу housePublic попадают только подтверждённые значения, а
//     поля карточки (год постройки, этажность, материал стен) переносятся
//     только по явной команде.
// ---------------------------------------------------------------------------

import type { Payload } from 'payload'
import {
  HOUSE_REGISTRY,
  approvedItems,
  buildFields,
  cardPatchFromApproved,
  descriptionParagraph,
  parseManagement,
  parsePassport,
  parseSearchHits,
  pickHouse,
  searchQueryFor,
  paragraphNode,
  type HouseFieldKey,
  type HouseInfoField,
  type HouseInfoResult,
  type HousePublicItem,
  type HouseQueryAddress,
  type HouseResultStatus,
} from './house-info'

/** Таймаут одного запроса к порталу */
const FETCH_TIMEOUT_MS = 15_000
/** Пауза между запросами: портал официальный, вести себя надо скромно */
const PAUSE_BETWEEN_REQUESTS_MS = 400
/** Кэш результатов: повторное нажатие кнопки не дёргает портал заново */
const CACHE_TTL_MS = 30 * 60 * 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface CacheEntry {
  at: number
  result: HouseInfoResult
}

const cache = new Map<string, CacheEntry>()

/** Кадастровый номер в сравнимый вид */
const normCadastral = (v: string | null | undefined): string =>
  (v || '').toLowerCase().replace(/[^0-9:]/g, '')

// --- Сеть -------------------------------------------------------------------

type FetchResult = { ok: true; body: string } | { ok: false; reason: string }

/** Запрос открытой страницы реестра: таймаут, честный User-Agent, редиректы */
async function fetchRegistryPage(path: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${HOUSE_REGISTRY.origin}${path}`, {
      headers: {
        'User-Agent': HOUSE_REGISTRY.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, reason: `реестр ответил кодом ${res.status}` }
    return { ok: true, body: await res.text() }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reason: timeout ? 'реестр не ответил за 15 секунд' : `нет связи с реестром (${message})`,
    }
  }
}

// --- Проверка ---------------------------------------------------------------

/** Снимок без значений: реестр недоступен, дом не найден и т.п. */
function emptyResult(input: {
  status: HouseResultStatus
  reason: string
  query: string
  checkedAt: string
  fields: HouseInfoField[]
}): HouseInfoResult {
  return {
    status: input.status,
    reason: input.reason,
    query: input.query,
    matchedBy: null,
    house: null,
    fields: input.fields,
    checkedAt: input.checkedAt,
  }
}

/** Заготовка полей со статусом — «Проверка недоступна» или «Не найдено» */
function stubFields(
  forced: 'unavailable' | 'notFound',
  opts: { sourceUrl: string | null; checkedAt: string; note: string | null },
): HouseInfoField[] {
  return buildFields({
    passport: { address: '', summary: {}, rows: [], updatedAt: null },
    management: null,
    sourceUrl: opts.sourceUrl,
    checkedAt: opts.checkedAt,
    forced,
    note: opts.note,
  })
}

export interface HouseLookupInput {
  address: HouseQueryAddress
  /** Кадастровый номер объекта — для перекрёстной сверки с реестром */
  cadastralNumber?: string | null
  /** Момент проверки (ISO); по умолчанию — сейчас */
  now?: string
}

/**
 * Проверка дома в официальном реестре по адресу объекта. Кадастровый номер
 * поиск портала не принимает, поэтому он используется как перекрёстная
 * сверка: если кадастровый номер земельного участка из паспорта дома совпал
 * с номером объекта, дом считается подтверждённым и по кадастру.
 */
export async function lookupHouseInfo(input: HouseLookupInput): Promise<HouseInfoResult> {
  const checkedAt = input.now || new Date().toISOString()
  const query = searchQueryFor(input.address)
  if (!query) {
    const reason =
      'В карточке не заполнены город, улица и дом — поиск реестра работает только по адресу, ' +
      'кадастровый номер используется лишь для сверки уже найденного дома'
    return emptyResult({
      status: 'noAddress',
      reason,
      query,
      checkedAt,
      fields: stubFields('unavailable', { sourceUrl: null, checkedAt, note: reason }),
    })
  }

  const cacheKey = query.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    // Снимок из кэша отдаём с текущей датой проверки: агент видит, когда
    // система обращалась к реестру в последний раз
    return { ...cached.result, checkedAt }
  }

  // 1. Поиск дома по адресу
  const search = await fetchRegistryPage(`/search/houses?query=${encodeURIComponent(query)}`)
  if (!search.ok) {
    const reason = `Проверка недоступна: ${search.reason}`
    return emptyResult({
      status: 'unavailable',
      reason,
      query,
      checkedAt,
      fields: stubFields('unavailable', { sourceUrl: null, checkedAt, note: reason }),
    })
  }
  const hits = parseSearchHits(search.body)
  if (!hits.length) {
    const reason = 'В реестре нет дома по этому адресу'
    return emptyResult({
      status: 'notFound',
      reason,
      query,
      checkedAt,
      fields: stubFields('notFound', { sourceUrl: null, checkedAt, note: reason }),
    })
  }

  const picked = pickHouse(hits, input.address)
  if (!picked.hit) {
    // Неоднозначный адрес: показываем, что нашлось, и не подставляем данные
    const status: HouseResultStatus = picked.ambiguous.length ? 'ambiguous' : 'notFound'
    const reason =
      picked.reason + (picked.ambiguous.length ? `: ${picked.ambiguous.map((h) => h.address).join('; ')}` : '')
    return emptyResult({
      status,
      reason,
      query,
      checkedAt,
      fields: stubFields(status === 'ambiguous' ? 'unavailable' : 'notFound', {
        sourceUrl: null,
        checkedAt,
        note: reason,
      }),
    })
  }

  // 2. Паспорт дома: характеристики и поставщики каждого значения
  await sleep(PAUSE_BETWEEN_REQUESTS_MS)
  const passportPage = await fetchRegistryPage(`/myhouse/profile/passport/${picked.hit.id}`)
  if (!passportPage.ok) {
    const reason = `Проверка недоступна: ${passportPage.reason}`
    return emptyResult({
      status: 'unavailable',
      reason,
      query,
      checkedAt,
      fields: stubFields('unavailable', { sourceUrl: picked.hit.url, checkedAt, note: reason }),
    })
  }
  const passport = parsePassport(passportPage.body)

  // 3. Управление домом — управляющая организация раскрывается отдельной
  // страницей; её недоступность не отменяет остальные характеристики
  await sleep(PAUSE_BETWEEN_REQUESTS_MS)
  const managementPage = await fetchRegistryPage(`/myhouse/profile/management/${picked.hit.id}`)
  const management = managementPage.ok ? parseManagement(managementPage.body) : null

  const fields = buildFields({
    passport,
    management,
    sourceUrl: picked.hit.url,
    checkedAt,
    note: picked.reason,
  })

  const plotCadastral = passport.rows.find((r) => /^кадастровый номер земельного участка/i.test(r.label))?.value || null
  const matchedBy: HouseInfoResult['matchedBy'] =
    input.cadastralNumber && plotCadastral && normCadastral(input.cadastralNumber) === normCadastral(plotCadastral)
      ? 'cadastral'
      : 'address'

  const result: HouseInfoResult = {
    status: 'found',
    reason: picked.reason,
    query,
    matchedBy,
    house: {
      id: picked.hit.id,
      address: passport.address || picked.hit.address,
      url: picked.hit.url,
      updatedAt: passport.updatedAt,
      plotCadastral,
    },
    fields,
    checkedAt,
  }

  cache.set(cacheKey, { at: Date.now(), result })
  return result
}

// --- Хранение снимка в карточке объекта --------------------------------------

/** Группа houseInfo в документе objects */
export interface HouseInfoGroup {
  status?: string | null
  checkedAt?: string | null
  registry?: string | null
  registryUrl?: string | null
  houseId?: string | null
  houseAddress?: string | null
  registryUpdatedAt?: string | null
  plotCadastral?: string | null
  query?: string | null
  matchedBy?: string | null
  fields?: unknown
  note?: string | null
  approved?: unknown
  approvedAt?: string | null
  approvedBy?: string | null
  log?: { at?: string | null; event?: string | null; message?: string | null; by?: string | null }[]
}

/** Публичная группа housePublic: только подтверждённые характеристики */
export interface HousePublicGroup {
  items?: unknown
  confirmedAt?: string | null
}

/** Снимок проверки, прочитанный из карточки */
export interface SavedHouseInfo {
  status: HouseResultStatus
  reason: string | null
  query: string
  matchedBy: 'address' | 'cadastral' | null
  house: HouseInfoResult['house']
  fields: HouseInfoField[]
  checkedAt: string | null
  approved: Record<string, boolean>
  approvedAt: string | null
  approvedBy: string | null
  log: { at: string; event: string; message: string; by: string }[]
}

/** Что сохраняем в группу houseInfo */
export function groupFromResult(
  result: HouseInfoResult,
  previous: HouseInfoGroup | null,
  entry: { message: string; by: string },
): HouseInfoGroup {
  const log = [...(previous?.log || [])].slice(-19)
  log.push({ at: result.checkedAt, event: 'check', message: entry.message, by: entry.by })
  return {
    status: result.status,
    checkedAt: result.checkedAt,
    registry: HOUSE_REGISTRY.name,
    registryUrl: result.house?.url || null,
    houseId: result.house?.id || null,
    houseAddress: result.house?.address || null,
    registryUpdatedAt: result.house?.updatedAt || null,
    plotCadastral: result.house?.plotCadastral || null,
    query: result.query,
    matchedBy: result.matchedBy,
    fields: result.fields,
    note: result.reason,
    approved: (previous?.approved as Record<string, boolean>) || {},
    approvedAt: previous?.approvedAt || null,
    approvedBy: previous?.approvedBy || null,
    log,
  }
}

/**
 * Сохранить снимок проверки в карточку объекта. Возвращает снимок в том же
 * виде, что и чтение из карточки, — ответ агенту не зависит от того, легла
 * ли запись в базу.
 */
export async function persistHouseInfo(
  payload: Payload,
  objectId: number,
  result: HouseInfoResult,
  actor: { name: string },
): Promise<SavedHouseInfo> {
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const previous = ((doc as unknown as { houseInfo?: HouseInfoGroup } | null)?.houseInfo || null) as HouseInfoGroup | null
  const group = groupFromResult(result, previous, { message: result.reason || 'Проверено', by: actor.name })
  try {
    const updated = await payload.update({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
      data: { houseInfo: group },
    })
    return savedHouseInfo(updated)
  } catch (error) {
    // Запись не прошла — свежий результат проверки всё равно показываем
    console.error('Persist house info error:', error)
    return savedHouseInfo({ houseInfo: group })
  }
}

/** Массив полей снимка из карточки */
const fieldsFromGroup = (group: HouseInfoGroup | null): HouseInfoField[] =>
  Array.isArray(group?.fields) ? (group.fields as HouseInfoField[]) : []

/** Карта подтверждений из карточки */
export const approvedFromGroup = (group: HouseInfoGroup | null): Record<string, boolean> => {
  const value = group?.approved
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, boolean> = {}
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    if (flag === true) out[key] = true
  }
  return out
}

/** Прочитать снимок «Данных о доме» из документа объекта */
export function savedHouseInfo(doc: unknown): SavedHouseInfo {
  const group = ((doc as { houseInfo?: HouseInfoGroup } | null)?.houseInfo || null) as HouseInfoGroup | null
  return {
    status: (group?.status as HouseResultStatus) || 'unavailable',
    reason: group?.note || null,
    query: group?.query || '',
    matchedBy: (group?.matchedBy as 'address' | 'cadastral' | null) || null,
    house: group?.registryUrl
      ? {
          id: group.houseId || '',
          address: group.houseAddress || '',
          url: group.registryUrl,
          updatedAt: group.registryUpdatedAt || null,
          plotCadastral: group.plotCadastral || null,
        }
      : null,
    fields: fieldsFromGroup(group),
    checkedAt: group?.checkedAt || null,
    approved: approvedFromGroup(group),
    approvedAt: group?.approvedAt || null,
    approvedBy: group?.approvedBy || null,
    log: (group?.log || []).map((e) => ({
      at: e.at || '',
      event: e.event || '',
      message: e.message || '',
      by: e.by || '',
    })),
  }
}

// --- Подтверждение агентом ----------------------------------------------------

export interface ApproveInput {
  /** Какие характеристики агент подтвердил */
  keys: HouseFieldKey[]
  /** Перенести подтверждённое в поля карточки (год, этажность, материал стен) */
  applyToCard: boolean
  /** Добавить подтверждённые характеристики в описание объекта */
  toDescription: boolean
  actor: { name: string }
  now?: string
}

export interface ApproveResult {
  ok: boolean
  error?: string
  saved?: SavedHouseInfo
  /** Что ушло клиенту */
  items?: HousePublicItem[]
  /** Какие поля карточки изменены */
  patch?: { builtYear?: number; totalFloors?: number; buildingType?: string }
  /** Добавленный абзац описания */
  paragraph?: string
}

/**
 * Подтверждение характеристик агентом. Единая точка правды: только после
 * этого значения попадают в публичную группу housePublic (её видит клиент).
 */
export async function approveHouseInfo(
  payload: Payload,
  objectId: number,
  input: ApproveInput,
): Promise<ApproveResult> {
  const now = input.now || new Date().toISOString()
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return { ok: false, error: 'Объект не найден' }

  const saved = savedHouseInfo(doc)
  if (!saved.fields.length) return { ok: false, error: 'Сначала получите данные о доме' }

  // Подтвердить можно только найденные значения: «не найдено» и «требует
  // проверки» подтверждению не подлежат
  const keys = new Set(input.keys)
  const approved: Record<string, boolean> = {}
  for (const field of saved.fields) {
    if (keys.has(field.key) && field.status === 'confirmed') approved[field.key] = true
  }
  if (!Object.keys(approved).length) {
    return { ok: false, error: 'Не выбрано ни одного подтверждённого значения' }
  }

  const items = approvedItems(saved.fields, approved, now)
  const patch = input.applyToCard ? cardPatchFromApproved(saved.fields, approved) : {}
  const paragraph = input.toDescription ? descriptionParagraph(items) : ''

  const previousGroup = ((doc as { houseInfo?: HouseInfoGroup }).houseInfo || null) as HouseInfoGroup | null
  const log = [...(previousGroup?.log || [])].slice(-19)
  const eventMessage = [
    `Подтверждено: ${items.map((i) => i.label.toLowerCase()).join(', ')}`,
    Object.keys(patch).length ? 'перенесено в карточку' : '',
    paragraph ? 'добавлено в описание' : '',
  ]
    .filter(Boolean)
    .join('; ')
  log.push({ at: now, event: 'approve', message: eventMessage, by: input.actor.name })

  const data: Record<string, unknown> = {
    houseInfo: {
      ...(previousGroup || {}),
      approved,
      approvedAt: now,
      approvedBy: input.actor.name,
      log,
    },
    housePublic: {
      items,
      confirmedAt: now,
    },
    ...patch,
  }

  if (paragraph) {
    data.description = appendParagraph(doc, paragraph)
  }

  await payload.update({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true, data })
  const updated = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)

  return {
    ok: true,
    saved: updated ? savedHouseInfo(updated) : undefined,
    items,
    patch,
    paragraph,
  }
}

/**
 * Абзац в конец описания объекта. Описание — richText (lexical): новые
 * абзацы добавляем к существующим, ничего не перезаписывая.
 */
export function appendParagraph(doc: unknown, text: string): unknown {
  const paragraph = paragraphNode(text) as { root: { children: unknown[] } }
  const current = (doc as { description?: { root?: { children?: unknown[] } } } | null)?.description
  const children = Array.isArray(current?.root?.children) ? current!.root!.children!.slice() : []
  // Пустой абзац перед характеристиками — текст не слипается с описанием
  return {
    root: {
      children: [
        ...children,
        { children: [{ text: '', type: 'text', version: 1 }], type: 'paragraph', version: 1 },
        ...paragraph.root.children,
      ],
      type: 'root',
      version: 1,
    },
  }
}

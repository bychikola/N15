/**
 * «Интеграции площадок» — серверная обвязка реестра platform-integrations.ts.
 *
 * Раздел CRM «Интеграции площадок» работает через этот сервис: показывает
 * площадки (Авито, ЦИАН, Домклик, Яндекс Недвижимость, VK, Telegram), статус
 * подключения, дату последней проверки, сохраняет доступы администратора и
 * выполняет проверку соединения реальным запросом к официальному API
 * площадки. Статус «подключено» ставится только по фактическому ответу
 * площадки — выдуманных результатов здесь нет.
 *
 * Доступы хранятся в глобале platform-settings (читает и меняет только
 * администратор, см. src/payload/globals/PlatformSettings.ts); запасной
 * источник — переменные окружения (имена в реестре, поле env). Наружу
 * значения не отдаются: только признак «заполнено» и хвост значения.
 *
 * Проверка объекта: официальный канал отдаёт объявления агентства, их и
 * сверяем с карточкой (адрес, цена, площадь, комнаты, этаж, описание, фото).
 */
import type { Payload } from 'payload'
import {
  CONNECTION_STATUS_LABELS,
  INTEGRATION_SPECS,
  integrationBySlug,
  platformState,
  type ConnectionStatus,
  type IntegrationSpec,
  type OwnListingsResult,
  type PlatformState,
  type ProbeResult,
} from './platform-integrations'
import {
  matchObjectInListings,
  searchObjectFromDoc,
  type PlatformObjectCheck,
  type SearchObjectLike,
} from './placement-search'
import { toPublishObject } from './publish-service'

/** Настройки интеграций из глобала (группы площадок + массив проверок) */
export type PlatformSettingsData = Record<string, unknown>

/** Читает глобал настроек: только администратор, но сервису нужен полный доступ */
export async function loadPlatformSettings(payload: Payload): Promise<PlatformSettingsData> {
  try {
    return (await payload.findGlobal({
      slug: 'platform-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as PlatformSettingsData
  } catch (e) {
    // Таблицы ещё нет (схема не досоздана) — работаем как без настроек:
    // площадки покажутся неподключёнными, секреты при этом не теряются
    console.error('Platform settings: не удалось прочитать настройки интеграций:', e)
    return {}
  }
}

/** Сохранённые в CRM значения доступа площадки (без запасного окружения) */
function storedCredentials(spec: IntegrationSpec, settings: PlatformSettingsData): Record<string, string> {
  const group = (settings[spec.slug] || {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const field of spec.credentials) {
    const v = group[field.key]
    out[field.key] = typeof v === 'string' ? v : ''
  }
  return out
}

/**
 * Доступы площадки: значения из CRM, пустые — из окружения сервера.
 * Так работают оба способа подключения: через раздел CRM и через .env.
 */
export function credentialsFor(spec: IntegrationSpec, settings: PlatformSettingsData): Record<string, string> {
  const stored = storedCredentials(spec, settings)
  const out: Record<string, string> = {}
  for (const field of spec.credentials) {
    out[field.key] = (stored[field.key] || '').trim() || String(process.env[field.env] || '').trim()
  }
  return out
}

/** Последняя проверка соединения площадки из массива checks */
function lastCheck(
  spec: IntegrationSpec,
  settings: PlatformSettingsData,
): { status?: string | null; message?: string | null; httpStatus?: number | null; checkedAt?: string | null } | null {
  const checks = settings.checks
  if (!Array.isArray(checks)) return null
  const found = (checks as Record<string, unknown>[])
    .filter((c) => c && c.platform === spec.slug)
    .sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')))[0]
  if (!found) return null
  return {
    status: typeof found.status === 'string' ? found.status : null,
    message: typeof found.message === 'string' ? found.message : null,
    httpStatus: typeof found.httpStatus === 'number' ? found.httpStatus : null,
    checkedAt: typeof found.checkedAt === 'string' ? found.checkedAt : null,
  }
}

/**
 * Состояние всех площадок раздела: статус подключения, дата последней
 * проверки, заполненность доступов (значения маскируются).
 */
export async function platformStates(payload: Payload): Promise<PlatformState[]> {
  const settings = await loadPlatformSettings(payload)
  return INTEGRATION_SPECS.map((spec) =>
    platformState(spec, storedCredentials(spec, settings), process.env, lastCheck(spec, settings)),
  )
}

/** Состояние одной площадки (после сохранения доступов или проверки) */
export async function platformStateFor(payload: Payload, slug: string): Promise<PlatformState | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null
  const settings = await loadPlatformSettings(payload)
  return platformState(spec, storedCredentials(spec, settings), process.env, lastCheck(spec, settings))
}

/** Запись результата проверки соединения в массив checks глобала */
async function persistCheck(payload: Payload, slug: string, probe: ProbeResult, checkedAt: string): Promise<void> {
  const settings = await loadPlatformSettings(payload)
  const checks = Array.isArray(settings.checks) ? (settings.checks as Record<string, unknown>[]) : []
  const next = [
    ...checks.filter((c) => c && c.platform !== slug).map((c) => ({
      platform: c.platform,
      status: c.status,
      message: c.message,
      httpStatus: c.httpStatus,
      checkedAt: c.checkedAt,
    })),
    {
      platform: slug,
      status: probe.status,
      message: probe.message,
      httpStatus: probe.httpStatus ?? null,
      checkedAt,
    },
  ]
  await payload.updateGlobal({ slug: 'platform-settings', data: { checks: next }, depth: 0, overrideAccess: true })
}

/**
 * Сохранение доступов площадки (кнопка «Подключить»). Пустая строка стирает
 * поле, отсутствующее в values — оставляет как было: форма не должна затирать
 * секрет, который в неё не вводили.
 */
export async function savePlatformCredentials(
  payload: Payload,
  slug: string,
  values: Record<string, string | undefined>,
): Promise<PlatformState | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null
  const settings = await loadPlatformSettings(payload)
  const group: Record<string, string> = { ...storedCredentials(spec, settings) }
  for (const field of spec.credentials) {
    const v = values[field.key]
    if (typeof v === 'string') group[field.key] = v.trim()
  }
  await payload.updateGlobal({
    slug: 'platform-settings',
    data: { [spec.slug]: group },
    depth: 0,
    overrideAccess: true,
  })
  return platformStateFor(payload, slug)
}

/** Отключение площадки: доступы стираются, статус — «не подключена» */
export async function clearPlatformCredentials(payload: Payload, slug: string): Promise<PlatformState | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null
  const group: Record<string, string> = {}
  for (const field of spec.credentials) group[field.key] = ''
  await payload.updateGlobal({
    slug: 'platform-settings',
    data: { [spec.slug]: group },
    depth: 0,
    overrideAccess: true,
  })
  return platformStateFor(payload, slug)
}

/**
 * «Проверить соединение» — реальный запрос к официальному API площадки.
 * Возвращает то, что площадка ответила: код, сообщение и разобранное тело.
 * У площадки без программного доступа (Яндекс Недвижимость) проверки нет —
 * честный статус «Нужен доступ администратора».
 */
export async function testPlatformConnection(
  payload: Payload,
  slug: string,
): Promise<{ state: PlatformState | null; probe: ProbeResult } | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null

  if (!spec.probe) {
    const probe: ProbeResult = {
      status: 'needsAdmin',
      message: `Проверка соединения недоступна: ${spec.channel.needs}`,
    }
    return { state: await platformStateFor(payload, slug), probe }
  }

  const settings = await loadPlatformSettings(payload)
  const probe = await spec.probe(credentialsFor(spec, settings))
  const checkedAt = new Date().toISOString()
  try {
    await persistCheck(payload, slug, probe, checkedAt)
  } catch (e) {
    // Ответ площадки важнее записи в журнал: результат всё равно уходит в CRM
    console.error(`Platform integration: не удалось сохранить проверку «${slug}»:`, e)
  }
  return { state: await platformStateFor(payload, slug), probe }
}

/**
 * Доступ площадки для сверки с объектом: подключена ли, какой статус и
 * функция забора своих объявлений. Используется и разделом «Интеграции
 * площадок», и блоком «Проверить размещение» в карточке объекта.
 */
export interface PlatformChannelAccess {
  spec: IntegrationSpec
  /** Все обязательные доступы заданы (в CRM или в окружении) */
  configured: boolean
  status: ConnectionStatus
  /** Что площадка ответила на последней проверке соединения */
  lastMessage: string | null
  /** Забор объявлений агентства с площадки (реальный запрос) */
  listings: () => Promise<OwnListingsResult>
}

export async function platformChannelAccess(payload: Payload, slug: string): Promise<PlatformChannelAccess | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null
  const settings = await loadPlatformSettings(payload)
  const creds = credentialsFor(spec, settings)
  const state = platformState(spec, storedCredentials(spec, settings), process.env, lastCheck(spec, settings))
  return {
    spec,
    configured: state.configured,
    status: state.status,
    lastMessage: state.lastMessage,
    listings: async () => {
      if (!spec.listings) {
        return { listings: [], error: `${spec.name}: программного доступа к объявлениям нет — ${spec.channel.needs}` }
      }
      if (!state.configured) {
        return { listings: [], error: `${spec.name} не подключена: ${spec.channel.needs}` }
      }
      return spec.listings(creds)
    },
  }
}

/**
 * Проверка реального объекта через подключённую площадку: берём карточку
 * CRM, читаем объявления агентства официальным каналом и сверяем признаки.
 * Пока площадка не подключена и пока нет фактического результата по объекту,
 * интеграция не считается работающей — это и показывает ответ.
 */
export async function checkObjectOnPlatform(
  payload: Payload,
  slug: string,
  objectId: number | string,
): Promise<PlatformObjectCheck | null> {
  const spec = integrationBySlug(slug)
  if (!spec) return null

  const base: Pick<PlatformObjectCheck, 'platform' | 'name'> = { platform: spec.slug, name: spec.name }
  const empty: Omit<PlatformObjectCheck, 'platform' | 'name'> = {
    found: false,
    checked: 0,
    listingUrl: null,
    title: null,
    price: null,
    publishedAt: null,
    match: null,
    matchParams: [],
    photoMatch: null,
    probability: null,
    reason: '',
  }

  if (!spec.channel.programmable || !spec.listings) {
    return { ...base, ...empty, reason: `Программного доступа нет: ${spec.channel.needs}` }
  }

  const access = await platformChannelAccess(payload, slug)
  if (!access) return null
  if (!access.configured) {
    return {
      ...base,
      ...empty,
      reason: `Площадка не подключена: ${spec.channel.needs}. Подключение выполняет администратор в разделе «Интеграции площадок»`,
    }
  }

  const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
  if (!doc) return { ...base, ...empty, reason: 'Объект не найден в CRM' }

  const docData = doc as unknown as Record<string, unknown>
  const pub = await toPublishObject(payload, docData)
  const object: SearchObjectLike = searchObjectFromDoc(docData, pub)

  const res = await access.listings()
  if (res.error) {
    return { ...base, ...empty, reason: res.error }
  }
  return { ...base, ...matchObjectInListings(object, res.listings) }
}

/** Короткая сводка по площадкам — для интерфейса CRM */
export function platformsSummary(states: PlatformState[]): {
  total: number
  connected: number
  notConnected: number
  needsAdmin: number
} {
  return {
    total: states.length,
    connected: states.filter((s) => s.status === 'connected').length,
    notConnected: states.filter((s) => s.status === 'notConfigured' || s.status === 'notChecked' || s.status === 'authError' || s.status === 'unreachable').length,
    needsAdmin: states.filter((s) => s.status === 'needsAdmin').length,
  }
}

/** Подпись статуса для интерфейса (единая формулировка во всех разделах CRM) */
export const connectionLabel = (status: ConnectionStatus): string => CONNECTION_STATUS_LABELS[status]

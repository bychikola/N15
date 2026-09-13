/**
 * «Интеграции площадок» — официальные каналы Авито, ЦИАН, Домклик и других
 * площадок: какие доступы нужны, что канал реально даёт и как это проверить.
 *
 * ЧЕСТНОСТЬ (требование владельца): статус «подключено» ставится только по
 * фактическому ответу площадки — HTTP-код и тело запроса к её официальному
 * API. Если доступов нет, площадка показывается как «не подключена», а не как
 * работающий парсер: «проверка недоступна» без результата — это не находка.
 *
 * Официальный канал отдаёт объявления самого агентства (кабинет площадки), а
 * не поиск по чужим объявлениям: автосбор чужих страниц запрещён правилами
 * площадок и здесь не выполняется. Поэтому сверка с объектом CRM идёт по
 * своим размещённым объявлениям — сколько их и совпали ли адрес, цена,
 * площадь, комнаты, этаж, описание и фотографии (сравнение — в
 * placement-search.ts). Формат ответа у каждой площадки свой, разбор здесь
 * защитный: если площадка ответила, но формат не распознан, это так и
 * пишется, а не выдаётся за результат.
 *
 * Файл зависит только от чистого listing-check.ts (никакого Payload): сеть —
 * глобальный fetch (Node 18+), поэтому реестр проверяется точечными прогонами.
 * Хранение доступов и запись статусов — в platform-integration-service.ts.
 */
import type { ListingLike } from './listing-check'

/** Таймаут одного запроса к площадке: дольше ждать смысла нет */
export const PLATFORM_HTTP_TIMEOUT_MS = 20_000

// --- Статусы подключения ---------------------------------------------------------------

/**
 * Состояние подключения площадки. Все значения — фактические:
 * connected      — площадка приняла доступ (HTTP 200 и разобранный ответ);
 * authError      — площадка ответила отказом (401/403, ошибка OAuth, «Forbidden»);
 * notChecked     — доступы сохранены, но соединение ещё не проверялось: сказать
 *                  «подключена» нельзя, а «не подключена» было бы неправдой;
 * notConfigured  — доступ не введён (нет ключей в CRM и в окружении);
 * needsAdmin     — программного доступа у площадки нет: подключение только
 *                  через кабинет/договор, это делают администратор и площадка;
 * unreachable    — площадка не ответила (сеть, таймаут, DNS).
 */
export type ConnectionStatus = 'connected' | 'authError' | 'notChecked' | 'notConfigured' | 'needsAdmin' | 'unreachable'

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Подключена',
  authError: 'Доступ отклонён',
  notChecked: 'Доступы сохранены — проверьте соединение',
  notConfigured: 'Площадка не подключена',
  needsAdmin: 'Нужен доступ администратора',
  unreachable: 'Площадка не отвечает',
}

/** Подробные пояснения к статусу — что это значит и что делать дальше */
export const CONNECTION_STATUS_HINTS: Record<ConnectionStatus, string> = {
  connected: 'Площадка приняла доступ: объявления агентства читаются официальным API',
  authError: 'Площадка ответила отказом — проверьте, что доступ выдан и не истёк (токен могли перевыпустить в кабинете)',
  notChecked: 'Доступы сохранены, но соединение ещё не проверялось — нажмите «Проверить соединение», чтобы получить фактический ответ площадки',
  notConfigured: 'Доступ к площадке не введён. Подключение выполняет администратор в этом разделе',
  needsAdmin: 'Площадка не даёт программного доступа: подключение возможно только по договору и через её кабинет — нужен доступ администратора',
  unreachable: 'Площадка не ответила на запрос — проверьте соединение сервера и повторите проверку',
}

/** Результат проверки соединения — то, что площадка ответила на самом деле */
export interface ProbeResult {
  status: ConnectionStatus
  /** Фактический HTTP-код ответа площадки (если запрос уходил) */
  httpStatus?: number
  /** Ответ площадки своими словами: без прикрас и без выдуманных результатов */
  message: string
  /** Тело ответа (сокращённое) — администратору для разбора */
  detail?: string
  /** Сколько занял запрос, мс */
  latencyMs?: number
}

// --- Описание полей доступа ------------------------------------------------------------

export interface CredentialField {
  /** Имя поля в хранилище (БД) и в форме подключения */
  key: string
  label: string
  /** Переменная окружения — запасной источник, если доступ задан в .env */
  env: string
  /** Секрет: в интерфейс отдаём только признак «заполнен» и хвост значения */
  secret: boolean
  required: boolean
  hint: string
}

export interface ChannelInfo {
  /** Чем подключается площадка: официальный API, фид или кабинет */
  kind: 'api' | 'feed' | 'cabinet'
  /** Название канала для карточки */
  title: string
  /** Что канал даёт: какие данные агентства доступны программно */
  gives: string
  /** Чего канал не даёт (обычно — поиска чужих объявлений) */
  limits: string
  /** Что нужно получить, чтобы подключение стало возможным */
  needs: string
  /** Ссылка на официальную страницу/документацию канала */
  docsUrl: string
  /** Есть ли у канала программная проверка соединения (иначе только кабинет) */
  programmable: boolean
}

export interface IntegrationSpec {
  slug: string
  name: string
  /** Короткое пояснение для карточки */
  summary: string
  channel: ChannelInfo
  credentials: CredentialField[]
  /** Реальная проверка соединения; null — программной проверки у площадки нет */
  probe: ((creds: Record<string, string>) => Promise<ProbeResult>) | null
  /** Забор объявлений агентства с площадки (для сверки с реальным объектом) */
  listings: ((creds: Record<string, string>) => Promise<OwnListingsResult>) | null
}

// --- Сеть -------------------------------------------------------------------------------

/** Ответ площадки в удобном виде: код, текст и разобранный JSON (если он есть) */
interface HttpAnswer {
  ok: boolean
  status: number
  text: string
  json: unknown
  /** Запрос не дошёл: сеть, таймаут, DNS */
  networkError?: string
  latencyMs: number
}

const shorten = (s: string, max = 400): string => (s.length > max ? `${s.slice(0, max)}…` : s)

/** Запрос к площадке с таймаутом. Исключения не летят наверх — они в networkError */
async function httpAnswer(url: string, init: RequestInit = {}): Promise<HttpAnswer> {
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PLATFORM_HTTP_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
    const text = await res.text().catch(() => '')
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, text, json, latencyMs: Date.now() - started }
  } catch (e) {
    const reason = e instanceof Error
      ? (e.name === 'AbortError' ? `таймаут ${PLATFORM_HTTP_TIMEOUT_MS / 1000} с` : e.message)
      : String(e)
    return { ok: false, status: 0, text: '', json: null, networkError: reason, latencyMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

/** Человекочитаемое сообщение площадки из её ответа (формат у каждой свой) */
const answerMessage = (a: HttpAnswer): string => {
  const j = a.json as Record<string, unknown> | null
  if (j) {
    const direct = [j.message, j.error_description, j.error, j.detail]
      .find((v) => typeof v === 'string' && v.trim())
    if (typeof direct === 'string') return direct
    const result = j.result as Record<string, unknown> | undefined
    if (result && typeof result.message === 'string') return result.message
    if (Array.isArray(j.errors) && j.errors.length) {
      const first = j.errors[0] as Record<string, unknown>
      if (typeof first?.message === 'string') return first.message
    }
  }
  return a.text ? shorten(a.text.replace(/\s+/g, ' ').trim(), 200) : `HTTP ${a.status}`
}

const networkFail = (a: HttpAnswer): ProbeResult => ({
  status: 'unreachable',
  message: `Площадка не ответила: ${a.networkError}`,
  latencyMs: a.latencyMs,
})

/** Показать администратору, что именно ответила площадка (сокращённо) */
const detailOf = (a: HttpAnswer): string | undefined =>
  (a.text ? shorten(a.text.replace(/\s+/g, ' ').trim()) : undefined)

const hasCreds = (creds: Record<string, string>, spec: IntegrationSpec): boolean =>
  spec.credentials.filter((f) => f.required).every((f) => (creds[f.key] || '').trim().length > 0)

const missingFields = (creds: Record<string, string>, spec: IntegrationSpec): string[] =>
  spec.credentials.filter((f) => f.required && !(creds[f.key] || '').trim()).map((f) => f.label)

const notConfigured = (spec: IntegrationSpec, creds: Record<string, string>): ProbeResult => ({
  status: 'notConfigured',
  message: `Площадка не подключена: не заданы ${missingFields(creds, spec).join(', ')}. Подключение выполняет администратор`,
})

// --- Разбор ответов площадок --------------------------------------------------------------

/** Массив объявлений из ответа площадки: ищем по типовым местам, не угадывая */
function readListingArray(json: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  const keys = ['offers', 'items', 'resources', 'listings', 'data', 'result']
  for (const key of keys) {
    const v = obj[key]
    if (Array.isArray(v)) return v as Record<string, unknown>[]
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>
      for (const inner of ['offers', 'items', 'resources', 'listings', 'data']) {
        if (Array.isArray(nested[inner])) return nested[inner] as Record<string, unknown>[]
      }
    }
  }
  return null
}

const strOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

const numOf = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Первое непустое значение по списку ключей — форматы у площадок разные */
const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

/** Фотографии объявления: строки или объекты {url}/{fullUrl} — принимаем оба вида */
function photosOf(obj: Record<string, unknown>): string[] {
  const raw = pick(obj, ['images', 'photos', 'photoUrls', 'imagesData'])
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object') {
        return strOf(pick(p as Record<string, unknown>, ['url', 'fullUrl', 'largeUrl', 'src'])) || ''
      }
      return ''
    })
    .filter(Boolean)
}

/**
 * Объявление площадки → общий вид ListingLike. Разбор защитный: неизвестные
 * поля просто остаются пустыми, выдумывать значения нельзя — по ним идёт
 * сверка с объектом CRM.
 */
export function listingFromPlatform(raw: Record<string, unknown>): PlatformListing {
  const address = pick(raw, ['address', 'location', 'addressString'])
  const addrText = typeof address === 'string'
    ? address
    : strOf((address as Record<string, unknown> | null)?.title)
  return {
    address: addrText,
    cadastralNumber: strOf(pick(raw, ['cadastralNumber', 'cadastral_number'])),
    price: numOf(pick(raw, ['price', 'priceRub', 'price_rub', 'cost'])),
    area: numOf(pick(raw, ['area', 'totalArea', 'total_area', 'square'])),
    rooms: numOf(pick(raw, ['rooms', 'roomsCount', 'rooms_count'])),
    floor: numOf(pick(raw, ['floor', 'floorNumber'])),
    totalFloors: numOf(pick(raw, ['totalFloors', 'floorsCount', 'buildingFloors'])),
    photos: photosOf(raw),
    description: strOf(pick(raw, ['description', 'body', 'text'])) || '',
    url: strOf(pick(raw, ['url', 'link', 'offerUrl', 'permalink'])),
    title: strOf(pick(raw, ['title', 'name', 'header'])),
    publishedAt: strOf(pick(raw, ['publishedAt', 'published_at', 'creationDate', 'createdAt', 'dateBegin', 'addedAt'])),
  }
}

/** Объявление площадки в общем виде: признаки сверки + ссылка, заголовок, дата */
export type PlatformListing = ListingLike & {
  url: string | null
  title: string | null
  publishedAt: string | null
}

export interface OwnListingsResult {
  /** Объявления агентства, как их отдала площадка (в общем виде) */
  listings: PlatformListing[]
  /** Причина, по которой объявлений нет: нет доступа, отказ площадки, неразобранный ответ */
  error?: string
  /** Сколько записей было в ответе площадки (для честной формулировки) */
  rawCount?: number
}

const withDetail = (message: string, detail?: string): string =>
  (detail ? `${message}. Ответ площадки: ${detail}` : message)

/** Универсальный забор объявлений: площадки, отдающие массив в JSON */
const jsonListings = (url: string, init: RequestInit, platformName: string) => async (): Promise<OwnListingsResult> => {
  const res = await httpAnswer(url, init)
  if (res.networkError) return { listings: [], error: `${platformName} не ответил: ${res.networkError}` }
  if (!res.ok) return { listings: [], error: withDetail(`${platformName} не отдал объявления: ${answerMessage(res)}`, detailOf(res)) }
  const arr = readListingArray(res.json)
  if (!arr) return { listings: [], error: `${platformName} ответил, но список объявлений в ответе не распознан — сверка невозможна` }
  return { listings: arr.map(listingFromPlatform), rawCount: arr.length }
}

// --- Авито ------------------------------------------------------------------------------

/**
 * Авито: официальный API для бизнеса. Доступ — OAuth-пара client_id и
 * client_secret из кабинета «Авито для бизнеса»; по ней берётся access_token.
 * Проверка соединения — реальный запрос токена и следом чтение своих
 * объявлений (GET /core/v1/items).
 */
async function avitoToken(creds: Record<string, string>): Promise<{ token: string; answer: HttpAnswer } | { error: ProbeResult }> {
  const res = await httpAnswer('https://api.avito.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  })
  if (res.networkError) return { error: networkFail(res) }
  const token = (res.json as { access_token?: string } | null)?.access_token
  if (!res.ok || !token) {
    return {
      error: {
        status: 'authError',
        httpStatus: res.status,
        message: `Авито не выдало доступ: ${answerMessage(res)}`,
        detail: detailOf(res),
        latencyMs: res.latencyMs,
      },
    }
  }
  return { token, answer: res }
}

const avitoProbe = async (creds: Record<string, string>): Promise<ProbeResult> => {
  const auth = await avitoToken(creds)
  if ('error' in auth) return auth.error

  const items = await httpAnswer('https://api.avito.ru/core/v1/items?per_page=1', {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  if (items.networkError) return networkFail(items)
  if (!items.ok) {
    return {
      status: 'authError',
      httpStatus: items.status,
      message: `Токен получен, но объявления не читаются: ${answerMessage(items)}`,
      detail: detailOf(items),
      latencyMs: auth.answer.latencyMs + items.latencyMs,
    }
  }
  const json = (items.json || {}) as Record<string, unknown>
  const meta = json.meta as Record<string, unknown> | undefined
  const total = typeof meta?.total === 'number' ? meta.total : null
  return {
    status: 'connected',
    httpStatus: items.status,
    message: total != null
      ? `Доступ принят, объявлений агентства в кабинете Авито: ${total}`
      : 'Доступ принят, объявления агентства читаются',
    detail: detailOf(items),
    latencyMs: auth.answer.latencyMs + items.latencyMs,
  }
}

const avitoListings = async (creds: Record<string, string>): Promise<OwnListingsResult> => {
  const auth = await avitoToken(creds)
  if ('error' in auth) return { listings: [], error: auth.error.message }

  const res = await httpAnswer('https://api.avito.ru/core/v1/items?per_page=100', {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  if (res.networkError) return { listings: [], error: `Авито не ответил: ${res.networkError}` }
  if (!res.ok) return { listings: [], error: withDetail(`Авито не отдал объявления: ${answerMessage(res)}`, detailOf(res)) }
  const items = (res.json as Record<string, unknown> | null)?.resources
  if (!Array.isArray(items)) {
    return { listings: [], error: 'Авито ответил, но список объявлений в ответе не распознан — сверка невозможна' }
  }
  const arr = items as Record<string, unknown>[]
  return { listings: arr.map(listingFromPlatform), rawCount: arr.length }
}

// --- Площадки реестра ---------------------------------------------------------------------

const AVITO: IntegrationSpec = {
  slug: 'avito',
  name: 'Авито',
  summary: 'Крупнейшая площадка объявлений — основная выгрузка объектов агентства',
  channel: {
    kind: 'api',
    title: 'API Авито для бизнеса (OAuth 2.0)',
    gives: 'Объявления агентства в кабинете: список, цена, статус, ссылки, статистика',
    limits: 'Поиск по чужим объявлениям API не даёт: чужие карточки на Авито не читаются',
    needs: 'Приложение в кабинете «Авито для бизнеса»: client_id и client_secret, доступ к API недвижимости',
    docsUrl: 'https://developers.avito.ru/api-catalog',
    programmable: true,
  },
  credentials: [
    { key: 'clientId', label: 'client_id', env: 'AVITO_CLIENT_ID', secret: false, required: true, hint: 'Кабинет Авито для бизнеса → Настройки → API' },
    { key: 'clientSecret', label: 'client_secret', env: 'AVITO_CLIENT_SECRET', secret: true, required: true, hint: 'Показывается один раз при создании приложения' },
  ],
  probe: async (creds) => (hasCreds(creds, AVITO) ? avitoProbe(creds) : notConfigured(AVITO, creds)),
  listings: async (creds) => (hasCreds(creds, AVITO)
    ? avitoListings(creds)
    : { listings: [], error: 'Площадка не подключена: нет client_id и client_secret' }),
}

const CIAN: IntegrationSpec = {
  slug: 'cian',
  name: 'ЦИАН',
  summary: 'Площадка объявлений о недвижимости, партнёрский доступ по договору',
  channel: {
    kind: 'api',
    title: 'Партнёрский API ЦИАН',
    gives: 'Объявления агентства на ЦИАН: список своих предложений, статусы, ссылки',
    limits: 'Поиск по чужим объявлениям партнёрский API не выполняет',
    needs: 'Договор с ЦИАН и токен публичного API, выданный площадкой',
    docsUrl: 'https://public-api.cian.ru/',
    programmable: true,
  },
  credentials: [
    { key: 'token', label: 'Токен API ЦИАН', env: 'CIAN_API_TOKEN', secret: true, required: true, hint: 'Выдаётся площадкой по договору' },
  ],
  probe: async (creds) => {
    if (!hasCreds(creds, CIAN)) return notConfigured(CIAN, creds)
    const res = await httpAnswer('https://public-api.cian.ru/v1/get-my-offers', {
      headers: { Authorization: `Bearer ${creds.token}` },
    })
    if (res.networkError) return networkFail(res)
    if (!res.ok) {
      return {
        status: 'authError',
        httpStatus: res.status,
        message: `ЦИАН отклонил доступ: ${answerMessage(res)}`,
        detail: detailOf(res),
        latencyMs: res.latencyMs,
      }
    }
    const offers = readListingArray(res.json)
    return {
      status: 'connected',
      httpStatus: res.status,
      message: offers
        ? `Доступ принят, объявлений агентства на ЦИАН: ${offers.length}`
        : 'Доступ принят: ЦИАН ответил на запрос своих объявлений',
      detail: detailOf(res),
      latencyMs: res.latencyMs,
    }
  },
  listings: async (creds) => (hasCreds(creds, CIAN)
    ? jsonListings('https://public-api.cian.ru/v1/get-my-offers', { headers: { Authorization: `Bearer ${creds.token}` } }, 'ЦИАН')()
    : { listings: [], error: 'Площадка не подключена: нет токена ЦИАН' }),
}

const DOMCLICK: IntegrationSpec = {
  slug: 'domclick',
  name: 'Домклик',
  summary: 'Площадка Сбербанка: объявления компании и статистика по ним',
  channel: {
    kind: 'api',
    title: 'API статистики Домклик + XML-фид размещения',
    gives: 'Объявления компании и статистика по ним (просмотры, звонки) из кабинета Домклик',
    limits: 'Чужие объявления недоступны; само размещение идёт не API, а XML-фидом в кабинете',
    needs: 'Токен и id компании из кабинета Домклик («Мои объявления» → «Статистика по API»)',
    docsUrl: 'https://blog.domclick.ru/partneram',
    programmable: true,
  },
  credentials: [
    { key: 'token', label: 'Токен Домклик', env: 'DOMCLICK_API_TOKEN', secret: true, required: true, hint: 'Кабинет → «Мои объявления» → Статистика → Подключить API' },
    { key: 'companyId', label: 'ID компании', env: 'DOMCLICK_COMPANY_ID', secret: false, required: true, hint: 'Из ссылки API кабинета: …/companies/<id>/offers' },
  ],
  probe: async (creds) => {
    if (!hasCreds(creds, DOMCLICK)) return notConfigured(DOMCLICK, creds)
    const res = await httpAnswer(domclickUrl(creds))
    if (res.networkError) return networkFail(res)
    if (!res.ok) {
      return {
        status: 'authError',
        httpStatus: res.status,
        message: `Домклик отклонил доступ: ${answerMessage(res)}`,
        detail: detailOf(res),
        latencyMs: res.latencyMs,
      }
    }
    const offers = readListingArray(res.json)
    return {
      status: 'connected',
      httpStatus: res.status,
      message: offers
        ? `Доступ принят, объявлений компании на Домклике: ${offers.length}`
        : 'Доступ принят: Домклик ответил на запрос статистики по объявлениям',
      detail: detailOf(res),
      latencyMs: res.latencyMs,
    }
  },
  listings: async (creds) => (hasCreds(creds, DOMCLICK)
    ? jsonListings(domclickUrl(creds), {}, 'Домклик')()
    : { listings: [], error: 'Площадка не подключена: нет токена и id компании Домклик' }),
}

/** Ссылка API статистики Домклика: токен передаётся параметром запроса */
const domclickUrl = (creds: Record<string, string>): string =>
  `https://public-api.domclick.ru/stats/v1/companies/${encodeURIComponent(creds.companyId)}/offers?token=${encodeURIComponent(creds.token)}`

const YANDEX: IntegrationSpec = {
  slug: 'yandex',
  name: 'Яндекс Недвижимость',
  summary: 'Площадка Яндекса — размещение выгрузкой фида из кабинета',
  channel: {
    kind: 'feed',
    title: 'XML-фид Яндекс.Недвижимости',
    gives: 'Размещение объявлений агентства и отчёт о выгрузке в кабинете realty.yandex.ru/feeds',
    limits: 'Программного API для агентств нет: фид загружается вручную, чужие объявления недоступны',
    needs: 'Доступ в кабинет Яндекс.Недвижимости и настройка фида — выполняется администратором',
    docsUrl: 'https://yandex.ru/support/realty/',
    programmable: false,
  },
  credentials: [],
  probe: null,
  listings: null,
}

const VK: IntegrationSpec = {
  slug: 'vk',
  name: 'VK',
  summary: 'Наше сообщество — публикация постов через официальный API',
  channel: {
    kind: 'api',
    title: 'VK API (токен сообщества)',
    gives: 'Публикация объявлений агентства в сообщество и статус постов',
    limits: 'Чужих объявлений VK не отдаёт — это наш канал публикации, а не поиск',
    needs: 'Токен сообщества с правом «Управление» и id группы — доступ администратора',
    docsUrl: 'https://dev.vk.com/ru/api/community-messages/getting-started',
    programmable: true,
  },
  credentials: [
    { key: 'token', label: 'Токен сообщества', env: 'VK_GROUP_TOKEN', secret: true, required: true, hint: 'Управление сообществом → Работа с API' },
    { key: 'groupId', label: 'ID группы', env: 'VK_GROUP_ID', secret: false, required: true, hint: 'Числовой id сообщества агентства' },
  ],
  probe: async (creds) => {
    if (!hasCreds(creds, VK)) return notConfigured(VK, creds)
    const url = `https://api.vk.com/method/groups.getById?group_id=${encodeURIComponent(creds.groupId)}&access_token=${encodeURIComponent(creds.token)}&v=5.199`
    const res = await httpAnswer(url)
    if (res.networkError) return networkFail(res)
    const err = (res.json as { error?: { error_msg?: string } } | null)?.error
    if (err) {
      return {
        status: 'authError',
        httpStatus: res.status,
        message: `VK отклонил доступ: ${err.error_msg || 'ошибка API'}`,
        detail: detailOf(res),
        latencyMs: res.latencyMs,
      }
    }
    return { status: 'connected', httpStatus: res.status, message: 'VK принял токен сообщества', detail: detailOf(res), latencyMs: res.latencyMs }
  },
  listings: null,
}

const TELEGRAM: IntegrationSpec = {
  slug: 'telegram',
  name: 'Telegram',
  summary: 'Наш канал — публикация постов через официальный Bot API',
  channel: {
    kind: 'api',
    title: 'Telegram Bot API',
    gives: 'Публикация объявлений агентства в канал и статус постов',
    limits: 'Чужих объявлений Telegram не отдаёт — это наш канал публикации, а не поиск',
    needs: 'Токен бота и id канала — доступ администратора',
    docsUrl: 'https://core.telegram.org/bots/api',
    programmable: true,
  },
  credentials: [
    { key: 'token', label: 'Токен бота', env: 'TELEGRAM_BOT_TOKEN', secret: true, required: true, hint: 'Получен у @BotFather' },
  ],
  probe: async (creds) => {
    if (!hasCreds(creds, TELEGRAM)) return notConfigured(TELEGRAM, creds)
    const res = await httpAnswer(`https://api.telegram.org/bot${encodeURIComponent(creds.token)}/getMe`)
    if (res.networkError) return networkFail(res)
    const json = res.json as { ok?: boolean; description?: string; result?: { username?: string } } | null
    if (!json?.ok) {
      return {
        status: 'authError',
        httpStatus: res.status,
        message: `Telegram отклонил доступ: ${json?.description || answerMessage(res)}`,
        detail: detailOf(res),
        latencyMs: res.latencyMs,
      }
    }
    return {
      status: 'connected',
      httpStatus: res.status,
      message: `Telegram принял токен бота${json.result?.username ? ` (@${json.result.username})` : ''}`,
      detail: detailOf(res),
      latencyMs: res.latencyMs,
    }
  },
  listings: null,
}

/**
 * Реестр площадок раздела «Интеграции площадок»: сначала площадки объявлений,
 * затем наши каналы публикации. `probe: null` — у площадки нет программного
 * доступа: соединение проверяется только в её кабинете, и честный статус —
 * «Нужен доступ администратора».
 */
export const INTEGRATION_SPECS: IntegrationSpec[] = [AVITO, CIAN, DOMCLICK, YANDEX, VK, TELEGRAM]

export const integrationBySlug = (slug: string): IntegrationSpec | undefined =>
  INTEGRATION_SPECS.find((s) => s.slug === slug)

export const integrationName = (slug: string): string => integrationBySlug(slug)?.name || slug

// --- Состояние площадки для интерфейса -------------------------------------------------------

export interface PlatformCredentialState {
  key: string
  label: string
  hint: string
  secret: boolean
  /** Значение задано (в CRM или в окружении) */
  filled: boolean
  /** Источник значения: сохранено в CRM или взято из окружения сервера */
  source: 'crm' | 'env' | null
  /** Что показываем не-секретным полем; для секретов — только хвост значения */
  preview: string
}

export interface PlatformState {
  slug: string
  name: string
  summary: string
  channel: ChannelInfo
  /** Статус подключения (по последней фактической проверке) */
  status: ConnectionStatus
  /** Последняя проверка соединения (ISO) */
  lastCheckedAt: string | null
  /** Что ответила площадка на последней проверке */
  lastMessage: string | null
  /** HTTP-код последней проверки */
  lastHttpStatus: number | null
  /** Поля доступа: заполнены ли и откуда взяты (значения не отдаём) */
  credentials: PlatformCredentialState[]
  /** Все обязательные поля заполнены */
  configured: boolean
  /** Можно ли проверить соединение программно */
  canTest: boolean
}

/**
 * Статус площадки по последней проверке и заполненности доступов. Значения
 * секретов наружу не отдаются: только признак «заполнено» и хвост — так ключи
 * не утекают в интерфейс и логи.
 */
export function platformState(
  spec: IntegrationSpec,
  stored: Record<string, string>,
  env: Record<string, string | undefined>,
  last?: { status?: string | null; message?: string | null; httpStatus?: number | null; checkedAt?: string | null } | null,
): PlatformState {
  const credentials: PlatformCredentialState[] = spec.credentials.map((f) => {
    const fromCrm = (stored[f.key] || '').trim()
    const fromEnv = (env[f.env] || '').trim()
    const value = fromCrm || fromEnv
    return {
      key: f.key,
      label: f.label,
      hint: f.hint,
      secret: f.secret,
      filled: value.length > 0,
      source: fromCrm ? 'crm' : fromEnv ? 'env' : null,
      preview: value ? maskValue(value, f.secret) : '',
    }
  })
  const configured = spec.credentials.filter((f) => f.required).every((f) => (stored[f.key] || '').trim() || (env[f.env] || '').trim())
  const storedStatus = last?.status
  // Статус берём только из фактической проверки. Без неё: доступы заполнены —
  // «проверьте соединение» (говорить «подключена» ещё нельзя), не заполнены —
  // «площадка не подключена», нет программного доступа — «нужен администратор»
  const status: ConnectionStatus = storedStatus && storedStatus in CONNECTION_STATUS_LABELS
    ? (storedStatus as ConnectionStatus)
    : configured && spec.probe
      ? 'notChecked'
      : spec.probe
        ? 'notConfigured'
        : 'needsAdmin'
  return {
    slug: spec.slug,
    name: spec.name,
    summary: spec.summary,
    channel: spec.channel,
    status,
    lastCheckedAt: last?.checkedAt || null,
    lastMessage: last?.message || null,
    lastHttpStatus: typeof last?.httpStatus === 'number' ? last.httpStatus : null,
    credentials,
    configured,
    canTest: !!spec.probe,
  }
}

/** Маскировка значения: секреты — только хвост, остальное видно администратору */
export function maskValue(value: string, secret: boolean): string {
  if (!secret) return value
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

/**
 * «Источники объектов» — закрытый реестр каналов, из которых карточка может
 * попасть в каталог Н15, и правила работы с ними.
 *
 * Идея та же, что у автосбора новостей (см. news.ts) и интеграций площадок
 * (см. platform-integrations.ts): список источников закрыт и лежит в коде, а
 * подключить можно только разрешённый канал. Здесь — не публикация наших
 * объектов наружу, а приём объектов В каталог: откуда карточка пришла, что
 * источник реально даёт, чего он не даёт и на каком основании его можно
 * подключить.
 *
 * Правила, заложенные здесь:
 *   — только разрешённые источники: у каждого — правовой статус (policy).
 *     `allowed` — собственные данные агентства и заявки самих собственников;
 *     `needsAgreement` — приём возможен только по договору с источником;
 *     `forbidden` — канал в реестре есть, но включить его нельзя, и причина
 *     записана прямо (автосбор чужих объявлений запрещён правилами площадок);
 *   — забор ведёт канал самого источника (поле fetch). Первым подключён канал
 *     «Заявки собственников»: он читает заявки из своей базы (owner-applications)
 *     и кладёт их кандидатами в очередь — без публикации. У остальных каналов
 *     fetch: null, то есть структура готова, а данных от них нет;
 *   — выборочная публикация: ни один объект из источника не попадает в
 *     каталог автоматически. Кандидат проходит очередь (коллекция
 *     source-objects) и публикуется только после явного решения сотрудника
 *     (см. SOURCE_PUBLICATION_RULE и source-object-service.ts).
 *
 * Файл без импортов из Payload: работает и на сервере, и в быстрых проверках
 * node. Хранение настроек и очередь — в src/lib/object-source-service.ts.
 */
import type { ObjectOrigin } from './object-origins'

// --- Правовой статус источника --------------------------------------------------------

/**
 * Можно ли подключать источник:
 *   allowed        — собственные данные Н15 и заявки собственников;
 *   needsAgreement — только по договору с источником (партнёр, застройщик, NMarket);
 *   forbidden      — включать нельзя: автосбор чужих объявлений запрещён
 *                    правилами площадки (позиция та же, что в market-parser.ts).
 */
export type ObjectSourcePolicy = 'allowed' | 'needsAgreement' | 'forbidden'

export const OBJECT_SOURCE_POLICY_LABELS: Record<ObjectSourcePolicy, string> = {
  allowed: 'Разрешён',
  needsAgreement: 'Только по договору',
  forbidden: 'Запрещён',
}

/** Что значит статус источника и что с ним делать */
export const OBJECT_SOURCE_POLICY_HINTS: Record<ObjectSourcePolicy, string> = {
  allowed: 'Собственные данные агентства или заявка самого собственника — источник можно подключать',
  needsAgreement: 'Приём объектов возможен только по договору с источником; без договора подключение запрещено',
  forbidden: 'Источник оставлен в реестре как запрещённый — включить его нельзя, причина указана в карточке',
}

/** Чем подключается источник: ручной ввод, официальный API, фид или кабинет */
export type ObjectSourceKind = 'manual' | 'api' | 'feed' | 'cabinet'

export const OBJECT_SOURCE_KIND_LABELS: Record<ObjectSourceKind, string> = {
  manual: 'Ручной ввод',
  api: 'Официальный API',
  feed: 'Фид / выгрузка',
  cabinet: 'Кабинет источника',
}

// --- Поля доступа ----------------------------------------------------------------------

export interface SourceCredentialField {
  /** Имя поля в хранилище (БД) и в форме подключения */
  key: string
  label: string
  /** Переменная окружения — запасной источник, если доступ задан в .env */
  env: string
  /** Секрет: наружу отдаём только признак «заполнен» и хвост значения */
  secret: boolean
  required: boolean
  hint: string
}

// --- Клиент данных источника ------------------------------------------------------------

/**
 * Минимум серверного клиента данных, который нужен источнику, читающему свою
 * базу (как «Заявки собственников»). Описан структурно, без импорта Payload:
 * реестр остаётся чистым файлом правил, а сервис передаёт сюда настоящий
 * Payload (см. object-source-service.ts).
 */
export interface SourceDataClient {
  find(args: {
    collection: string
    where?: Record<string, unknown>
    sort?: string
    limit?: number
    depth?: number
    pagination?: boolean
    overrideAccess?: boolean
  }): Promise<{ docs: Record<string, unknown>[] }>
}

/** Что получает канал забора: доступы источника и серверный клиент данных */
export interface SourceFetchContext {
  /** Заданные доступы источника (нужны сетевым каналам; внутренним — пусты) */
  creds: Record<string, string>
  /** Серверный клиент данных — для источников, читающих свою базу */
  client: SourceDataClient
}

/** Канал забора объектов с источника */
export type SourceFetch = (ctx: SourceFetchContext) => Promise<SourceImportResult>

// --- Описание источника -----------------------------------------------------------------

export interface ObjectSourceSpec {
  slug: string
  name: string
  /** Короткое пояснение для карточки */
  summary: string
  /** Происхождение карточки (поле origin коллекции objects) — какой код ставится */
  origin: ObjectOrigin | null
  kind: ObjectSourceKind
  policy: ObjectSourcePolicy
  /** Правовое основание: почему источник разрешён, ограничен или запрещён */
  reason: string
  /** Что источник реально даёт: какие данные объекта доступны */
  gives: string
  /** Чего источник не даёт (обычно — чужих объявлений) */
  limits: string
  /** Что нужно сделать, чтобы подключение стало возможным */
  needs: string
  /** Ссылка на официальную страницу/документацию источника */
  docsUrl: string | null
  /** Собственные объекты/заявки, которые уже работают: включены по умолчанию */
  enabledByDefault: boolean
  credentials: SourceCredentialField[]
  /** Забор объектов с источника; null — канал ещё не реализован */
  fetch: SourceFetch | null
}

// --- Кандидаты и результат забора --------------------------------------------------------

/**
 * Объект, как его отдал источник, в общем виде. Поля необязательные: форматы
 * источников разные, а выдумывать значения нельзя — по ним сотрудник решает,
 * публиковать карточку или нет.
 */
export interface SourceCandidate {
  /** Идентификатор объекта на стороне источника (для дедупликации) */
  externalId: string | null
  title: string | null
  address: string | null
  price: number | null
  area: number | null
  rooms: number | null
  url: string | null
  photos: string[]
  /** Исходные данные источника — для разбора, не для показа посетителю */
  raw: Record<string, unknown> | null
}

export interface SourceImportResult {
  /** Кандидаты, как их отдал источник (могут быть отброшены при разборе) */
  candidates: SourceCandidate[]
  /** Канал забора реализован (у подключённых источников — true) */
  implemented: boolean
  /** Что произошло — своими словами, без выдуманных результатов */
  message: string
  /** Сколько записей было в ответе источника (для честной формулировки) */
  rawCount?: number
}

/** Единая формулировка «канал ещё не реализован» — чтобы не обещать загрузку */
export const sourceImportNotImplemented = (name: string): SourceImportResult => ({
  candidates: [],
  implemented: false,
  message: `${name}: забор объектов ещё не реализован — канал не подключён, объекты не загружаются`,
})

// --- Выборочная публикация --------------------------------------------------------------

/**
 * Правило публикации: объект из источника никогда не публикуется
 * автоматически. Кандидат проходит очередь и становится объектом каталога
 * только после явного решения сотрудника. Значение — маркер для проверок и
 * интерфейса; сама механика очереди — в object-source-service.ts.
 */
export const SOURCE_PUBLICATION_RULE = 'manual' as const

/**
 * Состояние кандидата в очереди:
 *   pending   — ждёт решения сотрудника;
 *   approved  — одобрен к публикации (в каталог ещё не перенесён);
 *   rejected  — отклонён, в каталог не попадает;
 *   published — перенесён в каталог (заполняется следующим шагом модуля).
 */
export type SourceCandidateStatus = 'pending' | 'approved' | 'rejected' | 'published'

export const SOURCE_CANDIDATE_STATUS_LABELS: Record<SourceCandidateStatus, string> = {
  pending: 'Ждёт решения',
  approved: 'Одобрен к публикации',
  rejected: 'Отклонён',
  published: 'Опубликован',
}

// --- Канал «Заявки собственников» --------------------------------------------------------

/**
 * Первый реальный источник: заявки, которые собственники сами оставляют на
 * сайте (форма «Предложить объект», коллекция owner-applications). Основание —
 * согласие собственника (152-ФЗ), данное при отправке формы, поэтому источник
 * разрешён. Забор ничего не публикует: канал читает заявки из своей базы и
 * отдаёт их кандидатами, а очередь кладёт их со статусом «Ждёт решения»
 * (см. enqueueSourceCandidates в object-source-service.ts).
 *
 * Правила отбора: берём открытые заявки (не отклонённые и не дубли), по
 * которым ещё нет объекта каталога. Персональные данные собственника (имя,
 * телефон) в очередь не переносим — кандидату хватает характеристик объекта и
 * ссылки на заявку; заявка как была, так и остаётся в закрытой коллекции.
 *
 * В fetch идёт только минимум полей — заголовок, адрес, цена, площадь, комнаты
 * и служебный разбор. Название и адрес собираются по тем же правилам, что
 * черновик объекта из заявки (см. ownerObjectTitle в owner-applications.ts).
 */
const OWNER_EXCLUDED_STATUSES = ['rejected', 'duplicate']

const OWNER_CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  room: 'Комната',
  house: 'Дом',
  part_house: 'Часть дома',
  townhouse: 'Таунхаус',
  cottage: 'Коттедж',
  dacha: 'Дача',
  land: 'Земельный участок',
  commercial: 'Коммерческий объект',
  garage: 'Гараж',
}

const ownerText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const ownerNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Адрес заявки одной строкой — как его записал собственник */
function ownerAddressLine(address: Record<string, unknown> | null | undefined): string | null {
  const a = address || {}
  const line = [a.city, a.district, a.locality, a.snt, a.street, a.house]
    .map(ownerText)
    .filter(Boolean)
    .join(', ')
  return line || null
}

/** Заявка → кандидат очереди: характеристики объекта, без ПД собственника */
function ownerCandidate(doc: Record<string, unknown>): SourceCandidate {
  const address = (doc.address && typeof doc.address === 'object' ? doc.address : {}) as Record<string, unknown>
  const category = ownerText(doc.category)
  const place = ownerText(address.locality) || ownerText(address.street) || ownerText(address.city)
  const title = [OWNER_CATEGORY_LABELS[category] || 'Объект', place].filter(Boolean).join(', ')
  const id = doc.id as number | string
  return {
    // Номер заявки — ключ дедупликации: повторный забор не задвоит кандидата
    externalId: `owner:${id}`,
    title,
    address: ownerAddressLine(address),
    price: ownerNum(doc.price),
    area: ownerNum(doc.area),
    rooms: ownerNum(doc.rooms),
    url: null,
    // Фото заявки лежат в закрытом хранилище (owner-materials) и прямых
    // публичных ссылок не имеют — кандидату их не отдаём вовсе
    photos: [],
    // Разбор без ПД: связь с заявкой и характеристики, имя и телефон — нет
    raw: {
      applicationId: id,
      status: ownerText(doc.status) || null,
      type: ownerText(doc.type) || null,
      category: category || null,
      cadastralNumber: ownerText(doc.cadastralNumber) || null,
      receivedAt: ownerText(doc.receivedAt) || null,
      source: ownerText(doc.source) || null,
    },
  }
}

const fetchOwnerApplications: SourceFetch = async ({ client }) => {
  const { docs } = await client.find({
    collection: 'owner-applications',
    where: {
      and: [
        { status: { not_in: OWNER_EXCLUDED_STATUSES } },
        // Заявка, из которой объект уже заведён, в очередь не возвращается
        { object: { exists: false } },
      ],
    },
    sort: '-receivedAt',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const candidates = docs.map(ownerCandidate)
  return {
    candidates,
    implemented: true,
    rawCount: docs.length,
    message: `Заявки собственников: получено ${candidates.length} заявок в работу — все попадут в статус «Ждёт решения»`,
  }
}

// --- Реестр источников ------------------------------------------------------------------

const MANUAL: ObjectSourceSpec = {
  slug: 'manual',
  name: 'Н15: ручной ввод',
  summary: 'Карточку заводит сотрудник агентства — собственный объект Н15',
  origin: 'n15',
  kind: 'manual',
  policy: 'allowed',
  reason: 'Собственные объекты агентства: сотрудник вносит карточку сам, чужого сбора данных нет',
  gives: 'Карточка объекта, полностью заполненная сотрудником в CRM',
  limits: 'Автоматической загрузки нет: карточку заводит человек',
  needs: 'Доступ сотрудника в CRM Н15',
  docsUrl: null,
  enabledByDefault: true,
  credentials: [],
  fetch: null,
}

const OWNER: ObjectSourceSpec = {
  slug: 'owner',
  name: 'Заявки собственников',
  summary: 'Собственник сам предложил объект через форму на сайте',
  origin: 'owner',
  kind: 'cabinet',
  policy: 'allowed',
  reason: 'Собственник сам оставляет заявку на сайте и даёт согласие на обработку данных (152-ФЗ)',
  gives: 'Заявка с параметрами объекта; ПД собственника остаются в закрытой коллекции',
  limits: 'До проверки администратором в каталог не попадает: канал только кладёт кандидата в очередь',
  needs: 'Форма «Предложить объект» на сайте (уже работает) — доступы не нужны',
  docsUrl: null,
  enabledByDefault: true,
  credentials: [],
  // Первый реальный канал: читает заявки из своей базы, публикации нет
  fetch: fetchOwnerApplications,
}

const PARTNER: ObjectSourceSpec = {
  slug: 'partner',
  name: 'Партнёрские агентства',
  summary: 'Выгрузка объектов партнёра по договору о сотрудничестве',
  origin: 'partner',
  kind: 'feed',
  policy: 'needsAgreement',
  reason: 'Приём объектов возможен только по договору с партнёром и с его письменного согласия',
  gives: 'Фид или выгрузка объектов партнёра в согласованном формате',
  limits: 'Без договора и согласия приём объектов партнёра запрещён',
  needs: 'Договор с партнёром и адрес его выгрузки; доступ выдаёт администратор',
  docsUrl: null,
  enabledByDefault: false,
  credentials: [
    { key: 'feedUrl', label: 'Адрес выгрузки', env: 'PARTNER_FEED_URL', secret: false, required: true, hint: 'Ссылка на фид партнёра (http/https), выданная по договору' },
    { key: 'token', label: 'Токен доступа', env: 'PARTNER_FEED_TOKEN', secret: true, required: false, hint: 'Если фид закрыт — токен из договора' },
  ],
  fetch: null,
}

const DEVELOPER: ObjectSourceSpec = {
  slug: 'developer',
  name: 'Застройщики',
  summary: 'Выгрузка объектов застройщика по договору',
  origin: 'developer',
  kind: 'feed',
  policy: 'needsAgreement',
  reason: 'Приём объектов возможен только по договору с застройщиком и с его согласия',
  gives: 'Фид или выгрузка объектов застройщика в согласованном формате',
  limits: 'Без договора и согласия приём объектов застройщика запрещён',
  needs: 'Договор с застройщиком и адрес его выгрузки; доступ выдаёт администратор',
  docsUrl: null,
  enabledByDefault: false,
  credentials: [
    { key: 'feedUrl', label: 'Адрес выгрузки', env: 'DEVELOPER_FEED_URL', secret: false, required: true, hint: 'Ссылка на фид застройщика (http/https), выданная по договору' },
    { key: 'token', label: 'Токен доступа', env: 'DEVELOPER_FEED_TOKEN', secret: true, required: false, hint: 'Если фид закрыт — токен из договора' },
  ],
  fetch: null,
}

const NMARKET: ObjectSourceSpec = {
  slug: 'nmarket',
  name: 'NMarket.PRO',
  summary: 'Официальный канал обмена объектами между агентствами',
  origin: 'nmarket',
  kind: 'api',
  policy: 'needsAgreement',
  reason: 'Обмен объектами через официальный API возможен только при действующем доступе агентства',
  gives: 'Объекты, доступные агентству в NMarket.PRO по его учётной записи',
  limits: 'Доступ выдаётся площадкой; чужие данные вне учётной записи не читаются',
  needs: 'Договор с NMarket.PRO и API-ключ агентства; доступ выдаёт администратор',
  docsUrl: null,
  enabledByDefault: false,
  credentials: [
    { key: 'apiKey', label: 'API-ключ', env: 'NMARKET_API_KEY', secret: true, required: true, hint: 'Выдаётся в кабинете NMarket.PRO по договору' },
  ],
  fetch: null,
}

/**
 * Запрещённые каналы. Оставлены в реестре намеренно: у площадок есть
 * официальный канал своих объявлений (см. platform-integrations.ts), но
 * автосбор чужих страниц их правилами запрещён. Так запрет виден в реестре,
 * а не забыт, и включить такой источник нельзя.
 */
const forbidden = (slug: string, name: string): ObjectSourceSpec => ({
  slug,
  name,
  summary: 'Автосбор чужих объявлений — запрещён правилами площадки',
  origin: 'other',
  kind: 'api',
  policy: 'forbidden',
  reason: `${name} запрещает автосбор чужих объявлений: источником новых объектов для каталога он быть не может. Официальный канал площадки отдаёт только объявления самого агентства (см. «Интеграции площадок»)`,
  gives: 'Ничего: чтение чужих объявлений правилами площадки не разрешено',
  limits: 'Запрещено полностью',
  needs: 'Включить нельзя',
  docsUrl: null,
  enabledByDefault: false,
  credentials: [],
  fetch: null,
})

/**
 * Реестр источников объектов. Сначала разрешённые (собственные данные и
 * заявки), затем подключаемые по договору, затем запрещённые каналы.
 * Канал забора реализован только у «Заявок собственников» (fetch не null);
 * у остальных fetch: null — структура готова, но объектов они не отдают.
 */
export const OBJECT_SOURCE_SPECS: ObjectSourceSpec[] = [
  MANUAL,
  OWNER,
  PARTNER,
  DEVELOPER,
  NMARKET,
  forbidden('avito', 'Авито'),
  forbidden('cian', 'ЦИАН'),
  forbidden('domclick', 'Домклик'),
  forbidden('yandex', 'Яндекс Недвижимость'),
]

export const objectSourceBySlug = (slug: string): ObjectSourceSpec | undefined =>
  OBJECT_SOURCE_SPECS.find((s) => s.slug === slug)

export const objectSourceName = (slug: string): string => objectSourceBySlug(slug)?.name || slug

/** Источники, которые правилами разрешено подключать (без запрещённых) */
export const allowedObjectSources = (): ObjectSourceSpec[] =>
  OBJECT_SOURCE_SPECS.filter((s) => s.policy !== 'forbidden')

// --- Проверка подключения ----------------------------------------------------------------

/** Источник разрешён правилами (не запрещён) */
export const isAllowedObjectSource = (slug: string): boolean => {
  const spec = objectSourceBySlug(slug)
  return !!spec && spec.policy !== 'forbidden'
}

/** Обязательные поля доступа, которые не заполнены */
export const missingSourceCredentials = (
  spec: ObjectSourceSpec,
  creds: Record<string, string>,
): string[] =>
  spec.credentials
    .filter((f) => f.required && !(creds[f.key] || '').trim())
    .map((f) => f.label)

/** Все обязательные доступы источника заданы (или они не нужны) */
export const sourceCredentialsComplete = (
  spec: ObjectSourceSpec,
  creds: Record<string, string>,
): boolean => missingSourceCredentials(spec, creds).length === 0

export interface ImportGate {
  ok: boolean
  /** Почему забор сейчас невозможен — готовая формулировка для интерфейса */
  reason?: string
}

/**
 * Можно ли запускать забор с источника: проверяет правовой статус, включён ли
 * источник, реализован ли канал и заданы ли доступы. Здесь же — единый запрет
 * на автосбор чужих объявлений: у запрещённого источника ok всегда false.
 */
export function canImportFromObjectSource(
  spec: ObjectSourceSpec,
  creds: Record<string, string>,
  opts: { enabled: boolean },
): ImportGate {
  if (spec.policy === 'forbidden') {
    return { ok: false, reason: `Источник запрещён: ${spec.reason}` }
  }
  if (!opts.enabled) {
    return { ok: false, reason: `${spec.name} выключен — источник можно включить в настройках «Источники объектов»` }
  }
  if (!spec.fetch) {
    return { ok: false, reason: sourceImportNotImplemented(spec.name).message }
  }
  const missing = missingSourceCredentials(spec, creds)
  if (missing.length) {
    return { ok: false, reason: `${spec.name}: не заданы ${missing.join(', ')} — подключение выполняет администратор` }
  }
  return { ok: true }
}

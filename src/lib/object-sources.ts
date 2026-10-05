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
 *   — никакой загрузки объектов в основе модуля: ни один канал пока не
 *     реализован (fetch: null), поэтому структура готова, а данных нет;
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
  /** Забор объектов с источника; null — канал ещё не реализован (основа модуля) */
  fetch: ((creds: Record<string, string>) => Promise<SourceImportResult>) | null
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
  /** Канал забора реализован; в основе модуля у всех источников false */
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
  gives: 'Заявка с параметрами объекта и контактами собственника',
  limits: 'До проверки администратором в каталог не попадает — так устроено уже сейчас',
  needs: 'Форма «Предложить объект» на сайте (уже работает)',
  docsUrl: null,
  enabledByDefault: true,
  credentials: [],
  fetch: null,
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
 * `fetch: null` у всех: в основе модуля забор не реализован — структура
 * готова, реальные объекты не загружаются.
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

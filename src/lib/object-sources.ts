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
 *   — забор ведёт канал самого источника (поле fetch). Подключены три канала:
 *     «Заявки собственников» читает заявки из своей базы (owner-applications),
 *     «ГИС Торги» — публичный JSON-API государственного портала торгов
 *     (torgi.gov.ru, без доступов), «Партнёрские агентства» — согласованный
 *     JSON-фид по договору. Все кладут объекты только кандидатами в очередь —
 *     без публикации. Первое подключение внешнего источника ограничено потолком
 *     (importLimit, не больше 5 объектов за забор): очередь наполняется порциями,
 *     массовой загрузки нет. У остальных каналов (застройщики, NMarket) fetch:
 *     null, то есть структура готова, но данных от них нет: API и XML площадок
 *     в этом этапе не подключаются;
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
  /**
   * Потолок одного забора. Первое подключение внешнего источника не должно
   * массово заваливать очередь: не больше этого числа объектов за прогон.
   * Не задан — ограничение только защитное (FEED_MAX_ITEMS у фида).
   */
  importLimit?: number
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
  /** Регион/район, как его назвал источник */
  region: string | null
  address: string | null
  /** Тип объекта — код справочника OBJECT_CATEGORIES (квартира, дом, участок…) */
  objectType: string | null
  /** Вид сделки: sale или rent, если источник его отдаёт */
  dealType: string | null
  price: number | null
  area: number | null
  rooms: number | null
  /** Описание объекта от источника — показывается в карточке каталога */
  description: string | null
  /** Ссылка на объект у источника — внутренние данные, клиенту не показывается */
  url: string | null
  photos: string[]
  /** Партнёрская комиссия/вознаграждение — закрытое условие, клиенту не показывается */
  commission: string | null
  /** Дата актуальности данных на стороне источника (ISO) */
  actualAt: string | null
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

// --- Тип объекта и вид сделки ------------------------------------------------------------

/**
 * Синонимы типа объекта у источников → код справочника OBJECT_CATEGORIES.
 * Партнёры и заявки называют тип по-разному («Квартира», «кв.», apartment),
 * а в карточку каталога должен уйти код категории. Неизвестное значение не
 * выдумываем: кандидат остаётся без типа, сотрудник уточнит его при проверке.
 */
const OBJECT_TYPE_ALIASES: Record<string, string> = {
  apartment: 'apartment',
  flat: 'apartment',
  квартира: 'apartment',
  кв: 'apartment',
  комната: 'room',
  room: 'room',
  дом: 'house',
  house: 'house',
  домовладение: 'house',
  таунхаус: 'townhouse',
  townhouse: 'townhouse',
  коттедж: 'cottage',
  cottage: 'cottage',
  дача: 'dacha',
  dacha: 'dacha',
  участок: 'land',
  земельныйучасток: 'land',
  земля: 'land',
  зу: 'land',
  land: 'land',
  коммерческая: 'commercial',
  коммерция: 'commercial',
  commercial: 'commercial',
  гараж: 'garage',
  garage: 'garage',
  частьдома: 'part_house',
  parthouse: 'part_house',
}

/** Вид сделки у источников → код поля type коллекции objects */
const DEAL_TYPE_ALIASES: Record<string, string> = {
  sale: 'sale',
  продажа: 'sale',
  продам: 'sale',
  rent: 'rent',
  аренда: 'rent',
  сдам: 'rent',
  снять: 'rent',
}

/** Нормализация подписи источника: регистр, пробелы и знаки, ё → е */
const aliasKey = (v: unknown): string =>
  typeof v === 'string' ? v.trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s._-]+/g, '') : ''

/**
 * Тип объекта источника → код категории каталога (или null, если не распознан).
 * Таблица синонимов самодостаточна — включает и сами коды справочника
 * (apartment, house, part_house…), поэтому файл правил остаётся без рантайм-
 * импортов и работает в быстрых проверках node.
 */
export function sourceObjectType(v: unknown): string | null {
  const key = aliasKey(v)
  return key ? OBJECT_TYPE_ALIASES[key] || null : null
}

/** Вид сделки источника → sale/rent (или null, если источник его не назвал) */
export function sourceDealType(v: unknown): string | null {
  const key = aliasKey(v)
  return key ? DEAL_TYPE_ALIASES[key] || null : null
}

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
    region: ownerText(address.district) || ownerText(address.city) || null,
    address: ownerAddressLine(address),
    // Тип объекта и вид сделки заявки — кодами справочника каталога
    objectType: sourceObjectType(category),
    dealType: sourceDealType(ownerText(doc.type)),
    price: ownerNum(doc.price),
    area: ownerNum(doc.area),
    rooms: ownerNum(doc.rooms),
    description: ownerText(doc.description) || null,
    url: null,
    // Фото заявки лежат в закрытом хранилище (owner-materials) и прямых
    // публичных ссылок не имеют — кандидату их не отдаём вовсе
    photos: [],
    commission: null,
    actualAt: ownerText(doc.receivedAt) || null,
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

// --- Канал «Партнёрский JSON-фид» --------------------------------------------------------

/**
 * Первый внешний источник: партнёр по договору отдаёт объекты обычным
 * JSON-фидом. Канал реализован ровно так, как требует правовой статус
 * `needsAgreement`: адрес выгрузки и токен выдаёт партнёр по договору, без
 * них забор не запускается (см. missingSourceCredentials). Никакого
 * чтения чужих страниц и XML/API площадок здесь нет — только согласованный
 * JSON-документ по известному адресу.
 *
 * Формат фида — массив объектов или объект с массивом в одном из полей
 * `items`, `objects`, `data`, `results`, `listings`. Поля одного объекта
 * читаются терпимо к синонимам (партнёры называют их по-разному):
 *   id | externalId | objectId      — идентификатор у источника (ключ дедупликации);
 *   title | name                    — название;
 *   region                          — регион/район;
 *   address                         — адрес (строкой или объектом);
 *   category | objectType | … | type — тип объекта (код справочника категорий);
 *   dealType | deal | operation     — вид сделки (sale/rent);
 *   price | cost                    — стоимость;
 *   area | square                   — площадь, м²;
 *   rooms | roomCount               — комнат;
 *   description | text              — описание;
 *   url | link | sourceUrl          — ссылка у источника (закрытая, для CRM);
 *   commission                      — вознаграждение (закрытое, для CRM);
 *   actualAt | updatedAt | updated  — дата актуальности;
 *   photos | images                 — массив ссылок (строк или объектов с url).
 *
 * Кандидат несёт только характеристики объекта: персональные данные
 * собственника партнёр не передаёт, а ссылку и комиссию посетитель сайта
 * никогда не увидит (см. SourceObjects.ts — доступ к полям только у админа).
 */
const FEED_MAX_ITEMS = 500
const FEED_TIMEOUT_MS = 15_000

const isFeedObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const feedText = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/** Число из фида: принимает и число, и строку «4 500 000» / «54,5» */
const feedNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = feedText(v)
  if (!s) return null
  const n = Number(s.replace(/[\s ]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Ссылка фида: только http/https — прочие схемы отбрасываем */
const feedUrl = (v: unknown): string | null => {
  const s = feedText(v)
  return s && /^https?:\/\//i.test(s) ? s : null
}

/** Первое непустое значение из списка синонимов поля */
const feedPick = (item: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    const v = item[key]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

/** Адрес фида одной строкой: строка как есть или сборка из частей объекта */
function feedAddressLine(v: unknown): string | null {
  const line = feedText(v)
  if (line) return line
  if (!isFeedObject(v)) return null
  const parts = [v.city, v.district, v.locality, v.street, v.house].map(feedText).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Фото фида: массив ссылок или объектов с url — только http/https */
function feedPhotos(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((p) => (isFeedObject(p) ? feedUrl(feedPick(p, ['url', 'src', 'link', 'image'])) : feedUrl(p)))
    .filter((p): p is string => !!p)
}

/** Список объектов из ответа фида: корневой массив или массив в известном поле */
function feedItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isFeedObject)
  if (isFeedObject(payload)) {
    for (const key of ['items', 'objects', 'data', 'results', 'listings']) {
      if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter(isFeedObject)
    }
  }
  return []
}

/**
 * Персональные данные в разборе фида не храним: разбор нужен для сверки
 * характеристик объекта, а не для чужих контактов. Даже если партнёр прислал
 * телефон или почту собственника, в разбор они не попадут (152-ФЗ).
 */
const FEED_PII_KEYS = new Set([
  'ownername',
  'ownerphone',
  'phone',
  'phonenumber',
  'contact',
  'contactname',
  'contactphone',
  'email',
  'owneremail',
  'passport',
  'snils',
])

function feedRaw(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (FEED_PII_KEYS.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

/** Запись фида → кандидат очереди: характеристики объекта без чужих ПД */
function partnerCandidate(item: Record<string, unknown>): SourceCandidate {
  const id = feedText(feedPick(item, ['id', 'externalId', 'objectId']))
  const photos = feedPhotos(feedPick(item, ['photos', 'images']))
  return {
    // Идентификатор источника — ключ дедупликации: повторный забор той же
    // записи обновит кандидата, а не создаст второго (см. object-source-service)
    externalId: id,
    title: feedText(feedPick(item, ['title', 'name'])),
    region: feedText(feedPick(item, ['region', 'district', 'areaName'])),
    address: feedAddressLine(feedPick(item, ['address', 'location'])),
    // Тип объекта и вид сделки — кодами справочника каталога (синонимы фида)
    objectType: sourceObjectType(feedPick(item, ['category', 'objectType', 'propertyType', 'kind', 'type'])),
    dealType: sourceDealType(feedPick(item, ['dealType', 'deal', 'operation'])),
    price: feedNum(feedPick(item, ['price', 'cost'])),
    area: feedNum(feedPick(item, ['area', 'square'])),
    rooms: feedNum(feedPick(item, ['rooms', 'roomCount'])),
    description: feedText(feedPick(item, ['description', 'text'])),
    url: feedUrl(feedPick(item, ['url', 'link', 'sourceUrl'])),
    photos,
    commission: feedText(feedPick(item, ['commission', 'fee'])),
    actualAt: feedText(feedPick(item, ['actualAt', 'updatedAt', 'updated'])),
    // Разбор без ПД: запись фида за вычетом контактов, чтобы сотрудник сверил
    // характеристики объекта, а чужие персональные данные в очередь не попали
    raw: feedRaw(item),
  }
}

/**
 * Забор объектов из JSON-фида партнёра. Канал реализован всегда (implemented:
 * true) — сбой соединения или не-JSON ответ не выдаётся за успех: кандидатов
 * нет, а в очереди и журнале остаётся честное сообщение. Токен, если задан,
 * уходит заголовком Authorization: Bearer.
 */
const fetchPartnerFeed: SourceFetch = async ({ creds }) => {
  const url = (creds.feedUrl || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return {
      candidates: [],
      implemented: true,
      message: 'Партнёрский фид: адрес выгрузки не задан или неверен — объекты не получены',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(creds.token ? { Authorization: `Bearer ${creds.token}` } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError' ? 'источник не ответил вовремя' : 'нет связи с источником'
    return { candidates: [], implemented: true, message: `Партнёрский фид: ${reason} — объекты не получены` }
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    return { candidates: [], implemented: true, message: `Партнёрский фид: источник ответил отказом (код ${res.status}) — объекты не получены` }
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    return { candidates: [], implemented: true, message: 'Партнёрский фид: ответ не является JSON — объекты не получены' }
  }

  const all = feedItems(payload)
  const items = all.slice(0, FEED_MAX_ITEMS)
  const candidates = items
    .map(partnerCandidate)
    // Запись без идентификатора, названия и адреса бесполезна — её не берём
    .filter((c) => c.externalId || c.title || c.address)
  const truncated = all.length > items.length ? ` (взяты первые ${FEED_MAX_ITEMS})` : ''
  return {
    candidates,
    implemented: true,
    rawCount: all.length,
    message: `Партнёрский фид: получено объектов — ${candidates.length}${truncated}`,
  }
}

// --- Канал «ГИС Торги» -------------------------------------------------------------------

/**
 * Первый государственный источник: портал торгов torgi.gov.ru отдаёт карточки
 * лотов публичным JSON-API — открытые сведения о торгах, без авторизации и
 * токенов. Канал берёт только недвижимость и только наши регионы, не больше
 * потолка за забор, и кладёт кандидатов в очередь без публикации.
 *
 * Как устроен забор (проверено по фактическому формату API портала):
 *   — поиск: GET /new/api/public/lotcards/search с фильтрами
 *     dynSubjRF (коды субъектов РФ), lotStatus (актуальные статусы),
 *     catCode (категория имущества), сортировка по свежести;
 *   — карточка лота: GET /new/api/public/lotcards/{id} — начальная цена,
 *     задаток, шаг аукциона, даты, ссылка на ЭТП, документы;
 *   — по каждому лоту запрашивается отдельная карточка: без неё нет цены и
 *     документов, а выдумывать значения нельзя.
 *
 * Приоритет категорий — как у Н15: квартиры, дома, коммерция, участки.
 * Категории опрашиваются по очереди, и как только набрано не больше
 * TORGI_MAX_ITEMS объектов, забор останавливается: массовой загрузки нет.
 *
 * Персональные данные в очередь не попадают: сведения о лоте — это объект,
 * а не собственник. Публичные данные организатора торгов в разбор не кладём
 * вовсе (телефоны, контактные лица и адреса приёма граждан отбрасываются):
 * разбор собирается по белому списку полей, а не копированием ответа.
 */
const TORGI_SEARCH_URL = 'https://torgi.gov.ru/new/api/public/lotcards/search'
const TORGI_LOT_API_URL = 'https://torgi.gov.ru/new/api/public/lotcards'
const TORGI_LOT_PAGE_URL = 'https://torgi.gov.ru/new/public/lots/lot'
const TORGI_FILE_URL = 'https://torgi.gov.ru/new/file-store/v1'
const TORGI_TIMEOUT_MS = 15_000
/** Потолок одного забора: очередь наполняется порциями, а не массово */
const TORGI_MAX_ITEMS = 5

/** Категории портала в порядке приоритета Н15: код → тип объекта каталога */
const TORGI_CATEGORY_PRIORITY: { code: string; objectType: string }[] = [
  { code: '9', objectType: 'apartment' }, // Жилые помещения — квартиры и комнаты
  { code: '8', objectType: 'house' }, // Здания — дома
  { code: '11', objectType: 'commercial' }, // Нежилые помещения
  { code: '2', objectType: 'land' }, // Земельные участки
]

/** Актуальные лоты: идёт приём заявок или извещение опубликовано */
const TORGI_ACTIVE_STATUSES = ['APPLICATIONS_SUBMISSION', 'PUBLISHED']

const TORGI_STATUS_LABELS: Record<string, string> = {
  APPLICATIONS_SUBMISSION: 'Приём заявок',
  PUBLISHED: 'Опубликован',
  DETERMINING_WINNER: 'Определение победителя',
  SUCCEED: 'Состоялся',
  FAILED: 'Не состоялся',
  CANCELED: 'Отменён',
}

/** Наши регионы: код субъекта РФ портала → название */
const TORGI_REGIONS: { code: string; name: string }[] = [
  { code: '77', name: 'г. Москва' },
  { code: '50', name: 'Московская область' },
  { code: '78', name: 'г. Санкт-Петербург' },
  { code: '23', name: 'Краснодарский край' },
  { code: '26', name: 'Ставропольский край' },
  { code: '1', name: 'Республика Адыгея' },
  { code: '15', name: 'Республика Северная Осетия-Алания' },
]

const TORGI_REGION_NAMES = new Map(TORGI_REGIONS.map((r) => [r.code, r.name]))

/** Ответ портала: разобранный JSON или честная причина отказа */
interface TorgiResponse {
  ok: boolean
  data?: Record<string, unknown>
  reason?: string
}

/** Запрос к публичному API портала: JSON или причина, без выдуманных успехов */
async function torgiGetJson(url: string): Promise<TorgiResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TORGI_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, reason: `портал ответил отказом (код ${res.status})` }
    return { ok: true, data: (await res.json()) as Record<string, unknown> }
  } catch (e) {
    const reason =
      e instanceof Error && e.name === 'AbortError' ? 'портал не ответил вовремя' : 'нет связи с порталом'
    return { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
}

/** Поиск лотов одной категории в наших регионах — самые свежие сверху */
async function torgiSearch(catCode: string): Promise<TorgiResponse & { items?: Record<string, unknown>[] }> {
  const params = new URLSearchParams({
    dynSubjRF: TORGI_REGIONS.map((r) => r.code).join(','),
    lotStatus: TORGI_ACTIVE_STATUSES.join(','),
    catCode,
    page: '0',
    size: '10',
    sort: 'firstVersionPublicationDate,desc',
  })
  const res = await torgiGetJson(`${TORGI_SEARCH_URL}?${params.toString()}`)
  if (!res.ok) return res
  const content = res.data?.content
  const items = Array.isArray(content) ? content.filter(isFeedObject) : []
  return { ok: true, items }
}

/** Карточка лота: цена, задаток, шаг, даты, документы. Сбой — null, без выдумок */
async function torgiLotDetail(id: string): Promise<Record<string, unknown> | null> {
  const res = await torgiGetJson(`${TORGI_LOT_API_URL}/${encodeURIComponent(id)}`)
  return res.ok && res.data ? res.data : null
}

/** Значение характеристики лота по коду или названию (строка или мультивыбор) */
function torgiCharacteristic(
  sources: (Record<string, unknown> | null)[],
  re: RegExp,
): string | null {
  for (const src of sources) {
    const chars = src?.characteristics
    if (!Array.isArray(chars)) continue
    for (const c of chars) {
      if (!isFeedObject(c)) continue
      if (!re.test(String(c.code || '')) && !re.test(String(c.name || ''))) continue
      const value = c.characteristicValue
      if (Array.isArray(value)) {
        const first = value.find(isFeedObject) as Record<string, unknown> | undefined
        const s = feedText(first?.value) || feedText(first?.name)
        if (s) return s
      } else {
        const s = feedText(value)
        if (s) return s
      }
    }
  }
  return null
}

/** Начальная цена лота: явные поля карточки портала (задаток и шаг — не цена) */
function torgiPrice(item: Record<string, unknown>, detail: Record<string, unknown> | null): number | null {
  for (const src of [detail, item]) {
    if (!src) continue
    for (const key of ['priceMin', 'price', 'startPrice', 'priceStart']) {
      const n = feedNum(src[key])
      if (n != null && n > 0) return n
    }
  }
  return null
}

/** Местоположение, записанное прямо в названии или описании лота */
function torgiLocationFromText(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/(?:местоположени\w*|адрес\w*|расположен\w*)\s*:?\s*([\s\S]+)/i)
  if (!m) return null
  const line = m[1]
    .split(/\s*\(/)[0]
    .split(/,\s*(?:для|с целью|категория|вид |общей|площадью)/i)[0]
    .replace(/\s+/g, ' ')
    .replace(/[.;,\s]+$/, '')
    .trim()
  return line.length >= 6 ? line.slice(0, 300) : null
}

/** Адрес лота: готовое поле карточки, иначе местоположение из текста лота */
function torgiAddress(item: Record<string, unknown>, detail: Record<string, unknown> | null): string | null {
  for (const src of [detail, item]) {
    if (!src) continue
    const direct = feedAddressLine(feedPick(src, ['objectAddress', 'address', 'location', 'lotAddress']))
    if (direct) return direct
  }
  for (const src of [item, detail]) {
    if (!src) continue
    const parsed = torgiLocationFromText(feedText(src.lotName) || feedText(src.lotDescription))
    if (parsed) return parsed
  }
  return null
}

/** Официальные фото лота: идентификаторы файлов портала → публичные ссылки */
function torgiPhotos(item: Record<string, unknown>): string[] {
  const images = item.lotImages
  if (!Array.isArray(images)) return []
  return images
    .map((v) => feedText(v))
    .filter((v): v is string => !!v)
    .map((v) => (/^https?:\/\//i.test(v) ? v : `${TORGI_FILE_URL}/${encodeURIComponent(v)}?disposition=inline`))
    .slice(0, 10)
}

/** Документы лота портала: имя файла и публичная ссылка (без ПД) */
function torgiDocuments(detail: Record<string, unknown> | null): { name: string; url: string }[] {
  const list = detail?.lotAttachments
  if (!Array.isArray(list)) return []
  return list
    .map((a) => {
      if (!isFeedObject(a)) return null
      const fileId = feedText(a.fileId)
      if (!fileId) return null
      return { name: feedText(a.fileName) || 'Документ', url: `${TORGI_FILE_URL}/${encodeURIComponent(fileId)}` }
    })
    .filter((d): d is { name: string; url: string } => !!d)
    .slice(0, 20)
}

/** Количество комнат: характеристика лота, иначе разбор «N-комн.» из названия */
function torgiRooms(
  title: string | null,
  sources: (Record<string, unknown> | null)[],
): number | null {
  const fromCharacteristic = feedNum(torgiCharacteristic(sources, /комнат/i))
  if (fromCharacteristic != null) return fromCharacteristic
  const m = (title || '').match(/(\d+)\s*-?\s*комн/i)
  return m ? Number(m[1]) : null
}

/**
 * Лот портала → кандидат очереди: характеристики объекта без персональных
 * данных. Разбор (raw) собирается по белому списку — ответ портала целиком не
 * копируется, чтобы контакты организатора и служебные поля не попали в CRM.
 * Ссылка на лот, идентификатор и разбор хранятся в закрытых полях (см.
 * SourceObjects.ts — доступ только администратору) и на сайте не показываются.
 */
function torgiCandidate(
  item: Record<string, unknown>,
  detail: Record<string, unknown> | null,
  objectType: string,
): SourceCandidate {
  const id = feedText(item.id) || ''
  const title = feedText(item.lotName)
  const regionCode = feedText(item.subjectRFCode) || feedText(detail?.subjectRFCode)
  const category = isFeedObject(item.category) ? feedText(item.category.name) : null
  const statusCode = feedText(item.lotStatus)
  const statusLabel = statusCode ? TORGI_STATUS_LABELS[statusCode] || statusCode : null
  const cadastralNumber = torgiCharacteristic([item, detail], /cadastral|кадастр/i)
  const area = feedNum(torgiCharacteristic([item, detail], /^square|площад/i))
  const price = torgiPrice(item, detail)
  const documents = torgiDocuments(detail)

  return {
    // Идентификатор лота портала — ключ дедупликации при повторном заборе
    externalId: id || null,
    title,
    region: regionCode ? TORGI_REGION_NAMES.get(regionCode) || null : null,
    address: torgiAddress(item, detail),
    objectType,
    dealType: sourceDealType(feedText(item.typeTransaction) || feedPick(item, ['dealType', 'deal', 'operation'])),
    price,
    area,
    rooms: torgiRooms(title, [item, detail]),
    description: (feedText(item.lotDescription) || '').slice(0, 4000) || null,
    // Публичная страница лота на портале — внутренние данные, клиенту не показывается
    url: id ? `${TORGI_LOT_PAGE_URL}/${encodeURIComponent(id)}` : null,
    photos: torgiPhotos(item),
    // Комиссии у государственных торгов нет
    commission: null,
    actualAt: feedText(item.noticeFirstVersionPublicationDate) || feedText(item.createDate) || null,
    // Разбор по белому списку: только характеристики объекта и ход торгов, без ПД
    raw: {
      torgi: {
        id,
        noticeNumber: feedText(item.noticeNumber),
        lotNumber: feedNum(item.lotNumber),
        status: statusCode,
        statusLabel,
        biddType: isFeedObject(item.biddType) ? feedText(item.biddType.name) : null,
        biddForm: isFeedObject(item.biddForm) ? feedText(item.biddForm.name) : null,
        category,
        subjectRFCode: regionCode,
        region: regionCode ? TORGI_REGION_NAMES.get(regionCode) || null : null,
        dealType: feedText(item.typeTransaction),
        biddEndTime: feedText(item.biddEndTime),
        biddStartTime: feedText(detail?.biddStartTime),
        auctionStartDate: feedText(detail?.auctionStartDate),
        etpUrl: feedText(detail?.etpUrl),
        cadastralNumber,
        area,
        priceMin: price,
        deposit: feedNum(detail?.deposit),
        priceStep: feedNum(detail?.priceStep),
        photos: torgiPhotos(item),
        documents,
      },
    },
  }
}

/**
 * Забор недвижимости с ГИС Торги. Категории опрашиваются по приоритету Н15;
 * на каждый лот запрашивается карточка портала (цена, задаток, документы).
 * Канал реализован всегда (implemented: true): сбой связи или отказ портала
 * не выдаётся за успех — кандидатов нет, а в очереди и журнале остаётся
 * честное сообщение. Публикации нет: кандидаты кладутся в очередь со статусом
 * «Ждёт решения» (см. importFromObjectSource).
 */
const fetchGisTorgi: SourceFetch = async () => {
  const candidates: SourceCandidate[] = []
  const seen = new Set<string>()
  let rawCount = 0
  let detailFailures = 0
  let firstFailure: string | null = null

  for (const category of TORGI_CATEGORY_PRIORITY) {
    if (candidates.length >= TORGI_MAX_ITEMS) break
    const found = await torgiSearch(category.code)
    if (!found.ok) {
      // Первая же неудача — портал недоступен: дальше по категориям не долбим
      firstFailure = firstFailure || found.reason || 'ошибка запроса'
      if (!candidates.length) break
      continue
    }
    const items = found.items || []
    rawCount += items.length
    for (const item of items) {
      if (candidates.length >= TORGI_MAX_ITEMS) break
      const id = feedText(item.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const detail = await torgiLotDetail(id)
      if (!detail) detailFailures += 1
      candidates.push(torgiCandidate(item, detail, category.objectType))
    }
  }

  if (!candidates.length) {
    return {
      candidates: [],
      implemented: true,
      rawCount,
      message: `ГИС Торги: ${firstFailure || 'подходящих объектов в наших регионах не найдено'} — объекты не получены`,
    }
  }
  const tail = detailFailures
    ? `; по ${detailFailures} лотам карточка портала не открылась — часть полей (цена, задаток, документы) пуста`
    : ''
  return {
    candidates,
    implemented: true,
    rawCount,
    message: `ГИС Торги: получено объектов — ${candidates.length} из ${rawCount} найденных${tail}`,
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
  summary: 'JSON-фид объектов партнёра по договору о сотрудничестве',
  origin: 'partner',
  kind: 'feed',
  policy: 'needsAgreement',
  reason: 'Приём объектов возможен только по договору с партнёром и с его письменного согласия',
  gives: 'JSON-фид объектов партнёра в согласованном формате: характеристики, фото, ссылка и вознаграждение',
  limits: 'Без договора и адреса выгрузки приём объектов партнёра запрещён; в каталог — только вручную после проверки',
  needs: 'Договор с партнёром и адрес его JSON-фида; доступ выдаёт администратор',
  docsUrl: null,
  enabledByDefault: false,
  // Первое подключение — не больше 5 объектов за забор: очередь наполняется
  // порциями, массовой загрузки нет (см. importFromObjectSource)
  importLimit: 5,
  credentials: [
    { key: 'feedUrl', label: 'Адрес выгрузки', env: 'PARTNER_FEED_URL', secret: false, required: true, hint: 'Ссылка на JSON-фид партнёра (http/https), выданная по договору' },
    { key: 'token', label: 'Токен доступа', env: 'PARTNER_FEED_TOKEN', secret: true, required: false, hint: 'Если фид закрыт — токен из договора (уйдёт заголовком Authorization: Bearer)' },
  ],
  // Первый внешний канал: читает согласованный JSON-фид партнёра. Публикации
  // нет — кандидаты кладутся в очередь со статусом «Ждёт решения».
  fetch: fetchPartnerFeed,
}

const GIS_TORGI: ObjectSourceSpec = {
  slug: 'gis-torgi',
  name: 'ГИС Торги',
  summary: 'Государственные торги по недвижимости: публичный API портала torgi.gov.ru',
  // Отдельного происхождения «ГИС Торги» в справочнике нет (новое значение
  // select меняло бы enum в базе), поэтому карточка помечается как «Другая
  // площадка», а точный канал виден по полю source кандидата и по ссылке
  origin: 'other',
  kind: 'api',
  policy: 'allowed',
  reason:
    'Официальный государственный портал раскрывает сведения о торгах публично; забираются только открытые данные о лоте — без авторизации и персональных данных',
  gives:
    'Актуальные лоты-недвижимость наших регионов: тип, адрес, площадь, кадастровый номер, начальная цена, задаток и шаг, статус торгов, даты, официальные фото и документы',
  limits:
    'Не больше 5 объектов за забор и только в очередь; в каталог — вручную после проверки. Контакты организатора и лишние поля портала в очередь не переносятся',
  needs:
    'Ничего: данные открыты. Перед боевым использованием свериться с условиями использования портала — источник подключает администратор',
  docsUrl: 'https://torgi.gov.ru',
  enabledByDefault: false,
  // Первое подключение тестового источника — не больше 5 объектов за забор
  // (см. importFromObjectSource): очередь наполняется порциями
  importLimit: TORGI_MAX_ITEMS,
  credentials: [],
  // Государственный канал: публичный JSON-API портала, без доступов.
  // Публикации нет — кандидаты кладутся в очередь со статусом «Ждёт решения».
  fetch: fetchGisTorgi,
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
 * заявки, затем открытые государственные торги), затем подключаемые по
 * договору, затем запрещённые каналы. Канал забора реализован у «Заявок
 * собственников», «ГИС Торги» и партнёрского JSON-фида (fetch не null);
 * у остальных fetch: null — структура готова, но объектов они не отдают.
 */
export const OBJECT_SOURCE_SPECS: ObjectSourceSpec[] = [
  MANUAL,
  OWNER,
  GIS_TORGI,
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

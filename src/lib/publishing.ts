/**
 * «Публикация на площадках» — движок выгрузки объектов CRM на внешние
 * площадки (сайт N15, VK, Telegram; Авито/ЦИАН/Яндекс/Домклик подключаются
 * позже по официальным API/фидам).
 *
 * CRM — единственный источник данных: текст объявления всегда собирается
 * из текущего документа объекта при каждой выгрузке, никаких кэшей
 * объявлений. Этот файл без импортов (как src/lib/valuation.ts и
 * listing-check.ts): работает на сервере и в быстрых проверках node.
 * Серверная обвязка (адаптеры, запись статусов в БД) — в publish-*.ts.
 *
 * ПРИНЦИПЫ РАБОТЫ С ДАННЫМИ (требования владельца):
 * - личный номер собственника (ownerPhone) не публикуется никогда;
 * - кадастровый номер, паспортные данные и «закрытые» документы в тексты
 *   объявлений не попадают (эти поля вообще не входят в набор публикации);
 * - контакт в объявлении — только общий номер сайта либо телефон агента
 *   (что передаст серверная обвязка); клиентам площадки открытых номеров
 *   агентов не даём (на сайте — кнопки «Позвонить»/«WhatsApp»).
 */

// --- Площадки публикации --------------------------------------------------------

export type PublishPlatformSlug = 'site' | 'vk' | 'telegram' | 'avito' | 'cian' | 'yandex' | 'domclick' | 'instagram'

/** Статус публикации объекта на одной площадке (строка publishing.items) */
export type PublishStatus = 'off' | 'published' | 'error' | 'removed'

/** События журнала публикаций (publishing.log) */
export type PublishLogEvent = 'publish' | 'update' | 'unpublish' | 'withdraw' | 'error' | 'validate' | 'note'

export interface PublishPlatformSpec {
  slug: PublishPlatformSlug
  /** Название площадки (в CRM) */
  name: string
  /** Чем является площадка для нас */
  kind: 'site' | 'social' | 'marketplace'
  /**
   * Готовность автоматической публикации:
   * ready    — работает сразу (сайт N15);
   * env      — адаптер готов, нужны ключи в окружении (VK, Telegram);
   * contract — официальный канал по договору/в кабинете площадки (Авито,
   *            ЦИАН, Яндекс Недвижимость, Домклик) — подключается по
   *            получении API/XML-доступа;
   * noapi    — технической возможности автоматической публикации нет
   *            (Instagram: официального API для объявлений недвижимости нет).
   */
  readiness: 'ready' | 'env' | 'contract' | 'noapi'
  /** Ключи окружения, нужные адаптеру (readiness = env) */
  env?: string[]
  /** Человекочитаемое пояснение готовности — показывается в карточке CRM */
  note: string
  /** Лимит символов текста объявления (0 — без лимита) */
  messageLimit: number
}

export const PUBLISH_PLATFORMS: PublishPlatformSpec[] = [
  {
    slug: 'site',
    name: 'Сайт N15',
    kind: 'site',
    readiness: 'ready',
    note: 'Публикация в каталог n15-realty.ru',
    messageLimit: 0,
  },
  {
    slug: 'vk',
    name: 'VK',
    kind: 'social',
    readiness: 'env',
    env: ['VK_GROUP_TOKEN', 'VK_GROUP_ID'],
    note: 'Пост в сообщество ВКонтакте через официальный API (токен сообщества)',
    messageLimit: 15000,
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    kind: 'social',
    readiness: 'env',
    env: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID'],
    note: 'Публикация в канал Telegram через официальный Bot API',
    messageLimit: 1024,
  },
  {
    slug: 'avito',
    name: 'Авито',
    kind: 'marketplace',
    readiness: 'contract',
    note: 'Подключается после получения доступа к API/XML-фиду Авито для бизнеса',
    messageLimit: 0,
  },
  {
    slug: 'cian',
    name: 'ЦИАН',
    kind: 'marketplace',
    readiness: 'contract',
    note: 'Подключается по партнёрскому API/фиду ЦИАН (договор с площадкой)',
    messageLimit: 0,
  },
  {
    slug: 'yandex',
    name: 'Яндекс Недвижимость',
    kind: 'marketplace',
    readiness: 'contract',
    note: 'Подключается выгрузкой XML-фида в кабинете Яндекс.Недвижимости',
    messageLimit: 0,
  },
  {
    slug: 'domclick',
    name: 'Домклик',
    kind: 'marketplace',
    readiness: 'contract',
    note: 'Подключается по партнёрской выгрузке Домклика (кабинет агентства)',
    messageLimit: 0,
  },
  {
    slug: 'instagram',
    name: 'Instagram',
    kind: 'marketplace',
    readiness: 'noapi',
    note: 'Официального API для размещения объявлений нет — публикация не выполняется',
    messageLimit: 0,
  },
]

export const publishPlatformBySlug = (slug: string): PublishPlatformSpec | undefined =>
  PUBLISH_PLATFORMS.find((p) => p.slug === slug)

/** Площадка, у которой готов адаптер (readiness: ready/env) */
export const isPublishablePlatform = (spec: PublishPlatformSpec): boolean =>
  spec.readiness === 'ready' || spec.readiness === 'env'

/** Ключи окружения площадки настроены (readiness = env) */
export const platformConfigured = (spec: PublishPlatformSpec): boolean =>
  !!spec.env && spec.env.every((k) => process.env[k] && String(process.env[k]).trim().length > 0)

export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  off: 'Не опубликован',
  published: 'Опубликован',
  error: 'Ошибка',
  removed: 'Снят',
}

// --- Объект глазами публикации --------------------------------------------------

export interface PublishAddress {
  city?: string | null
  district?: string | null
  cityDistrict?: string | null
  locality?: string | null
  snt?: string | null
  street?: string | null
  house?: string | null
  apartment?: string | null
}

export interface PublishObjectLike {
  id?: number | string | null
  title?: string | null
  type?: string | null // sale | rent
  category?: string | null // apartment | house | townhouse | commercial | land
  price?: number | null
  area?: number | null
  areaUnit?: string | null // sqm | are
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  address?: PublishAddress | null
  description?: string | null // «плоский» текст описания (уже без lexical-разметки)
  photos?: string[] // абсолютные URL фотографий
  /** Телефон для контакта в объявлении (общий номер сайта/агента) — решает сервер */
  contactPhone?: string | null
  agentName?: string | null
  objectUrl?: string | null // страница объекта на сайте
  isPremium?: boolean | null
  urgentSale?: boolean | null
}

export const TYPE_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' }
export const CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  house: 'Дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая недвижимость',
  land: 'Земельный участок',
}

/** Обязательные для публикации поля (код — для машины, label — для людей) */
export const PUBLISH_REQUIRED: { field: string; label: string }[] = [
  { field: 'category', label: 'Категория' },
  { field: 'type', label: 'Тип сделки' },
  { field: 'price', label: 'Цена' },
  { field: 'area', label: 'Площадь' },
  { field: 'address', label: 'Адрес' },
  { field: 'description', label: 'Описание' },
  { field: 'photos', label: 'Фотографии' },
  { field: 'agent', label: 'Агент' },
  { field: 'contactPhone', label: 'Контактный номер' },
]

export interface ValidationIssue {
  field: string
  label: string
}

/** Есть ли адрес, достаточный для объявления (улица+дом либо СНТ/населённый пункт) */
const addressFilled = (a?: PublishAddress | null): boolean => {
  if (!a) return false
  const street = (a.street || '').trim()
  const house = (a.house || '').trim()
  if (street && house) return true
  // Участок/дом в товариществе: улица может отсутствовать, но нужно
  // название товарищества или населённого пункта
  return !!((a.snt || '').trim() && (a.locality || a.city || '').trim())
}

/**
 * Проверка обязательных полей перед публикацией. description и photos
 * приходят уже «подготовленными» (текст из richText и абсолютные URL —
 * их собирает серверная обвязка). Возвращает список незаполненных полей;
 * пустой список — публикация разрешена.
 */
export function validateForPublish(o: PublishObjectLike): ValidationIssue[] {
  const missing: ValidationIssue[] = []
  const add = (field: string, ok: boolean) => {
    if (!ok) {
      const known = PUBLISH_REQUIRED.find((r) => r.field === field)
      missing.push({ field, label: known ? known.label : field })
    }
  }

  add('category', !!o.category && Object.keys(CATEGORY_LABELS).includes(String(o.category)))
  add('type', !!o.type && Object.keys(TYPE_LABELS).includes(String(o.type)))
  add('price', typeof o.price === 'number' && Number.isFinite(o.price) && o.price > 0)
  add('area', typeof o.area === 'number' && Number.isFinite(o.area) && o.area > 0)
  add('address', addressFilled(o.address))
  add('description', !!o.description && o.description.trim().length > 0)
  add('photos', Array.isArray(o.photos) && o.photos.filter(Boolean).length > 0)
  add('agent', !!o.agentName)
  add('contactPhone', !!o.contactPhone && String(o.contactPhone).trim().length > 0)
  return missing
}

// --- Текст объявления ------------------------------------------------------------

/** 5500000 → «5 500 000» */
export const formatPrice = (v: number): string =>
  new Intl.NumberFormat('ru-RU').format(Math.round(v))

/** Площадь с единицей: квартира — «45 м²», участок в сотках — «6 сот.» */
export const formatArea = (o: PublishObjectLike): string => {
  if (typeof o.area !== 'number' || !Number.isFinite(o.area) || o.area <= 0) return ''
  if (o.category === 'land' && o.areaUnit === 'are') {
    const сотки = o.area / 100
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(сотки)} сот.`
  }
  return `${formatPrice(o.area)} м²`
}

/** Полная адресная строка: «Владикавказ, ул. Пушкина, 12, кв. 5» */
export const formatAddress = (a?: PublishAddress | null): string => {
  if (!a) return ''
  const place = (a.locality || a.city || '').trim()
  const snt = (a.snt || '').trim()
  const street = (a.street || '').trim()
  const house = (a.house || '').trim()
  const apartment = (a.apartment || '').trim()
  const parts: string[] = []
  if (snt) {
    // Участок в товариществе: «СТ Кобань, Владикавказский округ»
    parts.push(snt)
    if (place) parts.push(place)
  } else {
    if (place) parts.push(place)
    if (street) parts.push(`ул. ${street}`.replace(/^ул\. ул\./i, 'ул.'))
    if (house) parts.push(house)
  }
  if (apartment) parts.push(`кв. ${apartment}`)
  return parts.join(', ')
}

/** Первая строка объявления: «1-комнатная квартира, 45 м², 5 500 000 ₽» */
export function headlineOf(o: PublishObjectLike): string {
  const parts: string[] = []
  const title = (o.title || '').trim()
  const category = o.category ? CATEGORY_LABELS[String(o.category)] || String(o.category) : ''
  parts.push(title || category)
  const area = formatArea(o)
  if (area) parts.push(area)
  const rooms = typeof o.rooms === 'number' ? o.rooms : null
  if (o.category === 'apartment' && rooms && o.totalFloors) {
    // «3/9 этаж» — детали в описании, не перегружаем заголовок
  }
  let head = parts.filter(Boolean).join(', ')
  if (typeof o.price === 'number' && o.price > 0) head += ` — ${formatPrice(o.price)} ₽`
  if (o.type) head = `${TYPE_LABELS[String(o.type)] || String(o.type)}: ${head}`
  return head
}

const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Полный текст объявления для соцсети (VK/Telegram).
 * Никаких личных данных: контакт — только переданный contactPhone
 * (общий номер сайта или телефон агентства), owner-поля не участвуют.
 */
export function buildListingMessage(o: PublishObjectLike, opts?: { contactName?: string }): string {
  const lines: string[] = []
  lines.push(headlineOf(o))
  const addr = formatAddress(o.address)
  if (addr) lines.push(`📍 ${addr}`)
  const desc = stripHtml(o.description || '')
  if (desc) lines.push('', desc)
  const phone = (o.contactPhone || '').trim()
  if (phone) {
    // Общий номер сайта 8-958-116-15-15: у клиентов нет открытых номеров агентов
    lines.push('', `📞 ${phone}${opts?.contactName ? ` — ${opts.contactName}` : ''}`)
  }
  if (o.objectUrl) lines.push(`Подробнее: ${o.objectUrl}`)
  return lines.join('\n')
}

/** Обрезка до лимита площадки с аккуратным хвостом */
export function cutMessage(msg: string, limit: number): string {
  if (!limit || limit <= 0 || msg.length <= limit) return msg
  const cut = msg.slice(0, limit - 1)
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('.'))
  return (lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd() + '…'
}

// --- Что менялось в объекте -------------------------------------------------------

/**
 * «Материальные» поля — всё, что попадает в объявление. Изменение любого
 * из них (или состава фотографий) требует обновления публикаций. Поля
 * status, valuation, placements и publishing сюда не входят: статус сайта
 * обрабатывается отдельно, служебные группы не должны дёргать экспорт.
 */
export const PUBLISH_MATERIAL_KEYS = [
  'title', 'type', 'category', 'price', 'area', 'areaUnit', 'livingArea', 'kitchenArea',
  'rooms', 'floor', 'totalFloors', 'buildingType', 'condition', 'heating', 'water',
  'sewerage', 'electricity', 'gas', 'internet', 'balcony', 'builtYear', 'elevator',
  'yard', 'parking', 'address', 'coordinates', 'description', 'features',
  'images', 'primaryImage', 'floorPlan', 'agent', 'isPremium', 'isExclusive', 'urgentSale',
]

/** Простой детерминированный хэш (djb2) — для сравнения версий объекта */
export const hashOf = (s: string): string => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * «Отпечаток» публикационных полей документа. Поля адреса и прочие группы
 * сериализуем как есть (JSON-стабильно по порядку ключей объекта).
 */
export function publishFingerprint(doc: Record<string, unknown>): string {
  const pick: Record<string, unknown> = {}
  for (const key of PUBLISH_MATERIAL_KEYS) {
    if (key in doc && doc[key] !== undefined) pick[key] = doc[key]
  }
  return hashOf(JSON.stringify(pick))
}

/** Изменились ли материальные поля между двумя версиями документа */
export function materialChanged(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  for (const key of PUBLISH_MATERIAL_KEYS) {
    const a = JSON.stringify(prev[key] ?? null)
    const b = JSON.stringify(next[key] ?? null)
    if (a !== b) return true
  }
  return false
}

/** Изменился ли состав фотографий (для решения: пересоздать пост или поправить текст) */
export function photosChanged(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const a = JSON.stringify(next['images'] ?? null) + '|' + JSON.stringify(next['primaryImage'] ?? null)
  const b = JSON.stringify(prev['images'] ?? null) + '|' + JSON.stringify(prev['primaryImage'] ?? null)
  return a !== b
}

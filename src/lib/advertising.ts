/**
 * «Реклама на сайте» — движок рекламных материалов Н15 (страница /advertising
 * и блок «ВАША РЕКЛАМА» на главной).
 *
 * Движок ничего не знает про БД и не имеет импортов (как src/lib/valuation.ts
 * и src/lib/listing-check.ts): те же правила используют и серверная обвязка
 * (src/lib/advertising-service.ts, маршруты /api/advertising/*), и коллекции
 * админки, и — при показе материалов — страницы сайта.
 *
 * Второй поток того же раздела — заявки «Ваша реклама» с формы платного
 * размещения чужого объекта (advertising-requests, правовые документы —
 * src/lib/advertising-legal.ts). У заявки свой путь статусов и своя проверка
 * перед публикацией (adRequestPublishIssue), но требования к публикации те
 * же: проверенное содержание, согласия, оплата, срок и erid.
 *
 * ПРАВИЛА РАЗМЕЩЕНИЯ (требования владельца и ФЗ «О рекламе»):
 * - материал показывается на сайте только со статусом «Опубликовано» и
 *   только внутри оплаченного срока (даты начала и окончания);
 * - публикация невозможна без подтверждения рекламодателя (advertisers.status
 *   = «подтверждён»), без проверки содержания, без оплаты и без идентификатора
 *   интернет-рекламы (erid);
 * - при публикации в материал автоматически добавляется пометка «Реклама»,
 *   сведения о рекламодателе и данные интернет-рекламы (см. adMarking) —
 *   вручную их заполнять не нужно.
 */

// --- Справочники -----------------------------------------------------------------

export type AdStatus = 'draft' | 'review' | 'ready' | 'published' | 'removed'
export type AdPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded'
export type AdvertiserStatus = 'pending' | 'confirmed' | 'rejected'
export type AdvertiserKind = 'legal' | 'ip' | 'self'
export type AdFormat = 'card' | 'banner' | 'line' | 'article'

/**
 * Статус заявки «Ваша реклама» (форма платного размещения чужого объекта).
 * Путь заявки: новая → на проверке → (уточнения) → одобрено → ожидает оплаты
 * → опубликовано → завершено; отклонено — в любой момент проверки.
 * Набор и порядок значений совпадают с select-полем коллекции
 * advertising-requests и с типом enum в базе: менять только все три сразу.
 */
export type AdRequestStatus =
  | 'new'
  | 'checking'
  | 'clarification'
  | 'approved'
  | 'awaitingPayment'
  | 'published'
  | 'rejected'
  | 'done'

/** Как к обратившемуся обращаться — первое поле формы заявки */
export type AdContactKind = 'name' | 'company' | 'agency' | 'developer' | 'other'

/** Тип объекта в заявке (что именно предлагают к размещению) */
export type AdObjectType = 'apartment' | 'house' | 'land' | 'commercial' | 'newbuilding' | 'other'

/** Пометка «Реклама» (ст. 3, 5 ФЗ «О рекламе») — показывается на материале */
export const AD_LABEL = 'Реклама'

/** Площадка размещения — для данных интернет-рекламы */
export const AD_PLATFORM = 'n15-realty.ru'

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  draft: 'Черновик',
  review: 'На проверке',
  ready: 'Готов к публикации',
  published: 'Опубликовано',
  removed: 'Снято с публикации',
}

export const AD_PAYMENT_LABELS: Record<AdPaymentStatus, string> = {
  unpaid: 'Не оплачено',
  partial: 'Оплачено частично',
  paid: 'Оплачено',
  refunded: 'Возврат оплаты',
}

export const ADVERTISER_STATUS_LABELS: Record<AdvertiserStatus, string> = {
  pending: 'Не подтверждён',
  confirmed: 'Подтверждён',
  rejected: 'Отклонён',
}

export const ADVERTISER_KIND_LABELS: Record<AdvertiserKind, string> = {
  legal: 'Юридическое лицо',
  ip: 'ИП',
  self: 'Физлицо (самозанятый)',
}

export const AD_FORMAT_LABELS: Record<AdFormat, string> = {
  card: 'Карточка',
  banner: 'Баннер',
  line: 'Строчная ссылка',
  article: 'Статья',
}

export const AD_STATUS_OPTIONS = (Object.keys(AD_STATUS_LABELS) as AdStatus[]).map((v) => ({
  label: AD_STATUS_LABELS[v],
  value: v,
}))
export const AD_PAYMENT_OPTIONS = (Object.keys(AD_PAYMENT_LABELS) as AdPaymentStatus[]).map((v) => ({
  label: AD_PAYMENT_LABELS[v],
  value: v,
}))
export const ADVERTISER_STATUS_OPTIONS = (Object.keys(ADVERTISER_STATUS_LABELS) as AdvertiserStatus[]).map((v) => ({
  label: ADVERTISER_STATUS_LABELS[v],
  value: v,
}))
export const ADVERTISER_KIND_OPTIONS = (Object.keys(ADVERTISER_KIND_LABELS) as AdvertiserKind[]).map((v) => ({
  label: ADVERTISER_KIND_LABELS[v],
  value: v,
}))
export const AD_FORMAT_OPTIONS = (Object.keys(AD_FORMAT_LABELS) as AdFormat[]).map((v) => ({
  label: AD_FORMAT_LABELS[v],
  value: v,
}))

export const AD_REQUEST_STATUS_LABELS: Record<AdRequestStatus, string> = {
  new: 'Новая заявка',
  checking: 'На проверке',
  clarification: 'Нужны уточнения',
  approved: 'Одобрено',
  awaitingPayment: 'Ожидает оплаты',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  done: 'Завершено',
}

export const AD_CONTACT_KIND_LABELS: Record<AdContactKind, string> = {
  name: 'Имя и фамилия',
  company: 'Компания',
  agency: 'Агентство',
  developer: 'Застройщик',
  other: 'Другое',
}

export const AD_OBJECT_TYPE_LABELS: Record<AdObjectType, string> = {
  apartment: 'Квартира',
  house: 'Дом',
  land: 'Участок',
  commercial: 'Коммерческое помещение',
  newbuilding: 'Новостройка',
  other: 'Другое',
}

/** Порядок значений — как в select-поле и в enum базы (см. AdRequestStatus) */
export const AD_REQUEST_STATUS_OPTIONS = (Object.keys(AD_REQUEST_STATUS_LABELS) as AdRequestStatus[]).map(
  (v) => ({ label: AD_REQUEST_STATUS_LABELS[v], value: v }),
)
export const AD_CONTACT_KIND_OPTIONS = (Object.keys(AD_CONTACT_KIND_LABELS) as AdContactKind[]).map(
  (v) => ({ label: AD_CONTACT_KIND_LABELS[v], value: v }),
)
export const AD_OBJECT_TYPE_OPTIONS = (Object.keys(AD_OBJECT_TYPE_LABELS) as AdObjectType[]).map((v) => ({
  label: AD_OBJECT_TYPE_LABELS[v],
  value: v,
}))

// --- Типы «облегчённых» записей (хватит и документа Payload, и строки списка) ----

export interface AdvertiserLike {
  name?: string | null
  kind?: string | null
  inn?: string | null
  ogrn?: string | null
  site?: string | null
  contactName?: string | null
  phone?: string | null
  email?: string | null
  status?: string | null
}

export interface AdLike {
  title?: string | null
  status?: string | null
  paymentStatus?: string | null
  cost?: number | null
  startDate?: string | null
  endDate?: string | null
  termDays?: number | null
  contentChecked?: boolean | null
  erid?: string | null
  advertiser?: AdvertiserLike | number | string | null
}

/** Данные интернет-рекламы материала (пометка + рекламодатель + erid) */
export interface AdMarking {
  /** Пометка «Реклама» */
  label: string
  /** Сведения о рекламодателе одной строкой */
  advertiserInfo: string
  /** Идентификатор интернет-рекламы (erid) */
  erid: string
  /** Площадка размещения */
  platform: string
  /** Когда материал опубликован */
  markedAt: string
}

// --- Значения и даты -------------------------------------------------------------

/** Значение select/текста как есть: '' и пробелы → null («не указано») */
export const adValue = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed ? trimmed : null
}

/** Дата к ISO-строке (Payload в хуках отдаёт и Date, и строку) */
export const adIso = (v: unknown): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

/** Дата + N дней (для срока размещения) */
export const adAddDays = (iso: string, days: number): string => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** День (без времени) в ISO — сравнение сроков идёт по календарным дням */
const dayStart = (iso: string): number => {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Дата в виде «01.09.2026» (для пометки и списков) */
export const adDateText = (v: unknown): string => {
  const iso = adIso(v)
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** «01.09.2026 — 30.09.2026 (30 дней)» либо пустая строка, если срок не задан */
export const adTermText = (ad: AdLike): string => {
  const start = adIso(ad.startDate)
  const end = adIso(ad.endDate)
  const days = typeof ad.termDays === 'number' && ad.termDays > 0 ? `${ad.termDays} дн.` : ''
  if (start && end) return `${adDateText(start)} — ${adDateText(end)}${days ? ` (${days})` : ''}`
  if (start) return `с ${adDateText(start)}${days ? ` (${days})` : ''}`
  if (end) return `до ${adDateText(end)}`
  return ''
}

/** Срок размещения идёт прямо сейчас (обе даты заданы и текущий день внутри) */
export const adInTerm = (ad: AdLike, now: number = Date.now()): boolean => {
  const start = adIso(ad.startDate)
  const end = adIso(ad.endDate)
  if (!start || !end) return false
  return dayStart(start) <= now && now <= new Date(end).getTime()
}

/** Срок размещения истёк */
export const adTermExpired = (ad: AdLike, now: number = Date.now()): boolean => {
  const end = adIso(ad.endDate)
  return !!end && new Date(end).getTime() < now
}

/** Рекламодатель подтверждён (без этого публиковать нельзя) */
export const isAdvertiserConfirmed = (a?: AdvertiserLike | null): boolean => a?.status === 'confirmed'

/** Сведения о рекламодателе одной строкой: «ООО «Ромашка», ИНН 1234567890» */
export const advertiserInfo = (a?: AdvertiserLike | null): string => {
  if (!a) return ''
  const parts: string[] = []
  if (a.name) parts.push(a.name)
  if (a.inn) parts.push(`ИНН ${a.inn}`)
  if (a.ogrn) parts.push(`ОГРН ${a.ogrn}`)
  if (!a.inn && !a.ogrn && a.site) parts.push(a.site)
  return parts.join(', ')
}

// --- Проверка перед публикацией ---------------------------------------------------

/**
 * Почему материал нельзя опубликовать (null — можно).
 * Одна формулировка за раз: в админке и CRM её показываем как есть.
 */
export const adPublishIssue = (ad: AdLike, advertiser?: AdvertiserLike | null): string | null => {
  if (!ad.title || !String(ad.title).trim()) return 'Не заполнено название материала'
  if (!advertiser) return 'Не указан рекламодатель'
  if (advertiser.status === 'rejected') return 'Рекламодатель отклонён'
  if (!isAdvertiserConfirmed(advertiser)) return 'Рекламодатель не подтверждён (подтверждение обязательно)'
  if (!advertiserInfo(advertiser)) return 'У рекламодателя не заполнены наименование, ИНН/ОГРН или сайт'
  if (!ad.contentChecked) return 'Содержание материала не проверено'
  if (ad.paymentStatus !== 'paid') {
    return ad.paymentStatus === 'refunded' ? 'Оплата возвращена' : 'Материал не оплачен'
  }
  if (!(typeof ad.cost === 'number' && ad.cost > 0)) return 'Не указана стоимость размещения'
  const start = adIso(ad.startDate)
  const end = adIso(ad.endDate)
  if (!start) return 'Не указана дата начала размещения'
  if (!end) return 'Не указана дата окончания размещения'
  if (new Date(end).getTime() < new Date(start).getTime()) return 'Дата окончания раньше даты начала'
  if (adTermExpired(ad)) return 'Срок размещения истёк — продлите срок или укажите новые даты'
  if (!ad.erid || !String(ad.erid).trim()) return 'Не указан идентификатор интернет-рекламы (erid)'
  return null
}

/** Материал показывается на сайте: опубликован и срок идёт */
export const adVisible = (ad: AdLike, now: number = Date.now()): boolean =>
  ad.status === 'published' && adInTerm(ad, now)

// --- Автоматическая маркировка ----------------------------------------------------

/**
 * Пометка «Реклама» + сведения о рекламодателе + данные интернет-рекламы.
 * Собирается автоматически при публикации — вручную не заполняется.
 */
export const adMarking = (
  ad: AdLike,
  advertiser?: AdvertiserLike | null,
  at: string = new Date().toISOString(),
): AdMarking => ({
  label: AD_LABEL,
  advertiserInfo: advertiserInfo(advertiser),
  erid: adValue(ad.erid) || '',
  platform: AD_PLATFORM,
  markedAt: at,
})

/** Строка маркировки для показа: «Реклама. ООО «Ромашка», ИНН 1234567890. erid: …» */
export const adMarkingText = (marking?: Partial<AdMarking> | null): string => {
  if (!marking) return AD_LABEL
  const parts = [marking.label || AD_LABEL]
  if (marking.advertiserInfo) parts.push(marking.advertiserInfo)
  if (marking.erid) parts.push(`erid: ${marking.erid}`)
  return parts.join('. ')
}

/**
 * Материал можно показать посетителю только полным — с маркировкой.
 * Если маркировки нет (старые записи), сайт её не выдумывает: показываем
 * материал с общей пометкой «Реклама» без сведений о рекламодателе нельзя,
 * поэтому такие записи сайт пропускает (см. adVisible + markingReady).
 */
export const markingReady = (marking?: Partial<AdMarking> | null): boolean =>
  !!marking && !!marking.advertiserInfo && !!marking.label

// --- Заявки «Ваша реклама» --------------------------------------------------------

/** Заявка с формы платного размещения — то, что нужно проверке публикации */
export interface AdRequestLike {
  /** Как обращаться: имя, компания, агентство, застройщик, другое */
  contactKind?: string | null
  name?: string | null
  company?: string | null
  phone?: string | null
  email?: string | null
  objectType?: string | null
  location?: string | null
  price?: string | null
  listingUrl?: string | null
  erid?: string | null
  status?: string | null
  format?: string | null
  termDays?: number | null
  startDate?: string | null
  endDate?: string | null
  cost?: number | null
  discount?: number | null
  totalAmount?: number | null
  paymentStatus?: string | null
  /** Публикация без оплаты — согласована отдельно (см. оферту, раздел 5) */
  paymentWaived?: boolean | null
  contentChecked?: boolean | null
  consent?: boolean | null
  consentOffer?: boolean | null
  consentRights?: boolean | null
}

/** Итоговая сумма к оплате: стоимость минус скидка (не меньше нуля) */
export const adRequestTotal = (cost: unknown, discount: unknown): number => {
  const c = typeof cost === 'number' && Number.isFinite(cost) ? cost : 0
  const d = typeof discount === 'number' && Number.isFinite(discount) ? discount : 0
  return Math.max(0, c - d)
}

/** Скидка задана, но больше стоимости — считаем итог нулевым, предупреждаем в CRM */
export const adRequestDiscountInvalid = (cost: unknown, discount: unknown): boolean =>
  typeof discount === 'number' && discount > 0 && discount >= (typeof cost === 'number' ? cost : 0)

/** Итоговая сумма к показу в CRM: посчитанное значение или пусто */
export const adRequestTotalOf = (req: AdRequestLike): number | null => {
  if (typeof req.totalAmount === 'number' && Number.isFinite(req.totalAmount)) return req.totalAmount
  if (typeof req.cost === 'number') return adRequestTotal(req.cost, req.discount)
  return null
}

/** Все три согласия формы отмечены (без них заявка не принимается и не публикуется) */
export const adRequestConsentsOk = (req: AdRequestLike): boolean =>
  Boolean(req.consent && req.consentOffer && req.consentRights)

/** Публикация заявки оплачена либо согласована отдельно без оплаты */
export const adRequestPaid = (req: AdRequestLike): boolean =>
  req.paymentStatus === 'paid' || Boolean(req.paymentWaived)

/**
 * Почему заявку нельзя опубликовать (null — можно). Правила те же, что у
 * рекламного материала (adPublishIssue): проверенное содержание, согласие,
 * оплата, срок, стоимость и идентификатор интернет-рекламы. Проверку
 * повторяет и сервер, и хук коллекции — обойти её нельзя ни из CRM,
 * ни из админки.
 */
export const adRequestPublishIssue = (req: AdRequestLike): string | null => {
  if (req.status === 'rejected') return 'Заявка отклонена'
  if (req.status === 'published') return 'Заявка уже опубликована'
  if (req.status !== 'approved' && req.status !== 'awaitingPayment') {
    return 'Заявка не одобрена — сначала одобрите заявку'
  }
  if (!adRequestConsentsOk(req)) return 'В заявке нет всех трёх согласий (оферта, права на материалы, персональные данные)'
  if (!req.contentChecked) return 'Содержание заявки не проверено'
  const total = adRequestTotalOf({ cost: req.cost, discount: req.discount, totalAmount: req.totalAmount })
  if (!(typeof total === 'number' && total > 0)) return 'Не указана итоговая сумма размещения'
  if (adRequestDiscountInvalid(req.cost, req.discount)) return 'Скидка больше стоимости размещения'
  if (!adRequestPaid(req)) {
    return req.paymentStatus === 'refunded'
      ? 'Оплата возвращена'
      : 'Заявка не оплачена (либо отметьте согласование размещения без оплаты)'
  }
  const days = typeof req.termDays === 'number' ? req.termDays : 0
  if (!(days > 0)) return 'Не указан срок публикации'
  if (!adValue(req.erid)) return 'Не указан идентификатор интернет-рекламы (erid)'
  return null
}

/**
 * Заявка показывается на сайте: опубликована, срок идёт и маркировка
 * собрана — та же логика, что у рекламного материала (см. adVisible).
 */
export const adRequestVisible = (req: AdLike & AdRequestLike, now: number = Date.now()): boolean =>
  req.status === 'published' && adInTerm(req, now)

/**
 * Сведения о рекламодателе для маркировки заявки: компания (агентство,
 * застройщик), а если её нет — контактное лицо. У заявки нет отдельной
 * карточки рекламодателя, как у рекламного материала, поэтому данные
 * берутся из самой заявки.
 */
export const adRequestAdvertiserInfo = (req: AdRequestLike): string => {
  const company = adValue(req.company)
  const name = adValue(req.name)
  if (company && name) return `${company} (${name})`
  return company || name || ''
}

/** Маркировка заявки: пометка «Реклама», сведения о рекламодателе и erid */
export const adRequestMarking = (req: AdRequestLike, at: string = new Date().toISOString()): AdMarking => ({
  label: AD_LABEL,
  advertiserInfo: adRequestAdvertiserInfo(req),
  erid: adValue(req.erid) || '',
  platform: AD_PLATFORM,
  markedAt: at,
})

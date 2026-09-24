/**
 * «Доска объявлений» — движок раздела (страница /board и подача объявлений).
 *
 * Задача раздела: принимать объявления от частных лиц наравне с агентством,
 * проверять их руками в CRM и показывать на сайте отдельно от каталога
 * объектов агентства — это две разные базы, и смешивать их не нужно
 * (см. план раздела).
 *
 * Движок ничего не знает про БД и не имеет импортов, кроме общих хелперов
 * значений и дат: те же правила используют серверная обвязка
 * (src/lib/board-service.ts), маршруты /api/board/*, коллекция админки
 * и страницы сайта. Так «что считается опубликованным» и «почему нельзя
 * опубликовать» описано в одном месте.
 *
 * Правила доски (тексты для автора) — в src/lib/board-legal.ts.
 */

// Значения и даты — те же хелперы, что у рекламы: '' и пробелы → null,
// дата → ISO, дата + N дней. Они generic, несмотря на имя модуля.
import { adAddDays, adIso, adValue } from './advertising'

// --- Статусы ---------------------------------------------------------------------

/**
 * Статус объявления. Набор и ПОРЯДОК значений совпадают с select-полем
 * коллекции board-ads и с типом enum в базе: при добавлении статуса значение
 * сначала до-добавляется в БД (ALTER TYPE, см. docker-entrypoint.sh — там же
 * сделано для agent_tasks.status), иначе dev-push пытается пересобрать enum
 * и зависает.
 *
 * Путь объявления: на модерации → (нужны уточнения | отклонено | опубликовано);
 * опубликовано → снято автором | срок истёк. Из «уточнений», «отклонено»,
 * «срока» и «снято» автор подаёт объявление заново — оно снова идёт на модерацию.
 */
export type BoardStatus =
  | 'pending'
  | 'clarification'
  | 'published'
  | 'rejected'
  | 'expired'
  | 'archived'

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  pending: 'На модерации',
  clarification: 'Нужны уточнения',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  expired: 'Срок истёк',
  archived: 'Снято',
}

export const BOARD_STATUS_OPTIONS = (Object.keys(BOARD_STATUS_LABELS) as BoardStatus[]).map((value) => ({
  label: BOARD_STATUS_LABELS[value],
  value,
}))

/**
 * Статусы, в которых объявление занимает квоту автора. Опубликованное,
 * ожидающее проверки и отправленное на уточнения — всё это «живые» объявления;
 * отклонённые и истёкшие квоту не занимают, иначе автор не смог бы исправить
 * и подать их заново.
 */
export const BOARD_ACTIVE_STATUSES: BoardStatus[] = ['pending', 'clarification', 'published']

/** Кто разместил объявление — от этого зависит пометка на карточке */
export type BoardAuthorKind = 'private' | 'agency'

export const BOARD_AUTHOR_KIND_LABELS: Record<BoardAuthorKind, string> = {
  private: 'Частное лицо',
  agency: 'Агентство Н15',
}

export const BOARD_AUTHOR_KIND_OPTIONS = (Object.keys(BOARD_AUTHOR_KIND_LABELS) as BoardAuthorKind[]).map(
  (value) => ({ label: BOARD_AUTHOR_KIND_LABELS[value], value }),
)

// --- Границы и сроки -------------------------------------------------------------

/** Сколько дней объявление живёт с момента публикации */
export const BOARD_TERM_DAYS = 30
/** На сколько дней продлевается объявление кнопкой «Продлить» */
export const BOARD_RENEW_DAYS = 30
/** Сколько «живых» объявлений может держать один автор */
export const BOARD_MAX_ACTIVE_PER_USER = 5
/** Сколько фотографий принимаем в объявлении */
export const BOARD_MAX_PHOTOS = 10

/** Пределы длин текстов — проверяются и в форме, и в маршруте */
export const BOARD_TEXT_LIMITS = {
  title: 120,
  description: 6000,
  address: 120,
  name: 120,
  message: 2000,
} as const

// --- Типы для проверок -----------------------------------------------------------

/** Поля объявления, которые нужны движку (Payload отдаёт документ) */
export interface BoardAdLike {
  status?: string | null
  title?: string | null
  dealType?: string | null
  category?: string | null
  price?: number | null
  description?: string | null
  contactName?: string | null
  phone?: string | null
  photos?: unknown[] | null
  consent?: boolean | null
  consentRules?: boolean | null
  author?: unknown
  authorKind?: string | null
  publishedAt?: string | null
  expiresAt?: string | null
}

/** Адрес объявления — общий вид с объектами каталога */
export interface BoardAddressLike {
  city?: string | null
  district?: string | null
  cityDistrict?: string | null
  locality?: string | null
  snt?: string | null
  street?: string | null
}

// --- Правила ---------------------------------------------------------------------

/**
 * Объявление видно на сайте: опубликовано и срок не вышел. Просроченное
 * исчезает из выдачи сразу, не дожидаясь, пока таймер переведёт его в
 * «Срок истёк» — иначе объявление с прошедшей датой висело бы до следующего
 * часа.
 */
export const boardVisible = (ad: BoardAdLike, now: number = Date.now()): boolean => {
  if (adValue(ad.status) !== 'published') return false
  const end = adIso(ad.expiresAt)
  return !end || new Date(end).getTime() > now
}

/**
 * Почему объявление нельзя опубликовать (null — можно). Проверка одна на всех:
 * её вызывает и кнопка «Опубликовать» в CRM, и маршрут модерации, и хук
 * коллекции — обойти нельзя ни из CRM, ни из админки Payload.
 */
export const boardPublishIssue = (ad: BoardAdLike, now: number = Date.now()): string | null => {
  if (!adValue(ad.title)) return 'Не заполнен заголовок объявления'
  if (!adValue(ad.dealType)) return 'Не указано, продажа это или аренда'
  if (!adValue(ad.category)) return 'Не указана категория объекта'
  if (typeof ad.price !== 'number' || !Number.isFinite(ad.price) || ad.price < 0) {
    return 'Не указана цена'
  }
  if (!adValue(ad.description)) return 'Не заполнено описание объекта'
  if (!adValue(ad.contactName)) return 'Не указано контактное лицо'
  if (!adValue(ad.phone)) return 'Не указан телефон для связи'
  if (!ad.author) return 'Не указан автор объявления'
  if (!Array.isArray(ad.photos) || ad.photos.length === 0) {
    return 'Нужно хотя бы одно фото объекта'
  }
  // Согласия — требование к частным лицам, которые подают объявление с сайта.
  // Объявления агентства заводит сотрудник, и спрашивать с него галочки
  // на форме не за что: правила и обработка данных — его рабочие обязанности.
  if (adValue(ad.authorKind) !== 'agency') {
    if (ad.consent !== true) return 'Нет согласия на обработку персональных данных'
    if (ad.consentRules !== true) return 'Не приняты правила доски'
  }
  const end = adIso(ad.expiresAt)
  if (end && new Date(end).getTime() <= now) {
    return 'Срок размещения истёк — продлите объявление'
  }
  return null
}

/** Когда истекает срок объявления, опубликованного в указанный момент */
export const boardExpireAt = (publishedAt: string, days: number = BOARD_TERM_DAYS): string =>
  adAddDays(publishedAt, days)

/** Сколько дней осталось до конца размещения (null — срок не задан или прошёл) */
export const boardDaysLeft = (ad: BoardAdLike, now: number = Date.now()): number | null => {
  const end = adIso(ad.expiresAt)
  if (!end) return null
  const ms = new Date(end).getTime() - now
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0
}

/**
 * Адрес для публикации. Номер дома и квартиры на доске не показываем:
 * объявления размещают частные лица, и точный адрес — это в первую очередь
 * их безопасность; улицу и район покупатель видит, номер уточняет у автора.
 * Полный адрес (с домом) доступен модератору в CRM и автору в личном кабинете.
 */
export const boardPublicAddress = (
  address: BoardAddressLike | null | undefined,
  opts: { house?: string | null; full?: boolean } = {},
): string => {
  if (!address) return ''
  const parts = [
    adValue(address.snt),
    adValue(address.locality),
    address.cityDistrict ? `${String(address.cityDistrict).trim()} район` : null,
    adValue(address.district),
    adValue(address.street),
    // Дом — только когда адрес показывают модератору или автору
    opts.full ? adValue(opts.house) : null,
  ]
  return parts.filter(Boolean).join(', ')
}

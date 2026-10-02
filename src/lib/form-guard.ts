/**
 * Невидимая защита публичных форм от спама.
 *
 * Формы сайта отправляют заявку прямо в REST Payload (POST /api/applications),
 * поэтому проверка живёт не в отдельном маршруте, а в хуке коллекции: запрос
 * в обход формы отсекается там же, где и обычная отправка. Заявки, заведённые
 * сотрудником из CRM, под неё не попадают — хук зовёт защиту только для
 * анонимных созданий (см. beforeChange в src/payload/collections/Applications).
 *
 * Что отсекаем:
 *  - поле-ловушку: скрытый input формы, которого человек не видит и не
 *    заполняет, а спам-боты заполняют все поля подряд;
 *  - слишком быструю отправку: заявка, ушедшая через полсекунды после показа
 *    формы, написана не человеком (время считает сама форма);
 *  - телефон без десяти цифр: по такому номеру не перезвонить, а мусор
 *    в поле — признак рассылки;
 *  - сообщение с тремя и более ссылками: клиент присылает ссылку на объект,
 *    рассылка — пачку ссылок;
 *  - частоту отправок с одного IP: всплеск и суточную квоту.
 *
 * Сами поля защиты (ловушка и время заполнения) объявлены в коллекции
 * applications — из заявки их удаляет хук сразу после проверки, в CRM и базе
 * остаются только данные клиента.
 */
import { clientIp, rateLimited } from './rate-limit'

/** Скрытое поле-ловушка: в форме оно спрятано, а в заявке — признак бота */
export const HONEYPOT_FIELD = 'formRef'

/** Сколько миллисекунд прошло от показа формы до отправки */
export const FILL_TIME_FIELD = 'fillTime'

/** Быстрее этого человек форму не заполнит, мс */
const MIN_FILL_MS = 1500

/** Больше этого числа ссылок в сообщении — уже рассылка */
const MAX_LINKS = 2

/** Цифр в телефоне: меньше — по номеру не перезвонить */
const MIN_PHONE_DIGITS = 10

/** Предел длины сообщения: длиннее — обрезаем, заявка в CRM нечитаема */
export const MAX_MESSAGE = 4000

/**
 * Лимиты по IP. Всплеск щедрее, чем у формы рекламы: заявки — основной канал,
 * а за одним адресом оператора связи сидят сразу многие клиенты.
 */
const RATE_MAX = 10
const RATE_WINDOW_MS = 10 * 60_000
const RATE_DAY_MAX = 40
const RATE_DAY_WINDOW_MS = 24 * 60 * 60_000

/** Отказ: код ответа и текст, который дойдёт до формы */
export interface GuardFailure {
  status: number
  message: string
}

/**
 * Отсеянная заявка. Текст без подсказок, что именно выдало бота, но с советом
 * для человека, если ловушку случайно заполнило автозаполнение браузера:
 * после перезагрузки страницы поле снова пустое.
 */
const SPAM_MESSAGE = 'Не удалось отправить заявку. Обновите страницу и попробуйте ещё раз или позвоните нам.'
const TOO_MANY_MESSAGE = 'Слишком много отправок — попробуйте через несколько минут'
const PHONE_MESSAGE = 'Проверьте номер телефона — по нему мы перезвоним'

/** Сколько цифр в значении: по ним видно, годится ли телефон для звонка */
const phoneDigits = (v: unknown): number => (String(v ?? '').match(/\d/g) || []).length

/** Сколько ссылок в тексте (http(s) и www.) */
const linkCount = (v: unknown): number => (String(v ?? '').match(/(https?:\/\/|www\.)/gi) || []).length

/**
 * Проверка заявки с публичной формы: null — заявка проходит, иначе причина
 * отказа. headers — заголовки запроса, по ним считается IP для лимита.
 * scope — свой счётчик лимитов для каждой формы: у заявок на просмотр и
 * у заявок собственников квоты разные, и общий счётчик душил бы обе формы
 * разом (по умолчанию — прежний, «applications»).
 */
export function checkSpam(
  data: Record<string, unknown>,
  headers?: Headers,
  scope = 'applications',
): GuardFailure | null {
  // Лимит по IP проверяем первым: отказ должен стоить дешевле самой заявки.
  // Без адреса клиента (запрос изнутри приложения, локальная разработка)
  // частоту не считаем — общий счётчик заблокировал бы всех разом
  const ip = headers ? clientIp(headers) : 'unknown'
  if (ip !== 'unknown') {
    if (rateLimited(`${scope}:${ip}`, RATE_MAX, RATE_WINDOW_MS)) {
      return { status: 429, message: TOO_MANY_MESSAGE }
    }
    if (rateLimited(`${scope}-day:${ip}`, RATE_DAY_MAX, RATE_DAY_WINDOW_MS)) {
      return { status: 429, message: TOO_MANY_MESSAGE }
    }
  }

  // Заполненная ловушка: человек это поле не видит, значит заявку писал бот
  if (String(data[HONEYPOT_FIELD] ?? '').trim()) {
    return { status: 400, message: SPAM_MESSAGE }
  }

  // Время заполнения необязательно: у заявок со старых (закэшированных)
  // страниц и у запросов в обход формы его нет — такие проверяем по
  // остальным признакам, чтобы не потерять живого клиента
  const fillTime = Number(data[FILL_TIME_FIELD])
  if (Number.isFinite(fillTime) && fillTime > 0 && fillTime < MIN_FILL_MS) {
    return { status: 400, message: SPAM_MESSAGE }
  }

  if (phoneDigits(data.clientPhone) < MIN_PHONE_DIGITS) {
    return { status: 400, message: PHONE_MESSAGE }
  }

  if (linkCount(data.message) > MAX_LINKS) {
    return { status: 400, message: SPAM_MESSAGE }
  }

  return null
}

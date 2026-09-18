/**
 * Цели Яндекс.Метрики.
 *
 * Идентификаторы целей — ровно те строки, что заведены в счётчике
 * (Метрика → Настройка → Цели → «JavaScript-событие»). Цель, которой нет
 * в настройках счётчика, Метрика молча игнорирует, поэтому имя цели можно
 * менять только вместе с настройками счётчика.
 *
 * В Метрику уходят только имена целей: ни имена, ни телефоны, ни текст
 * сообщений из форм сюда не передаются — персональные данные посетителей
 * в аналитику не попадают (см. раздел 8 политики конфиденциальности).
 */

export type MetrikaGoal =
  /** Отправка формы заявки — все публичные формы (контакты, просмотр, реклама) */
  | 'lead_form'
  /** Заявка «Обратный звонок» — форма на странице /contacts */
  | 'callback'
  /** Нажатие «Позвонить» — tel:-ссылки на общий номер агентства */
  | 'call_click'
  /** Нажатие WhatsApp — ссылки wa.me */
  | 'whatsapp_click'
  /** Открытие карточки объекта — страница /catalog/<slug> */
  | 'object_open'
  /** Просмотр страницы рекламы — /advertising */
  | 'advertising_view'
  /** Отправка заявки на размещение рекламы — форма на /advertising */
  | 'ad_request'

/** Функция счётчика из сниппета Метрики (window.ym) */
type YmCall = (counterId: number, method: string, ...args: unknown[]) => void

interface MetrikaWindow extends Window {
  /** Появляется после выполнения сниппета (см. components/analytics/YandexMetrika) */
  ym?: YmCall
  /** Номер счётчика — его тоже ставит сниппет; без него цели не отправить */
  __n15MetrikaId?: number
}

/** Цели, сработавшие до загрузки сниппета: ждём счётчик и досылаем */
const pending: MetrikaGoal[] = []
/** Сколько целей копим, если счётчик так и не загрузился (рекламный блокировщик) */
const MAX_PENDING = 20
/** Проверок по 250 мс — около десяти секунд ожидания счётчика */
const MAX_ATTEMPTS = 40
let attempts = 0
let waiting = false

/**
 * Отправить цель в Метрику. Ничего не делает, если счётчика на странице нет
 * (номер не задан в настройках сайта, скрипт заблокирован) — клик или отправка
 * формы из-за аналитики не задерживаются и не ломаются.
 */
export function reachGoal(goal: MetrikaGoal): void {
  if (typeof window === 'undefined') return
  if (pending.length >= MAX_PENDING) return
  pending.push(goal)
  if (waiting) return
  waiting = true
  attempts = 0
  waitForCounter()
}

/**
 * Сниппет выполняется из HTML страницы, но цель может сработать раньше, чем
 * он успеет отработать (например, открытие карточки объекта сразу после
 * загрузки, медленная сеть, блокировщик рекламы с белым списком). Ждём
 * window.ym короткими шагами и отправляем накопившиеся цели.
 */
function waitForCounter(): void {
  const win = window as MetrikaWindow
  const counterId = win.__n15MetrikaId
  if (win.ym && counterId) {
    for (const goal of pending) win.ym(counterId, 'reachGoal', goal)
    pending.length = 0
    waiting = false
    return
  }
  if (++attempts >= MAX_ATTEMPTS) {
    pending.length = 0
    waiting = false
    return
  }
  window.setTimeout(waitForCounter, 250)
}

/** Цель по ссылке: tel: — «Позвонить», wa.me — «WhatsApp», остальные без цели */
export function linkGoal(href: string): MetrikaGoal | null {
  if (href.startsWith('tel:')) return 'call_click'
  if (/^https?:\/\/([\w-]+\.)?(wa\.me|whatsapp\.com)\//i.test(href)) return 'whatsapp_click'
  return null
}

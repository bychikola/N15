/**
 * Маршрутизация звонка с сайта: по объекту — его ответственному агенту,
 * без объекта — на общий номер Н15 (резервный маршрут, в АТС это Лана).
 *
 * Как это работает. Личные номера агентов клиентам не показываются вовсе
 * (поле phone коллекции agents скрыто от посетителей полевой access-проверкой),
 * поэтому «Позвонить» в карточке объекта набирает номер агентства, а не личный
 * номер: звонок приходит в облачную АТС Н15, и соединяет клиента с нужным
 * агентом уже она. Чтобы АТС знала, кого соединять, в набор подставляется
 * номер агента в АТС (поле atsNumber у агента — заполняется после настройки
 * кабинета МегаФон):
 *
 *   прямой номер   +7 867 2xx-xx-xx — набираем его как есть: это отдельная
 *                  линия агента в АТС, клиент попадает к нему напрямую;
 *   добавочный     101 — набирается после общего номера с паузой (запятая
 *                  в tel:-ссылке — стандартная пауза в наборе, RFC 3966):
 *                  АТС принимает добавочный и переводит звонок на агента.
 *
 * Если номер в АТС не заполнен, звонок уходит просто на общий номер Н15 —
 * так же, как кнопка «Позвонить нам» в шапке. В АТС общий номер настроен на
 * резервного агента (Лана), поэтому звонок не теряется: он просто не адресный.
 *
 * Отсюда источник маршрута в ответе (source):
 *   agent   — ответственный агент определён (по объекту или запрошен напрямую);
 *   reserve — агента нет: объект без ответственного или запрос без объекта.
 */

/** Пауза в наборе перед добавочным: два символа — около 2 секунд */
export const TEL_PAUSE = ',,'

/** Агент, по которому строится маршрут (поля коллекции agents) */
export interface CallAgent {
  id: number
  name?: string | null
  /** Номер агента в АТС: прямой номер или короткий добавочный */
  atsNumber?: string | null
}

/**
 * Куда набирать агенту: прямой номер АТС или добавочный к общему номеру.
 * Пусто — номер в АТС не задан (или задан непонятно), звонок идёт на общий.
 */
export interface AtsTarget {
  kind: 'direct' | 'extension'
  digits: string
}

/** Цифры номера в одном виде: 11 цифр с кодом страны (8… → 7…) */
export function telDigits(raw?: string | null): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return `7${d.slice(1)}`
  if (d.length === 10) return `7${d}`
  return d
}

/**
 * Разбор номера агента в АТС. Слишком короткое значение (до 6 цифр) — это
 * добавочный, длинное (10 и больше) — прямой номер. Середина (7–9 цифр) не
 * похожа ни на то, ни на другое: не угадываем и оставляем звонок на общем
 * номере, иначе клиент наберёт мусор.
 */
export function atsTarget(raw?: string | null): AtsTarget | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const d = value.replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 6) return { kind: 'extension', digits: d }
  const full = telDigits(value)
  if (full.length === 11) return { kind: 'direct', digits: full }
  return null
}

/** Маршрут звонка: кому адресован и что набирает телефон клиента */
export interface CallRoute {
  agent: CallAgent | null
  source: 'agent' | 'reserve'
  target: AtsTarget | null
  /** Цифры для tel:-ссылки: общий номер, прямой номер агента или номер с добавочным */
  dial: string
}

/** Строка набора: общий номер и, если он есть, добавочный через паузу */
const withExtension = (common: string, extension: string): string =>
  common ? `${common}${TEL_PAUSE}${extension}` : ''

/**
 * Маршрут звонка по ответственному агенту. Общий номер — из настроек сайта
 * (SiteSettings → «Телефоны»); если он не заполнен, адресный звонок с
 * добавочным набрать нечем, и маршрут остаётся пустым.
 */
export function buildCallRoute(
  commonPhone: string | null | undefined,
  agent: CallAgent | null,
): CallRoute {
  const common = telDigits(commonPhone)
  if (!agent) {
    return { agent: null, source: 'reserve', target: null, dial: common }
  }

  const target = atsTarget(agent.atsNumber)
  if (target?.kind === 'direct') {
    return { agent, source: 'agent', target, dial: target.digits }
  }
  if (target) {
    return { agent, source: 'agent', target, dial: withExtension(common, target.digits) }
  }
  // Ответственный агент есть, номера в АТС нет: звонок идёт на общий номер,
  // а соединяет клиента с агентом сама АТС
  return { agent, source: 'agent', target: null, dial: common }
}

/** Ссылка для нажатия «Позвонить»: пустой маршрут — нечего набирать */
export function telHref(dial: string): string {
  return dial ? `tel:+${dial}` : ''
}

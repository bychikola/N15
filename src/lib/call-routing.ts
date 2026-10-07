/**
 * Контакты ответственного агента для кнопок карточки объекта.
 *
 * Бизнес-логика: у объекта есть ответственный агент, и клиент должен попасть
 * именно к нему. Поэтому кнопка «Позвонить» набирает личный рабочий мобильный
 * агента (поле phone коллекции agents), а «WhatsApp» ведёт на его WhatsApp
 * (поле whatsapp; если оно пусто — на тот же личный телефон, это тот же
 * человек). Номера берутся из данных конкретного агента в CRM.
 *
 * Это отдельный канал связи, он не смешивается с общим номером Н15/АТС:
 *   личный контакт агента  — кнопки «Позвонить»/«WhatsApp» на объекте;
 *   общий номер агентства  — настройки сайта → «Телефоны», тот же, что в
 *                            шапке, подвале и «Контактах». Он остаётся
 *                            самостоятельным каналом и используется как
 *                            резервный маршрут, когда ответственного агента
 *                            нет (source=reserve).
 *
 * Ни при каких данных звонок по объекту не уйдёт чужому агенту: buildCallRoute
 * для агента всегда возвращает номер именно этого агента, а общий номер
 * подставляется только когда агента нет или у него не заполнен телефон.
 *
 * Источник маршрута в ответе (source):
 *   agent   — ответственный агент определён (по объекту или запрошен напрямую);
 *   reserve — агента нет: объект без ответственного или запрос без объекта.
 *             Сюда же попадают объекты офиса Н15 (ownership=office): личного
 *             агента у них нет, звонок и WhatsApp идут на общий номер офиса —
 *             тот же резервный маршрут, что у карточки без ответственного.
 */

/** Агент, по которому строится маршрут (поля коллекции agents) */
export interface CallAgent {
  id: number
  name?: string | null
  /** Личный рабочий мобильный агента — номер кнопки «Позвонить» */
  phone?: string | null
  /** WhatsApp агента — номер кнопки «WhatsApp» */
  whatsapp?: string | null
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
 * Цифры номера для wa.me: российская «восьмёрка» не годится, нужен код
 * страны. Принимает и ссылку https://wa.me/7… — из неё тоже остаются цифры.
 */
export function waDigits(raw?: string | null): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('8') ? `7${d.slice(1)}` : d
}

/** Маршрут звонка: кому адресован и что набирает телефон клиента */
export interface CallRoute {
  agent: CallAgent | null
  source: 'agent' | 'reserve'
  /** Набран личный рабочий номер агента (а не общий номер агентства) */
  personal: boolean
  /** Цифры для tel:-ссылки: личный номер агента или общий номер агентства */
  dial: string
}

/** Полный номер (не добавочный и не обрывок): по нему можно звонить */
const isFullNumber = (digits: string): boolean => digits.length >= 10

/**
 * Маршрут звонка по ответственному агенту. Общий номер Н15 — из настроек
 * сайта (SiteSettings → «Телефоны»); если он не заполнен, резервный звонок
 * набрать нечем, и маршрут остаётся пустым.
 */
export function buildCallRoute(
  commonPhone: string | null | undefined,
  agent: CallAgent | null,
): CallRoute {
  const common = telDigits(commonPhone)
  if (!agent) {
    // Объект без ответственного агента: звонок идёт на общий номер Н15/АТС
    return { agent: null, source: 'reserve', personal: false, dial: common }
  }

  const personal = telDigits(agent.phone)
  if (isFullNumber(personal)) {
    // Личный рабочий мобильный ответственного агента — кнопка «Позвонить»
    return { agent, source: 'agent', personal: true, dial: personal }
  }
  // У агента не заполнен телефон: ведём на общий номер агентства. Это не
  // чужой агент и не подмена личного номера — личного номера просто нет.
  return { agent, source: 'agent', personal: false, dial: common }
}

/**
 * Ссылка WhatsApp ответственного агента: поле whatsapp, а при пустоте — его же
 * личный телефон (тот же человек, не чужой номер). Нет ни того, ни другого —
 * пусто, кнопки WhatsApp нет. Ссылка идёт мимо АТС, номер у неё свой.
 */
export function waHref(agent: CallAgent | null): string {
  if (!agent) return ''
  const digits = waDigits(agent.whatsapp) || waDigits(agent.phone)
  return digits.length >= 10 ? `https://wa.me/${digits}` : ''
}

/**
 * WhatsApp офиса Н15 — на основной контакт агентства (общий номер из настроек
 * сайта). У объекта офиса личного ответственного агента нет, и обе кнопки —
 * «Позвонить» и «WhatsApp» — ведут на один общий номер агентства, а не на
 * телефон сотрудника (см. src/lib/object-ownership.ts). Номер пуст или не
 * похож на телефон — ссылки нет, кнопка WhatsApp не показывается.
 */
export function officeWaHref(commonPhone: string | null | undefined): string {
  const digits = waDigits(commonPhone)
  return digits.length >= 10 ? `https://wa.me/${digits}` : ''
}

/** Ссылка для нажатия «Позвонить»: пустой маршрут — нечего набирать */
export function telHref(dial: string): string {
  return dial ? `tel:+${dial}` : ''
}

/**
 * Общий номер агентства — тот же, что в шапке сайта, в подвале главной и в
 * разделе «Контакты» (настройки сайта → «Телефоны»). Это отдельный канал
 * связи и резервный маршрут звонка: если ответственного агента нет (или у
 * него не заполнен телефон), звонок идёт сюда.
 */
export const SITE_PHONE = '+7 (958) 116-15-15'

/** Он же готовой ссылкой — для кнопок «Позвонить» */
export const SITE_PHONE_TEL = 'tel:+79581161515'

/**
 * Ссылка «позвонить» из номера в любом виде: «8 (958) 116-15-15»,
 * «+7 958 116 15 15», «79581161515» — всё сводится к tel:+79581161515.
 * Пустое значение или не номер — общий номер агентства: кнопка «Позвонить»
 * не должна вести в никуда.
 */
export function phoneHref(raw?: string | null): string {
  const dial = telDigits(raw)
  return dial.length >= 10 ? telHref(dial) : SITE_PHONE_TEL
}

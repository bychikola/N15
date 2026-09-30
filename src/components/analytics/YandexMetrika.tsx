import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { CONSENT_COOKIE, parseConsent } from '@/lib/consent'
import { MetrikaCounter } from './MetrikaCounter'

/**
 * Счётчик Яндекс.Метрики — подключается на страницах публичного сайта и в CRM
 * (оба корневых layout'а), но только после согласия посетителя на аналитику:
 * сама Метрика ставит свои cookie, поэтому до выбора в баннере её скрипт в HTML
 * не попадает вовсе (ФЗ-152, ст. 9 и ст. 10.1).
 *
 * Номер счётчика берётся из настроек сайта (CRM → Настройки сайта →
 * «Аналитика: номер счётчика Яндекс.Метрики»). Пустое поле — счётчик не
 * подключён, в HTML не добавляется ничего; номер меняется без правки кода.
 *
 * Вебвизор выключен намеренно: он записывает содержимое форм, а имена,
 * телефоны и тексты сообщений в Метрику попадать не должны. Уходят только
 * адрес страницы, обезличенные данные о посетителе и имена целей
 * (src/lib/metrika.ts).
 *
 * Свой счётчик посещений сайта (SiteVisitTracker) согласия не требует: он без
 * cookie и без сохранения IP, то есть не относится к персональным данным
 * (см. src/lib/site-stats.ts).
 */
export async function YandexMetrika() {
  const counterId = await metrikaCounterId()
  if (!counterId) return null

  // Решение посетителя читаем на сервере: layout уже читает cookie темы, так
  // что лишнего перехода в динамический рендер здесь нет. Согласие есть —
  // счётчик попадает в HTML сразу, без ожидания клиентского скрипта, и
  // считается даже у посетителей без JavaScript
  const cookieStore = await cookies()
  const consent = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value)
  const allowed = consent?.analytics === true

  return <MetrikaCounter counterId={counterId} initialAnalytics={allowed} />
}

/** Номер счётчика из настроек сайта: только цифры, пусто — аналитика выключена */
async function metrikaCounterId(): Promise<number | null> {
  try {
    const payload = await getPayload({ config })
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    const raw = (settings as unknown as { metrikaId?: string | null }).metrikaId
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return null
    const id = Number(digits)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    // База недоступна — страница важнее счётчика, аналитика просто не подключится
    return null
  }
}

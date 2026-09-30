/**
 * Согласие на аналитические cookie (Яндекс.Метрика).
 *
 * До согласия Метрика не подключается вовсе: ни скрипт, ни пиксель для
 * посетителей без JavaScript (см. components/analytics/YandexMetrika).
 * Свой счётчик посещений сайта согласия не требует и его не спрашивает:
 * он обезличенный — без cookie и без сохранения IP (src/lib/site-stats.ts).
 *
 * Сам выбор хранится в одной технически необходимой cookie n15_consent:
 * без неё браузер не помнит решение и баннер показывался бы на каждой
 * странице. В cookie только выбор и дата — ни идентификатора посетителя,
 * ни истории в ней нет.
 */

/** Имя cookie с решением посетителя. Значение — JSON, см. ConsentState */
export const CONSENT_COOKIE = 'n15_consent'
/** Версия согласия: меняются категории — старый выбор больше не действует */
export const CONSENT_VERSION = 1
/** Событие для страницы: выбор изменился (баннер и счётчик слушают его) */
export const CONSENT_EVENT = 'n15-consent-change'
/** Сколько помним выбор: год, потом спрашиваем заново */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

export interface ConsentState {
  /** Версия текста согласия */
  v: number
  /** Разрешена ли аналитика (Яндекс.Метрика) */
  analytics: boolean
  /** Когда выбор сделан (ISO) */
  at: string
}

/** Разобрать значение cookie. null — cookie нет, испорчена или устарела */
export function parseConsent(value: string | null | undefined): ConsentState | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ConsentState>
    if (parsed.v !== CONSENT_VERSION) return null
    return {
      v: CONSENT_VERSION,
      analytics: parsed.analytics === true,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    }
  } catch {
    return null
  }
}

/** Решение посетителя из cookie браузера (только в браузере) */
export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${CONSENT_COOKIE}=`))
  return parseConsent(match ? match.slice(CONSENT_COOKIE.length + 1) : null)
}

/** Записать выбор: аналитика разрешена или только необходимые */
export function saveConsent(analytics: boolean): ConsentState {
  const state: ConsentState = { v: CONSENT_VERSION, analytics, at: new Date().toISOString() }
  if (typeof document !== 'undefined') {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }))
  }
  return state
}

/**
 * Забыть выбор и спросить заново — кнопка «Настройки cookie» в подвале.
 * Баннер показывается снова, Метрика (если была разрешена) выгружается
 * только после перезагрузки страницы: скрипт Метрики не умеет отключаться
 * на лету, поэтому сразу после смены выбора страница перезагружается.
 */
export function clearConsent(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }))
}

/** Разрешена ли аналитика (Метрика) */
export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true
}

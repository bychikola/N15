/**
 * Маячки счётчика сайта из браузера: просмотр страницы и действия посетителя
 * (см. app/api/visit и src/lib/visitor-tracking.ts). Модуль клиентский —
 * вызывать его можно только из компонентов браузера.
 *
 * Ошибки глушим: аналитика не важнее страницы. Если браузер заблокирует
 * запрос, посетитель этого не заметит.
 */

/** Адрес счётчика: тот же origin, ответ — пустой 204 (см. app/api/visit) */
const ENDPOINT = '/api/visit'

/** Отправить маячок «в фоне»: на скорость страницы он не влияет */
export function sendVisit(body: Record<string, unknown>): void {
  try {
    const data = JSON.stringify(body)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([data], { type: 'application/json' }))
      return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Блокировщики и старые браузеры: статистика не важнее страницы
  }
}

/**
 * Записать действие посетителя: избранное, нажатия, начало подачи
 * объявления. Вид события должен быть в белом списке сервера
 * (CLIENT_EVENT_KINDS) — чужие виды маячок отбрасывает.
 */
export function trackAction(event: string, objectId?: number | null): void {
  if (typeof window === 'undefined') return
  sendVisit({
    event,
    path: window.location.pathname,
    ...(typeof objectId === 'number' && objectId > 0 ? { objectId } : {}),
  })
}

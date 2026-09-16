/**
 * Безопасный URL для ссылок в интерфейсе.
 *
 * Ссылки на объявления приходят из ответов внешних площадок (Авито, ЦИАН,
 * Домклик, VK) — это недоверенные данные. Схемы `javascript:`, `data:` и
 * подобные в href дают XSS (клик по ссылке исполняет код в контексте CRM).
 * Пропускаем только http/https, остальное — null (рисуем текстом без ссылки).
 */
export function safeHttpUrl(raw?: string | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

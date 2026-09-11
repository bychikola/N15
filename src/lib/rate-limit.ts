// Простой per-IP лимит запросов (одна инстанция Next): не более max за windowMs.
// Защищает публичные маршруты от перебора (например, /api/agents/contact —
// сбор всех номеров агентов по id) и от спама через открытые эндпоинты.
const buckets = new Map<string, number[]>()

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (buckets.get(key) || []).filter((ts) => now - ts < windowMs)
  if (arr.length >= max) {
    buckets.set(key, arr)
    return true
  }
  arr.push(now)
  buckets.set(key, arr)
  return false
}

/** IP клиента за прокси (Caddy шлёт X-Forwarded-For) */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

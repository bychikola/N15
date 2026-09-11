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

/**
 * IP клиента за прокси. Caddy ДОПИСЫВАЕТ реальный адрес в конец цепочки
 * X-Forwarded-For, поэтому берём ПОСЛЕДНИЙ элемент: первый клиент может
 * подделать сам (передав свой заголовок) — иначе лимит обходится сменой
 * подставленного значения на каждый запрос.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (!xff) return 'unknown'
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'unknown'
}

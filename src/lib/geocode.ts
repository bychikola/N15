// Геокодирование адреса. Ключ геокодера хранится НА СЕРВЕРЕ
// (YANDEX_GEOCODER_API_KEY, см. /api/geocode) — в браузер не попадает:
// JS API-ключ карт к геокодеру доступа не имеет (403), а открывать ключ
// геокодера в клиентском коде нельзя (квота/злоупотребление).
// Возвращает [lat, lng] или null, если адрес не найден/ошибка.
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  if (!address.trim()) return null
  try {
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim() }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.found) return null
    return [Number(data.lat), Number(data.lng)]
  } catch {
    return null
  }
}

// Геокодирование адреса через HTTP-геокодер Яндекса (отдельный ключ
// «API Геокодера», NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY). Ключ JavaScript API
// (для карт) к геокодеру доступа не имеет — ymaps.geocode с ним даёт 403.
// Возвращает [lat, lng] или null, если адрес не найден/ошибка.
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
  if (!apiKey || !address.trim()) return null
  try {
    const url =
      'https://geocode-maps.yandex.ru/1.x/?' +
      new URLSearchParams({
        apikey: apiKey,
        geocode: address,
        format: 'json',
        results: '1',
        lang: 'ru_RU',
      })
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const pos = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
    if (typeof pos !== 'string') return null
    const [lng, lat] = pos.split(' ').map(Number)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return [lat, lng]
  } catch {
    return null
  }
}

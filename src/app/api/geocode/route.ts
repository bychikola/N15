import { NextRequest, NextResponse } from 'next/server'

// Серверный геокодер: ключ YANDEX_GEOCODER_API_KEY (без NEXT_PUBLIC_) не
// попадает в браузер. Вызывается картой объекта (публичная страница) и
// формой объекта в CRM. Лёгкий per-IP лимит — защита от спама через
// открытый эндпоинт (иначе чужой сайт жёг бы квоту геокодера).
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
const hits = new Map<string, number[]>()

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()
    const arr = (hits.get(ip) || []).filter((ts) => now - ts < RATE_WINDOW_MS)
    if (arr.length >= RATE_MAX) {
      return NextResponse.json({ error: 'rate limit' }, { status: 429 })
    }
    arr.push(now)
    hits.set(ip, arr)

    const body = await req.json().catch(() => null)
    const address = String((body as { address?: string } | null)?.address || '').trim().slice(0, 300)
    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }

    const apiKey = process.env.YANDEX_GEOCODER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'geocoder not configured' }, { status: 500 })
    }

    const url =
      'https://geocode-maps.yandex.ru/1.x/?' +
      new URLSearchParams({
        apikey: apiKey,
        geocode: address,
        format: 'json',
        results: '1',
        lang: 'ru_RU',
      })
    // Ключ геокодера ограничен по Referer — серверные запросы без Referer
    // Яндекс режет (403). Шлём свой домен (браузер послал бы его же).
    const referer = process.env.NEXT_PUBLIC_SERVER_URL || 'https://n15-realty.ru/'
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: referer },
    })
    if (!res.ok) {
      // адрес в лог не пишем (данные клиента)
      console.warn(`geocode: yandex http ${res.status}`)
      return NextResponse.json({ error: 'geocoder error' }, { status: 502 })
    }
    const data = await res.json()
    const meta = data?.response?.GeoObjectCollection?.metaDataProperty?.GeocoderResponseMetaData
    const pos = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
    if (typeof pos !== 'string') {
      console.warn(`geocode: empty result (yandex found: ${meta?.found ?? '?'})`)
      return NextResponse.json({ found: false })
    }
    const [lng, lat] = pos.split(' ').map(Number)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ found: false })
    }
    return NextResponse.json({ found: true, lat, lng })
  } catch (error) {
    console.error('geocode error:', error)
    return NextResponse.json({ error: 'geocode failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'
import { geocodeAddressCached } from '@/lib/geocode-server'

// Серверный геокодер: ключ YANDEX_GEOCODER_API_KEY (без NEXT_PUBLIC_) не
// попадает в браузер. Вызывается картой объекта (публичная страница) и
// формой объекта в CRM. Лёгкий per-IP лимит — защита от спама через
// открытый эндпоинт (иначе чужой сайт жёг бы квоту геокодера).
// Сам запрос к Яндексу и кеш ответов — в src/lib/geocode-server.ts.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60

export async function POST(req: NextRequest) {
  try {
    if (rateLimited(`geocode:${clientIp(req.headers)}`, RATE_MAX, RATE_WINDOW_MS)) {
      return NextResponse.json({ error: 'rate limit' }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const address = String((body as { address?: string } | null)?.address || '').trim().slice(0, 300)
    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }

    if (!process.env.YANDEX_GEOCODER_API_KEY) {
      return NextResponse.json({ error: 'geocoder not configured' }, { status: 500 })
    }

    const coords = await geocodeAddressCached(address)
    if (!coords) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, lat: coords[0], lng: coords[1] })
  } catch (error) {
    console.error('geocode error:', error)
    return NextResponse.json({ error: 'geocode failed' }, { status: 500 })
  }
}

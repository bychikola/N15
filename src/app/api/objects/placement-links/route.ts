import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { platformSearchLinks, PLATFORM_SPECS, type ObjectLike } from '@/lib/listing-check'

/**
 * Поисковые ссылки площадок по адресу объекта — для ручной проверки
 * в блоке «Где размещён объект» карточки CRM. Адрес объекта публичен на
 * сайте, поэтому маршрут открытый (как сам REST объектов).
 */
export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get('id'))
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({
      collection: 'objects',
      id,
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) {
      return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })
    }
    const addr = ((doc as unknown as { address?: Record<string, string | undefined> }).address || {}) as Record<
      string,
      string | undefined
    >
    const objectLike: ObjectLike = {
      address: {
        city: addr.city,
        locality: addr.locality,
        street: addr.street,
        house: addr.house,
      },
    }
    return NextResponse.json({
      ok: true,
      links: platformSearchLinks(objectLike),
      platforms: PLATFORM_SPECS.map((p) => ({ slug: p.slug, name: p.name })),
    })
  } catch (error) {
    console.error('Placement links error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

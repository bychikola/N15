import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { platformSearchLinks, PLATFORM_SPECS, type ObjectLike } from '@/lib/listing-check'

/**
 * Поисковые ссылки площадок по адресу объекта — для ручной проверки
 * в блоке «Где размещён объект» карточки CRM (единственный потребитель).
 * Маршрут внутренний: адреса архивных/снятых объектов не должны утекать
 * наружу, поэтому доступ — только команда Н15.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

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

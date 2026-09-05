import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { checkOneObject } from '@/lib/placements-service'
import { platformSearchLinks, type ObjectLike } from '@/lib/listing-check'

/**
 * «Проверить сейчас» — кнопка в блоке «Где размещён объект» карточки CRM.
 *
 * Прогоняет сверку площадок для одного объекта (статусы привязанных
 * объявлений, устаревшие ручные ссылки → «требует проверки», официальные
 * каналы площадок при подключённых ключах) и сохраняет группу placements.
 * Заодно возвращает поисковые ссылки площадок по адресу — для ручной
 * проверки агентом (автосбор площадки запрещают, см. src/lib/listing-check.ts).
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as { objectId?: number | string } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const result = await checkOneObject(payload, objectId)
    if (!result) {
      return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })
    }

    // Ссылки «проверить вручную» считаем от сохранённого адреса объекта
    const doc = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    const addr = (doc?.address || {}) as Record<string, string | undefined>
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
      placements: result.placements,
      activePlatforms: result.activePlatforms,
      itemsTotal: result.itemsTotal,
      searchLinks: platformSearchLinks(objectLike),
    })
  } catch (error) {
    console.error('Check placements error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

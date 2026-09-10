import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { myObjectIds } from '@/lib/legal-service'
import { lookupHouseInfo, persistHouseInfo, savedHouseInfo } from '@/lib/house-info-service'

/**
 * «Получить данные о доме» — кнопка в карточке объекта CRM.
 *
 * POST { objectId } — проверка дома в официальном реестре: адрес снимается с
 * карточки автоматически, по нему находится дом в АИС ППК «ФРТ» (открытые
 * сведения о многоквартирных домах, ППК «Фонд развития территорий»), из
 * паспорта дома и раздела «Управление» собираются характеристики — год
 * постройки, материал стен, этажность, серия, год капитального ремонта,
 * управляющая организация, площадь дома. У каждого значения сохраняются
 * источник, поставщик данных и дата проверки; расхождение поставщиков даёт
 * «Требует проверки», отсутствие сведений — «Не найдено», недоступность
 * реестра — «Проверка недоступна» (значения не выдумываются). Снимок
 * сохраняется в группу houseInfo.
 *
 * GET ?objectId=… — последний сохранённый снимок (карточка открывается без
 * повторного прогона).
 *
 * Внутренний маршрут CRM: агент — по своим объектам, администратор — по всем.
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
    if (user.role !== 'admin') {
      const mine = await myObjectIds(payload, user.id)
      if (!mine.has(objectId)) {
        return NextResponse.json({ error: 'Объект ведёт другой агент' }, { status: 403 })
      }
    }

    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    const obj = doc as unknown as {
      address?: Record<string, unknown>
      cadastralNumber?: string | null
    }
    const address = obj.address || {}
    const result = await lookupHouseInfo({
      address: {
        city: typeof address.city === 'string' ? address.city : null,
        locality: typeof address.locality === 'string' ? address.locality : null,
        street: typeof address.street === 'string' ? address.street : null,
        house: typeof address.house === 'string' ? address.house : null,
        snt: typeof address.snt === 'string' ? address.snt : null,
      },
      cadastralNumber: obj.cadastralNumber || null,
    })
    // Снимок сохраняем best-effort: если запись не прошла, свежий результат
    // всё равно уходит агенту в ответе (persistHouseInfo вернёт его как снимок)
    const saved = await persistHouseInfo(payload, objectId, result, { name: user.name })

    return NextResponse.json({ ok: true, saved })
  } catch (error) {
    console.error('House data error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const objectId = Number(new URL(req.url).searchParams.get('objectId'))
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    return NextResponse.json({ ok: true, saved: savedHouseInfo(doc) })
  } catch (error) {
    console.error('House data (saved) error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

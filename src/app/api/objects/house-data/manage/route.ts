import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { myObjectIds } from '@/lib/legal-service'
import { approveHouseInfo, houseInfoForStaff } from '@/lib/house-info-service'
import type { HouseFieldKey } from '@/lib/house-info'

/**
 * Подтверждение характеристик дома в карточке объекта CRM.
 *
 * POST { objectId, keys, applyToCard?, toDescription? } — агент отмечает,
 * какие значения реестра верны. Только после этого они попадают в публичную
 * группу housePublic (её видит клиент на странице объекта), при
 * applyToCard — переносятся в поля карточки (год постройки, этажность,
 * материал стен), при toDescription — добавляются абзацем в описание.
 * Подтвердить можно только найденные значения: «Не найдено» и «Требует
 * проверки» подтверждению не подлежат.
 *
 * Внутренний маршрут CRM. Сама проверка реестра и просмотр характеристик
 * открыты всем сотрудникам по любому объекту (см. house-data/route.ts), а
 * подтверждение — это правка карточки объекта и публикация значений клиенту,
 * поэтому оно доступно администратору и агенту, который ведёт объект (то же
 * правило, что у правки объектов в коллекции Objects).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | { objectId?: number | string; keys?: unknown; applyToCard?: boolean; toDescription?: boolean }
      | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const keys = Array.isArray(body?.keys) ? (body!.keys as HouseFieldKey[]) : []
    if (!keys.length) {
      return NextResponse.json({ error: 'Не выбрано ни одного значения' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    if (user.role !== 'admin') {
      const mine = await myObjectIds(payload, user.id)
      if (!mine.has(objectId)) {
        return NextResponse.json({ error: 'Объект ведёт другой агент' }, { status: 403 })
      }
    }

    const result = await approveHouseInfo(payload, objectId, {
      keys,
      applyToCard: body?.applyToCard === true,
      toDescription: body?.toDescription === true,
      actor: { name: user.name },
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Не удалось подтвердить' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      // Кадастровые сведения снимка — только администратору (см. house-data)
      saved: result.saved ? houseInfoForStaff(result.saved, user.role === 'admin') : result.saved,
      items: result.items,
      patch: result.patch,
      paragraph: result.paragraph,
    })
  } catch (error) {
    console.error('House data manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

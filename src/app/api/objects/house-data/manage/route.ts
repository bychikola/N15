import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { myObjectIds } from '@/lib/legal-service'
import { approveHouseInfo } from '@/lib/house-info-service'
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
 * Внутренний маршрут CRM: агент — по своим объектам, администратор — по всем.
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
      saved: result.saved,
      items: result.items,
      patch: result.patch,
      paragraph: result.paragraph,
    })
  } catch (error) {
    console.error('House data manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

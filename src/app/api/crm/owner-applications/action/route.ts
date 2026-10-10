import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { applyOwnerAction, type OwnerActionInput } from '@/lib/owner-service'

/**
 * Действия администратора по заявке собственника из CRM.
 *
 * Раздел «Заявки собственников» открыт только администратору: в заявке
 * телефон и адрес владельца, поэтому и маршрут проверяет роль сам, не
 * полагаясь на то, что страница его не покажет. Агент получает 403.
 *
 * Одно действие — один вызов: подтвердить телефон вручную, сменить статус,
 * создать объект из заявки, связать с найденным дублем, сохранить
 * внутренний комментарий (см. applyOwnerAction в src/lib/owner-service.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Раздел доступен только администратору' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | {
          id?: number
          action?: string
          status?: string
          objectId?: number
          agentId?: number
          note?: string
          method?: string
          consent?: boolean
        }
      | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const result = await applyOwnerAction(
      payload,
      {
        id: Number(body.id),
        action: body.action as OwnerActionInput['action'],
        status: body.status,
        objectId: body.objectId,
        agentId: body.agentId,
        note: body.note,
        method: body.method,
        consent: body.consent,
      },
      user,
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Owner application action error:', error)
    return NextResponse.json({ error: 'Не удалось выполнить действие — попробуйте ещё раз' }, { status: 500 })
  }
}

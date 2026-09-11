import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { archiveObject, deleteObjectForever, restoreObject, stripArchiveComments } from '@/lib/archive-service'
import { isArchiveReason } from '@/lib/archive'

/**
 * Раздел CRM «Архив объектов» и карточка объекта:
 *   { action: 'archive', objectId, reason, comment? } — переместить в архив
 *   { action: 'restore', objectId }                    — вернуть из архива
 *   { action: 'delete',  objectId }                    — удалить окончательно
 *
 * Архивные объекты не удаляются: статус archived скрывает объект с сайта,
 * из каталога, поиска и с площадок публикации, но документ и его история
 * остаются в базе (см. src/lib/archive.ts). Вернуть объект можно в прежний
 * статус — он снова доступен для публикации.
 *
 * Внутренний маршрут CRM: только агент или администратор. Агент управляет
 * архивом своих объектов (проверка в archive-service), «Удалить окончательно»
 * доступно только администратору.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | { action?: string; objectId?: number | string; reason?: string; comment?: string }
      | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const action = body?.action
    if (!action || !['archive', 'restore', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }
    if (action === 'archive' && !isArchiveReason(body?.reason)) {
      return NextResponse.json({ error: 'Укажите причину переноса в архив' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }

    const result =
      action === 'archive'
        ? await archiveObject(payload, objectId, actor, { reason: body?.reason, comment: body?.comment })
        : action === 'restore'
          ? await restoreObject(payload, objectId, actor)
          : await deleteObjectForever(payload, objectId, actor)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      // Внутренние комментарии архива (перенос и история) — только
      // администратору: агент не получает их даже в ответе на свою операцию
      archive:
        result.archive && user.role !== 'admin' ? stripArchiveComments(result.archive) : result.archive,
    })
  } catch (error) {
    console.error('Archive manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

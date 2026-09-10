import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { publishAdvertisement, unpublishAdvertisement } from '@/lib/advertising-service'

/**
 * Кнопки «Опубликовать» и «Снять с публикации» раздела CRM «Реклама»:
 *   { action: 'publish',   id } — опубликовать оплаченный проверенный материал
 *   { action: 'unpublish', id } — снять материал с публикации
 *
 * Перед публикацией проверяются условия размещения (подтверждение
 * рекламодателя, проверка содержания, оплата, срок, erid) — те же правила
 * повторяет хук коллекции advertisements, поэтому обойти их нельзя.
 * Управление рекламой доступно только администратору.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Рекламой управляет администратор' },
        { status: 403 },
      )
    }

    const body = (await req.json().catch(() => null)) as { action?: string; id?: number | string } | null
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указан рекламный материал' }, { status: 400 })
    }
    const action =
      body?.action === 'unpublish' ? 'unpublish' : body?.action === 'publish' ? 'publish' : null
    if (!action) {
      return NextResponse.json({ error: 'Не указано действие (publish/unpublish)' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, email: user.email, name: user.name }
    const result =
      action === 'publish'
        ? await publishAdvertisement(payload, id, actor)
        : await unpublishAdvertisement(payload, id, actor)

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Не удалось выполнить действие' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, status: result.status, markingText: result.markingText })
  } catch (error) {
    console.error('Advertising publish manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

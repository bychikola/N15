import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { approveNews, postponeNews, rejectNews, type NewsActionPatch } from '@/lib/news-service'

/**
 * Кнопки раздела CRM «Новости на проверку»:
 *   { action: 'approve',  id, title?, summary?, topic? } — одобрить и опубликовать в блоге
 *   { action: 'reject',   id, reason? }                  — отклонить
 *   { action: 'postpone', id, days?, reason? }           — отложить (вернётся в очередь)
 *
 * Автопубликации нет: в блог новость попадает только после подтверждения
 * сотрудника. Перед публикацией ещё раз проверяются правила (официальный
 * источник, заголовок, дата, ссылка, краткое содержание) — их же повторяет
 * хук коллекции news, обойти проверку нельзя (см. src/lib/news.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | { action?: string; id?: number | string; title?: string; summary?: string; topic?: string; reason?: string; days?: number }
      | null
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указана новость' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, email: user.email, name: user.name }
    const patch: NewsActionPatch = {
      title: typeof body?.title === 'string' ? body.title : undefined,
      summary: typeof body?.summary === 'string' ? body.summary : undefined,
      topic: typeof body?.topic === 'string' ? body.topic : undefined,
    }

    if (body?.action === 'approve') {
      const result = await approveNews(payload, id, actor, patch)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ok: true, blogPostId: result.blogPostId })
    }

    if (body?.action === 'reject') {
      const result = await rejectNews(payload, id, actor, body.reason)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (body?.action === 'postpone') {
      const result = await postponeNews(payload, id, actor, Number(body.days) || undefined, body.reason)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Не указано действие (approve/reject/postpone)' }, { status: 400 })
  } catch (error) {
    console.error('News review manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

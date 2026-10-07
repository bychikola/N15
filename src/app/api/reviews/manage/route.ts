import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { reviewPublishIssue, type ReviewLike } from '@/lib/reviews'

/**
 * Модерация отзывов из CRM (раздел «Отзывы»).
 *
 *   POST /api/reviews/manage  { id, action, note? }
 *
 * Действия: publish (опубликовать), reject (отклонить), hide (скрыть),
 * pending (вернуть на проверку).
 *
 * Доступ: команда Н15 (агент и администратор). Публикация проверяет те же
 * условия, что и хук коллекции (reviewPublishIssue) — обойти их нельзя ни
 * отсюда, ни из админки Payload.
 */
const ACTIONS = ['publish', 'reject', 'hide', 'pending'] as const
type Action = (typeof ACTIONS)[number]

/** Куда переводит действие */
const NEXT_STATUS: Record<Action, string> = {
  publish: 'published',
  reject: 'rejected',
  hide: 'hidden',
  pending: 'pending',
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | { id?: number | string; action?: string; note?: string }
      | null
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указан отзыв' }, { status: 400 })
    }
    const action = ACTIONS.includes(body?.action as Action) ? (body?.action as Action) : null
    if (!action) {
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = (await payload
      .findByID({ collection: 'reviews', id, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as Record<string, unknown> | null
    if (!doc) {
      return NextResponse.json({ error: 'Отзыв не найден' }, { status: 404 })
    }

    // Публикация — единственное действие с проверкой полноты отзыва
    if (action === 'publish') {
      const issue = reviewPublishIssue(doc as ReviewLike)
      if (issue) {
        return NextResponse.json({ error: `Нельзя опубликовать: ${issue}` }, { status: 400 })
      }
    }

    const note = String(body?.note || '').trim().slice(0, 1000)
    const data: Record<string, unknown> = {
      status: NEXT_STATUS[action],
      moderatedBy: user.email || user.name || 'сотрудник',
      moderatedAt: new Date().toISOString(),
    }
    // Заметка модератора — служебная: пишем, только если её дали
    if (note) data.moderationNote = note

    // Сессию передаём явно: при overrideAccess Payload не подставляет её сам,
    // а хук коллекции по req.user проверяет, что публикует именно команда Н15
    type UpdateArgs = Parameters<typeof payload.update>[0]
    await payload.update({
      collection: 'reviews',
      id,
      data,
      depth: 0,
      overrideAccess: true,
      user: user as unknown as UpdateArgs['user'],
    })

    return NextResponse.json({ ok: true, status: NEXT_STATUS[action] })
  } catch (error) {
    console.error('Review manage error:', error)
    return NextResponse.json({ error: 'Не удалось выполнить действие' }, { status: 500 })
  }
}

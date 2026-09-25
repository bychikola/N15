import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { publishBoardAd } from '@/lib/board-service'
import { sendBoardMail } from '@/lib/board-mail'
import { BOARD_RENEW_DAYS, boardPublishIssue, type BoardAdLike } from '@/lib/board'

/**
 * Модерация объявлений доски из CRM (раздел «Доска»).
 *
 *   POST /api/board/manage  { id, action, note? }
 *
 * Действия: publish (опубликовать), clarify (нужны уточнения), reject
 * (отклонить), unpublish (снять с публикации), renew (продлить срок).
 *
 * Доступ: команда Н15 (агент и администратор) — раздел CRM открыт всей команде,
 * и объявлений со временем будет много: очередь не должна зависеть от одного
 * человека. Сузить до администратора — одна строка здесь.
 *
 * Публикация идёт через publishBoardAd: он копирует фотографии из закрытого
 * хранилища в media (иначе объявление вышло бы на сайт без снимков), а условия
 * проверяет хук коллекции — обойти их нельзя ни отсюда, ни из админки.
 */
const ACTIONS = ['publish', 'clarify', 'reject', 'unpublish', 'renew'] as const
type Action = (typeof ACTIONS)[number]

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
      return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
    }
    const action = ACTIONS.includes(body?.action as Action) ? (body?.action as Action) : null
    if (!action) {
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = (await payload
      .findByID({ collection: 'board-ads', id, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as Record<string, unknown> | null
    if (!doc) {
      return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
    }

    const note = String(body?.note || '').trim().slice(0, 1000)
    const by = user.email || user.name || 'сотрудник'

    // Публикация — единственное действие с копированием фотографий
    if (action === 'publish') {
      const issue = boardPublishIssue(doc as BoardAdLike)
      if (issue) {
        return NextResponse.json({ error: `Нельзя опубликовать: ${issue}` }, { status: 400 })
      }
      const result = await publishBoardAd(payload, id, { id: user.id, email: user.email, name: user.name, role: user.role })
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Не удалось опубликовать' }, { status: 400 })
      }
      await markModerated(payload, id, by)
      // Письмо — вспомогательный канал: автор видит то же в кабинете,
      // поэтому неудачная отправка действие не отменяет
      await sendBoardMail(payload, String(doc.email || ''), {
        kind: 'published',
        adId: id,
        title: String(doc.title || ''),
      })
      return NextResponse.json({ ok: true, status: 'published' })
    }

    // Остальные действия — смена статуса и заметка для автора
    const next: Record<Exclude<Action, 'publish'>, { status: string; note?: string }> = {
      clarify: { status: 'clarification', note },
      reject: { status: 'rejected', note },
      unpublish: { status: 'archived', note },
      renew: { status: 'published' },
    }
    const update = next[action as Exclude<Action, 'publish'>]

    // Отказ и уточнения без пояснения бессмысленны: автор не поймёт, что править
    if ((action === 'clarify' || action === 'reject') && !note) {
      return NextResponse.json({ error: 'Напишите, что исправить или почему отказ' }, { status: 400 })
    }

    const data: Record<string, unknown> = { status: update.status }
    if (update.note !== undefined && update.note !== '') data.moderationNote = update.note
    if (action === 'renew') {
      const base = new Date(String(doc.expiresAt || new Date().toISOString()))
      const from = base.getTime() > Date.now() ? base : new Date()
      from.setDate(from.getDate() + BOARD_RENEW_DAYS)
      data.expiresAt = from.toISOString()
    }

    await payload.update({ collection: 'board-ads', id, data, depth: 0, overrideAccess: true })
    await markModerated(payload, id, by)

    // Автору — письмо о решении (у уточнений и отказа обязателен текст)
    if (action === 'clarify' || action === 'reject') {
      await sendBoardMail(payload, String(doc.email || ''), {
        kind: action === 'clarify' ? 'clarification' : 'rejected',
        adId: id,
        title: String(doc.title || ''),
        note,
      })
    }

    return NextResponse.json({ ok: true, status: update.status })
  } catch (error) {
    console.error('Board manage error:', error)
    return NextResponse.json({ error: 'Не удалось выполнить действие' }, { status: 500 })
  }
}

/** Кто и когда проверял — для карточки модерации и журнала объявления */
async function markModerated(
  payload: Awaited<ReturnType<typeof getPayload>>,
  id: number,
  by: string,
): Promise<void> {
  await payload
    .update({
      collection: 'board-ads',
      id,
      data: { moderatedBy: by, moderatedAt: new Date().toISOString() },
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
}

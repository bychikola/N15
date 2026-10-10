import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

import { issueOwnerManageLink, revokeOwnerManageLinks } from '@/lib/owner-manage-link'
import { rateLimited } from '@/lib/rate-limit'

/**
 * Номер объявления из тела запроса: прямо (boardAdId) или через заявку
 * (applicationId) — во втором случае объявление берётся из связи заявки.
 * Ссылку часто выдают из карточки заявки, где известен её номер. 0 — не найден.
 */
async function boardAdIdFromBody(
  payload: Payload,
  body: { boardAdId?: number; applicationId?: number } | null,
): Promise<number> {
  if (!body || typeof body !== 'object') return 0
  const direct = Number(body.boardAdId)
  if (Number.isInteger(direct) && direct > 0) return direct

  const applicationId = Number(body.applicationId)
  if (!Number.isInteger(applicationId) || applicationId <= 0) return 0
  const app = await payload
    .findByID({
      collection: 'owner-applications',
      id: applicationId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  const link = (app as { boardAd?: unknown } | null)?.boardAd
  const id = Number(link && typeof link === 'object' ? (link as { id?: unknown }).id : link)
  return Number.isInteger(id) && id > 0 ? id : 0
}

/**
 * Выдача защищённой ссылки управления объявлением собственника.
 *
 * Только администратор и только для объявления «от собственника», у которого
 * по заявке подтверждён контакт владельца. Ссылка привязана к конкретному
 * объявлению, содержит случайный токен (в базе — только хеш) и живёт 24 часа
 * (см. src/lib/owner-manage-link.ts).
 *
 * Ссылку маршрут НЕ отправляет никому: её получает администратор и сам
 * передаёт владельцу. Автоматическая рассылка на произвольный номер без
 * подтверждения принадлежности запрещена требованием этапа — поэтому здесь
 * нет ни SMS, ни почты.
 *
 * Принимает либо номер объявления (boardAdId), либо номер заявки
 * (applicationId) — во втором случае объявление берётся из связи заявки.
 * Перевыпуск разрешён: так собственник получает новую ссылку, когда прежняя
 * истекла; активной остаётся только последняя.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Раздел доступен только администратору' }, { status: 403 })
    }

    // Выдача ссылки — редкое ручное действие: ограничиваем частоту,
    // чтобы перебором заявок нельзя было наплодить токены
    if (rateLimited(`owner-manage-link:${user.id}`, 30, 60 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много запросов — попробуйте позже' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as
      | { boardAdId?: number; applicationId?: number }
      | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const boardAdId = await boardAdIdFromBody(payload, body)
    if (!boardAdId) {
      return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
    }

    const result = await issueOwnerManageLink(payload, boardAdId, {
      user,
      origin: req.nextUrl.origin,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    // Ответ содержит саму ссылку — она показывается один раз, в базе её нет
    return NextResponse.json({
      ok: true,
      url: result.url,
      expiresAt: result.expiresAt,
      boardAdId: result.boardAdId,
    })
  } catch (error) {
    console.error('Owner manage link issue error:', error)
    return NextResponse.json({ error: 'Не удалось выдать ссылку — попробуйте ещё раз' }, { status: 500 })
  }
}

/**
 * Отзыв ссылки управления: администратор гасит активную ссылку объявления —
 * по ней больше нельзя открыть объявление, даже до истечения срока. Сама
 * запись в базе остаётся (только с датой отзыва) — история выдач не теряется.
 * Принимает те же поля, что и выдача: boardAdId либо applicationId.
 */
export async function DELETE(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Раздел доступен только администратору' }, { status: 403 })
    }

    if (rateLimited(`owner-manage-link:${user.id}`, 30, 60 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много запросов — попробуйте позже' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as
      | { boardAdId?: number; applicationId?: number }
      | null
    const boardAdId = await boardAdIdFromBody(payload, body)
    if (!boardAdId) {
      return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
    }

    const result = await revokeOwnerManageLinks(payload, boardAdId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, boardAdId })
  } catch (error) {
    console.error('Owner manage link revoke error:', error)
    return NextResponse.json({ error: 'Не удалось отозвать ссылку — попробуйте ещё раз' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { resolveOwnerManageLink, OWNER_MANAGE_TOKEN_RE } from '@/lib/owner-manage-link'
import { boardAdAddress, BOARD_STATUS_LABELS, type BoardAdLike, type BoardStatus } from '@/lib/board'
import { categoryLabel } from '@/lib/object-categories'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Доступ по ссылке управления: собственник без учётной записи открывает своё
 * объявление. Маршрут принимает токен, находит по его хешу ровно одну запись
 * и отдаёт данные ТОЛЬКО того объявления, к которому ссылка привязана, — ни
 * список, ни чужое объявление, ни служебные поля заявки наружу не уходят.
 *
 * Ссылка одноразово-персональная: подставить номер объявления нельзя, поиск
 * идёт по токену. Истёкшая или отозванная ссылка не работает — ответ один и
 * тот же, чтобы перебором нельзя было понять, существует ли ссылка.
 *
 * Этот этап даёт только доступ на чтение: редактирование, удаление и
 * повторная публикация появятся следующим этапом и будут вызывать эту же
 * проверку (resolveOwnerManageLink) перед любым изменением.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    if (rateLimited(`owner-manage:${clientIp(req.headers)}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много запросов — попробуйте позже' }, { status: 429 })
    }

    const raw = req.nextUrl.searchParams.get('token') || ''
    // Формат токена проверяем до обращения к базе: мусор не создаёт запросов
    if (!OWNER_MANAGE_TOKEN_RE.test(raw)) {
      return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 404 })
    }

    const link = await resolveOwnerManageLink(payload, raw)
    if (!link) {
      return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 404 })
    }

    let ad: Record<string, unknown> | null = null
    try {
      ad = (await payload.findByID({
        collection: 'board-ads',
        id: link.boardAdId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> | null
    } catch {
      ad = null
    }
    if (!ad) {
      return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 404 })
    }

    const status = String(ad.status || 'pending')
    // Отдаём только то, что нужно владельцу о своём объявлении. Полный адрес
    // (с домом) — он его и указал; телефон в ответ не кладём, он не нужен
    return NextResponse.json({
      ok: true,
      ad: {
        id: Number(ad.id),
        title: String(ad.title || ''),
        status,
        statusLabel: BOARD_STATUS_LABELS[status as BoardStatus] || status,
        dealType: String(ad.dealType || 'sale'),
        category: String(ad.category || ''),
        categoryTitle: categoryLabel(String(ad.category || '')),
        price: typeof ad.price === 'number' ? ad.price : null,
        area: typeof ad.area === 'number' ? ad.area : null,
        address: boardAdAddress(ad as unknown as BoardAdLike, { isAuthor: true }),
        publishedAt: typeof ad.publishedAt === 'string' ? ad.publishedAt : null,
        expiresAt: typeof ad.expiresAt === 'string' ? ad.expiresAt : null,
      },
      /** До какого момента действует сама ссылка */
      linkExpiresAt: link.expiresAt,
    })
  } catch (error) {
    console.error('Owner manage link open error:', error)
    return NextResponse.json({ error: 'Не удалось открыть объявление — попробуйте ещё раз' }, { status: 500 })
  }
}

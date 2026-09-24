import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  archiveBoardAdByAuthor,
  loadMyBoardAd,
  loadMyBoardAds,
  resubmitBoardAdByAuthor,
  updateBoardAdByAuthor,
} from '@/lib/board-service'
import { boardPhotosFromForm } from '@/lib/board-form'
import { BOARD_MAX_PHOTOS } from '@/lib/board'
import { rateLimited } from '@/lib/rate-limit'

/**
 * Кабинет автора: свои объявления, правка, снятие и повторная подача.
 *
 *   GET  /api/board/ads/manage        — список своих объявлений
 *   GET  /api/board/ads/manage?id=N   — одно своё объявление для формы правки
 *   POST /api/board/ads/manage        — multipart: { id, action }
 *
 * Действия: update (правка содержания), archive (снять с публикации),
 * resubmit (подать снова), renew (продлить срок).
 *
 * Доступ только свой: каждое действие проверяет, что автор объявления —
 * текущий пользователь (см. ownBoardAd в src/lib/board-service.ts). Через
 * этот маршрут нельзя опубликовать объявление: правка возвращает его
 * в очередь модерации, публикует только команда (см. /api/board/manage).
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите в аккаунт' }, { status: 401 })
    }
    const authorId = Number(user.id)

    const raw = req.nextUrl.searchParams.get('id')
    if (raw) {
      const ad = await loadMyBoardAd(payload, Number(raw), authorId)
      if (!ad) {
        return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
      }
      return NextResponse.json({ ad })
    }

    return NextResponse.json({ ads: await loadMyBoardAds(payload, authorId) })
  } catch (error) {
    console.error('Board my ads error:', error)
    return NextResponse.json({ error: 'Не удалось загрузить объявления' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите в аккаунт' }, { status: 401 })
    }
    const authorId = Number(user.id)

    // Правка и повторная подача — не чаще десяти раз в час с автора:
    // каждая правка снова ставит объявление в очередь модерации
    if (rateLimited(`board-manage:${authorId}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много изменений — попробуйте позже' }, { status: 429 })
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Не удалось прочитать форму' }, { status: 400 })
    }

    const id = Number(form.get('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
    }
    const action = String(form.get('action') || '')

    if (action === 'update') {
      // Фотографии проверяем до записи: формат и размер — те же правила,
      // что при подаче (см. src/lib/board-form.ts)
      const photos = boardPhotosFromForm(form)
      if (!photos.ok) {
        return NextResponse.json({ error: photos.error }, { status: 415 })
      }
      const keep = String(form.get('keepPhotos') || '')
        .split(',')
        .filter(Boolean).length
      if (keep + photos.files.length === 0) {
        return NextResponse.json({ error: 'Оставьте хотя бы одну фотографию объекта' }, { status: 400 })
      }
      if (keep + photos.files.length > BOARD_MAX_PHOTOS) {
        return NextResponse.json({ error: `Не больше ${BOARD_MAX_PHOTOS} фотографий` }, { status: 400 })
      }

      const result = await updateBoardAdByAuthor(payload, id, authorId, form)
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Не удалось сохранить' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, status: 'pending' })
    }

    if (action === 'archive') {
      const result = await archiveBoardAdByAuthor(payload, id, authorId)
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Не удалось снять' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, status: 'archived' })
    }

    if (action === 'resubmit' || action === 'renew') {
      const result = await resubmitBoardAdByAuthor(payload, id, authorId, action === 'renew')
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Не удалось подать' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, status: action === 'renew' ? 'published' : 'pending' })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (error) {
    console.error('Board manage error:', error)
    return NextResponse.json({ error: 'Не удалось выполнить действие' }, { status: 500 })
  }
}

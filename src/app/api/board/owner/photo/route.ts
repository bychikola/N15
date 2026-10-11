import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { resolveOwnerManageLink, OWNER_MANAGE_TOKEN_RE } from '@/lib/owner-manage-link'
import { readOwnerAdPhoto } from '@/lib/owner-manage'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Снимок объявления для страницы управления по личной ссылке.
 *
 * Фотографии до публикации лежат в закрытом хранилище board-materials: прямых
 * адресов у них нет (доступ к файлам проверяет Payload по учётной записи, а у
 * собственника её нет). Поэтому страница управления показывает снимки через
 * этот маршрут: он принимает тот же токен, что и сама страница, и отдаёт файл
 * ТОЛЬКО если запрошенный снимок принадлежит объявлению этой ссылки
 * (см. readOwnerAdPhoto). Зная чужой id, по своей ссылке чужой файл не получить.
 *
 * GET /api/board/owner/photo?token=…&id=<id снимка>&size=thumb|full
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    // Страница показывает сразу все снимки: лимит выше, чем у чтения данных
    if (rateLimited(`owner-manage-photo:${clientIp(req.headers)}`, 300, 10 * 60_000)) {
      return new Response('Too many requests', { status: 429 })
    }

    const raw = req.nextUrl.searchParams.get('token') || ''
    if (!OWNER_MANAGE_TOKEN_RE.test(raw)) {
      return new Response('Not found', { status: 404 })
    }
    const link = await resolveOwnerManageLink(payload, raw)
    if (!link) {
      return new Response('Not found', { status: 404 })
    }

    const photoId = Number(req.nextUrl.searchParams.get('id'))
    if (!Number.isInteger(photoId) || photoId <= 0) {
      return new Response('Not found', { status: 404 })
    }
    const thumb = req.nextUrl.searchParams.get('size') === 'thumb'

    const file = await readOwnerAdPhoto(payload, link.boardAdId, photoId, thumb)
    if (!file) {
      return new Response('Not found', { status: 404 })
    }

    // Файл личный: кешируем только у владельца и не даём браузеру угадывать
    // тип (nosniff), как в отдаче вложений почты (см. /api/mail/attachment)
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.data.length),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('Owner manage photo error:', error)
    return new Response('Not found', { status: 404 })
  }
}

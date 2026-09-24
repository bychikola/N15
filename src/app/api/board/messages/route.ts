import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { rateLimited } from '@/lib/rate-limit'

/**
 * Переписка по объявлению доски: покупатель ↔ автор.
 *
 *   GET  /api/board/messages?ad=N&with=U   — переписка по объявлению
 *   POST /api/board/messages               — { adId, text, to? }
 *
 * Отдельный маршрут, а не REST коллекции messages: у диалога доски свои
 * правила — писать можно только по опубликованному объявлению, только второй
 * стороне диалога (автору или тому, кто уже написал) и никогда себе. Через
 * общий REST это не проверить: там доступ решает where-условие «участник»,
 * а на создание его не наложить.
 *
 * Пара диалога: объявление + покупатель (автор у объявления один), поэтому
 * переписка выбирается по объявлению и второй стороне — в записи для этого
 * хранится `counterpart`.
 */
const MSG_RATE_MAX = 20
const MSG_RATE_WINDOW_MS = 60 * 60_000
const TEXT_MAX = 2000

/** Автор объявления из документа (id или объект связи) */
const authorIdOf = (ad: Record<string, unknown>): number | null => {
  const raw = ad.author as { id?: number } | number | undefined
  const id = typeof raw === 'object' && raw ? Number(raw.id) : Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Выборка переписки по объявлению. Участник видит только свои диалоги:
 * покупатель — свой (с автором), автор — все диалоги по своему объявлению
 * (по одному на покупателя). Сотрудник Н15 видит переписку как автор,
 * если объявление его.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите в аккаунт' }, { status: 401 })
    }
    const viewerId = Number(user.id)

    const adId = Number(req.nextUrl.searchParams.get('ad'))
    if (!Number.isInteger(adId) || adId <= 0) {
      return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
    }
    const ad = (await payload
      .findByID({ collection: 'board-ads', id: adId, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as Record<string, unknown> | null
    if (!ad) {
      return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
    }

    const authorId = authorIdOf(ad)
    const isAuthor = authorId === viewerId
    // Покупатель в диалоге — тот, кто написал (в поле counterpart у сообщений
    // автора он и есть). Автору нужен параметр with: у него диалогов может
    // быть несколько, по одному на покупателя
    const withParam = Number(req.nextUrl.searchParams.get('with'))
    const buyerId = isAuthor
      ? (Number.isInteger(withParam) && withParam > 0 ? withParam : null)
      : viewerId
    if (!buyerId) {
      return NextResponse.json({ error: 'Не указан собеседник' }, { status: 400 })
    }

    const res = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { boardAd: { equals: adId } },
          // Переписка именно этой пары: сообщения покупателя и ответы автора
          { or: [{ sender: { equals: buyerId } }, { counterpart: { equals: buyerId } }] },
        ],
      },
      sort: 'createdAt',
      limit: 200,
      depth: 1,
      overrideAccess: true,
    })

    // Отметку прочтения ставит тот, кто открыл переписку: входящие — прочитаны
    for (const msg of res.docs) {
      const senderRaw = (msg as { sender?: { id?: number } | number }).sender
      const senderId = typeof senderRaw === 'object' && senderRaw ? Number(senderRaw.id) : Number(senderRaw)
      if (senderId !== viewerId && (msg as { read?: boolean }).read !== true) {
        await payload
          .update({ collection: 'messages', id: msg.id, data: { read: true }, overrideAccess: true })
          .catch(() => null)
      }
    }

    return NextResponse.json({
      messages: (res.docs as unknown as Record<string, unknown>[]).map((m) => ({
        id: Number(m.id),
        text: String(m.text || ''),
        read: m.read === true,
        createdAt: String(m.createdAt || ''),
        senderId: (() => {
          const s = m.sender as { id?: number } | number | undefined
          return typeof s === 'object' && s ? Number(s.id) : Number(s)
        })(),
        senderName: (() => {
          const s = m.sender as { name?: string } | undefined
          return typeof s === 'object' && s ? String(s.name || '') : ''
        })(),
      })),
      authorId,
      buyerId,
    })
  } catch (error) {
    console.error('Board messages error:', error)
    return NextResponse.json({ error: 'Не удалось загрузить переписку' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите, чтобы написать автору' }, { status: 401 })
    }
    const viewerId = Number(user.id)

    if (rateLimited(`board-msg:${viewerId}`, MSG_RATE_MAX, MSG_RATE_WINDOW_MS)) {
      return NextResponse.json({ error: 'Слишком много сообщений — попробуйте позже' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as
      | { adId?: number | string; text?: string; to?: number | string }
      | null
    const adId = Number(body?.adId)
    const text = String(body?.text || '').trim().slice(0, TEXT_MAX)
    if (!Number.isInteger(adId) || adId <= 0) {
      return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: 'Напишите сообщение' }, { status: 400 })
    }

    const ad = (await payload
      .findByID({ collection: 'board-ads', id: adId, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as Record<string, unknown> | null
    if (!ad) {
      return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
    }
    // Писать можно только по объявлению, которое сейчас на сайте: у снятого
    // и непроверенного автор переписку не ждёт
    if (String(ad.status) !== 'published') {
      return NextResponse.json({ error: 'Объявление больше не публикуется' }, { status: 400 })
    }

    const authorId = authorIdOf(ad)
    if (!authorId) {
      return NextResponse.json({ error: 'У объявления нет автора' }, { status: 400 })
    }

    // Кому пишем: автор отвечает покупателю (нужен параметр to), покупатель
    // пишет автору — по умолчанию
    const isAuthor = authorId === viewerId
    const toId = isAuthor ? Number(body?.to) : authorId
    if (!Number.isInteger(toId) || toId <= 0) {
      return NextResponse.json({ error: 'Не указан собеседник' }, { status: 400 })
    }
    if (toId === viewerId) {
      return NextResponse.json({ error: 'Нельзя написать самому себе' }, { status: 400 })
    }
    // Автор может ответить только тому, кто ему писал по этому объявлению:
    // иначе через доску можно было бы написать любому пользователю
    if (isAuthor) {
      const known = await payload.count({
        collection: 'messages',
        where: {
          and: [
            { boardAd: { equals: adId } },
            { or: [{ sender: { equals: toId } }, { counterpart: { equals: toId } }] },
          ],
        },
        overrideAccess: true,
      })
      if (!known.totalDocs) {
        return NextResponse.json({ error: 'Этот покупатель вам не писал' }, { status: 403 })
      }
    }

    const message = await payload.create({
      collection: 'messages',
      data: {
        boardAd: adId,
        sender: viewerId,
        counterpart: toId,
        text,
        read: false,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, id: message.id }, { status: 201 })
  } catch (error) {
    console.error('Board message send error:', error)
    return NextResponse.json({ error: 'Не удалось отправить сообщение' }, { status: 500 })
  }
}

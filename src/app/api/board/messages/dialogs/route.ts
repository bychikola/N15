import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Диалоги доски текущего пользователя: одно объявление — одна строка на
 * собеседника. Автор видит, кто ему писал по каждому объявлению, покупатель —
 * свои переписки с авторами.
 *
 * Возвращаем собеседника, последнее сообщение и число непрочитанных: этого
 * достаточно, чтобы показать список в личном кабинете, а сама переписка
 * открывается отдельной страницей (/lk/board/messages/<adId>).
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите в аккаунт' }, { status: 401 })
    }
    const me = Number(user.id)

    // Все сообщения доски, где я участник: написал сам или мне написали
    const res = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { boardAd: { exists: true } },
          { or: [{ sender: { equals: me } }, { counterpart: { equals: me } }] },
        ],
      },
      sort: '-createdAt',
      limit: 500,
      depth: 1,
      overrideAccess: true,
    })

    const idOf = (v: unknown): number => {
      if (typeof v === 'object' && v) return Number((v as { id?: number }).id) || 0
      return Number(v) || 0
    }
    const nameOf = (v: unknown): string =>
      typeof v === 'object' && v ? String((v as { name?: string }).name || '') : ''

    const dialogs = new Map<string, {
      adId: number
      adTitle: string
      otherId: number
      otherName: string
      lastText: string
      lastAt: string
      unread: number
    }>()

    for (const doc of res.docs as unknown as Record<string, unknown>[]) {
      const adId = idOf(doc.boardAd)
      const senderId = idOf(doc.sender)
      const counterpartId = idOf(doc.counterpart)
      const otherId = senderId === me ? counterpartId : senderId
      if (!adId || !otherId) continue

      const key = `${adId}:${otherId}`
      const ad = doc.boardAd as { title?: string } | undefined
      const existing = dialogs.get(key)
      const unread = senderId !== me && doc.read !== true ? 1 : 0
      if (!existing) {
        dialogs.set(key, {
          adId,
          adTitle: typeof ad === 'object' && ad ? String(ad.title || '') : '',
          otherId,
          otherName: nameOf(senderId === me ? doc.counterpart : doc.sender),
          lastText: String(doc.text || ''),
          lastAt: String(doc.createdAt || ''),
          unread,
        })
      } else {
        existing.unread += unread
      }
    }

    return NextResponse.json({ dialogs: Array.from(dialogs.values()) })
  } catch (error) {
    console.error('Board dialogs error:', error)
    return NextResponse.json({ error: 'Не удалось загрузить сообщения' }, { status: 500 })
  }
}

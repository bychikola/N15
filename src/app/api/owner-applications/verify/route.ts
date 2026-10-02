import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { confirmOwnerPhone } from '@/lib/owner-service'
import { CODE_MAX_ATTEMPTS, ownerCodeExpired, ownerCodeMatches } from '@/lib/owner-verify'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Проверка кода из SMS: владелец вводит код с формы на /sell, и заявка
 * переходит в статус «Телефон подтверждён». До этого момента объект в каталог
 * попасть не может — его просто нет в базе.
 *
 * Ответ не содержит ни телефона, ни данных заявки: только результат проверки.
 * Сам код живёт в базе хешем, попытки ограничены (5 ошибок — нужен новый код),
 * срок — 15 минут, плюс лимит по IP от перебора (см. src/lib/owner-verify.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    // Перебор кода с одного адреса: 5 цифр — миллион комбинаций, но при
    // пяти попытках на заявку перебор экономически бессмысленен; лимит
    // закрывает и случай, когда заявок много
    if (rateLimited(`owner-verify:${clientIp(req.headers)}`, 20, 10 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много попыток — попробуйте позже' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as { id?: number; code?: string } | null
    const id = Number(body?.id)
    const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '').slice(0, 5) : ''
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }
    if (!/^\d{5}$/.test(code)) {
      return NextResponse.json({ error: 'Введите пять цифр из SMS' }, { status: 400 })
    }

    let doc: Record<string, unknown> | null = null
    try {
      doc = (await payload.findByID({
        collection: 'owner-applications',
        id,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> | null
    } catch {
      doc = null
    }
    if (!doc) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })

    if (doc.phoneConfirmedAt) {
      return NextResponse.json({ ok: true, already: true })
    }

    const attempts = Number(doc.verifyAttempts) || 0
    if (attempts >= CODE_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Слишком много неверных попыток — запросите новый код' },
        { status: 400 },
      )
    }
    if (ownerCodeExpired(typeof doc.verifyCodeSentAt === 'string' ? doc.verifyCodeSentAt : null)) {
      return NextResponse.json({ error: 'Код истёк — запросите новый' }, { status: 400 })
    }

    const storedHash = typeof doc.verifyCodeHash === 'string' ? doc.verifyCodeHash : null
    if (!ownerCodeMatches(storedHash, code)) {
      await payload.update({
        collection: 'owner-applications',
        id,
        data: { verifyAttempts: attempts + 1 },
        depth: 0,
        overrideAccess: true,
      })
      const left = CODE_MAX_ATTEMPTS - (attempts + 1)
      return NextResponse.json(
        {
          error:
            left > 0
              ? `Неверный код. Осталось попыток: ${left}`
              : 'Неверный код. Попытки закончились — запросите новый код',
        },
        { status: 400 },
      )
    }

    const result = await confirmOwnerPhone(payload, id, 'code')
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, status: result.status })
  } catch (error) {
    console.error('Owner verify error:', error)
    return NextResponse.json({ error: 'Не удалось проверить код — попробуйте ещё раз' }, { status: 500 })
  }
}

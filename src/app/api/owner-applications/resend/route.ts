import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  CODE_RESEND_MAX_PER_DAY,
  generateOwnerCode,
  hashOwnerCode,
  resendWaitSeconds,
} from '@/lib/owner-verify'
import { smsConfigured, sendSms } from '@/lib/sms'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Повторная отправка кода подтверждения: владелец не дождался SMS, письмо
 * потерялось или истёк срок кода. Выпускаем новый код, старый перестаёт
 * работать (в базе перезаписывается хеш).
 *
 * Ограничения — чтобы чужой номер нельзя было «бомбить» сообщениями: пауза
 * между отправками (минута), не больше пяти кодов в сутки на заявку и
 * отдельный лимит на сам номер по всем заявкам (см. src/lib/owner-verify.ts).
 * Ответ, как и у проверки кода, не содержит ни данных заявки, ни телефона.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    if (rateLimited(`owner-resend:${clientIp(req.headers)}`, 10, 10 * 60_000)) {
      return NextResponse.json({ error: 'Слишком много запросов — попробуйте позже' }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as { id?: number } | null
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
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
      return NextResponse.json({ error: 'Телефон уже подтверждён' }, { status: 400 })
    }

    const wait = resendWaitSeconds(typeof doc.verifyCodeSentAt === 'string' ? doc.verifyCodeSentAt : null)
    if (wait > 0) {
      return NextResponse.json(
        { error: `Новый код можно запросить через ${wait} с`, waitSeconds: wait },
        { status: 429 },
      )
    }

    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const sentToday = doc.verifySendsDay === day ? Number(doc.verifySendsToday) || 0 : 0
    if (sentToday >= CODE_RESEND_MAX_PER_DAY) {
      return NextResponse.json(
        { error: 'На сегодня кодов достаточно — попробуйте завтра' },
        { status: 429 },
      )
    }

    const phone = typeof doc.ownerPhone === 'string' ? doc.ownerPhone : ''
    const digits = phone.replace(/\D/g, '')
    if (digits && rateLimited(`owner-code:${digits}`, CODE_RESEND_MAX_PER_DAY, 24 * 60 * 60_000)) {
      return NextResponse.json(
        { error: 'На этот номер код уже отправляли несколько раз — попробуйте завтра' },
        { status: 429 },
      )
    }

    const code = generateOwnerCode()
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        verifyCodeHash: hashOwnerCode(code),
        verifyCodeSentAt: now.toISOString(),
        verifyAttempts: 0,
        verifySendsToday: sentToday + 1,
        verifySendsDay: day,
        history: [
          ...(Array.isArray(doc.history) ? (doc.history as Record<string, unknown>[]) : []),
          { at: now.toISOString(), action: 'Код отправлен повторно' },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })

    const sms = await sendSms(phone, `Н15: новый код подтверждения ${code}. Никому его не сообщайте.`)
    if (!sms.ok) {
      console.error(`Заявки собственников: повторная SMS не отправлена (${sms.reason || 'причина неизвестна'})`)
    }

    return NextResponse.json({ ok: true, codeSent: sms.ok, smsConfigured: smsConfigured() })
  } catch (error) {
    console.error('Owner resend error:', error)
    return NextResponse.json({ error: 'Не удалось отправить код — попробуйте ещё раз' }, { status: 500 })
  }
}

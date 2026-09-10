import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Приём заявки с формы «Обсудить размещение рекламы» (страница /advertising).
 *
 * Поля: имя, компания, телефон, почта, сообщение. Без согласия на обработку
 * персональных данных заявка не принимается — согласие обязательно и на форме
 * (клиентская проверка), и здесь, и в коллекции advertising-requests.
 * Публичного создания через REST у коллекции нет: пишем только этим маршрутом.
 */

const MAX = { name: 120, company: 200, phone: 40, email: 200, message: 4000 }

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const name = clean(body.name)
    const company = clean(body.company)
    const phone = clean(body.phone)
    const email = clean(body.email)
    const message = clean(body.message)
    const consent = body.consent === true

    if (!name) return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
    if (!phone) return NextResponse.json({ error: 'Укажите телефон' }, { status: 400 })
    // Номер без букв: минимум 10 цифр (городской с кодом или мобильный)
    if ((phone.match(/\d/g) || []).length < 10) {
      return NextResponse.json({ error: 'Проверьте номер телефона' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Проверьте адрес почты' }, { status: 400 })
    }
    if (!consent) {
      return NextResponse.json(
        { error: 'Нужно согласие на обработку персональных данных' },
        { status: 400 },
      )
    }
    if (
      name.length > MAX.name ||
      company.length > MAX.company ||
      phone.length > MAX.phone ||
      email.length > MAX.email ||
      message.length > MAX.message
    ) {
      return NextResponse.json({ error: 'Слишком длинный текст — сократите сообщение' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: 'advertising-requests',
      data: { name, company, phone, email, message, consent: true, status: 'new' },
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, id: doc.id })
  } catch (error) {
    console.error('Advertising request error:', error)
    return NextResponse.json({ error: 'Не удалось отправить заявку. Позвоните нам, пожалуйста' }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// Простой per-user лимит отправок (одна инстанция Next): не более N писем
// в минуту с одного аккаунта — защита от спам-релея через взломанную сессию.
const SEND_WINDOW_MS = 60_000
const SEND_MAX_PER_WINDOW = 10
const recentSends = new Map<number, number[]>()

function rateLimited(userId: number): boolean {
  const now = Date.now()
  const arr = (recentSends.get(userId) || []).filter((ts) => now - ts < SEND_WINDOW_MS)
  if (arr.length >= SEND_MAX_PER_WINDOW) {
    recentSends.set(userId, arr)
    return true
  }
  arr.push(now)
  recentSends.set(userId, arr)
  return false
}

// Один синтаксически валидный адрес — без списков рассылки и заголовочных инъекций
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Реальная отправка письма через SMTP (настройки ящика VK WorkSpace —
// глобал «Почта (подключение)» в админке). Письмо попадает в «Отправленные»
// ТОЛЬКО после успешной отправки на сервер — без фальшивых записей.
export async function POST(req: NextRequest) {
  try {
    // Доступ: только агент/админ с валидной сессией — иначе открытый SMTP-релей
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || (me.user.role !== 'admin' && me.user.role !== 'agent')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (rateLimited(me.user.id as number)) {
      return NextResponse.json({ error: 'Слишком много отправок — подожди минуту' }, { status: 429 })
    }

    const body = await req.json()
    const toEmail = String((body.toEmail as string) || '').trim().toLowerCase()
    const subject = String((body.subject as string) || '').trim().slice(0, 500)
    const text = String((body.text as string) || '').slice(0, 100_000)

    if (!toEmail || !text) {
      return NextResponse.json({ error: 'toEmail and text are required' }, { status: 400 })
    }
    if (!EMAIL_RE.test(toEmail) || toEmail.includes(',')) {
      return NextResponse.json({ error: 'Некорректный адрес получателя' }, { status: 400 })
    }

    const settings = await payload.findGlobal({ slug: 'mail-settings', overrideAccess: true })
    if (!settings.enabled || !settings.username || !settings.password) {
      return NextResponse.json(
        { error: 'Почта не подключена — заполни настройки в админке (Система → Почта подключение)' },
        { status: 400 },
      )
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost || 'smtp.mail.ru',
      port: Number(settings.smtpPort) || 465,
      secure: true,
      auth: { user: settings.username, pass: settings.password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    })

    const fromName = String(settings.senderName || '').trim().replace(/"/g, '')
    const from = fromName ? `"${fromName}" <${settings.username}>` : settings.username
    const subjectLine = subject || '(без темы)'

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: subjectLine,
      text,
    })
    transporter.close()

    // В «Отправленные» — только после того, как сервер принял письмо
    const email = await payload.create({
      collection: 'emails',
      data: {
        folder: 'sent',
        toEmail: toEmail.trim(),
        subject: subjectLine,
        text,
        receivedAt: new Date().toISOString(),
        read: true,
        messageId: info.messageId || undefined,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ doc: email, messageId: info.messageId || null })
  } catch (error) {
    console.error('Mail send error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `SMTP-ошибка: ${msg}` }, { status: 500 })
  }
}

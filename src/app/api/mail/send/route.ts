import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// Реальная отправка письма через SMTP (настройки ящика VK WorkSpace —
// глобал «Почта (подключение)» в админке). Письмо попадает в «Отправленные»
// ТОЛЬКО после успешной отправки на сервер — без фальшивых записей.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { toEmail, subject, text } = body as { toEmail?: string; subject?: string; text?: string }

    if (!toEmail || !text) {
      return NextResponse.json({ error: 'toEmail and text are required' }, { status: 400 })
    }

    const payload = await getPayload({ config })
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
    const subjectLine = subject?.trim() || '(без темы)'

    const info = await transporter.sendMail({
      from,
      to: toEmail.trim(),
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

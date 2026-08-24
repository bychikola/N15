import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Отправка письма. Сейчас сохраняет письмо в папку «Отправленные» —
// реальная отправка через SMTP добавится вместе с подключением ящика
// (MailSettings в админке).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { toEmail, subject, text } = body as { toEmail?: string; subject?: string; text?: string }

    if (!toEmail || !text) {
      return NextResponse.json({ error: 'toEmail and text are required' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    const email = await payload.create({
      collection: 'emails',
      data: {
        folder: 'sent',
        toEmail,
        subject: subject || '(без темы)',
        text,
        receivedAt: new Date().toISOString(),
        read: true,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ doc: email })
  } catch (error) {
    console.error('Mail send error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

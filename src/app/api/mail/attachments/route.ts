import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Список вложений письма (для вкладки «Почта»): роли агент/админ.
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || (me.user.role !== 'admin' && me.user.role !== 'agent')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const emailId = Number(req.nextUrl.searchParams.get('emailId') || 0)
    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 })
    }
    const { docs } = await payload.find({
      collection: 'mail-attachments',
      where: { email: { equals: emailId } },
      sort: 'id',
      limit: 50,
      depth: 0,
      // data (base64) не отдаём — только метаданные для списка
      select: { filename: true, mimeType: true, size: true },
    })
    return NextResponse.json({ docs })
  } catch (error) {
    console.error('Mail attachments GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

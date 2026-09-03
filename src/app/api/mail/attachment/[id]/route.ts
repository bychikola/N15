import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest } from 'next/server'

// Отдача файла вложения: картинки/PDF открываются в браузере (inline),
// остальное скачивается. Роли агент/админ; nosniff против XSS через файл.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || (me.user.role !== 'admin' && me.user.role !== 'agent')) {
      return new Response('Forbidden', { status: 403 })
    }
    const doc = await payload.findByID({
      collection: 'mail-attachments',
      id: Number(id),
      overrideAccess: true,
    })
    if (!doc?.data) {
      return new Response('Not found', { status: 404 })
    }
    const buf = Buffer.from(String(doc.data), 'base64')
    const mime = String(doc.mimeType || 'application/octet-stream')
    // inline только для безопасных типов, остальное — скачивание
    const inline = mime.startsWith('image/') || mime === 'application/pdf'
    const filename = encodeURIComponent(String(doc.filename || 'file'))
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buf.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Mail attachment GET error:', error)
    return new Response('Error', { status: 500 })
  }
}

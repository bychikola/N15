import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { canManageObjectLegal, getLegalDocFile } from '@/lib/legal-service'

// Файл документа юр. экспертизы. GET — скачивание/просмотр (картинки и PDF
// открываются inline с CSP sandbox, остальное скачивается; nosniff от XSS
// через файл). DELETE — удаление документа. Доступ — как у списка документов:
// только администратор.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const docId = Number(id)
    if (!Number.isFinite(docId) || docId <= 0) {
      return new Response('Not found', { status: 404 })
    }
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    const doc = await getLegalDocFile(payload, docId)
    if (!doc || !doc.object || !doc.data) {
      return new Response('Not found', { status: 404 })
    }
    if (!canManageObjectLegal(actor)) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }

    const buf = Buffer.from(String(doc.data), 'base64')
    const mime = String(doc.mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim()
    // inline — только растровые картинки и PDF; SVG и офисные файлы — только
    // скачиванием (svg+xml при inline-открытии исполняет скрипты — stored XSS)
    const SAFE_INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf'])
    const inline = SAFE_INLINE.has(mime)
    const filename = encodeURIComponent(String(doc.filename || 'document'))
    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Content-Length': String(buf.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    }
    if (inline) headers['Content-Security-Policy'] = 'sandbox'
    return new Response(new Uint8Array(buf), { headers })
  } catch (error) {
    console.error('Legal doc GET error:', error)
    return new Response('Error', { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const docId = Number(id)
    if (!Number.isFinite(docId) || docId <= 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    const doc = await getLegalDocFile(payload, docId)
    if (!doc || !doc.object) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    if (!canManageObjectLegal(actor)) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }

    await payload.delete({ collection: 'legal-documents', id: docId, overrideAccess: true })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Legal doc DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

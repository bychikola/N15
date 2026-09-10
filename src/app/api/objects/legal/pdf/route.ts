import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { getReportByObject, isLegalOfficer, reportRecordToData } from '@/lib/legal-service'
import { renderLegalReportPdf } from '@/lib/legal-report-pdf'
import { checkPdfStructure } from '@/lib/pdf'

// Скачивание отчёта юр. проверки в PDF. Отчёт — закрытый документ: PDF
// получает только аккаунт Ланы Козыревой (та же проверка, что в коллекции
// legal-reports). Клиентам и другим сотрудникам файл не формируется.
//
// PDF строится на сервере без внешних библиотек (см. src/lib/pdf.ts):
// кириллический шрифт встраивается в файл, поэтому скачанный отчёт
// открывается на любом устройстве.
export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!isLegalOfficer(actor)) {
      return NextResponse.json({ error: 'PDF доступен только сотруднику, ответственному за проверки' }, { status: 403 })
    }
    const objectId = Number(req.nextUrl.searchParams.get('objectId') || 0)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const record = await getReportByObject(payload, objectId)
    if (!record) {
      return NextResponse.json({ error: 'Отчёт ещё не сформирован — проведите проверку' }, { status: 404 })
    }

    const buf = renderLegalReportPdf(reportRecordToData(record))
    if (!checkPdfStructure(buf)) {
      console.error('Legal pdf: собранный PDF не прошёл проверку структуры')
      return NextResponse.json({ error: 'Не удалось собрать файл отчёта' }, { status: 500 })
    }

    const filename = encodeURIComponent(`yur-proverka-obekta-${objectId}.pdf`)
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Legal pdf GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

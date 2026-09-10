import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { getReportByObject, isLegalOfficer } from '@/lib/legal-service'

// Чтение сформированного отчёта. Отчёт — закрытый документ: этот маршрут
// отвечает только аккаунту Ланы Козыревой. Клиентам, другим агентам и
// администраторам отчёт не показывается (см. также коллекцию legal-reports).
export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!isLegalOfficer(actor)) {
      return NextResponse.json({ error: 'Отчёт доступен только сотруднику, ответственному за проверки' }, { status: 403 })
    }
    const objectId = Number(req.nextUrl.searchParams.get('objectId') || 0)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const report = await getReportByObject(payload, objectId)
    if (!report) {
      return NextResponse.json({ exists: false })
    }
    return NextResponse.json({ exists: true, report })
  } catch (error) {
    console.error('Legal report GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

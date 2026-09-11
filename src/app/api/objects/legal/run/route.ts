import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { buildAndStoreReport, canManageObjectLegal } from '@/lib/legal-service'
import type { LegalManualMarks } from '@/lib/legal-check'

// «Провести юридическую экспертизу»: кнопка в карточке объекта. Маршрут
// прогоняет движок (см. src/lib/legal-check.ts) по карточке объекта,
// загруженной выписке ЕГРН и отметкам юриста о ручных проверках и сохраняет
// отчёт в закрытую коллекцию legal-reports.
//
// Экспертиза — закрытая часть карточки: и запуск, и отчёт доступны только
// администратору (canManageObjectLegal). Остальным сотрудникам маршрут
// отвечает отказом, как и остальные маршруты документов и отчёта.
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const body = (await req.json().catch(() => null)) as
      | { objectId?: number | string; cadastralNumber?: unknown; manual?: unknown }
      | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!canManageObjectLegal(actor)) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }

    const data = await buildAndStoreReport(
      payload,
      objectId,
      {
        cadastralNumber: typeof body?.cadastralNumber === 'string' ? body.cadastralNumber : undefined,
        manual: (body?.manual || {}) as LegalManualMarks,
      },
      actor.name,
    )

    return NextResponse.json({ formed: true, report: data })
  } catch (error) {
    console.error('Legal run POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  buildAndStoreReport,
  canManageObjectLegal,
  isLegalOfficer,
} from '@/lib/legal-service'
import type { LegalFacts } from '@/lib/legal-check'

// «Провести юридическую проверку»: кнопка в карточке объекта. Маршрут
// прогоняет движок (см. src/lib/legal-check.ts) по загруженным документам и
// внесённым сведениям и сохраняет отчёт в закрытую коллекцию legal-reports.
//
// Полный текст отчёта в ответе получает только аккаунт Ланы Козыревой
// (isLegalOfficer). Остальным сотрудникам (агент, ведущий объект, или
// администратор) возвращается лишь подтверждение, что проверка проведена, —
// сам отчёт им недоступен ни в этом ответе, ни через другие маршруты.
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const body = (await req.json().catch(() => null)) as { objectId?: number | string; facts?: unknown } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!(await canManageObjectLegal(payload, actor, objectId))) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }

    const data = await buildAndStoreReport(payload, objectId, (body?.facts || {}) as LegalFacts, actor.name)

    if (isLegalOfficer(actor)) {
      return NextResponse.json({ formed: true, report: data })
    }
    // Полный отчёт — только Лане; коллегам факт проведения проверки
    return NextResponse.json({
      formed: true,
      note: 'Проверка проведена. Подробный отчёт доступен сотруднику, ответственному за юридические проверки',
      checkedAt: data.checkedAt,
    })
  } catch (error) {
    console.error('Legal run POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

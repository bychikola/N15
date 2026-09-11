import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  canManageObjectLegal,
  canReadLegalReport,
  getObjectDocs,
  getReportByObject,
} from '@/lib/legal-service'
import { LEGAL_STATUS_LABELS } from '@/lib/legal-check'

// Статус юридической экспертизы объекта для карточки CRM: что доступно
// текущему сотруднику (документы и запуск проверки), загружены ли документы,
// сформирован ли отчёт. Документы и отчёт читает только администратор (см.
// report/route.ts) — остальным сотрудникам маршрут отвечает лишь «недоступно»,
// не раскрывая ни перечня документов, ни факта проверки.
export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const objectId = Number(req.nextUrl.searchParams.get('objectId') || 0)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    const canReadReport = canReadLegalReport(actor)
    const canManage = canManageObjectLegal(actor)
    if (!canManage) {
      // Не администратор: существование проверки не раскрываем
      return NextResponse.json({ canManage: false, canReadReport: false })
    }

    const [docs, report] = await Promise.all([
      getObjectDocs(payload, objectId),
      getReportByObject(payload, objectId),
    ])
    return NextResponse.json({
      canManage: true,
      canReadReport,
      docsCount: docs.length,
      report: report
        ? {
            status: report.status,
            statusLabel: LEGAL_STATUS_LABELS[report.status as keyof typeof LEGAL_STATUS_LABELS] || String(report.status),
            checkedAt: report.checkedAt,
            docsActualAt: report.docsActualAt ?? null,
          }
        : null,
    })
  } catch (error) {
    console.error('Legal status GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

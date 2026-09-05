import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { runPlacementsSweep } from '@/lib/placements-service'

/**
 * Автоматическая периодическая проверка площадок: обрабатывает объекты,
 * которым подошёл срок (nextCheckAt наступил или проверки ещё не было).
 *
 * Вызывается таймером страницы объектов CRM (пока она открыта) и серверным
 * таймером (src/instrumentation.ts). Прогон идемпотентен и ограничен по числу
 * объектов за проход, поэтому частые вызовы безопасны.
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as { limit?: number } | null
    const limit = Math.min(20, Math.max(1, Number(body?.limit) || 5))

    const payload = await getPayload({ config })
    const { checked, skipped } = await runPlacementsSweep(payload, limit)
    return NextResponse.json({ ok: true, checked, skipped })
  } catch (error) {
    console.error('Placements sweep error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

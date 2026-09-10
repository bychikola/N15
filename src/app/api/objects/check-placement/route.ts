import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  persistPlacementSearch,
  savedPlacementSearch,
  searchObjectPlacements,
} from '@/lib/placement-search-service'

/**
 * «Проверить размещение» — кнопка в карточке объекта CRM.
 *
 * POST { objectId } — прогон проверки: данные объекта (адрес, город, район,
 * тип, площадь, комнаты, этаж, цена, описание, фотографии) снимаются с
 * карточки автоматически, затем по каждой площадке определяется, размещён ли
 * этот же объект где-то ещё (свои публикации, сохранённые объявления рынка,
 * официальные каналы площадок). Снимок сохраняется в группу placements.
 * Площадки без официального канала получают статус «проверка недоступна» —
 * результат не имитируется (см. src/lib/placement-search.ts).
 *
 * GET ?objectId=… — последний сохранённый снимок (карточка открывается без
 * повторного прогона).
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as { objectId?: number | string } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    const result = await searchObjectPlacements(payload, doc as unknown as Record<string, unknown>)
    // Снимок сохраняем best-effort: если запись не прошла, свежий результат
    // всё равно уходит агенту в ответе
    const saved = await persistPlacementSearch(payload, objectId, result)

    return NextResponse.json({
      ok: true,
      saved,
      checkedAt: result.checkedAt,
      profile: result.profile,
      probes: result.probes,
      found: result.found,
      unavailable: result.unavailable,
    })
  } catch (error) {
    console.error('Check placement error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const objectId = Number(new URL(req.url).searchParams.get('objectId'))
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    const { probes, checkedAt } = savedPlacementSearch(
      (doc as unknown as { placements?: unknown }).placements,
    )
    return NextResponse.json({ ok: true, checkedAt, probes })
  } catch (error) {
    console.error('Check placement (saved) error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { placementsSummary, touchManualItem, type PlacementsGroup } from '@/lib/placements-service'
import { platformByUrl, platformBySlug, type PlacementStatus } from '@/lib/listing-check'

/**
 * Управление привязанными к объекту объявлениями площадок из карточки CRM
 * (блок «Где размещён объект»):
 *   { action: 'add',    objectId, url, platform?, status?, price? } — привязать ручную ссылку
 *   { action: 'remove', objectId, itemId }                          — отвязать объявление
 *   { action: 'status', objectId, itemId, status }                  — подтвердить/сменить статус
 *
 * Ручная ссылка — разрешённый способ работы с площадками, которые запрещают
 * автоматический сбор (см. src/lib/listing-check.ts): ссылку агент берёт из
 * своего объявления или поиска площадки, модуль хранит её и следит за
 * устареванием (7 дней без подтверждения — «требует проверки»).
 * Дубли не создаются: повторная ссылка той же площадки обновляет запись.
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
const STATUSES: PlacementStatus[] = ['active', 'removed', 'needsCheck']

const VALID_URL_RE = /^https?:\/\//

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as {
      action?: string
      objectId?: number | string
      url?: string
      platform?: string
      status?: string
      price?: number | null
      itemId?: number | string | null
    } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }
    const action = body?.action
    if (!action || !['add', 'remove', 'status'].includes(action)) {
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) {
      return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })
    }
    const prev = ((doc as unknown as { placements?: unknown }).placements || {}) as PlacementsGroup
    // Момент действия агента — групповая дата «последней проверки» блока
    const nowIso = new Date().toISOString()

    let group: PlacementsGroup

    if (action === 'add') {
      const url = String(body?.url || '').trim()
      if (!VALID_URL_RE.test(url)) {
        return NextResponse.json({ error: 'Введите ссылку на объявление (http/https)' }, { status: 400 })
      }
      // Площадка определяется по домену ссылки; явный выбор — запасной путь
      const spec = platformByUrl(url) || (body?.platform ? platformBySlug(String(body.platform)) : undefined)
      if (!spec) {
        return NextResponse.json(
          { error: 'Ссылка не похожа на объявление площадки. Поддерживаются: Авито, ЦИАН, Домклик, Яндекс Недвижимость' },
          { status: 400 },
        )
      }
      const status: PlacementStatus = STATUSES.includes(body?.status as PlacementStatus) ? (body?.status as PlacementStatus) : 'active'
      const price = typeof body?.price === 'number' && Number.isFinite(body.price) && body.price > 0 ? body.price : null

      const items = Array.isArray(prev.items) ? [...prev.items] : []
      // Дубль ссылки той же площадки — обновляем существующую запись
      const existing = items.find((it) => it.platform === spec.slug && it.url === url)
      if (existing) {
        existing.status = status
        existing.lastCheckedAt = nowIso
        if (price != null) {
          if (existing.priceInitial == null) existing.priceInitial = price
          existing.price = price
        }
        existing.note = undefined
      } else {
        items.push({
          platform: spec.slug,
          url,
          source: 'manual',
          status,
          price,
          priceInitial: price,
          firstSeenAt: nowIso,
          // Агент только что открыл объявление и привязал его — это и есть проверка
          lastCheckedAt: nowIso,
        })
      }
      // Действие агента — это и есть проверка площадок карточки (сводка блока
      // и «дата проверки» считаются от групповой lastCheckedAt)
      group = { ...prev, items, lastCheckedAt: nowIso }
    } else if (action === 'remove') {
      const itemId = body?.itemId
      if (itemId == null) {
        return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
      }
      group = {
        ...prev,
        items: (prev.items || []).filter((it) => String(it.id) !== String(itemId)),
      }
    } else {
      const itemId = body?.itemId
      const status = body?.status as PlacementStatus
      if (itemId == null || !STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Не указаны объявление и статус' }, { status: 400 })
      }
      // Подтверждение статуса агентом — реальная проверка объявления (он открыл ссылку)
      group = touchManualItem(prev, itemId, { status, confirm: true })
      group.lastCheckedAt = nowIso
    }

    await payload.update({
      collection: 'objects',
      id: objectId,
      data: { placements: group },
      depth: 0,
      overrideAccess: true,
    })

    // Ответ строим от свежего документа: id записей массива Payload выдаёт
    // только при сохранении, и у только что добавленной записи его ещё нет —
    // карточка CRM (кнопки статусов) работает по этим id
    const fresh = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    const saved = ((fresh as unknown as { placements?: unknown }).placements || {}) as PlacementsGroup

    return NextResponse.json({ ok: true, placements: saved, summary: placementsSummary(saved) })
  } catch (error) {
    console.error('Placements manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

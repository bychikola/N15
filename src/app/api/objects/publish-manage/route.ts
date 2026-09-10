import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  publishObject,
  publishingLog,
  publishingSummary,
  unpublishObject,
  type PublishingGroup,
} from '@/lib/publish-service'
import { isPublishablePlatform, publishPlatformBySlug } from '@/lib/publishing'

/**
 * Управление публикацией объекта на площадки из карточки CRM (блок
 * «Публикация»):
 *   { action: 'publish',   objectId, platforms: ['site','vk',…] } — опубликовать
 *   { action: 'unpublish', objectId, platforms: […] }             — снять с публикации
 *
 * CRM — единственный источник данных: объявления собираются из документа
 * при каждой выгрузке (см. src/lib/publish-service.ts). Перед публикацией
 * проверяются обязательные поля (категория, тип сделки, цена, площадь,
 * адрес, описание, фотографии, агент, контактный номер) — при незаполненных
 * полях не публикуется ни одна площадка, в ответ приходит список missing.
 * Только официальные API/XML площадок (VK, Telegram) — никакого обхода
 * защиты сайтов.
 *
 * Внутренний маршрут CRM: агент работает только со своими объектами
 * (как access.update коллекции Objects), администратор — со всеми.
 */
const PUBLISHABLE = new Set(['site', 'vk', 'telegram'])

/** ids профилей агентов, привязанных к пользователю (копия логики Objects.ts) */
async function myAgentIds(payload: Awaited<ReturnType<typeof getPayload>>, userId: number | string): Promise<Set<number>> {
  const ids = new Set<number>()
  const { docs } = await payload.find({
    collection: 'agents',
    where: { user: { equals: userId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const agent of docs) {
    if (typeof agent.id === 'number') ids.add(agent.id)
  }
  return ids
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as {
      action?: string
      objectId?: number | string
      platforms?: unknown
    } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }
    const action = body?.action === 'unpublish' ? 'unpublish' : body?.action === 'publish' ? 'publish' : null
    if (!action) {
      return NextResponse.json({ error: 'Не указано действие (publish/unpublish)' }, { status: 400 })
    }
    // Принимаем только площадки с готовым адаптером; неизвестные отбрасываем
    const platforms = Array.isArray(body?.platforms)
      ? [
          ...new Set(
            body.platforms
              .map((p) => String(p).trim())
              .filter((p) => {
                const spec = publishPlatformBySlug(p)
                return p && !!spec && isPublishablePlatform(spec)
              }),
          ),
        ]
      : []
    if (!platforms.length) {
      return NextResponse.json({ error: 'Выберите площадки для публикации' }, { status: 400 })
    }
    // Пока адаптеры есть у сайта, VK и Telegram; остальные площадки подключаются
    // по официальным API/фидам позже — в этот маршрут они не попадают
    if (platforms.some((p) => !PUBLISHABLE.has(p))) {
      return NextResponse.json({ error: 'Площадка ещё не подключена к автоматической публикации' }, { status: 400 })
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
    // Агент управляет публикациями только своих объектов (свои — по профилю
    // агента в карточке, agents.user = этот пользователь)
    if (user.role !== 'admin') {
      const mine = await myAgentIds(payload, user.id)
      const agentId = (doc as unknown as { agent?: unknown }).agent
      const agentNum = typeof agentId === 'number' ? agentId : Number(agentId)
      if (!Number.isFinite(agentNum) || !mine.has(agentNum)) {
        return NextResponse.json({ error: 'Это не ваш объект — публикация доступна его агенту или администратору' }, { status: 403 })
      }
    }
    // Объект в архиве = снят с продажи: новые публикации запрещены (снятие — можно)
    if (action === 'publish' && (doc as unknown as { status?: string }).status === 'archived') {
      return NextResponse.json({ error: 'Объект снят с продажи (архив) — сначала верните его в работу' }, { status: 400 })
    }

    const by = user.name || user.email || 'CRM'
    const outcome =
      action === 'publish'
        ? await publishObject(payload, objectId, platforms, by)
        : { validation: [], results: await unpublishObject(payload, objectId, platforms, by) }

    // Свежая группа — карточка CRM рисует статусы и журнал по ней
    const fresh = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    const group = ((fresh as unknown as { publishing?: unknown }).publishing || {}) as PublishingGroup

    return NextResponse.json({
      ok: true,
      validation: outcome.validation,
      results: outcome.results,
      summary: publishingSummary(group),
      log: publishingLog(group),
    })
  } catch (error) {
    console.error('Publish manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'
import { buildCallRoute, telHref, waHref, type CallAgent } from '@/lib/call-routing'
// Общий номер агентства — только поле «Телефоны» настроек сайта
import { getPublicSiteSettings } from '@/lib/site-settings'

// Контакты агента для кнопок карточки объекта. Кнопки «Позвонить»/«WhatsApp»
// запрашивают контакт здесь — одним запросом при открытии страницы — и
// переходят по готовой ссылке: номеров текстом на странице нет.
//
// Кнопка «Позвонить» ведёт на личный рабочий мобильный ответственного агента,
// «WhatsApp» — на его WhatsApp (данные конкретного агента в CRM). По объекту
// ответственного называет сервер (src/lib/call-routing.ts), а не страница:
// чужому агенту клиент не попадёт. Общий номер Н15/АТС — отдельный канал:
// он остаётся резервным маршрутом, когда у объекта ответственного агента нет.
//
// Параметры: ?object=<id> — карточка объекта, ?id=<agentId> — страница команды.
//
// Защита от перебора: лимит по IP и только активные агенты/опубликованные
// объекты — иначе маршрут позволял бы выкачать контакты перебором id.
const CONTACT_RATE_MAX = 30
const CONTACT_RATE_WINDOW_MS = 60_000

/** Агент с полями, нужными для маршрута и WhatsApp */
interface AgentRow extends CallAgent {
  isActive?: boolean
}

/** Активный агент по id: скрытых и уволенных не отдаём */
async function loadAgent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  id: number,
): Promise<AgentRow | null> {
  const { docs } = await payload.find({
    collection: 'agents',
    where: { and: [{ id: { equals: id } }, { isActive: { equals: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (docs[0] as AgentRow | undefined) ?? null
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const objectId = Number(params.get('object'))
  const agentId = Number(params.get('id'))
  const hasObject = Number.isInteger(objectId) && objectId > 0
  const hasAgent = Number.isInteger(agentId) && agentId > 0
  if (!hasObject && !hasAgent) {
    return NextResponse.json({ error: 'Object or agent id required' }, { status: 400 })
  }
  if (rateLimited(`agent-contact:${clientIp(req.headers)}`, CONTACT_RATE_MAX, CONTACT_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const payload = await getPayload({ config })

    // Ответственный агент: у объекта — его поле «Ответственный агент», на
    // странице команды — тот агент, чья карточка открыта. Объект и агент
    // читаются с overrideAccess: маршрут строит сервер, а личные поля агента
    // (телефон, WhatsApp) скрыты от посетителей полевой проверкой коллекции
    // agents. Наружу уходят только готовые ссылки кнопок, не сами номера.
    let agent: AgentRow | null = null
    if (hasObject) {
      const { docs } = await payload.find({
        collection: 'objects',
        where: { and: [{ id: { equals: objectId } }, { status: { equals: 'published' } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const rel = (docs[0] as { agent?: unknown } | undefined)?.agent
      // На глубине 0 связь приходит id, но принимаем и развёрнутый объект
      const ref = typeof rel === 'object' && rel !== null ? (rel as { id?: unknown }).id : rel
      const responsibleId = Number(ref)
      if (Number.isInteger(responsibleId) && responsibleId > 0) {
        agent = await loadAgent(payload, responsibleId)
      }
    } else {
      agent = await loadAgent(payload, agentId)
    }

    // Общий номер агентства — тот же, что в шапке сайта (настройки → «Телефоны»)
    const { phones } = await getPublicSiteSettings(['phones'], payload)
    const commonPhone = phones?.[0]?.phone

    // Маршрут: агент определён — звонок на его личный мобильный, агента нет —
    // общий (резервный) номер агентства. См. src/lib/call-routing.ts
    const route = buildCallRoute(commonPhone, agent)
    const tel = telHref(route.dial)
    const wa = waHref(agent)

    if (!tel && !wa) {
      return NextResponse.json({ error: 'No call route and no WhatsApp' }, { status: 404 })
    }
    return NextResponse.json({
      tel: tel || undefined,
      wa: wa || undefined,
      // Источник маршрута и агент — для проверок (scripts/check-call-routing.mjs):
      // клиенту эта информация ничего не добавляет, но и не выдаёт лишнего
      source: route.source,
      agentId: route.agent?.id,
      // true — набран личный мобильный агента, false — общий номер агентства
      personal: route.personal,
    })
  } catch (error) {
    console.error('Agent contact error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loadObjectTitles, loadVisitorEvents, type VisitorRow } from '@/lib/visitor-report'
import { rateLimited } from '@/lib/rate-limit'

/**
 * «Активность на сайте» для карточки обращения в CRM: последний визит,
 * сколько раз заходил, какие объекты открывал (и какие — повторно), что
 * добавил в избранное, нажимал ли «Позвонить»/WhatsApp/«Написать».
 *
 * Данные обезличенные: карточка посетителя опознаётся хешем, IP и cookie
 * в системе нет (см. src/lib/visitor-tracking.ts). Фамилию и телефон отсюда
 * не достать — они есть только в самой заявке, которую человек отправил.
 *
 * Доступ: тот же, что к самой заявке — маршрут читает её правилами коллекции
 * applications (overrideAccess: false), поэтому агент видит активность только
 * по своим заявкам и «Неразобранному», а не по чужим. Номер карточки
 * посетителя и ссылка на неё выдаются только администратору: раздел
 * «Посетители» — закрытый (см. src/app/crm/visitors).
 */

/** Лимит запросов на сотрудника: карточка заявки запрашивает блок один раз */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60

/** Объект в ответе: номер, название и сколько раз открывал */
interface ActivityObject {
  id: number
  title: string
  views: number
}

export async function GET(req: NextRequest) {
  const user = await fetchUser(req)
  // Блок для сотрудников CRM: клиенту (role user) история посетителя не видна
  if (!user || (user.role !== 'agent' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }
  if (rateLimited(`visitor-activity:${user.id}`, RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Слишком часто' }, { status: 429 })
  }

  const applicationId = Number.parseInt(req.nextUrl.searchParams.get('applicationId') || '', 10)
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: 'Не указана заявка' }, { status: 400 })
  }

  const payload = await getPayload({ config })

  // Права заявки проверяет сама коллекция: агент не откроет чужую заявку
  try {
    await payload.findByID({
      collection: 'applications',
      id: applicationId,
      depth: 0,
      overrideAccess: false,
      user,
    })
  } catch {
    return NextResponse.json({ error: 'Заявка не найдена или нет доступа' }, { status: 403 })
  }

  // Карточка посетителя, привязанная к заявке (см. linkApplicationToVisitor)
  let card: VisitorRow | null = null
  try {
    const res = await payload.find({
      collection: 'visitors',
      where: { applications: { contains: applicationId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    card = (res.docs[0] as unknown as VisitorRow | undefined) || null
  } catch (e) {
    console.error('[visitors/activity] не удалось прочитать карточку посетителя:', e)
  }

  if (!card?.visitor) {
    // Заявка не связана с посетителем: она пришла не с формы сайта (заведена
    // вручную) или браузер не опознан — блок покажет это словами
    return NextResponse.json({ found: false })
  }

  const events = await loadVisitorEvents(payload, card.visitor, 500)

  const objectViews = new Map<number, number>()
  const favorites = new Set<number>()
  const clicks = { call: 0, whatsapp: 0, write: 0 }
  for (const event of events) {
    if (event.kind === 'object_view' && event.objectId) {
      objectViews.set(event.objectId, (objectViews.get(event.objectId) || 0) + 1)
    }
    if (event.kind === 'favorite_add' && event.objectId) favorites.add(event.objectId)
    if (event.kind === 'favorite_remove' && event.objectId) favorites.delete(event.objectId)
    if (event.kind === 'call_click') clicks.call++
    if (event.kind === 'whatsapp_click') clicks.whatsapp++
    if (event.kind === 'write_click') clicks.write++
  }

  const titles = await loadObjectTitles(payload, Array.from(new Set([...objectViews.keys(), ...favorites])))

  const objects: ActivityObject[] = Array.from(objectViews.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, views]) => ({ id, title: titles.get(id)?.title || `Объект №${id}`, views }))

  return NextResponse.json({
    found: true,
    lastSeenAt: card.lastSeenAt || null,
    visitsCount: card.visitsCount || 0,
    pageviewsCount: card.pageviewsCount || 0,
    objects,
    favorites: Array.from(favorites).map((id) => ({ id, title: titles.get(id)?.title || `Объект №${id}` })),
    clicks,
    // Карточку посетителя открываем только администратору: у агента раздел
    // «Аналитика → Посетители» закрыт
    visitor: user.role === 'admin' ? { id: card.id, title: card.title || `ID ${card.id}` } : null,
  })
}

/** Пользователь по cookie сессии — как getCrmUser, но для маршрута */
async function fetchUser(req: NextRequest) {
  const payload = await getPayload({ config })
  try {
    const result = await payload.auth({ headers: req.headers })
    const user = result.user as { id?: number; role?: string } | null | undefined
    if (!user?.id) return null
    return user as { id: number; role: string; agentAccess?: boolean; canManageAgents?: boolean; name?: string; email?: string }
  } catch {
    return null
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'

// Номера агентов не публикуются в HTML страниц (поле phone скрыто от
// анонимов полевой access-проверкой коллекции agents), поэтому кнопки
// «Позвонить»/«WhatsApp» запрашивают контакт здесь — одним запросом
// в момент нажатия, и сразу запускают звонок/чат. Номер не отображается
// текстом ни до, ни после нажатия.
//
// Защита от перебора: лимит по IP и только активные агенты — иначе маршрут
// позволял бы выкачать все номера простым перебором id.
const CONTACT_RATE_MAX = 30
const CONTACT_RATE_WINDOW_MS = 60_000

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Agent id required' }, { status: 400 })
  }
  if (rateLimited(`agent-contact:${clientIp(req.headers)}`, CONTACT_RATE_MAX, CONTACT_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'agents',
      // Только активные: контакты скрытых/уволенных агентов не отдаём
      where: { and: [{ id: { equals: id } }, { isActive: { equals: true } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const agent = docs[0] as { phone?: string; whatsapp?: string } | undefined
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Цифры номера для tel:. WhatsApp-номер — из отдельного поля whatsapp,
    // при пустом/битом — из phone. Российская «восьмёрка» для wa.me не
    // годится — нужен код страны (79…), поэтому 8… → 7…
    const digits = (v?: string) => (v || '').replace(/\D/g, '')
    const withCountryCode = (v: string) =>
      v.length === 11 && v.startsWith('8') ? `7${v.slice(1)}` : v
    const tel = digits(agent.phone)
    const wa = withCountryCode(digits(agent.whatsapp) || digits(agent.phone))

    if (!tel && !wa) {
      return NextResponse.json({ error: 'Agent has no contacts' }, { status: 404 })
    }
    return NextResponse.json({ tel: tel || undefined, wa: wa || undefined })
  } catch (error) {
    console.error('Agent contact error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

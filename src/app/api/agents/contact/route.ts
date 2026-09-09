import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Номера агентов не публикуются в HTML страниц (поле phone скрыто от
// анонимов полевой access-проверкой коллекции agents), поэтому кнопки
// «Позвонить»/«WhatsApp» запрашивают контакт здесь — одним запросом
// в момент нажатия, и сразу запускают звонок/чат. Номер не отображается
// текстом ни до, ни после нажатия.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Agent id required' }, { status: 400 })
  }
  try {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'agents',
      where: { id: { equals: id } },
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

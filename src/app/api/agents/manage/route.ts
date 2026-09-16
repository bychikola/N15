import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'

/**
 * Создание агента из CRM (раздел «Агенты», кнопка «Добавить агента»).
 *
 *   POST /api/agents/manage  { name, position?, phone?, email?, telegram?,
 *                              whatsapp?, photoId?, isActive? }
 *
 * Доступ: администратор или сотрудник с галочкой «Может добавлять агентов»
 * (поле canManageAgents, ставится в админке Payload — как доступ к ИИ-агенту).
 * Остальным — 403.
 *
 * Телефоны агентов скрыты от посетителей полевой access-проверкой коллекции
 * (см. Agents.ts), поэтому запись идёт с overrideAccess: права проверяем здесь.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    if (user.role !== 'admin' && !user.canManageAgents) {
      return NextResponse.json(
        { error: 'Добавлять агентов может администратор или сотрудник с разрешением' },
        { status: 403 },
      )
    }

    const body = (await req.json().catch(() => null)) as {
      name?: string
      position?: string
      phone?: string
      email?: string
      telegram?: string
      whatsapp?: string
      photoId?: number | string | null
      isActive?: boolean
    } | null

    const name = String(body?.name || '').trim().slice(0, 200)
    if (!name) {
      return NextResponse.json({ error: 'Укажите имя агента' }, { status: 400 })
    }

    const text = (v: unknown, max = 300) => {
      const s = String(v ?? '').trim().slice(0, max)
      return s || undefined
    }
    const photoId = Number(body?.photoId)
    const hasPhoto = Number.isInteger(photoId) && photoId > 0

    const payload = await getPayload({ config })
    const agent = await payload.create({
      collection: 'agents',
      data: {
        name,
        position: text(body?.position),
        phone: text(body?.phone, 40),
        email: text(body?.email, 200),
        telegram: text(body?.telegram),
        whatsapp: text(body?.whatsapp, 200),
        ...(hasPhoto ? { photo: photoId } : {}),
        isActive: body?.isActive !== false,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, doc: agent }, { status: 201 })
  } catch (error) {
    console.error('Agent create error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

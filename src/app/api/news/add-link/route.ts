import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { addNewsByLink } from '@/lib/news-service'

/**
 * Добавление новости ссылкой вручную — для источников без открытого RSS
 * (Минстрой, ДОМ.РФ, Росреестр, органы РСО-Алания: см. реестр в src/lib/news.ts).
 *
 * Домен ссылки обязан входить в официальный реестр (пункт 10 брифа): чужой
 * адрес не примется, что бы ни прислали. Заголовок и краткое описание
 * подтягиваются со страницы источника, если она доступна серверу; иначе
 * сотрудник вписывает их в форме.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as
      | { url?: string; title?: string; summary?: string; topic?: string }
      | null
    const url = (body?.url || '').trim()
    if (!url) {
      return NextResponse.json({ error: 'Укажите ссылку на новость официального источника' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const result = await addNewsByLink(payload, url, { id: user.id, email: user.email, name: user.name }, {
      title: body?.title,
      summary: body?.summary,
      topic: body?.topic,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, id: result.id }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    console.error('News add link error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

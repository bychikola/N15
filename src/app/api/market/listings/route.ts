import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  addOrUpdateListing,
  listListings,
  objectHeadline,
  recheckListing,
  removeListing,
} from '@/lib/market-service'

/**
 * «Парсер рынка» — записи чужих объявлений для анализа рынка (страница
 * CRM /crm/market). Отдельный модуль: он ничего не публикует наружу,
 * только сохраняет ссылки и считает похожесть на объекты Н15.
 *
 *   GET  /api/market/listings?includeRemoved=1 — список записей
 *   POST /api/market/listings
 *     { action: 'add',    url, title?, address?, price?, area?, rooms?, publishedAt?, authorKind?, note? }
 *         — добавить ссылку; если объявление уже есть (та же ссылка) —
 *           обновить цену/данные и зафиксировать изменение цены в истории
 *     { action: 'recheck', id }  — пересчитать совпадения с объектами Н15
 *     { action: 'remove',  id }  — удалить запись (только администратор)
 *
 * Записи создаются вручную агентом по ссылке или официальным каналом
 * площадки; автосбора страниц нет (правила площадок — см. market-parser.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const payload = await getPayload({ config })
    const includeRemoved = req.nextUrl.searchParams.get('includeRemoved') === '1'
    const listings = await listListings(payload, includeRemoved)
    // Заголовки автоматически связанных объектов Н15 — карточке не нужно
    // делать N запросов, чтобы показать «Объект Н15: …»
    const linkedIds = [...new Set(listings.map((l) => l.matchedObject).filter((v): v is number | string => v != null))]
    const linkedTitles = new Map<string, string>()
    if (linkedIds.length) {
      const { docs } = await payload.find({
        collection: 'objects',
        where: { id: { in: linkedIds } },
        limit: linkedIds.length,
        depth: 0,
        overrideAccess: true,
      })
      for (const d of docs) linkedTitles.set(String(d.id), objectHeadline(d as unknown as Record<string, unknown>))
    }
    return NextResponse.json({
      listings: listings.map((l) => ({
        ...l,
        matchedTitle: l.matchedObject ? linkedTitles.get(String(l.matchedObject)) || null : null,
      })),
    })
  } catch (error) {
    console.error('Market listings error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const body = (await req.json().catch(() => null)) as {
      action?: string
      id?: number | string
      url?: unknown
      title?: unknown
      address?: unknown
      price?: unknown
      area?: unknown
      rooms?: unknown
      publishedAt?: unknown
      authorKind?: unknown
      note?: unknown
    } | null
    const payload = await getPayload({ config })
    const action = body?.action

    if (action === 'add') {
      const url = typeof body?.url === 'string' ? body.url.trim() : ''
      if (!url) {
        return NextResponse.json({ error: 'Вставьте ссылку на объявление' }, { status: 400 })
      }
      // Принимаем http/https-ссылку (или домен без протокола — допишем https)
      const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
      try {
        new URL(fullUrl)
      } catch {
        return NextResponse.json({ error: 'Это не похоже на ссылку — проверьте адрес объявления' }, { status: 400 })
      }
      const num = (v: unknown): number | null => {
        const n = typeof v === 'string' ? Number(v.replace(/\s/g, '')) : typeof v === 'number' ? v : NaN
        return Number.isFinite(n) && n > 0 ? n : null
      }
      const result = await addOrUpdateListing(payload, {
        url: fullUrl,
        title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : null,
        address: typeof body?.address === 'string' && body.address.trim() ? body.address.trim() : null,
        price: num(body?.price),
        area: num(body?.area),
        rooms: num(body?.rooms),
        publishedAt: typeof body?.publishedAt === 'string' && body.publishedAt ? body.publishedAt : null,
        authorKind: typeof body?.authorKind === 'string' && body.authorKind ? body.authorKind : null,
        note: typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'recheck' || action === 'remove') {
      const id = Number(body?.id)
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json({ error: 'Не указана запись' }, { status: 400 })
      }
      if (action === 'recheck') {
        const result = await recheckListing(payload, id)
        return NextResponse.json({ ok: true, ...result })
      }
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Удалять записи может только администратор' }, { status: 403 })
      }
      await removeListing(payload, id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (error) {
    console.error('Market listings error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

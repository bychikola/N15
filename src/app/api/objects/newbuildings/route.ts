import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

/**
 * id квартир-новостроек — для подборки «Новостройки» каталога
 * (/[lang]/catalog?market=new).
 *
 * Новостройка — это квартира (category apartment) с типом жилья «Новостройка»
 * (поле market, см. src/lib/object-market.ts), привязанная к застройщику.
 * Готовность дома на пометку не влияет: квартиры в сданных домах — те же
 * новостройки, поэтому отдельного условия по сроку сдачи здесь нет.
 *
 * Связь объекта с застройщиком — закрытое поле (privateFieldsAccess в
 * Objects.ts): публичный API не только не отдаёт его, но и не принимает в
 * where («The following path cannot be queried»). Поэтому каталог не может
 * спросить застройщика напрямую и ходит сюда: маршрут читает объекты с
 * overrideAccess и возвращает ТОЛЬКО id подходящих карточек — ни справочник
 * застройщиков (контакты представителя, договоры, комиссии), ни закрытые поля
 * объекта на клиент не уходят. Каталог подставляет id: { in: [...] } в свой
 * where и дальше фильтрует выдачу как обычно.
 *
 * В подборку не попадают: вторичное жильё (market secondary), паркинг и
 * коммерция (другие категории), черновики и архив (status, см.
 * src/lib/archive.ts), реализованные объекты ЖК (unitStatus sold) и квартиры
 * скрытых застройщиков — компания без «Показывать на сайте» или в архиве на
 * сайте не открывается (см. newbuildings/developers/[id]/page.tsx), её
 * объектов в подборке тоже нет. Объекты без привязки к застройщику не
 * показываем: это не подборка новостроек.
 *
 * Параметры: ?developer=4 — квартиры одной компании, ?complex=9 — одного ЖК.
 */

// Потолок выдачи: id едут в URL каталога и в where режима «На карте», где
// список значений in ограничен 200 (MAX_VALUES в src/lib/objects-where.ts).
// Больше отдавать нельзя — маршрут карты ответил бы ошибкой запроса. Порядок
// — как у подборки компании: свежие публикации первыми
const MAX_IDS = 200
const PAGE = 200

/** Числовой параметр адреса: пустой или мусорный — null (не сужаем) */
const idParam = (raw: string | null): number | null =>
  raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : null

export async function GET(req: NextRequest) {
  const developerId = idParam(req.nextUrl.searchParams.get('developer'))
  const complexId = idParam(req.nextUrl.searchParams.get('complex'))
  try {
    const payload = await getPayload({ config })

    // Опубликованные компании: только их квартиры показываем на сайте. Список
    // нужен целиком — по нему отсеиваем объекты скрытых застройщиков
    const publishedDevelopers = new Set<number>()
    for (let page = 1; ; page++) {
      const { docs, hasNextPage } = await payload.find({
        collection: 'developers',
        where: {
          and: [{ showOnSite: { equals: true } }, { status: { not_equals: 'archived' } }],
        },
        limit: PAGE,
        page,
        depth: 0,
        overrideAccess: true,
      })
      docs.forEach((d) => publishedDevelopers.add(Number(d.id)))
      if (!hasNextPage || !docs.length) break
    }
    // Открытых компаний нет — новостроек для показа тоже нет. Запрос к
    // объектам не делаем: незачем
    if (!publishedDevelopers.size) return NextResponse.json({ ids: [] })

    const conds: Where[] = [
      { status: { equals: 'published' } },
      { category: { equals: 'apartment' } },
      { market: { equals: 'new' } },
    ]
    if (developerId !== null) conds.push({ developer: { equals: developerId } })
    if (complexId !== null) conds.push({ complex: { equals: complexId } })

    const ids: number[] = []
    for (let page = 1; ids.length < MAX_IDS; page++) {
      const { docs, hasNextPage } = await payload.find({
        collection: 'objects',
        where: { and: conds },
        sort: '-createdAt',
        limit: PAGE,
        page,
        depth: 0,
        overrideAccess: true,
      })
      docs.forEach((d) => {
        const doc = d as unknown as { id: number; developer?: unknown; unitStatus?: string }
        const id = Number(doc.id)
        if (!Number.isInteger(id)) return
        // Привязка к застройщику обязательна, и компания должна быть открыта
        // на сайте; реализованные объекты ЖК (у квартир поле пустое) — мимо
        const developer = typeof doc.developer === 'object' && doc.developer !== null
          ? Number((doc.developer as { id?: number }).id)
          : Number(doc.developer)
        if (!Number.isInteger(developer) || !publishedDevelopers.has(developer)) return
        if (doc.unitStatus === 'sold') return
        ids.push(id)
      })
      if (!hasNextPage || !docs.length) break
    }
    return NextResponse.json({ ids: ids.slice(0, MAX_IDS) })
  } catch (error) {
    console.error('Newbuildings lookup error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

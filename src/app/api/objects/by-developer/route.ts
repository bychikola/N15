import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

/**
 * id опубликованных объектов выбранного застройщика — для подборки каталога
 * («Объекты застройщика» со страницы компании, /[lang]/catalog?developer=<id>).
 *
 * Связь объекта с застройщиком — закрытое поле (privateFieldsAccess в
 * Objects.ts): публичный API не только не отдаёт его, но и не принимает в
 * where («The following path cannot be queried»). Поэтому каталог не может
 * спросить застройщика напрямую и ходит сюда: маршрут читает объекты с
 * overrideAccess и возвращает ТОЛЬКО id опубликованных карточек компании —
 * ни сам справочник застройщиков (контакты представителя, договоры, комиссии),
 * ни закрытые поля объекта на клиент не уходят. Каталог подставляет
 * id: { in: [...] } в свой where и дальше фильтрует выдачу как обычно.
 *
 * Скрытый застройщик (неопубликованный или архивный) id не отдаёт: его
 * страница на сайте не открывается (см. developers/[id]/page.tsx), и объекты
 * такой компании в подборке тоже не показываются.
 *
 * Параметры: ?developer=4
 */

// Потолок выдачи: id едут в URL каталога и в where режима «На карте», где
// список значений in ограничен 200 (MAX_VALUES в src/lib/objects-where.ts).
// Больше отдавать нельзя — маршрут карты ответил бы ошибкой запроса. Порядок
// — как на странице компании: свежие публикации первыми
const MAX_IDS = 200
const PAGE = 200

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('developer') ?? ''
  const developerId = /^\d+$/.test(raw) ? parseInt(raw, 10) : null
  // Не идентификатор застройщика (мусорный или пустой параметр) — искать
  // нечего: пустой ответ без обращения к базе. Ошибку не отдаём: клиент
  // получает тот же результат, что и по застройщику без объектов
  if (developerId === null) {
    return NextResponse.json({ ids: [] })
  }
  try {
    const payload = await getPayload({ config })
    // Публикацию компании проверяем в самом запросе: скрытой компании
    // объектов не отдаём, как и её страницы
    const { docs: devDocs } = await payload.find({
      collection: 'developers',
      where: {
        and: [
          { id: { equals: developerId } },
          { showOnSite: { equals: true } },
          { status: { not_equals: 'archived' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!devDocs.length) return NextResponse.json({ ids: [] })

    const ids: number[] = []
    for (let page = 1; ids.length < MAX_IDS; page++) {
      const { docs, hasNextPage } = await payload.find({
        collection: 'objects',
        // Только опубликованные объекты компании: черновики и архив на сайте
        // не видны, и подборка не должна их показывать (см. src/lib/archive.ts)
        where: {
          and: [
            { status: { equals: 'published' } },
            { developer: { equals: developerId } },
          ],
        },
        sort: '-createdAt',
        limit: PAGE,
        page,
        depth: 0,
        overrideAccess: true,
      })
      docs.forEach((d) => {
        const id = Number(d.id)
        if (Number.isInteger(id)) ids.push(id)
      })
      if (!hasNextPage || !docs.length) break
    }
    return NextResponse.json({ ids: ids.slice(0, MAX_IDS) })
  } catch (error) {
    console.error('Developer objects lookup error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

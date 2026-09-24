import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loadBoardList } from '@/lib/board-service'
import { BOARD_PAGE_SIZE } from '@/lib/board-service'

/**
 * Выдача объявлений доски для страницы /board.
 *
 * Параметры — семантические (тип сделки, категория, цена от и до, район…),
 * а where собирает сервер: сырой where из браузера здесь не принимается
 * намеренно. В отличие от каталога объектов (там фильтр проверяет
 * sanitizeObjectsWhere), в объявлении лежит телефон автора — открытый where
 * позволил бы перебирать номера запросом вида { phone: { contains } }.
 *
 * Наружу уходит не документ Payload, а карточка выдачи с явным списком
 * публичных полей (см. src/lib/board-list-item.ts): телефона, почты, IP
 * и журнала модерации в ответе нет.
 *
 * Лимит по IP — как у остальных публичных выборок (см. src/lib/rate-limit.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const payload = await getPayload({ config })

    const result = await loadBoardList(payload, {
      type: sp.get('type') || undefined,
      category: sp.get('category') || undefined,
      rooms: sp.get('rooms') || undefined,
      priceMin: sp.get('price_min') || undefined,
      priceMax: sp.get('price_max') || undefined,
      areaMin: sp.get('area_min') || undefined,
      areaMax: sp.get('area_max') || undefined,
      floorMin: sp.get('floor_min') || undefined,
      floorMax: sp.get('floor_max') || undefined,
      district: sp.get('district') || undefined,
      cityDistrict: sp.get('city_district') || undefined,
      locality: sp.get('locality') || undefined,
      city: sp.get('city') || undefined,
      authorKind: sp.get('author') || undefined,
      q: sp.get('q') || undefined,
      sort: sp.get('sort') || undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || BOARD_PAGE_SIZE,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Board list error:', error)
    // Детали — только в серверный лог: клиенту общее сообщение
    return NextResponse.json({ error: 'Не удалось загрузить объявления' }, { status: 500 })
  }
}

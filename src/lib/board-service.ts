/**
 * «Доска объявлений» — серверная обвязка раздела: выборки для сайта и CRM,
 * создание и правка объявлений, смена статусов, публикация с копированием
 * фото в открытое хранилище.
 *
 * Правила (что считается опубликованным, почему нельзя публиковать) живут
 * в движке src/lib/board.ts, работа с базой — здесь. Маршруты и страницы
 * вызывают только эти функции, поэтому проверки не расходятся между
 * страницей, списком и модерацией.
 *
 * Чтение идёт с overrideAccess: доступ к коллекции закрыт (в записи телефон
 * автора), а фильтры собирает сервер из семантических параметров — сырой where
 * из браузера не принимается нигде. Наружу отдаётся не документ, а карточка
 * выдачи (src/lib/board-list-item.ts) с явным списком публичных полей.
 */
import type { Payload, Where } from 'payload'
import { boardToListItem, type BoardListItem } from './board-list-item'
import { BOARD_ACTIVE_STATUSES } from './board'

/** Размер страницы выдачи — как в каталоге объектов */
export const BOARD_PAGE_SIZE = 12

/** Параметры выдачи: только те, что приходят из фильтров на странице */
export interface BoardListParams {
  type?: string
  category?: string
  rooms?: string
  priceMin?: string
  priceMax?: string
  areaMin?: string
  areaMax?: string
  floorMin?: string
  floorMax?: string
  district?: string
  cityDistrict?: string
  locality?: string
  city?: string
  authorKind?: string
  q?: string
  sort?: string
  page?: number
  limit?: number
}

export interface BoardListResult {
  docs: BoardListItem[]
  totalDocs: number
  page: number
  hasMore: boolean
}

/** Число из строки фильтра: пусто и мусор → null */
const num = (v: string | undefined): number | null => {
  if (!v) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Значение select-фильтра: принимаем только из известного списка */
const oneOf = (v: string | undefined, allowed: readonly string[]): string | null =>
  v && allowed.includes(v) ? v : null

const DEAL_TYPES = ['sale', 'rent'] as const
const AUTHOR_KINDS = ['private', 'agency'] as const
/** Сортировки выдачи: свежие, дешевле, дороже */
const SORTS: Record<string, string> = {
  new: '-publishedAt',
  cheap: 'price',
  expensive: '-price',
}

/**
 * Список объявлений для страницы /board. Условие «опубликовано и срок не вышел»
 * ставится всегда, поэтому непроверенное и просроченное в выдачу не попадает,
 * даже если таймер автоснятия ещё не сработал.
 */
export async function loadBoardList(payload: Payload, params: BoardListParams): Promise<BoardListResult> {
  const and: Where[] = [
    { status: { equals: 'published' } },
    {
      or: [
        { expiresAt: { greater_than: new Date().toISOString() } },
        { expiresAt: { exists: false } },
      ],
    },
  ]

  const deal = oneOf(params.type, DEAL_TYPES)
  if (deal) and.push({ dealType: { equals: deal } })

  if (params.category) and.push({ category: { equals: params.category } })
  if (params.rooms) {
    // «4» в фильтре значит «4 и больше» — как в каталоге
    const rooms = num(params.rooms)
    if (rooms != null) and.push(rooms >= 4 ? { rooms: { greater_than_equal: 4 } } : { rooms: { equals: rooms } })
  }

  const priceMin = num(params.priceMin)
  const priceMax = num(params.priceMax)
  if (priceMin != null) and.push({ price: { greater_than_equal: priceMin } })
  if (priceMax != null) and.push({ price: { less_than_equal: priceMax } })

  const areaMin = num(params.areaMin)
  const areaMax = num(params.areaMax)
  if (areaMin != null) and.push({ area: { greater_than_equal: areaMin } })
  if (areaMax != null) and.push({ area: { less_than_equal: areaMax } })

  const floorMin = num(params.floorMin)
  const floorMax = num(params.floorMax)
  if (floorMin != null) and.push({ floor: { greater_than_equal: floorMin } })
  if (floorMax != null) and.push({ floor: { less_than_equal: floorMax } })

  if (params.cityDistrict) and.push({ 'address.cityDistrict': { equals: params.cityDistrict } })
  else if (params.district) and.push({ 'address.district': { equals: params.district } })
  if (params.locality) and.push({ 'address.locality': { equals: params.locality } })

  const authorKind = oneOf(params.authorKind, AUTHOR_KINDS)
  if (authorKind) and.push({ authorKind: { equals: authorKind } })

  const q = (params.q || '').trim()
  if (q) {
    and.push({
      or: [
        { title: { contains: q } },
        { 'address.street': { contains: q } },
        { 'address.locality': { contains: q } },
      ],
    })
  }

  const limit = Math.min(Math.max(params.limit || BOARD_PAGE_SIZE, 1), 48)
  const page = Math.max(params.page || 1, 1)

  const res = await payload.find({
    collection: 'board-ads',
    where: { and },
    sort: SORTS[params.sort || ''] || SORTS.new,
    limit,
    page,
    // depth 1: нужны копии фото в media (publicPhotos) для обложки карточки
    depth: 1,
    overrideAccess: true,
  })

  return {
    docs: (res.docs as unknown as Record<string, unknown>[]).map(boardToListItem),
    totalDocs: res.totalDocs,
    page,
    hasMore: page * limit < res.totalDocs,
  }
}

/** Сколько «живых» объявлений у автора — для квоты подачи (см. POST /api/board/ads) */
export async function countActiveBoardAds(payload: Payload, authorId: number): Promise<number> {
  const res = await payload.count({
    collection: 'board-ads',
    where: {
      and: [
        { author: { equals: authorId } },
        { status: { in: [...BOARD_ACTIVE_STATUSES] } },
      ],
    },
    overrideAccess: true,
  })
  return res.totalDocs
}

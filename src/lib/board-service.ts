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
import fs from 'node:fs/promises'
import type { Payload, Where } from 'payload'
import { boardToListItem, type BoardListItem, type BoardPhoto } from './board-list-item'
import {
  BOARD_ACTIVE_STATUSES,
  boardPublicAddress,
  boardPublishIssue,
  boardVisible,
  type BoardAddressLike,
} from './board'
import { storedFilePath } from './upload-paths'

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

/** Число из фильтра или документа: пусто, мусор и не-число → null */
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
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

/** Объявление на странице: то, что видит посетитель, плюс признак предпросмотра */
export interface BoardAdDetail {
  id: number
  title: string
  dealType: string
  category: string
  houseType: string
  commercialType: string
  price: number | null
  area: number | null
  areaUnit: string
  plotArea: number | null
  plotAreaUnit: string
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  description: string
  /** Адрес без номера дома (см. boardPublicAddress) */
  address: string
  locality: string
  /** Фотографии для показа: у опубликованного — копии в media, у предпросмотра — присланные */
  photos: BoardPhoto[]
  authorKind: string
  authorName: string
  publishedAt: string | null
  expiresAt: string | null
  /**
   * Показывается предпросмотр: объявление ещё не опубликовано (или срок вышел),
   * но его открыл автор или сотрудник. На странице это плашка «на модерации»
   */
  preview: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Фотографии из документа: Payload отдаёт их объектами (depth 1) */
const photosOf = (value: unknown): BoardPhoto[] =>
  Array.isArray(value) ? (value.filter((p) => p && typeof p === 'object') as BoardPhoto[]) : []

/**
 * Объявление для страницы /board/<id>.
 *
 * Читаем с overrideAccess (доступ к коллекции закрыт — в записи телефон
 * автора), но наружу отдаём только публичные поля: телефона, почты, IP
 * и журнала модерации в объекте нет. Неопубликованное объявление открывается
 * только автору и сотрудникам — как предпросмотр с плашкой; остальным null
 * (страница отвечает 404).
 */
export async function loadBoardAd(
  payload: Payload,
  id: number,
  viewer?: { id?: number | string; role?: string | null } | null,
): Promise<BoardAdDetail | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return null

  const visible = boardVisible(doc as never)
  const authorRaw = doc.author as { id?: number } | number | undefined
  const authorId = typeof authorRaw === 'object' && authorRaw ? Number(authorRaw.id) : Number(authorRaw)
  const isAuthor = Boolean(viewer?.id && authorId === Number(viewer.id))
  const isStaff = viewer?.role === 'agent' || viewer?.role === 'admin'
  if (!visible && !isAuthor && !isStaff) return null

  const addr = (doc.address || {}) as BoardAddressLike & { house?: string | null }

  return {
    id: Number(doc.id),
    title: str(doc.title),
    dealType: str(doc.dealType) || 'sale',
    category: str(doc.category),
    houseType: str(doc.houseType),
    commercialType: str(doc.commercialType),
    price: num(doc.price),
    area: num(doc.area),
    areaUnit: str(doc.areaUnit) || 'sqm',
    plotArea: num(doc.plotArea),
    plotAreaUnit: str(doc.plotAreaUnit),
    rooms: num(doc.rooms),
    floor: num(doc.floor),
    totalFloors: num(doc.totalFloors),
    description: str(doc.description),
    address: boardPublicAddress(addr),
    locality: str(addr.locality) || str(addr.city),
    // На сайте — копии проверенных фото; до публикации показываем присланные
    // (их видит только автор и команда, см. доступ к board-materials)
    photos: visible ? photosOf(doc.publicPhotos) : photosOf(doc.photos),
    authorKind: str(doc.authorKind) || 'private',
    authorName: str(doc.contactName),
    publishedAt: str(doc.publishedAt) || null,
    expiresAt: str(doc.expiresAt) || null,
    preview: !visible,
  }
}

/**
 * Телефон автора по кнопке «Показать телефон». Отдаём только у опубликованного
 * и не истёкшего объявления: телефон автора — персональные данные, и в разметке
 * страницы его нет вовсе (как у агентов, см. /api/agents/contact).
 */
export async function boardAdPhone(payload: Payload, id: number): Promise<string | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc || !boardVisible(doc as never)) return null
  return str(doc.phone) || null
}

/**
 * Копии фотографий в открытое хранилище media — то, что показывается на сайте.
 * До публикации снимки лежат в закрытой папке board-materials, поэтому
 * непроверенные файлы на сайт не попадают (см. BoardMaterials.ts).
 */
async function copyBoardPhotos(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<{ file: number }[]> {
  const photos = Array.isArray(doc.photos) ? doc.photos : []
  const out: { file: number }[] = []
  for (const item of photos) {
    // Поле-загрузка (hasMany) отдаёт сами документы media, а не обёртку
    // { file } — как у массива загрузок в рекламе (см. AdvertisingRequests)
    const source = item as { filename?: unknown; mimeType?: unknown }
    const filename = str(source.filename)
    if (!filename) continue
    const filePath = storedFilePath('board-materials', filename)
    if (!filePath) {
      console.error(`Board: подозрительное имя файла фото — ${filename}`)
      continue
    }
    try {
      const bytes = await fs.readFile(filePath)
      const created = await payload.create({
        collection: 'media',
        data: { alt: str(doc.title) || 'Фотография объявления' },
        file: {
          data: bytes,
          mimetype: str(source.mimeType) || 'image/jpeg',
          name: filename,
          size: bytes.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      out.push({ file: created.id as number })
    } catch (error) {
      console.error(`Board: не удалось скопировать фото ${filename}:`, error)
    }
  }
  return out
}

/**
 * Публикация объявления: копируем фото в media и ставим статус «Опубликовано».
 * Условия публикации проверяет хук коллекции (boardPublishIssue) — здесь только
 * подготовка: без копий фотографий объявление вышло бы на сайт без снимков.
 */
export async function publishBoardAd(
  payload: Payload,
  id: number,
  user?: { id?: number | string; email?: string; name?: string; role?: string | null } | null,
): Promise<{ ok: boolean; error?: string }> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return { ok: false, error: 'Объявление не найдено' }

  // Копии уже сделаны при первой публикации — второй раз не копируем, иначе
  // при каждом «снять и опубликовать снова» в media плодились бы дубликаты
  const alreadyCopied = Array.isArray(doc.publicPhotos) && doc.publicPhotos.length > 0
  const publicPhotos = alreadyCopied ? [] : await copyBoardPhotos(payload, doc)
  try {
    await payload.update({
      collection: 'board-ads',
      id,
      data: {
        // Присланные фото остаются в закрытом хранилище (поле photos),
        // а копии в media (publicPhotos) — то, что показывается на сайте
        ...(publicPhotos.length ? { publicPhotos: publicPhotos.map((p) => p.file) } : {}),
        status: 'published',
      },
      depth: 0,
      overrideAccess: true,
      // Пользователя передаём явно: локальный API его не подставляет, а хук
      // коллекции по нему проверяет право публиковать (см. BoardAds.ts)
      ...(user ? { user: { ...user, collection: 'users' } } : {}),
    })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/** Строка очереди модерации: всё, что нужно модератору для решения */
export interface BoardQueueRow {
  id: number
  title: string
  status: string
  dealType: string
  category: string
  price: number | null
  area: number | null
  areaUnit: string
  plotArea: number | null
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  description: string
  /** Полный адрес — модератору дом видно (на сайте он скрыт) */
  address: string
  authorName: string
  authorPhone: string
  authorEmail: string
  authorKind: string
  createdAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  moderationNote: string
  moderatedBy: string
  /** Почему нельзя опубликовать (null — можно) */
  issue: string | null
  /** Фотографии: до публикации — из закрытого хранилища, после — копии в media */
  photos: BoardPhoto[]
  videoLinks: string
  log: { event: string; at: string; by: string }[]
}

/**
 * Очередь модерации для раздела CRM «Доска»: свежие сверху, по умолчанию —
 * те, что ждут проверки. Здесь отдаём всё, включая телефон, точный адрес
 * и журнал: раздел открыт только команде Н15.
 */
export async function loadBoardQueue(payload: Payload, status?: string): Promise<BoardQueueRow[]> {
  const where: Where = status ? { status: { equals: status } } : {}
  const res = await payload.find({
    collection: 'board-ads',
    where,
    sort: '-createdAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  return (res.docs as unknown as Record<string, unknown>[]).map((doc) => {
    const addr = (doc.address || {}) as BoardAddressLike & { house?: string | null }
    return {
      id: Number(doc.id),
      title: str(doc.title),
      status: str(doc.status),
      dealType: str(doc.dealType),
      category: str(doc.category),
      price: num(doc.price),
      area: num(doc.area),
      areaUnit: str(doc.areaUnit) || 'sqm',
      plotArea: num(doc.plotArea),
      rooms: num(doc.rooms),
      floor: num(doc.floor),
      totalFloors: num(doc.totalFloors),
      description: str(doc.description),
      address: boardPublicAddress(addr, { house: addr.house, full: true }),
      authorName: str(doc.contactName),
      authorPhone: str(doc.phone),
      authorEmail: str(doc.email),
      authorKind: str(doc.authorKind) || 'private',
      createdAt: str(doc.createdAt) || null,
      publishedAt: str(doc.publishedAt) || null,
      expiresAt: str(doc.expiresAt) || null,
      moderationNote: str(doc.moderationNote),
      moderatedBy: str(doc.moderatedBy),
      issue: boardPublishIssue(doc as never),
      // До публикации показываем присланные фото (они в закрытом хранилище),
      // после — копии в media: модератору важно видеть то, что уже на сайте
      photos: boardVisible(doc as never) ? photosOf(doc.publicPhotos) : photosOf(doc.photos),
      videoLinks: str(doc.videoLinks),
      log: Array.isArray(doc.log)
        ? (doc.log as Record<string, unknown>[]).map((e) => ({
            event: str(e.event),
            at: str(e.at),
            by: str(e.by),
          }))
        : [],
    }
  })
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

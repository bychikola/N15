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
  BOARD_RENEW_DAYS,
  boardPublicAddress,
  boardPublishIssue,
  boardVisible,
  type BoardAddressLike,
} from './board'
import { parseBoardAdForm } from './board-form'
import { sendBoardMail } from './board-mail'
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
  /**
   * Смотрит сам автор. Нужно странице: автору не предлагаем писать самому
   * себе, а покупателю — форму сообщения (см. BoardMessageForm)
   */
  viewerIsAuthor: boolean
  /** Сколько раз объявление открывали (автору — ориентир, смотрят ли его) */
  views: number
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
    viewerIsAuthor: isAuthor,
    views: num(doc.views) || 0,
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
  // Публикует только команда: здесь, а не только в маршруте модерации —
  // иначе функцию можно было бы позвать из другого места и выложить на сайт
  // непроверенное объявление (ту же проверку повторяет хук коллекции)
  if (user?.role !== 'agent' && user?.role !== 'admin') {
    return { ok: false, error: 'Опубликовать объявление может только команда Н15' }
  }

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
export async function loadBoardQueue(
  payload: Payload,
  viewer: { role?: string | null } | null | undefined,
  status?: string,
): Promise<BoardQueueRow[]> {
  // Проверка прав — здесь, а не только на странице: очередь содержит телефоны
  // и точные адреса авторов, и функция не должна отдавать их тому, кто позвал
  // её в обход раздела CRM (страница проверяет роль отдельно — см.
  // src/app/crm/board/page.tsx)
  if (viewer?.role !== 'agent' && viewer?.role !== 'admin') return []

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


// ── Кабинет автора ────────────────────────────────────────────────────────────

/** Строка «Мои объявления» в личном кабинете */
export interface BoardMyAdRow {
  id: number
  title: string
  status: string
  dealType: string
  category: string
  price: number | null
  createdAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  /** Пояснение модератора: что исправить (видит только автор) */
  moderationNote: string
  views: number
  /** Обложка: у опубликованного — копия в media, до публикации — присланное фото */
  photo?: BoardPhoto
  /** Почему объявление сейчас не на сайте (null — всё в порядке) */
  issue: string | null
}

/**
 * Объявления автора для личного кабинета. Отдаём свои записи в любом статусе:
 * черновик проверки, опубликованное, отклонённое, снятое и истёкшее — автору
 * важно видеть и то, что не прошло, и причину.
 */
export async function loadMyBoardAds(payload: Payload, authorId: number): Promise<BoardMyAdRow[]> {
  const res = await payload.find({
    collection: 'board-ads',
    where: { author: { equals: authorId } },
    sort: '-createdAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  return (res.docs as unknown as Record<string, unknown>[]).map((doc) => {
    const visible = boardVisible(doc as never)
    const photos = visible ? photosOf(doc.publicPhotos) : photosOf(doc.photos)
    // «Почему не на сайте»: у неопубликованного — требования публикации,
    // у опубликованного с истёкшим сроком — сам срок
    const issue = visible
      ? null
      : str(doc.status) === 'published'
        ? 'Срок размещения истёк — продлите объявление'
        : boardPublishIssue(doc as never)
    return {
      id: Number(doc.id),
      title: str(doc.title),
      status: str(doc.status),
      dealType: str(doc.dealType),
      category: str(doc.category),
      price: num(doc.price),
      createdAt: str(doc.createdAt) || null,
      publishedAt: str(doc.publishedAt) || null,
      expiresAt: str(doc.expiresAt) || null,
      moderationNote: str(doc.moderationNote),
      views: num(doc.views) || 0,
      photo: photos[0],
      issue,
    }
  })
}

/** Объявление автора для правки: поля формы и уже загруженные фотографии */
export interface BoardAdForEdit {
  id: number
  status: string
  /** Поля в том виде, в каком их ждёт форма */
  fields: Record<string, string>
  photos: { id: number; url: string; thumb: string }[]
}

/**
 * Объявление для формы правки. Отдаём только своё: чужое (или чужой id)
 * вернёт null — маршрут ответит 404, и перебором id чужое объявление
 * не открыть.
 */
export async function loadMyBoardAd(
  payload: Payload,
  id: number,
  authorId: number,
): Promise<BoardAdForEdit | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return null

  const authorRaw = doc.author as { id?: number } | number | undefined
  const ownerId = typeof authorRaw === 'object' && authorRaw ? Number(authorRaw.id) : Number(authorRaw)
  if (ownerId !== authorId) return null

  const addr = (doc.address || {}) as Record<string, unknown>
  const photos = photosOf(doc.photos).map((p, index) => {
    const file = (doc.photos as { id?: number }[] | undefined)?.[index]
    return {
      id: Number(file?.id) || 0,
      url: p.url || '',
      thumb: p.sizes?.thumbnail?.url || p.sizes?.card?.url || p.url || '',
    }
  })

  return {
    id: Number(doc.id),
    status: str(doc.status),
    fields: {
      dealType: str(doc.dealType) || 'sale',
      category: str(doc.category) || 'apartment',
      houseType: str(doc.houseType),
      commercialType: str(doc.commercialType),
      title: str(doc.title),
      price: num(doc.price) != null ? String(num(doc.price)) : '',
      area: num(doc.area) != null ? String(num(doc.area)) : '',
      areaUnit: str(doc.areaUnit) || 'sqm',
      plotArea: num(doc.plotArea) != null ? String(num(doc.plotArea)) : '',
      plotAreaUnit: str(doc.plotAreaUnit) || 'are',
      rooms: num(doc.rooms) != null ? String(num(doc.rooms)) : '',
      floor: num(doc.floor) != null ? String(num(doc.floor)) : '',
      totalFloors: num(doc.totalFloors) != null ? String(num(doc.totalFloors)) : '',
      description: str(doc.description),
      videoLinks: str(doc.videoLinks),
      city: str(addr.city) || 'Владикавказ',
      district: str(addr.district),
      cityDistrict: str(addr.cityDistrict),
      locality: str(addr.locality),
      snt: str(addr.snt),
      street: str(addr.street),
      house: str(addr.house),
      contactName: str(doc.contactName),
      phone: str(doc.phone),
      email: str(doc.email),
    },
    photos,
  }
}

/** Объявление автора (проверка владения) — общая для всех действий кабинета */
async function ownBoardAd(
  payload: Payload,
  id: number,
  authorId: number,
): Promise<Record<string, unknown> | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return null
  const authorRaw = doc.author as { id?: number } | number | undefined
  const ownerId = typeof authorRaw === 'object' && authorRaw ? Number(authorRaw.id) : Number(authorRaw)
  return ownerId === authorId ? doc : null
}

/**
 * Правка объявления автором. Содержание меняется — и объявление снова уходит
 * на проверку: после модерации текст нельзя подменить незаметно (см. правило
 * в BoardAds.ts). Согласия и версия правил остаются прежними: они уже приняты.
 *
 * Копии фотографий в media, сделанные при прошлой публикации, удаляем: иначе
 * после повторной публикации на сайте остались бы прежние снимки (см.
 * publishBoardAd — он копирует заново, если копий нет).
 */
export async function updateBoardAdByAuthor(
  payload: Payload,
  id: number,
  authorId: number,
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await ownBoardAd(payload, id, authorId)
  if (!doc) return { ok: false, error: 'Объявление не найдено' }

  const parsed = parseBoardAdForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  // Какие из прежних фотографий автор оставил
  const keep = String(form.get('keepPhotos') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const existing = Array.isArray(doc.photos) ? (doc.photos as { id?: number }[]) : []
  const removed = existing.map((p) => Number(p?.id)).filter((pid) => pid && !keep.includes(pid))

  // Новые фотографии из формы
  const newFiles = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  const newIds: number[] = []
  for (const file of newFiles) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const created = await payload.create({
        collection: 'board-materials',
        data: { alt: String(parsed.data.title || ''), author: authorId },
        file: { data: buffer, mimetype: file.type || 'image/jpeg', name: file.name, size: buffer.length },
        depth: 0,
        overrideAccess: true,
      })
      newIds.push(Number(created.id))
    } catch (error) {
      console.error('Board: фотография при правке не принята', error)
      return { ok: false, error: 'Одна из фотографий не читается — выберите другую' }
    }
  }

  const photos = [...keep, ...newIds]
  if (!photos.length) return { ok: false, error: 'Оставьте хотя бы одну фотографию объекта' }

  // Прежние копии для сайта: удаляем и очищаем — при публикации сделаются заново
  const oldPublic = Array.isArray(doc.publicPhotos) ? (doc.publicPhotos as { id?: number }[]) : []
  for (const p of oldPublic) {
    if (p?.id) await payload.delete({ collection: 'media', id: Number(p.id), overrideAccess: true }).catch(() => null)
  }
  // Убранные автором снимки из закрытого хранилища тоже больше не нужны
  for (const pid of removed) {
    await payload.delete({ collection: 'board-materials', id: pid, overrideAccess: true }).catch(() => null)
  }

  try {
    await payload.update({
      collection: 'board-ads',
      id,
      data: {
        ...parsed.data,
        photos,
        publicPhotos: [],
        // Правка содержания возвращает объявление на проверку — и снимает
        // прежнее пояснение модератора: оно относилось к прошлой редакции
        status: 'pending',
        moderationNote: null,
      },
      depth: 0,
      overrideAccess: true,
      ...(await actorOf(payload, authorId)),
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Пользователь для локального API — по нему хук понимает, кто меняет запись */
async function actorOf(
  payload: Payload,
  authorId: number,
): Promise<{ user?: { id: number; email?: string; name?: string; role?: string; collection: string } }> {
  const user = await payload
    .findByID({ collection: 'users', id: authorId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!user) return {}
  return {
    user: {
      id: authorId,
      email: user.email,
      name: user.name,
      role: user.role,
      collection: 'users',
    },
  }
}

/** Снять объявление с публикации — автор убирает его сам (объект продан) */
export async function archiveBoardAdByAuthor(
  payload: Payload,
  id: number,
  authorId: number,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await ownBoardAd(payload, id, authorId)
  if (!doc) return { ok: false, error: 'Объявление не найдено' }
  try {
    await payload.update({
      collection: 'board-ads',
      id,
      data: { status: 'archived' },
      depth: 0,
      overrideAccess: true,
      ...(await actorOf(payload, authorId)),
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Подать объявление снова: из «нужны уточнения», «отклонено» и «снято» —
 * на проверку; из «срок истёк» — продлить на новый срок. Продление доступно
 * и опубликованному объявлению, срок которого ещё идёт.
 */
export async function resubmitBoardAdByAuthor(
  payload: Payload,
  id: number,
  authorId: number,
  renew: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const doc = await ownBoardAd(payload, id, authorId)
  if (!doc) return { ok: false, error: 'Объявление не найдено' }

  const status = str(doc.status)
  const end = str(doc.expiresAt)
  const expired = status === 'expired' || (Boolean(end) && new Date(end).getTime() <= Date.now())

  // Срок продлеваем от текущего конца, если он ещё впереди, иначе от сегодня
  const extend = (): string => {
    const base = end ? new Date(end) : new Date()
    const from = base.getTime() > Date.now() ? base : new Date()
    from.setDate(from.getDate() + BOARD_RENEW_DAYS)
    return from.toISOString()
  }

  const data: Record<string, unknown> = {}
  if (renew) {
    // Продление опубликованного: содержание не трогаем, проверять заново нечего
    data.expiresAt = extend()
    // А истёкшее объявление продлить «напрямую» нельзя: оно не на сайте, и
    // вернуть его туда может только команда (проверка публикации в хуке
    // BoardAds.ts). Поэтому оно уходит на проверку — как повторная подача
    if (status !== 'published') data.status = 'pending'
  } else {
    // Повторная подача — проверка заново: ставим в очередь
    data.status = 'pending'
    // Вышедший срок продлеваем сразу: иначе модератор не сможет опубликовать
    // объявление — boardPublishIssue не пропускает просроченное
    if (expired) data.expiresAt = extend()
  }

  try {
    await payload.update({
      collection: 'board-ads',
      id,
      data,
      depth: 0,
      overrideAccess: true,
      ...(await actorOf(payload, authorId)),
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}


// ── Срок размещения ───────────────────────────────────────────────────────────

/** За сколько дней до конца срока напоминаем автору */
const BOARD_REMIND_DAYS = 3

export interface BoardSweepResult {
  /** Сколько объявлений снято по сроку */
  expired: number
  /** Сколько писем-напоминаний отправлено */
  reminded: number
}

/** Было ли уже такое событие в журнале — по нему понимаем, писали ли автору */
const hasLogEvent = (doc: Record<string, unknown>, event: string): boolean =>
  Array.isArray(doc.log) && (doc.log as { event?: string }[]).some((e) => str(e.event) === event)

/**
 * Проход по срокам размещения. Делает две вещи:
 *
 * 1. Напоминает автору, что объявление скоро снимется (за три дня), — один раз
 *    на объявление: отметка о письме лежит в журнале, поэтому лишних писем
 *    не будет, даже если проход запускается каждый час.
 * 2. Снимает объявления с вышедшим сроком: статус «Срок истёк», письмо автору.
 *
 * Объявление при этом остаётся в кабинете автора — его можно продлить или
 * подать заново (см. /lk/board), и в выдаче сайта просроченное не показывается
 * сразу, не дожидаясь прохода: условие по сроку стоит в loadBoardList.
 */
export async function runBoardExpirySweep(payload: Payload): Promise<BoardSweepResult> {
  const now = Date.now()
  const remindBefore = new Date(now + BOARD_REMIND_DAYS * 86_400_000).toISOString()

  // Берём опубликованные с заполненным сроком — остальные не могут истечь
  const res = await payload.find({
    collection: 'board-ads',
    where: {
      and: [{ status: { equals: 'published' } }, { expiresAt: { exists: true } }],
    },
    sort: 'expiresAt',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })

  let expired = 0
  let reminded = 0

  for (const raw of res.docs as unknown as Record<string, unknown>[]) {
    const end = str(raw.expiresAt)
    if (!end) continue
    const endMs = new Date(end).getTime()
    if (!Number.isFinite(endMs)) continue

    const email = str(raw.email)
    const title = str(raw.title)
    const id = Number(raw.id)

    if (endMs <= now) {
      // Срок вышел: снимаем и пишем автору
      try {
        await payload.update({
          collection: 'board-ads',
          id,
          data: { status: 'expired' },
          depth: 0,
          overrideAccess: true,
        })
        expired++
        if (email) await sendBoardMail(payload, email, { kind: 'expired', adId: id, title })
      } catch (error) {
        console.error('Board: не удалось снять объявление по сроку', id, error)
      }
      continue
    }

    // Срок ещё идёт, но близко: напоминаем один раз
    if (endMs <= new Date(remindBefore).getTime() && !hasLogEvent(raw, 'reminder')) {
      const daysLeft = Math.max(1, Math.ceil((endMs - now) / 86_400_000))
      if (email) await sendBoardMail(payload, email, { kind: 'expiring', adId: id, title, daysLeft })
      // Отметка в журнале: даже если почты нет, второй раз не проверяем
      await payload
        .update({
          collection: 'board-ads',
          id,
          data: { log: [...(Array.isArray(raw.log) ? (raw.log as unknown[]) : []), { event: 'reminder', at: new Date().toISOString(), by: 'система' }] },
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      reminded++
    }
  }

  return { expired, reminded }
}


/**
 * Похожие объявления для страницы объявления: та же категория и тот же тип
 * сделки, свежие сверху. Показываем их под карточкой — покупатель, которому
 * не подошёл этот объект, тут же видит альтернативы, а не уходит с сайта
 * (как в каталоге объектов, см. catalog/[slug]/page.tsx).
 */
export async function loadSimilarBoardAds(
  payload: Payload,
  ad: { id: number; category: string; dealType: string },
  limit = 4,
): Promise<BoardListItem[]> {
  const res = await payload.find({
    collection: 'board-ads',
    where: {
      and: [
        { status: { equals: 'published' } },
        {
          or: [
            { expiresAt: { greater_than: new Date().toISOString() } },
            { expiresAt: { exists: false } },
          ],
        },
        { dealType: { equals: ad.dealType } },
        { category: { equals: ad.category } },
        { id: { not_equals: ad.id } },
      ],
    },
    sort: '-publishedAt',
    limit,
    depth: 1,
    overrideAccess: true,
  })
  return (res.docs as unknown as Record<string, unknown>[]).map(boardToListItem)
}

/**
 * Засчитать просмотр объявления. Вызывается со страницы объявления для
 * посетителя — автор и сотрудники свои же просмотры не накручивают.
 *
 * Счётчик приблизительный (обновление страницы считается тоже) — так же
 * считают и крупные площадки; точный учёт потребовал бы отдельного хранилища
 * просмотров, а поле нужно автору только как ориентир: смотрят объявление
 * или нет. Ошибку записи не показываем: счётчик не повод не отдать страницу.
 */
export async function countBoardAdView(payload: Payload, id: number, current: number): Promise<void> {
  await payload
    .update({
      collection: 'board-ads',
      id,
      data: { views: (Number.isFinite(current) ? current : 0) + 1 },
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
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

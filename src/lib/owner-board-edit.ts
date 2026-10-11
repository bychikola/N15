/**
 * Правка объявления собственника администратором прямо в CRM.
 *
 * Объявление собственника (source: 'owner') заводится из заявки владельца
 * (см. publishOwnerApplicationToBoard в src/lib/owner-service.ts) и связано
 * с ней полем ownerApplication. Собственник без кабинета правит по личной
 * ссылке только фотографии (src/lib/owner-manage.ts); всё остальное —
 * заголовок, описание, параметры, стоимость и фотографии — администратор
 * правит здесь, не разрывая связь с заявкой и владельцем.
 *
 * Контакты и адрес правке не подлежат намеренно: имя собственника остаётся
 * в публичной карточке, а его телефон на сайт не публикуется вовсе — связь
 * идёт через Н15 (см. boardShowsPublicPhone в src/lib/board.ts). Дать менять
 * эти поля из формы значило бы открыть обход подтверждения контакта, ради
 * которого заявка и собиралась.
 *
 * Правка содержания возвращает объявление на проверку — как у автора и по
 * личной ссылке. Исключение — уже опубликованное объявление: администратор
 * и есть тот, кто проверяет, поэтому после сохранения оно снова уходит на
 * доску с новыми снимками (копии прежних в открытом media удаляются).
 *
 * Кто изменил объявление, пишется в журнал объявления (поле log) и в историю
 * заявки — по ним видно и что менялось, и кем.
 */
import type { Payload } from 'payload'
import {
  BOARD_MAX_PHOTOS,
  BOARD_STATUS_LABELS,
  BOARD_TEXT_LIMITS,
  boardAdAddress,
  boardVisible,
  type BoardStatus,
} from './board'
import { OBJECT_CATEGORY_VALUES, HOUSE_TYPE_VALUES } from './object-categories'
import { COMMERCIAL_TYPE_VALUES } from './commercial-types'
import { withMainPhotoFirst, boardPhotosFromForm } from './board-form'
import { publishBoardAd } from './board-service'

/** Администратор, выполняющий правку (из payload.auth) */
export interface OwnerBoardEditUser {
  id?: number | string
  email?: string
  name?: string
  role?: string | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** id связи (объект { id } или само число) — или null */
function refId(value: unknown): number | null {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Текст из формы: обрезка и предел длины (пусто → undefined) */
const text = (v: unknown, max: number): string | undefined => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || undefined
}

/** Значение из справочника: чужое молча отбрасываем */
const pick = (v: unknown, allowed: readonly string[]): string | undefined => {
  const s = String(v ?? '').trim()
  return allowed.includes(s) ? s : undefined
}

/** Число из формы: пусто, мусор и минус → undefined (как в board-form) */
const number = (v: unknown): number | undefined => {
  if (v == null) return undefined
  const raw = String(v).trim().replace(',', '.')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Фотография объявления для формы правки: id и ссылки на снимок */
export interface OwnerBoardEditPhoto {
  id: number
  url: string
  thumb: string
}

/** Объявление собственника, каким его видит форма правки в CRM */
export interface OwnerBoardEditData {
  id: number
  /** Заявка, из которой собрано объявление (null — связь потеряна) */
  applicationId: number | null
  status: string
  statusLabel: string
  /** Объявление опубликовано и видно на сайте (после правки — останется там) */
  published: boolean
  /** Полный адрес — администратору он виден всегда (на сайте дом скрыт) */
  address: string
  /** Имя собственника: показывается на сайте, правке не подлежит */
  contactName: string
  /** Поля формы в строковом виде — как их ждёт форма правки */
  fields: Record<string, string>
  photos: OwnerBoardEditPhoto[]
}

/** Фотографии документа (depth 1): снимки в закрытом хранилище board-materials */
function photoView(value: unknown): OwnerBoardEditPhoto[] {
  if (!Array.isArray(value)) return []
  const out: OwnerBoardEditPhoto[] = []
  for (const item of value) {
    const p = (item || {}) as Record<string, unknown>
    const id = refId(p.id)
    if (!id) continue
    const sizes = (p.sizes || {}) as Record<string, { url?: unknown }>
    const url = str(p.url)
    out.push({
      id,
      url,
      thumb: str(sizes.thumbnail?.url) || str(sizes.card?.url) || url,
    })
  }
  return out
}

/** id и имя файла фотографий объявления (для удаления убранных снимков) */
function photoFiles(value: unknown): { id: number; filename: string }[] {
  if (!Array.isArray(value)) return []
  const out: { id: number; filename: string }[] = []
  for (const item of value) {
    const p = (item || {}) as Record<string, unknown>
    const id = refId(p.id)
    if (id) out.push({ id, filename: str(p.filename) })
  }
  return out
}

/**
 * Объявление собственника для формы правки. Возвращаем null, если объявления
 * нет, оно не от собственника (source ≠ 'owner') или id мусорный: правка из
 * CRM существует только для объявлений из заявок.
 */
export async function loadOwnerBoardAdForEdit(
  payload: Payload,
  id: number,
): Promise<OwnerBoardEditData | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const doc = (await payload
    .findByID({ collection: 'board-ads', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc || str(doc.source) !== 'owner') return null

  const addr = (doc.address as Record<string, unknown> | null) || null
  const status = str(doc.status) || 'pending'
  const n = (v: unknown): string => {
    const x = number(v)
    return x != null ? String(x) : ''
  }

  return {
    id: Number(doc.id),
    applicationId: refId(doc.ownerApplication),
    status,
    statusLabel: BOARD_STATUS_LABELS[status as BoardStatus] || status,
    published: boardVisible(doc as never),
    address: boardAdAddress(doc as never, { isStaff: true }),
    contactName: str(doc.contactName),
    fields: {
      dealType: str(doc.dealType) || 'sale',
      category: str(doc.category) || 'apartment',
      houseType: str(doc.houseType),
      commercialType: str(doc.commercialType),
      title: str(doc.title),
      price: n(doc.price),
      area: n(doc.area),
      areaUnit: str(doc.areaUnit) || 'sqm',
      plotArea: n(doc.plotArea),
      plotAreaUnit: str(doc.plotAreaUnit) || 'are',
      rooms: n(doc.rooms),
      floor: n(doc.floor),
      totalFloors: n(doc.totalFloors),
      description: str(doc.description),
      videoLinks: str(doc.videoLinks),
      // Для формы — тот же вид, что ждёт ввод; в базу не пишем
      city: str(addr?.city) || 'Владикавказ',
    },
    photos: photoView(doc.photos),
  }
}

export interface OwnerBoardEditResult {
  ok: boolean
  error?: string
  boardAdId?: number
  /** После сохранения объявление снова на доске (было опубликовано) */
  published?: boolean
}

/**
 * Сохранение правки объявления собственника администратором.
 *
 * Из формы приходят текстовые поля, `keepPhotos` — id оставленных снимков,
 * `photos` — новые файлы, `mainPhoto` — ключ главного (`existing:<id>` или
 * `new:<номер>`). Проверки фотографий те же, что при подаче и правке автором.
 * Контакты и адрес берём из самого объявления — форма их не присылает.
 */
export async function updateOwnerBoardAdByAdmin(
  payload: Payload,
  boardAdId: number,
  form: FormData,
  user: OwnerBoardEditUser | null | undefined,
): Promise<OwnerBoardEditResult> {
  // Право проверяем и здесь, а не только в маршруте: функция меняет
  // опубликованное объявление владельца, и звать её в обход маршрута нельзя
  if (user?.role !== 'admin') {
    return { ok: false, error: 'Редактировать объявление собственника может только администратор' }
  }
  if (!Number.isInteger(boardAdId) || boardAdId <= 0) {
    return { ok: false, error: 'Объявление не найдено' }
  }

  const doc = (await payload
    .findByID({ collection: 'board-ads', id: boardAdId, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return { ok: false, error: 'Объявление не найдено' }
  if (str(doc.source) !== 'owner') {
    return { ok: false, error: 'Это не объявление собственника — правка из CRM доступна только для них' }
  }

  // --- Содержание ----------------------------------------------------------
  const title = text(form.get('title'), BOARD_TEXT_LIMITS.title)
  const description = text(form.get('description'), BOARD_TEXT_LIMITS.description)
  const dealType = pick(form.get('dealType'), ['sale', 'rent'])
  const category = pick(form.get('category'), OBJECT_CATEGORY_VALUES)
  const price = number(form.get('price'))

  if (!title) return { ok: false, error: 'Заполните заголовок объявления' }
  if (!description) return { ok: false, error: 'Заполните описание объекта' }
  if (!dealType) return { ok: false, error: 'Укажите, продажа это или аренда' }
  if (!category) return { ok: false, error: 'Выберите категорию объекта' }
  if (price === undefined) return { ok: false, error: 'Укажите цену' }

  // --- Фотографии ----------------------------------------------------------
  const parsed = boardPhotosFromForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const existing = photoFiles(doc.photos)
  const existingIds = existing.map((p) => p.id)
  const keep = String(form.get('keepPhotos') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && existingIds.includes(n))
  const removed = existingIds.filter((id) => !keep.includes(id))

  if (keep.length + parsed.files.length === 0) {
    return { ok: false, error: 'Оставьте хотя бы одну фотографию объекта' }
  }
  if (keep.length + parsed.files.length > BOARD_MAX_PHOTOS) {
    return { ok: false, error: `Не больше ${BOARD_MAX_PHOTOS} фотографий` }
  }

  const authorId = refId(doc.author) ?? refId(user.id) ?? undefined
  const newIds: number[] = []
  for (const file of parsed.files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const created = await payload.create({
        collection: 'board-materials',
        data: { alt: title, ...(authorId ? { author: authorId } : {}) },
        file: { data: buffer, mimetype: file.type || 'image/jpeg', name: file.name, size: buffer.length },
        depth: 0,
        overrideAccess: true,
      })
      newIds.push(Number(created.id))
    } catch (error) {
      // Новые файлы уже записались — при ошибке убираем их, чтобы не копить мусор
      for (const id of newIds) {
        await payload.delete({ collection: 'board-materials', id, overrideAccess: true }).catch(() => null)
      }
      console.error('Правка объявления собственника: фотография не принята', error)
      return { ok: false, error: 'Одна из фотографий не читается — выберите другую' }
    }
  }

  // Главное фото — первым: обложка берётся из начала списка (см. withMainPhotoFirst)
  const photos = withMainPhotoFirst(
    [...keep, ...newIds],
    [...keep.map((id) => `existing:${id}`), ...newIds.map((_, i) => `new:${i}`)],
    String(form.get('mainPhoto') || ''),
  )

  const wasVisible = boardVisible(doc as never)
  const by = str(user.name) || str(user.email) || 'администратор'

  // Прежние копии в media: на публикации снимутся заново из нового набора.
  // Удаляем их и убранные файлы закрытого хранилища только после удачного
  // сохранения — иначе при сбое объявление осталось бы без снимков
  const oldPublicIds = (Array.isArray(doc.publicPhotos) ? (doc.publicPhotos as { id?: unknown }[]) : [])
    .map((p) => refId(p?.id))
    .filter((id): id is number => Boolean(id))

  // Запись в журнал объявления: кто и когда правил (имя и почта администратора)
  const log = [
    ...(Array.isArray(doc.log) ? (doc.log as unknown[]) : []),
    { event: `Изменено администратором: ${by}`, at: new Date().toISOString(), by },
  ]

  const data: Record<string, unknown> = {
    title,
    description,
    dealType,
    category,
    houseType: pick(form.get('houseType'), HOUSE_TYPE_VALUES) ?? null,
    commercialType: pick(form.get('commercialType'), COMMERCIAL_TYPE_VALUES) ?? null,
    price,
    area: number(form.get('area')) ?? null,
    areaUnit: pick(form.get('areaUnit'), ['sqm', 'are', 'ha']) || 'sqm',
    plotArea: number(form.get('plotArea')) ?? null,
    plotAreaUnit: pick(form.get('plotAreaUnit'), ['are', 'ha', 'sqm']) ?? null,
    rooms: number(form.get('rooms')) ?? null,
    floor: number(form.get('floor')) ?? null,
    totalFloors: number(form.get('totalFloors')) ?? null,
    videoLinks: text(form.get('videoLinks'), 1000) ?? null,
    photos,
    publicPhotos: [],
    moderationNote: null,
    log,
    // Опубликованное объявление администратор оставляет на доске (он и есть
    // проверяющий) — publishBoardAd ниже скопирует новые снимки. Остальные
    // возвращаются на проверку: содержание изменилось.
    status: wasVisible ? 'published' : 'pending',
  }

  const actor = user ? { user: { id: user.id, email: user.email, name: user.name, role: user.role, collection: 'users' } } : {}
  try {
    await payload.update({
      collection: 'board-ads',
      id: boardAdId,
      data,
      depth: 0,
      overrideAccess: true,
      ...actor,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  // Было на доске — возвращаем туда же с новыми снимками (копии в media)
  if (wasVisible) {
    const republished = await publishBoardAd(payload, boardAdId, {
      id: user?.id,
      email: user?.email,
      name: user?.name,
      role: user?.role,
    })
    if (!republished.ok) {
      return {
        ok: false,
        error:
          republished.error ||
          'Правка сохранена, но вернуть объявление на доску не удалось — опубликуйте его в разделе «Доска»',
      }
    }
  }

  // Убранные снимки из закрытого хранилища и прежние копии в media больше
  // не нужны: объявление сохранено, на публикации копии сделаны заново
  for (const id of removed) {
    await payload.delete({ collection: 'board-materials', id, overrideAccess: true }).catch(() => null)
  }
  for (const id of oldPublicIds) {
    await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => null)
  }

  // След в истории заявки: заявка и объявление остаются связанными
  const applicationId = refId(doc.ownerApplication)
  if (applicationId) {
    try {
      const app = (await payload.findByID({
        collection: 'owner-applications',
        id: applicationId,
        depth: 1,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> | null
      const history = Array.isArray(app?.history) ? [...(app.history as unknown[])] : []
      history.push({
        at: new Date().toISOString(),
        action: 'Объявление отредактировано администратором',
        note: `Объявление №${boardAdId}`,
        by: refId(user?.id),
      })
      await payload.update({
        collection: 'owner-applications',
        id: applicationId,
        data: { history },
        depth: 0,
        overrideAccess: true,
      })
    } catch (error) {
      // История заявки — вспомогательная запись: правку объявления не роняем
      console.error('Правка объявления собственника: не удалось записать историю заявки', error)
    }
  }

  return { ok: true, boardAdId, published: wasVisible }
}

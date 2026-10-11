/**
 * Управление фотографиями объявления собственника по личной ссылке.
 *
 * Собственник не заводит личный кабинет: администратор выдаёт ему защищённую
 * ссылку (см. owner-manage-link.ts), и по ней владелец правит снимки своего
 * объявления — добавляет новые, убирает лишние и выбирает главное. Доступ
 * ограничен ровно одним объявлением: связку «токен → объявление» проверяет
 * resolveOwnerManageLink, а этот модуль работает уже с найденным объявлением.
 *
 * Здесь только фотографии — текст, контакты и адрес собственник по ссылке не
 * меняет: телефон и адрес подтверждает и заполняет Н15 при публикации, и
 * правка этих полей с чужой ссылки была бы обходом подтверждения контакта.
 *
 * Правка содержания возвращает объявление на проверку (как и правка автором
 * из личного кабинета, см. updateBoardAdByAuthor): опубликованное объявление
 * с новыми снимками уходит в «На модерации», а копии в открытом хранилище
 * удаляются — пока модератор не посмотрел, изменённых фото на сайте нет.
 *
 * Снимки до публикации лежат в закрытом хранилище board-materials, поэтому
 * наружу мы отдаём не их адреса, а ссылки на собственный маршрут
 * /api/board/owner/photo с тем же токеном: файл читается с диска только после
 * проверки ссылки и только для своего объявления (см. readOwnerAdPhoto).
 */
import fs from 'node:fs/promises'
import type { Payload } from 'payload'
import {
  BOARD_MAX_PHOTOS,
  BOARD_STATUS_LABELS,
  type BoardStatus,
} from './board'
import { withMainPhotoFirst } from './board-form'
import { storedFilePath } from './upload-paths'
import {
  PHOTO_FORMATS_LABEL,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_LABEL,
  isAllowedPhoto,
} from './photo-rules'

/** Маршрут выдачи снимка по токену управления */
export const OWNER_MANAGE_PHOTO_PATH = '/api/board/owner/photo'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** id связи (объект { id } или само число) — или null */
function refId(value: unknown): number | null {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Одна фотография объявления для страницы управления: id и ссылки на снимок */
export interface OwnerManagePhoto {
  id: number
  /** Превью для сетки (sizes.thumbnail, а если его нет — оригинал) */
  thumb: string
  /** Полный снимок для просмотра */
  full: string
}

/** Объявление, каким его видит собственник по ссылке */
export interface OwnerManageAd {
  id: number
  title: string
  status: string
  statusLabel: string
  photos: OwnerManagePhoto[]
}

/** Ссылка на снимок через защищённый маршрут: чужой файл по ней не достать */
export function ownerPhotoUrl(token: string, photoId: number, size: 'thumb' | 'full'): string {
  return `${OWNER_MANAGE_PHOTO_PATH}?token=${encodeURIComponent(token)}&id=${photoId}&size=${size}`
}

/** Фотографии документа (depth 1) — только те, у кого есть числовой id */
function photoFiles(value: unknown): { id: number; filename: string }[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const id = refId((item as { id?: unknown })?.id)
      if (!id) return null
      return { id, filename: str((item as { filename?: unknown }).filename) }
    })
    .filter((p): p is { id: number; filename: string } => p !== null)
}

/**
 * Объявление для страницы управления: собственнику нужны заголовок, статус и
 * свои фотографии. Больше ничего не отдаём — ни телефона, ни служебных полей
 * заявки. Вернёт null, если объявление не найдено или это не объявление
 * собственника: ссылка управления выдаётся только для source: 'owner'.
 */
export async function loadOwnerManageAd(
  payload: Payload,
  boardAdId: number,
  token: string,
): Promise<OwnerManageAd | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id: boardAdId, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return null
  // Ссылка управления существует только для объявлений собственников; на
  // всякий случай проверяем и здесь, чтобы не открыть чужое объявление
  if (str(doc.source) !== 'owner') return null

  const status = str(doc.status) || 'pending'
  const photos = photoFiles(doc.photos).map((p) => ({
    id: p.id,
    thumb: ownerPhotoUrl(token, p.id, 'thumb'),
    full: ownerPhotoUrl(token, p.id, 'full'),
  }))

  return {
    id: Number(doc.id),
    title: str(doc.title),
    status,
    statusLabel: BOARD_STATUS_LABELS[status as BoardStatus] || status,
    photos,
  }
}

export interface OwnerPhotoUpdateResult {
  ok: boolean
  error?: string
  /** Менялись ли фотографии: без изменений объявление на модерацию не уходит */
  changed?: boolean
  status?: string
}

/**
 * Правка фотографий по ссылке управления.
 *
 * Из формы приходят: `keepPhotos` — id оставленных снимков, `photos` — новые
 * файлы, `mainPhoto` — ключ главного (`existing:<id>` или `new:<номер>`).
 * Проверки те же, что при подаче и правке автором (формат, размер, не больше
 * BOARD_MAX_PHOTOS, минимум один снимок). Чужие id в keepPhotos молча
 * отбрасываются: подставить номер чужого снимка нельзя.
 *
 * Изменение (добавление, удаление или смена главного) возвращает объявление
 * на проверку: status → pending, копии в открытом хранилище удаляются, как при
 * правке автором. Если ничего не поменялось, объявление не трогаем — не гоняем
 * модератора зря.
 */
export async function updateOwnerAdPhotos(
  payload: Payload,
  boardAdId: number,
  form: FormData,
): Promise<OwnerPhotoUpdateResult> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id: boardAdId, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return { ok: false, error: 'Объявление не найдено' }
  if (str(doc.source) !== 'owner') {
    return { ok: false, error: 'Управление по ссылке доступно только для своего объявления' }
  }

  // Новые файлы: формат и размер проверяем до записи — те же правила, что при
  // подаче (см. boardPhotosFromForm)
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  for (const file of files) {
    if (!isAllowedPhoto({ name: file.name, type: file.type })) {
      return { ok: false, error: `Формат не поддерживается — нужны ${PHOTO_FORMATS_LABEL}` }
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: `Фотография больше ${PHOTO_MAX_LABEL}` }
    }
  }

  // Оставленные снимки: берём только те id, что действительно есть у объявления
  const existing = photoFiles(doc.photos)
  const existingIds = existing.map((p) => p.id)
  const keep = String(form.get('keepPhotos') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && existingIds.includes(n))
  const removed = existingIds.filter((id) => !keep.includes(id))

  if (keep.length + files.length === 0) {
    return { ok: false, error: 'Оставьте хотя бы одну фотографию объекта' }
  }
  if (keep.length + files.length > BOARD_MAX_PHOTOS) {
    return { ok: false, error: `Не больше ${BOARD_MAX_PHOTOS} фотографий` }
  }

  // Новые снимки кладём в закрытое хранилище доски. Автора берём у объявления
  // (сотрудник, который его завёл): собственник без учётной записи, а снимки
  // должны остаться видимыми модератору
  const authorId = refId(doc.author)
  const newIds: number[] = []
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const created = await payload.create({
        collection: 'board-materials',
        data: { alt: str(doc.title), ...(authorId ? { author: authorId } : {}) },
        file: { data: buffer, mimetype: file.type || 'image/jpeg', name: file.name, size: buffer.length },
        depth: 0,
        overrideAccess: true,
      })
      newIds.push(Number(created.id))
    } catch (error) {
      console.error('Owner manage: фотография не принята', error)
      return { ok: false, error: 'Одна из фотографий не читается — выберите другую' }
    }
  }

  // Главное фото — первым: обложка берётся из начала списка (см. withMainPhotoFirst)
  const photos = withMainPhotoFirst(
    [...keep, ...newIds],
    [...keep.map((id) => `existing:${id}`), ...newIds.map((_, i) => `new:${i}`)],
    String(form.get('mainPhoto') || ''),
  )

  // Изменилось ли что-нибудь: порядок и состав снимков сравниваем с прежним
  const changed = photos.length !== existingIds.length || photos.some((id, i) => id !== existingIds[i])
  if (!changed) {
    // Файлы уже могли записаться, но раз ничего не поменялось — убираем их,
    // чтобы не копить мусор в хранилище
    for (const id of newIds) {
      await payload.delete({ collection: 'board-materials', id, overrideAccess: true }).catch(() => null)
    }
    return { ok: true, changed: false, status: str(doc.status) || 'pending' }
  }

  // Убранные снимки из закрытого хранилища больше не нужны
  for (const id of removed) {
    await payload.delete({ collection: 'board-materials', id, overrideAccess: true }).catch(() => null)
  }
  // Копии для сайта, сделанные при прошлой публикации: удаляем и очищаем —
  // при публикации сделаются заново из новых снимков
  const oldPublic = Array.isArray(doc.publicPhotos) ? (doc.publicPhotos as { id?: unknown }[]) : []
  for (const p of oldPublic) {
    const id = refId(p?.id)
    if (id) await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => null)
  }

  try {
    await payload.update({
      collection: 'board-ads',
      id: boardAdId,
      data: {
        photos,
        publicPhotos: [],
        // Правка фотографий возвращает объявление на проверку — как и правка
        // автором: изменённые снимки не должны появиться на сайте до модерации
        status: 'pending',
        moderationNote: null,
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true, changed: true, status: 'pending' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Файл снимка для отдачи наружу: содержимое и тип */
export interface OwnerAdPhotoFile {
  data: Buffer
  contentType: string
}

/** Тип содержимого по расширению имени файла (Payload сохраняет картинки как есть) */
function contentTypeOf(filename: string, fallback: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (ext === 'webp') return 'image/webp'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'avif') return 'image/avif'
  return fallback || 'application/octet-stream'
}

/**
 * Чтение снимка объявления по токену управления. Сначала убеждаемся, что
 * запрошенный снимок действительно принадлежит этому объявлению (id из
 * doc.photos), и только потом читаем файл из закрытого хранилища. Так по
 * ссылке нельзя достать чужой файл, даже зная его id: маршрут работает
 * только в связке «токен → объявление → его снимки».
 */
export async function readOwnerAdPhoto(
  payload: Payload,
  boardAdId: number,
  photoId: number,
  thumb: boolean,
): Promise<OwnerAdPhotoFile | null> {
  const doc = (await payload
    .findByID({ collection: 'board-ads', id: boardAdId, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc || str(doc.source) !== 'owner') return null

  const items = Array.isArray(doc.photos) ? (doc.photos as Record<string, unknown>[]) : []
  const item = items.find((p) => refId(p?.id) === photoId)
  if (!item) return null

  const sizes = (item.sizes || {}) as Record<string, { filename?: unknown }>
  let filename = str(item.filename)
  if (thumb) {
    filename = str(sizes.thumbnail?.filename) || str(sizes.card?.filename) || filename
  }
  if (!filename) return null

  const full = storedFilePath('board-materials', filename)
  if (!full) {
    console.error(`Owner manage: подозрительное имя файла фото — ${filename}`)
    return null
  }
  try {
    const data = await fs.readFile(full)
    return { data, contentType: contentTypeOf(filename, str(item.mimeType)) }
  } catch {
    return null
  }
}

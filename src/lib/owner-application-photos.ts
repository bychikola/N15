/**
 * Фотографии заявки собственника: загрузка, удаление и выбор главного снимка
 * администратором до публикации.
 *
 * Снимки заявки лежат в закрытом хранилище owner-materials (см. OwnerMaterials):
 * на сайт напрямую они не отдаются — копии в media создаёт публикация
 * (copyOwnerPhotosToBoard / copyOwnerPhotos в src/lib/owner-service.ts).
 * Администратор добавляет реальные фотографии и отмечает главную здесь, до
 * выхода объявления на доску. Главное фото — первое в списке заявки, и именно
 * из начала списка берётся обложка при публикации (см. withMainPhotoFirst в
 * src/lib/board-form.ts и copyOwnerPhotosToBoard).
 *
 * Правка доступна только администратору и только пока заявка не ушла на доску:
 * у опубликованного объявления снимки правятся в карточке объявления
 * (см. OwnerBoardAdEdit) — иначе правка заявки разошлась бы с тем, что на сайте.
 */
import type { Payload } from 'payload'

import { withMainPhotoFirst } from './board-form'
import { ownerPhotosFromForm, OWNER_MAX_PHOTOS } from './owner-form'

/** Администратор, выполняющий правку (из payload.auth) */
export interface OwnerApplicationPhotosUser {
  id?: number | string
  email?: string
  name?: string
  role?: string | null
}

/** Фотография заявки для карточки CRM: id и ссылки на снимок в закрытом хранилище */
export interface OwnerApplicationPhoto {
  id: number
  url: string | null
  thumb: string | null
}

export interface OwnerApplicationPhotosResult {
  ok: boolean
  error?: string
  /** Итоговый список id фотографий заявки в порядке показа (главная — первая) */
  photoIds?: number[]
  /** Тот же список со ссылками — чтобы карточка обновилась без перезагрузки */
  photos?: OwnerApplicationPhoto[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** id связи (число, строка или объект { id }) — или null */
function refId(value: unknown): number | null {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Документ owner-materials (depth 1) → фотография для карточки */
function photoView(item: unknown): OwnerApplicationPhoto | null {
  if (!item || typeof item !== 'object') return null
  const p = item as { id?: unknown; url?: unknown; sizes?: Record<string, { url?: unknown }> }
  const id = refId(p.id)
  if (!id) return null
  const url = str(p.url) || null
  const thumb = str(p.sizes?.thumbnail?.url) || str(p.sizes?.card?.url) || url
  return { id, url, thumb }
}

/** id фотографий заявки (depth 1 — документы owner-materials) */
function photoIdsOf(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const item of value) {
    const id = refId((item || {}) as { id?: unknown })
    if (id) out.push(id)
  }
  return out
}

/**
 * Сохранение фотографий заявки администратором. Из формы приходят
 * `keepPhotos` — id оставленных снимков, `photos` — новые файлы и `mainPhoto`
 * — ключ главного (`existing:<id>` или `new:<номер>`). Проверки формата и
 * размера — общие с формой на сайте (ownerPhotosFromForm), лимит — тот же.
 *
 * Заявку эта функция не публикует и статус не меняет: администратор лишь
 * готовит снимки, а публикация на доске — отдельное осознанное действие
 * (см. publishOwnerApplicationToBoard).
 */
export async function updateOwnerApplicationPhotos(
  payload: Payload,
  id: number,
  form: FormData,
  user: OwnerApplicationPhotosUser | null | undefined,
): Promise<OwnerApplicationPhotosResult> {
  // Право проверяем и здесь, а не только в маршруте: функция меняет снимки
  // заявки с персональными данными собственника
  if (user?.role !== 'admin') {
    return { ok: false, error: 'Редактировать фотографии заявки может только администратор' }
  }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Заявка не найдена' }

  const doc = (await payload
    .findByID({ collection: 'owner-applications', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!doc) return { ok: false, error: 'Заявка не найдена' }

  // Доска и заявка расходятся после публикации: у объявления свои снимки.
  // Правку закрываем, чтобы на сайте и в заявке не оказалось разных наборов
  if (refId(doc.boardAd)) {
    return {
      ok: false,
      error: 'Заявка уже опубликована на доске — фотографии правятся в карточке объявления',
    }
  }

  const parsed = ownerPhotosFromForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const existing = photoIdsOf(doc.photos)
  const keep = String(form.get('keepPhotos') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && existing.includes(n))
  const removed = existing.filter((photoId) => !keep.includes(photoId))

  if (keep.length + parsed.files.length === 0) {
    return { ok: false, error: 'Оставьте хотя бы одну фотографию' }
  }
  if (keep.length + parsed.files.length > OWNER_MAX_PHOTOS) {
    return { ok: false, error: `Не больше ${OWNER_MAX_PHOTOS} фотографий` }
  }

  // Новые снимки — в то же закрытое хранилище заявок (owner-materials)
  const alt = str(doc.ownerName) || 'Фотография объекта'
  const newIds: number[] = []
  const newDocs: Record<string, unknown>[] = []
  for (const file of parsed.files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const created = await payload.create({
        collection: 'owner-materials',
        data: { alt },
        file: {
          data: buffer,
          mimetype: file.type || 'image/jpeg',
          name: file.name,
          size: buffer.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      newIds.push(Number(created.id))
      newDocs.push(created as unknown as Record<string, unknown>)
    } catch (error) {
      // Уже записанные новые файлы убираем, чтобы не копить мусор
      for (const createdId of newIds) {
        await payload
          .delete({ collection: 'owner-materials', id: createdId, overrideAccess: true })
          .catch(() => null)
      }
      console.error('Фотографии заявки: снимок не принят', error)
      return { ok: false, error: 'Одна из фотографий не читается — выберите другую' }
    }
  }

  // Главное фото — первым: обложка берётся из начала списка (см. withMainPhotoFirst)
  const photos = withMainPhotoFirst(
    [...keep, ...newIds],
    [...keep.map((photoId) => `existing:${photoId}`), ...newIds.map((_, i) => `new:${i}`)],
    String(form.get('mainPhoto') || ''),
  )

  const actorId = refId(user.id)
  const history = Array.isArray(doc.history) ? [...doc.history] : []
  history.push({
    at: new Date().toISOString(),
    action: 'Фотографии заявки обновлены',
    note: `Снимков: ${photos.length}`,
    ...(actorId ? { by: actorId } : {}),
  })

  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: { photos, history },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  // Убранные снимки из закрытого хранилища больше не нужны: заявка сохранена
  for (const photoId of removed) {
    await payload
      .delete({ collection: 'owner-materials', id: photoId, overrideAccess: true })
      .catch(() => null)
  }

  // Вид сохранённого набора для карточки: прежние снимки уже читали с depth 1,
  // новые — из ответа на создание. Порядок — как записан в заявку (главная первая)
  const views = new Map<number, OwnerApplicationPhoto>()
  for (const item of Array.isArray(doc.photos) ? doc.photos : []) {
    const view = photoView(item)
    if (view) views.set(view.id, view)
  }
  for (const created of newDocs) {
    const view = photoView(created)
    if (view) views.set(view.id, view)
  }
  const photoViews = photos
    .map((photoId) => views.get(photoId))
    .filter((view): view is OwnerApplicationPhoto => Boolean(view))

  return { ok: true, photoIds: photos, photos: photoViews }
}

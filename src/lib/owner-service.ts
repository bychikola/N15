/**
 * Работа с заявками собственников: подтверждение телефона, статусы, создание
 * объекта из одобренной заявки и связывание с найденным дублем. Здесь же —
 * копирование фотографий из закрытого хранилища заявок (owner-materials)
 * в открытое media: до одобрения заявки снимки на сайт не отдаются вовсе.
 *
 * Главное правило этапа: без подтверждённого телефона собственника объект
 * в каталог не попадает. Объект создаётся только вручную — администратором
 * из CRM (действие «Создать объект»), всегда черновиком и с пометкой
 * происхождения «собственник». Если похожий объект уже есть в базе, он
 * показывается администратору как совпадение, а второй объект автоматически
 * не создаётся (см. findOwnerDuplicates в src/lib/owner-applications.ts).
 *
 * Каждое действие оставляет след в истории заявки: кто, когда и что сделал.
 */
import fs from 'node:fs/promises'
import type { Payload } from 'payload'

import {
  findOwnerDuplicates,
  isOpenOwnerStatus,
  linkedObjectId,
  ownerObjectData,
  ownerObjectTitle,
  ownerSourceLabel,
  ownerStatusLabel,
  OWNER_APPLICATION_STATUSES,
  type OwnerApplicationLike,
  type OwnerApplicationStatus,
  type OwnerDuplicate,
} from './owner-applications'
import { categoryLabel } from './object-categories'
import { storedFilePath } from './upload-paths'

/** Кто выполняет действие: администратор из CRM или система (маршрут с сайта) */
export type OwnerActor = { id?: number | string; name?: string; email?: string } | null | undefined

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Число или null: приведение значения документа к карточке CRM */
const numOrNull = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && v !== null && v !== undefined && v !== '' ? n : null
}

const actorId = (user: OwnerActor): number | undefined => {
  const id = Number(user?.id)
  return Number.isInteger(id) ? id : undefined
}

export interface OwnerActionResult {
  ok: boolean
  error?: string
  /** Идентификатор созданного объекта (для действия «Создать объект») */
  objectId?: number
  /** Итоговый статус заявки */
  status?: string
}

/** Заявка целиком, как документ: сервис работает поверх коллекции */
type OwnerApplicationDoc = Record<string, unknown> & OwnerApplicationLike

async function findOwnerApplication(payload: Payload, id: number): Promise<OwnerApplicationDoc | null> {
  try {
    const doc = await payload.findByID({ collection: 'owner-applications', id, depth: 1, overrideAccess: true })
    return (doc || null) as OwnerApplicationDoc | null
  } catch {
    return null
  }
}

const historyOf = (doc: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(doc.history) ? (doc.history as Record<string, unknown>[]) : []

/** Строка истории заявки: действие, время, автор и примечание */
function historyEntry(action: string, user: OwnerActor, note?: string): Record<string, unknown> {
  return {
    at: new Date().toISOString(),
    action,
    note: str(note) || undefined,
    by: actorId(user),
  }
}

/**
 * Смена статуса заявки с записью в историю. Отдельная функция, а не правка
 * полем: в CRM каждое действие обязано оставить след, кто его сделал.
 */
export async function setOwnerStatus(
  payload: Payload,
  id: number,
  status: OwnerApplicationStatus,
  opts: { user?: OwnerActor; note?: string; extra?: Record<string, unknown> } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  if (!OWNER_APPLICATION_STATUSES.some((s) => s.value === status)) {
    return { ok: false, error: 'Неизвестный статус заявки' }
  }
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        ...(opts.extra || {}),
        status,
        history: [...historyOf(doc), historyEntry(`Статус: ${ownerStatusLabel(status)}`, opts.user, opts.note)],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true, status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Подтверждение телефона собственника. Способ «code» — владелец ввёл код из
 * SMS (см. маршрут /api/owner-applications/verify), «admin» — номер подтвердил
 * администратор вручную (требование этапа: подтверждение не должно зависеть
 * от доступности SMS-провайдера). Из «Новой» заявка переходит в «Телефон
 * подтверждён»; если она уже ушла дальше, статус не откатывается.
 */
export async function confirmOwnerPhone(
  payload: Payload,
  id: number,
  method: 'code' | 'admin',
  opts: { user?: OwnerActor; note?: string } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  const now = new Date().toISOString()
  const status =
    doc.status === 'new' || !doc.status ? 'phone_confirmed' : (doc.status as OwnerApplicationStatus)
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        phoneConfirmedAt: doc.phoneConfirmedAt || now,
        phoneConfirmMethod: doc.phoneConfirmMethod || method,
        // Код после успешной проверки обнуляем: повторно он не сработает
        verifyCodeHash: null,
        status,
        history: [
          ...historyOf(doc),
          historyEntry(
            method === 'code' ? 'Телефон подтверждён кодом из SMS' : 'Телефон подтверждён администратором',
            opts.user,
            opts.note,
          ),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true, status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Копирование фотографий заявки в открытое хранилище media. Файлы лежат
 * в закрытом owner-materials и читаются с диска по имени из документа —
 * имя проверяет storedFilePath (защита от «../» в имени). Нечитаемая
 * фотография не роняет одобрение: она пропускается с записью в лог сервера,
 * остальные попадают в объект.
 */
export async function copyOwnerPhotos(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<number[]> {
  const photos = Array.isArray(doc.photos) ? doc.photos : []
  const alt = ownerObjectTitle(doc as OwnerApplicationLike) || 'Фотография объекта'
  const out: number[] = []
  let index = 0
  for (const item of photos) {
    index += 1
    const file = (item as { file?: unknown })?.file
    if (!file || typeof file !== 'object') continue
    const source = file as { filename?: unknown; mimeType?: unknown }
    const filename = str(source.filename)
    if (!filename) continue
    // Имя проверяет storedFilePath: файл читается по данным из формы заявки
    // (папка закрытого хранилища — внутри тома media, см. OwnerMaterials)
    const filePath = storedFilePath('owner-materials', filename)
    if (!filePath) {
      console.error(`Заявки собственников: подозрительное имя файла фото — ${filename}`)
      continue
    }
    try {
      const bytes = await fs.readFile(filePath)
      const created = await payload.create({
        collection: 'media',
        data: { alt: `${alt} — фото ${index}` },
        file: {
          data: bytes,
          mimetype: str(source.mimeType) || 'image/jpeg',
          name: filename,
          size: bytes.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      out.push(Number(created.id))
    } catch (error) {
      console.error(`Заявки собственников: не удалось скопировать фото ${filename}:`, error)
    }
  }
  return out
}

/**
 * Создание объекта из одобренной заявки. Условия: телефон собственника
 * подтверждён и объект по заявке ещё не создан — иначе вернётся ошибка.
 * Объект заводится черновиком с происхождением «собственник»: публикация
 * в каталог — отдельное осознанное действие в карточке объекта. После
 * создания заявка связывается с объектом и получает статус «Одобрено».
 */
export async function createObjectFromApplication(
  payload: Payload,
  id: number,
  user?: OwnerActor,
): Promise<OwnerActionResult> {
  const app = await findOwnerApplication(payload, id)
  if (!app) return { ok: false, error: 'Заявка не найдена' }
  if (linkedObjectId(app)) return { ok: false, error: 'Объект по заявке уже создан' }
  if (!app.phoneConfirmedAt) {
    return { ok: false, error: 'Сначала подтвердите телефон собственника — без этого объект заводить нельзя' }
  }
  if (app.status === 'rejected' || app.status === 'duplicate') {
    return { ok: false, error: 'Заявка закрыта: смените её статус, если решили вернуть её в работу' }
  }

  const photoIds = await copyOwnerPhotos(payload, app as Record<string, unknown>)
  let objectId: number
  try {
    const created = await payload.create({
      collection: 'objects',
      data: ownerObjectData(app, photoIds),
      depth: 0,
      overrideAccess: true,
    })
    objectId = Number(created.id)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        object: objectId,
        status: 'approved',
        history: [
          ...historyOf(app as Record<string, unknown>),
          historyEntry('Одобрено: создан объект в базе', user, `Объект №${objectId}, черновик`),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    // Объект уже создан — заявку без связи не бросаем, сообщаем об ошибке
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, objectId, status: 'approved' }
}

/**
 * Пометка «Дубль»: заявка совпала с объектом, который уже есть в базе.
 * Второй объект не создаётся — администратор увидел совпадение и связал
 * заявку с существующей карточкой (см. findOwnerDuplicates).
 */
export async function markOwnerDuplicate(
  payload: Payload,
  id: number,
  objectId: number,
  opts: { user?: OwnerActor; note?: string } = {},
): Promise<OwnerActionResult> {
  if (!Number.isInteger(objectId) || objectId <= 0) {
    return { ok: false, error: 'Выберите объект, с которым совпала заявка' }
  }
  try {
    await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
  } catch {
    return { ok: false, error: 'Объект не найден' }
  }
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        matchedObject: objectId,
        status: 'duplicate',
        history: [
          ...historyOf(doc),
          historyEntry('Дубль: объект уже есть в базе', opts.user, opts.note || `Совпадение с объектом №${objectId}`),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true, status: 'duplicate' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Внутренний комментарий администратора: хранится в заявке и её истории */
export async function addOwnerComment(
  payload: Payload,
  id: number,
  comment: string,
  user?: OwnerActor,
): Promise<OwnerActionResult> {
  const note = str(comment)
  if (!note) return { ok: false, error: 'Введите текст комментария' }
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        internalComment: note,
        history: [...historyOf(doc), historyEntry('Внутренний комментарий', user, note)],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Действия администратора из CRM: одно действие — один вызов */
export interface OwnerActionInput {
  id: number
  action: 'confirm_phone' | 'status' | 'create_object' | 'duplicate' | 'comment'
  status?: string
  objectId?: number
  note?: string
}

/** Выполнить действие администратора из CRM. Права проверяет маршрут. */
export async function applyOwnerAction(
  payload: Payload,
  input: OwnerActionInput,
  user: OwnerActor,
): Promise<OwnerActionResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Заявка не найдена' }

  switch (input.action) {
    case 'confirm_phone':
      return confirmOwnerPhone(payload, id, 'admin', { user, note: input.note })
    case 'status': {
      const status = str(input.status)
      if (!OWNER_APPLICATION_STATUSES.some((s) => s.value === status)) {
        return { ok: false, error: 'Неизвестный статус заявки' }
      }
      return setOwnerStatus(payload, id, status as OwnerApplicationStatus, { user, note: input.note })
    }
    case 'create_object':
      return createObjectFromApplication(payload, id, user)
    case 'duplicate':
      return markOwnerDuplicate(payload, id, Number(input.objectId), { user, note: input.note })
    case 'comment':
      return addOwnerComment(payload, id, input.note || '', user)
    default:
      return { ok: false, error: 'Неизвестное действие' }
  }
}

// ── Выгрузка заявок для раздела CRM ───────────────────────────────────────────

/** Фотография заявки для карточки CRM (закрытое хранилище, только админ) */
export interface OwnerBoardPhoto {
  id: number
  url: string | null
  thumb: string | null
}

/** Строка истории заявки для карточки CRM */
export interface OwnerBoardHistory {
  at: string | null
  action: string
  note: string | null
  by: string | null
}

/**
 * Заявка для карточки CRM: всё, что нужно администратору — телефон
 * собственника, источник, дата поступления, объект, статус проверки,
 * внутренний комментарий, найденные совпадения и история. Наружу,
 * на публичный сайт, этот объект не отдаётся нигде.
 */
export interface OwnerBoardRow {
  id: number
  status: string
  statusLabel: string
  source: string
  sourceLabel: string
  receivedAt: string | null
  ownerName: string
  ownerPhone: string
  type: string
  category: string
  categoryTitle: string
  price: number | null
  area: number | null
  areaUnit: string | null
  plotArea: number | null
  plotAreaUnit: string | null
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  cadastralNumber: string | null
  address: string
  description: string
  photos: OwnerBoardPhoto[]
  phoneConfirmedAt: string | null
  phoneConfirmMethod: string | null
  verifyCodeSentAt: string | null
  consent: boolean
  consentAt: string | null
  objectId: number | null
  objectSlug: string | null
  objectTitle: string | null
  objectStatus: string | null
  matchedObjectId: number | null
  matchedObjectTitle: string | null
  internalComment: string | null
  history: OwnerBoardHistory[]
  /** Совпадения с объектами базы: администратор решает, дубль это или нет */
  duplicates: OwnerDuplicate[]
}

/** Строка адреса заявки: город, пункт, товарищество, улица, дом */
function ownerAddressLine(addr: Record<string, unknown> | null | undefined): string {
  if (!addr) return ''
  return [addr.city, addr.locality, addr.snt, addr.street, addr.house].map(str).filter(Boolean).join(', ')
}

const photoOf = (item: unknown): OwnerBoardPhoto | null => {
  if (!item || typeof item !== 'object') return null
  const p = item as { id?: unknown; url?: unknown; sizes?: Record<string, { url?: unknown }> }
  const id = Number(p.id)
  if (!Number.isInteger(id)) return null
  const thumb = p.sizes?.thumbnail?.url ?? p.sizes?.card?.url
  return {
    id,
    url: typeof p.url === 'string' ? p.url : null,
    thumb: typeof thumb === 'string' ? thumb : null,
  }
}

/**
 * Заявки для раздела CRM «Заявки собственников». Совпадения с объектами
 * считаются на лету (findOwnerDuplicates) и только для открытых заявок:
 * у закрытых (отклонена, дубль, опубликована) искать уже нечего, а каждый
 * поиск — это несколько запросов к базе. Число таких заявок ограничено,
 * чтобы страница оставалась быстрой даже при длинной очереди.
 */
export async function loadOwnerBoard(
  payload: Payload,
  opts: { status?: string; limit?: number } = {},
): Promise<OwnerBoardRow[]> {
  const res = await payload.find({
    collection: 'owner-applications',
    where: opts.status ? { status: { equals: opts.status } } : undefined,
    sort: '-receivedAt',
    limit: opts.limit ?? 60,
    depth: 1,
    overrideAccess: true,
  })

  const rows: OwnerBoardRow[] = []
  let searched = 0
  /** Сколько открытых заявок проверяем на совпадения за один показ страницы */
  const maxSearches = 30
  for (const raw of res.docs) {
    const doc = raw as unknown as Record<string, unknown>
    const addr = (doc.address as Record<string, unknown> | null) || null
    const status = str(doc.status) || 'new'
    const linked = (doc.object as Record<string, unknown> | null) || null
    const matched = (doc.matchedObject as Record<string, unknown> | null) || null
    const objectId = linkedObjectId(doc as OwnerApplicationLike)
    const matchedObjectId = linkedObjectId({
      object: (doc.matchedObject ?? null) as number | { id?: number } | null,
    })

    let duplicates: OwnerDuplicate[] = []
    if (isOpenOwnerStatus(status) && searched < maxSearches) {
      searched += 1
      try {
        duplicates = await findOwnerDuplicates(payload, doc as unknown as OwnerApplicationLike)
      } catch (error) {
        console.error('Заявки собственников: не удалось найти совпадения:', error)
      }
    }

    rows.push({
      id: Number(doc.id),
      status,
      statusLabel: ownerStatusLabel(status),
      source: str(doc.source) || 'site',
      sourceLabel: ownerSourceLabel(str(doc.source)),
      receivedAt: str(doc.receivedAt) || null,
      ownerName: str(doc.ownerName),
      ownerPhone: str(doc.ownerPhone),
      type: str(doc.type) || 'sale',
      category: str(doc.category),
      categoryTitle: categoryLabel(str(doc.category)),
      price: numOrNull(doc.price),
      area: numOrNull(doc.area),
      areaUnit: str(doc.areaUnit) || null,
      plotArea: numOrNull(doc.plotArea),
      plotAreaUnit: str(doc.plotAreaUnit) || null,
      rooms: numOrNull(doc.rooms),
      floor: numOrNull(doc.floor),
      totalFloors: numOrNull(doc.totalFloors),
      cadastralNumber: str(doc.cadastralNumber) || null,
      address: ownerAddressLine(addr),
      description: str(doc.description),
      photos: (Array.isArray(doc.photos) ? doc.photos : []).map(photoOf).filter((p): p is OwnerBoardPhoto => Boolean(p)),
      phoneConfirmedAt: str(doc.phoneConfirmedAt) || null,
      phoneConfirmMethod: str(doc.phoneConfirmMethod) || null,
      verifyCodeSentAt: str(doc.verifyCodeSentAt) || null,
      consent: doc.consent === true,
      consentAt: str(doc.consentAt) || null,
      objectId,
      objectSlug: linked ? str(linked.slug) || null : null,
      objectTitle: linked ? str(linked.title) || null : null,
      objectStatus: linked ? str(linked.status) || null : null,
      matchedObjectId,
      matchedObjectTitle: matched ? str(matched.title) || null : null,
      internalComment: str(doc.internalComment) || null,
      history: (Array.isArray(doc.history) ? doc.history : []).map((h) => {
        const e = (h || {}) as Record<string, unknown>
        const by = (e.by || {}) as Record<string, unknown>
        return {
          at: str(e.at) || null,
          action: str(e.action),
          note: str(e.note) || null,
          by: typeof e.by === 'object' && e.by ? str(by.name) || null : null,
        }
      }),
      duplicates,
    })
  }
  return rows
}

/**
 * Синхронизация статуса заявки с публикацией объекта: как только объект,
 * созданный из заявки, опубликован в каталоге, заявка получает статус
 * «Опубликовано». Вызывается хуком коллекции objects после изменения
 * (см. Objects.ts); повторные срабатывания безопасны — заявка уже
 * в статусе «Опубликовано» пропускается.
 */
export async function syncOwnerApplicationOnPublish(
  payload: Payload,
  objectDoc: Record<string, unknown> | undefined,
): Promise<void> {
  if (!objectDoc || objectDoc.status !== 'published') return
  const objectId = Number(objectDoc.id)
  if (!Number.isInteger(objectId)) return
  try {
    const res = await payload.find({
      collection: 'owner-applications',
      where: { object: { equals: objectId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const app = res.docs[0] as Record<string, unknown> | undefined
    if (!app || app.status === 'published') return
    await payload.update({
      collection: 'owner-applications',
      id: Number(app.id),
      data: {
        status: 'published',
        history: [
          ...historyOf(app),
          historyEntry('Опубликовано: объект вышел в каталог', null, `Объект №${objectId}`),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    // Связь статусов не должна ломать публикацию объекта
    console.error('Заявки собственников: не удалось обновить статус заявки:', error)
  }
}

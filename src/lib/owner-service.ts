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
  OWNER_CONTACT_METHODS,
  type OwnerApplicationLike,
  type OwnerApplicationStatus,
  type OwnerDuplicate,
} from './owner-applications'
import { categoryLabel } from './object-categories'
import { storedFilePath } from './upload-paths'
import { boardVisible } from './board'
import { publishBoardAd } from './board-service'

/** Кто выполняет действие: администратор из CRM или система (маршрут с сайта) */
export type OwnerActor =
  | { id?: number | string; name?: string; email?: string; role?: string | null }
  | null
  | undefined

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

/** id связи (агент, объект) из числа, строки или объекта { id }; null — нет */
const refId = (value: unknown): number | null => {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Объявление доски, связанное с заявкой (doc.boardAd, depth 1) — или null */
const linkedBoardAd = (doc: Record<string, unknown>): Record<string, unknown> | null => {
  const value = doc.boardAd
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** id объявления доски, связанного с заявкой — или null */
const linkedBoardAdId = (doc: Record<string, unknown>): number | null =>
  refId(doc.boardAd ?? null)

/**
 * Ответственный агент по заявке. У нового объекта каталога агент обязателен
 * (validateResponsibleAgent в Objects.ts): по нему маршрутизируются звонки
 * клиентов (см. src/lib/call-routing.ts) и строится доступ к карточке.
 * Порядок: агент, выбранный администратором сейчас (explicit), затем уже
 * сохранённый в заявке (doc.agent). Если агента нет или профиль не найден —
 * понятная ошибка: и подтвердить заявку, и завести объект без агента нельзя.
 */
async function resolveOwnerAgent(
  payload: Payload,
  explicit: unknown,
  doc: Record<string, unknown>,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const id = refId(explicit) ?? refId(doc.agent)
  if (id == null) {
    return { ok: false, error: 'Выберите ответственного агента — без него объект из заявки не заводится' }
  }
  try {
    const agent = await payload.findByID({ collection: 'agents', id, depth: 0, overrideAccess: true })
    if (!agent?.id) return { ok: false, error: 'Ответственный агент не найден — выберите агента из списка' }
  } catch {
    return { ok: false, error: 'Ответственный агент не найден — выберите агента из списка' }
  }
  return { ok: true, id }
}

export interface OwnerActionResult {
  ok: boolean
  error?: string
  /** Идентификатор созданного объекта (для действия «Создать объект») */
  objectId?: number
  /** Идентификатор опубликованного объявления доски (для «Опубликовать на доске») */
  boardAdId?: number
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
 *
 * Статус «Опубликовано» вручную не ставится: его заявка получает только
 * тогда, когда объект по ней фактически создан и опубликован в каталоге
 * (см. syncOwnerApplicationOnPublish). Пока объекта нет — попытка отклоняется
 * с понятной причиной: раньше «Опубликовано» можно было выставить у заявки,
 * по которой объекта ещё не было.
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
  if (status === 'published') {
    // «Опубликовано» ставится только тогда, когда объявление заявки реально
    // видно на публичной доске (или объект заявки вышел в каталог). Заявка не
    // может стать «Опубликовано» «на словах»: это защита от статуса, за
    // которым ничего не стоит (см. publishOwnerApplicationToBoard)
    const board = linkedBoardAd(doc)
    const boardLive = board ? boardVisible(board as never) : false
    const linked = linkedObjectId(doc as OwnerApplicationLike)
    if (!boardLive && !linked) {
      return {
        ok: false,
        error:
          'Сначала опубликуйте объявление на доске (или заведите объект каталога) — без этого статус «Опубликовано» недоступен',
      }
    }
    if (!boardLive && linked) {
      let objectStatus: string | null = null
      try {
        const object = await payload.findByID({
          collection: 'objects',
          id: linked,
          depth: 0,
          overrideAccess: true,
        })
        objectStatus = str((object as { status?: unknown } | null)?.status) || null
      } catch {
        return { ok: false, error: 'Объект заявки не найден — создайте его заново' }
      }
      if (objectStatus !== 'published') {
        return {
          ok: false,
          error:
            'Объект ещё не опубликован: откройте его карточку и опубликуйте — заявка станет «Опубликовано» автоматически',
        }
      }
    }
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
 *
 * Ответственного агента подтверждение больше не требует: заявка собственника
 * идёт на доску объявлений, где агент не нужен. Если администратор выбрал
 * агента сам (готовит объект каталога), выбор сохраняется.
 */
export async function confirmOwnerPhone(
  payload: Payload,
  id: number,
  method: 'code' | 'admin',
  opts: { user?: OwnerActor; note?: string; agentId?: number } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  const now = new Date().toISOString()
  const status =
    doc.status === 'new' || !doc.status ? 'phone_confirmed' : (doc.status as OwnerApplicationStatus)

  const data: Record<string, unknown> = {
    phoneConfirmedAt: doc.phoneConfirmedAt || now,
    phoneConfirmMethod: doc.phoneConfirmMethod || method,
    // Код после успешной проверки обнуляем: повторно он не сработает
    verifyCodeHash: null,
    status,
  }
  if (method === 'admin') {
    // Ответственный агент для заявки больше не обязателен: объявление
    // собственника публикуется прямо на доске, и агент для этого не нужен.
    // Если администратор всё же выбрал агента (готовит объект в каталог),
    // сохраняем выбор — без проверки «обязательно выберите»
    const explicit = refId(opts.agentId)
    if (explicit != null) {
      const agent = await resolveOwnerAgent(payload, explicit, {})
      if (!agent.ok) return agent
      data.agent = agent.id
    }
  }

  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        ...data,
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
 * Назначение ответственного агента отдельным действием. Нужно, когда телефон
 * подтвердил сам собственник кодом из SMS: агента в этом случае администратор
 * ставит позже — иначе объект из заявки не завести.
 */
export async function assignOwnerAgent(
  payload: Payload,
  id: number,
  agentId: number,
  opts: { user?: OwnerActor; note?: string } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  const agent = await resolveOwnerAgent(payload, agentId, {})
  if (!agent.ok) return agent
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        agent: agent.id,
        history: [...historyOf(doc), historyEntry('Назначен ответственный агент', opts.user, opts.note)],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Ручное подтверждение контакта с собственником — отдельный этап приёмки.
 * Администратор сам связывается с владельцем (WhatsApp или телефонный звонок),
 * выбирает способ и отмечает контакт подтверждённым: сохраняются дата, способ
 * и администратор. Без этого шага и отдельного согласия на публикацию номера
 * объявление на доске не выходит (см. publishOwnerApplicationToBoard).
 *
 * Повторный вызов не сбрасывает уже проставленную дату: первый контакт и есть
 * момент подтверждения, а смена способа фиксируется в истории.
 */
export async function confirmOwnerContact(
  payload: Payload,
  id: number,
  method: string,
  opts: { user?: OwnerActor; note?: string } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  const known = OWNER_CONTACT_METHODS.find((m) => m.value === method)
  if (!known) {
    return { ok: false, error: 'Выберите способ подтверждения: WhatsApp или телефонный звонок' }
  }
  const now = new Date().toISOString()
  const who = actorId(opts.user)
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        contactConfirmedAt: str(doc.contactConfirmedAt) || now,
        contactConfirmMethod: method,
        ...(who ? { contactConfirmedBy: who } : {}),
        history: [
          ...historyOf(doc),
          historyEntry(`Контакт подтверждён: ${known.label}`, opts.user, opts.note),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Отдельное согласие собственника на публикацию его номера. Нужно именно
 * отдельно от согласия на обработку данных: пока телефона в объявлении нет,
 * достаточно личного согласия, а показ номера на доске требует явной отметки.
 * Снятие отметки тоже фиксируется в истории — согласие можно отозвать.
 */
export async function setOwnerPhoneConsent(
  payload: Payload,
  id: number,
  consent: boolean,
  opts: { user?: OwnerActor } = {},
): Promise<OwnerActionResult> {
  const doc = await findOwnerApplication(payload, id)
  if (!doc) return { ok: false, error: 'Заявка не найдена' }
  const granted = consent === true
  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        publishPhoneConsent: granted,
        publishPhoneConsentAt: granted
          ? str(doc.publishPhoneConsentAt) || new Date().toISOString()
          : null,
        history: [
          ...historyOf(doc),
          historyEntry(
            granted ? 'Согласие на публикацию номера: получено' : 'Согласие на публикацию номера: отозвано',
            opts.user,
          ),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    return { ok: true }
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
 * подтверждён, назначен ответственный агент и объект по заявке ещё не создан —
 * иначе вернётся ошибка. Объект заводится полноценной карточкой-черновиком с
 * происхождением «собственник», ответственным агентом и автором (createdBy):
 * публикация в каталог — отдельное осознанное действие в карточке объекта, а
 * появляется он сразу в разделе «Объекты». После создания заявка связывается
 * с объектом и получает статус «Одобрено»; статус «Опубликовано» заявка
 * получит, когда объект выйдет в каталог (см. syncOwnerApplicationOnPublish).
 */
export async function createObjectFromApplication(
  payload: Payload,
  id: number,
  user?: OwnerActor,
  agentId?: number,
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

  // Ответственный агент обязателен: без него validateResponsibleAgent
  // отклонит создание, а поле просто заполняется до проверки
  const agent = await resolveOwnerAgent(payload, agentId, app as Record<string, unknown>)
  if (!agent.ok) return agent

  const photoIds = await copyOwnerPhotos(payload, app as Record<string, unknown>)
  const author = actorId(user)
  let objectId: number
  try {
    const created = await payload.create({
      collection: 'objects',
      data: {
        ...ownerObjectData(app, photoIds, agent.id),
        // Автор карточки — учётная запись администратора: объект остаётся
        // доступен и виден в разделе «Объекты» (см. createdBy в Objects.ts)
        ...(author ? { createdBy: author } : {}),
      },
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
        agent: agent.id,
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
 * Фотографии заявки → закрытое хранилище доски (board-materials). Возвращает
 * id созданных файлов: их кладут в объявление, а при публикации доски копии
 * уходят в открытое media (см. publishBoardAd). Нечитаемое фото публикацию не
 * роняет — пропускаем и пишем строку в лог сервера.
 */
async function copyOwnerPhotosToBoard(
  payload: Payload,
  doc: Record<string, unknown>,
  authorId: number,
): Promise<number[]> {
  const photos = Array.isArray(doc.photos) ? doc.photos : []
  const alt = ownerObjectTitle(doc as OwnerApplicationLike) || 'Фотография объекта'
  const out: number[] = []
  let index = 0
  for (const item of photos) {
    index += 1
    // Поле-загрузка отдаёт либо сам документ хранилища, либо обёртку { file }:
    // принимаем оба вида, чтобы перенос не зависел от глубины выборки
    const rawFile = (item as { file?: unknown })?.file
    const source = (rawFile && typeof rawFile === 'object' ? rawFile : item) as {
      filename?: unknown
      mimeType?: unknown
    }
    const filename = str(source.filename)
    if (!filename) continue
    const filePath = storedFilePath('owner-materials', filename)
    if (!filePath) {
      console.error(`Заявки собственников: подозрительное имя файла фото — ${filename}`)
      continue
    }
    try {
      const bytes = await fs.readFile(filePath)
      // Имя уникально: фото из разных заявок могут называться одинаково
      const name = `owner-${String(doc.id ?? 'app')}-${index}-${filename}`
      const created = await payload.create({
        collection: 'board-materials',
        data: { alt: `${alt} — фото ${index}`, author: authorId },
        file: {
          data: bytes,
          mimetype: str(source.mimeType) || 'image/jpeg',
          name,
          size: bytes.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      out.push(Number(created.id))
    } catch (error) {
      console.error(`Заявки собственников: не удалось перенести фото ${filename}:`, error)
    }
  }
  return out
}

/**
 * Публикация объявления собственника на доске объявлений.
 *
 * Заявка, которую владелец оставил сам через публичную форму (/sell), после
 * подтверждения телефона и одобрения администратором попадает прямо на доску:
 * объект каталога из неё не заводится — доска и каталог разные базы, и
 * смешивать их не нужно. Ответственный агент при этом не требуется.
 *
 * Порядок: собираем карточку из данных заявки, переносим фото из закрытого
 * хранилища заявок в закрытое хранилище доски, публикуем (копии фото уходят
 * в media) и ставим заявке «Опубликовано» — но только после того, как
 * объявление реально стало видно на сайте. Контакт в карточке — телефон
 * владельца из заявки; номер агентства или агента сюда не подставляется.
 *
 * Условия публикации: контакт с собственником подтверждён вручную (WhatsApp
 * или звонок, с датой, способом и администратором) и получено отдельное
 * согласие на показ номера (publishPhoneConsent). Отдельного подтверждения
 * телефона — кодом из SMS или второй ручной отметкой — для доски не требуется:
 * администратор уже связался с владельцем по этому номеру, и это и есть
 * подтверждение контакта. Проверка телефона остаётся для карточки каталога
 * (см. createObjectFromApplication), её эта функция не трогает.
 */
export async function publishOwnerApplicationToBoard(
  payload: Payload,
  id: number,
  user?: OwnerActor,
): Promise<OwnerActionResult> {
  if (user?.role !== 'admin') {
    return { ok: false, error: 'Опубликовать объявление может только администратор' }
  }
  const app = await findOwnerApplication(payload, id)
  if (!app) return { ok: false, error: 'Заявка не найдена' }
  // Ручное подтверждение контакта и отдельное согласие на показ номера —
  // обязательные условия публикации: администратор должен быть уверен, что
  // связался именно с владельцем и что тот разрешил показывать телефон
  if (!app.contactConfirmedAt) {
    return {
      ok: false,
      error: 'Сначала подтвердите контакт с собственником — позвоните или напишите в WhatsApp и отметьте это',
    }
  }
  if (app.publishPhoneConsent !== true) {
    return {
      ok: false,
      error: 'Нужно отдельное согласие собственника на публикацию номера — отметьте его в карточке заявки',
    }
  }
  if (app.status === 'rejected' || app.status === 'duplicate') {
    return { ok: false, error: 'Заявка закрыта: смените её статус, если решили вернуть её в работу' }
  }
  // Повторное нажатие безопасно: объявление уже опубликовано — отдаём его id
  const already = linkedBoardAdId(app)
  if (already) return { ok: true, boardAdId: already, status: 'published' }

  // Автор объявления — администратор, который публикует: поле «Автор» в доске
  // обязательное. Публично объявление всё равно «От собственника» — вид
  // автора задаёт источник (см. BoardAds.ts), а контакт берётся из заявки
  const authorId = actorId(user)
  if (!authorId) return { ok: false, error: 'Не удалось определить администратора' }

  const photoIds = await copyOwnerPhotosToBoard(payload, app as Record<string, unknown>, authorId)
  if (!photoIds.length) {
    return {
      ok: false,
      error: 'В заявке нет фотографий — попросите собственника добавить хотя бы одно фото',
    }
  }

  const title = ownerObjectTitle(app as OwnerApplicationLike).slice(0, 120)
  const address = {
    city: str(app.address?.city) || 'Владикавказ',
    district: str(app.address?.district) || undefined,
    cityDistrict: str(app.address?.cityDistrict) || undefined,
    locality: str(app.address?.locality) || undefined,
    snt: str(app.address?.snt) || undefined,
    street: str(app.address?.street) || undefined,
    house: str(app.address?.house) || undefined,
  }
  const addressLine = [address.city, address.locality, address.street].map(str).filter(Boolean).join(', ')
  const description = str(app.description) || [title, addressLine].filter(Boolean).join('. ')

  let boardAdId: number
  try {
    const created = await payload.create({
      collection: 'board-ads',
      data: {
        title,
        dealType: app.type === 'rent' ? 'rent' : 'sale',
        category: app.category || 'apartment',
        price: numOrNull(app.price) ?? 0,
        area: numOrNull(app.area) ?? undefined,
        areaUnit: str(app.areaUnit) || 'sqm',
        plotArea: numOrNull(app.plotArea) ?? undefined,
        plotAreaUnit: str(app.plotAreaUnit) || undefined,
        rooms: numOrNull(app.rooms) ?? undefined,
        floor: numOrNull(app.floor) ?? undefined,
        totalFloors: numOrNull(app.totalFloors) ?? undefined,
        description,
        address,
        // Точный адрес на доске закрыт: собственник не давал согласия в форме
        // доски. На сайте видны улица, район и город (см. boardShowsExactAddress)
        showExactAddress: false,
        contactName: str(app.ownerName),
        phone: str(app.ownerPhone),
        photos: photoIds,
        author: authorId,
        source: 'owner',
        ownerApplication: id,
        status: 'pending',
        // Согласие владелец дал при подаче заявки (152-ФЗ) — переносим отметку,
        // чтобы объявление прошло проверку публикации без нового согласия
        consent: true,
        consentRules: true,
      },
      depth: 0,
      overrideAccess: true,
    })
    boardAdId = Number(created.id)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  // Публикация: копирует фото в media и ставит статус «Опубликовано».
  // Право публиковать проверяет хук коллекции — передаём администратора
  const published = await publishBoardAd(payload, boardAdId, user)
  if (!published.ok) {
    return { ok: false, error: published.error || 'Не удалось опубликовать объявление на доске' }
  }

  // «Опубликовано» — только если объявление реально видно на публичной доске
  const board = (await payload
    .findByID({ collection: 'board-ads', id: boardAdId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!board || !boardVisible(board as never)) {
    return {
      ok: false,
      error: 'Объявление создано, но не стало видно на доске — проверьте его в разделе «Доска»',
    }
  }

  try {
    await payload.update({
      collection: 'owner-applications',
      id,
      data: {
        boardAd: boardAdId,
        status: 'published',
        history: [
          ...historyOf(app as Record<string, unknown>),
          historyEntry(
            'Опубликовано на доске объявлений',
            user,
            `Объявление №${boardAdId}, контакт — собственник`,
          ),
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, boardAdId, status: 'published' }
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
  action:
    | 'confirm_phone'
    | 'confirm_contact'
    | 'phone_consent'
    | 'status'
    | 'create_object'
    | 'assign_agent'
    | 'duplicate'
    | 'comment'
    | 'publish_board'
  status?: string
  objectId?: number
  agentId?: number
  note?: string
  /** Способ подтверждения контакта (для действия «Контакт подтверждён») */
  method?: string
  /** Отдельное согласие на публикацию номера (для действия «Согласие») */
  consent?: boolean
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
      return confirmOwnerPhone(payload, id, 'admin', { user, note: input.note, agentId: input.agentId })
    case 'confirm_contact':
      return confirmOwnerContact(payload, id, str(input.method), { user, note: input.note })
    case 'phone_consent':
      return setOwnerPhoneConsent(payload, id, input.consent === true, { user })
    case 'status': {
      const status = str(input.status)
      if (!OWNER_APPLICATION_STATUSES.some((s) => s.value === status)) {
        return { ok: false, error: 'Неизвестный статус заявки' }
      }
      return setOwnerStatus(payload, id, status as OwnerApplicationStatus, { user, note: input.note })
    }
    case 'create_object':
      return createObjectFromApplication(payload, id, user, input.agentId)
    case 'publish_board':
      return publishOwnerApplicationToBoard(payload, id, user)
    case 'assign_agent':
      return assignOwnerAgent(payload, id, Number(input.agentId), { user, note: input.note })
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
  /** Ручное подтверждение контакта: дата, способ (WhatsApp / звонок), кто подтвердил */
  contactConfirmedAt: string | null
  contactConfirmMethod: string | null
  contactConfirmedById: number | null
  contactConfirmedByName: string | null
  /** Отдельное согласие собственника на показ номера в объявлении */
  publishPhoneConsent: boolean
  publishPhoneConsentAt: string | null
  consent: boolean
  consentAt: string | null
  /** Ответственный агент: нужен только для объекта каталога, для доски не обязателен */
  agentId: number | null
  agentName: string | null
  /** Объявление доски, собранное из этой заявки (null — заявка на доску не выкладывалась) */
  boardAdId: number | null
  /** Объявление доски опубликовано и видно на сайте */
  boardPublished: boolean
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
 * Документ заявки → строка для карточки CRM. Одна и та же сборка для списка
 * (loadOwnerBoard) и для полной карточки заявки (loadOwnerApplication):
 * поля не расходятся, администратор видит ровно то, что отправил собственник.
 * Совпадения с объектами базы считаются на лету и опционально: у закрытых
 * заявок искать уже нечего, а каждый поиск — это несколько запросов к базе.
 */
async function ownerBoardRowFromDoc(
  payload: Payload,
  doc: Record<string, unknown>,
  withDuplicates: boolean,
): Promise<OwnerBoardRow> {
  const addr = (doc.address as Record<string, unknown> | null) || null
  const status = str(doc.status) || 'new'
  const linked = (doc.object as Record<string, unknown> | null) || null
  const matched = (doc.matchedObject as Record<string, unknown> | null) || null
  const agentDoc = (doc.agent as Record<string, unknown> | null) || null
  const contactConfirmedBy = (doc.contactConfirmedBy as Record<string, unknown> | null) || null
  const objectId = linkedObjectId(doc as OwnerApplicationLike)
  const matchedObjectId = linkedObjectId({
    object: (doc.matchedObject ?? null) as number | { id?: number } | null,
  })
  const agentId = linkedObjectId({ object: (doc.agent ?? null) as number | { id?: number } | null })
  const boardAd = linkedBoardAd(doc)
  const boardAdId = linkedBoardAdId(doc)

  let duplicates: OwnerDuplicate[] = []
  if (withDuplicates) {
    try {
      duplicates = await findOwnerDuplicates(payload, doc as unknown as OwnerApplicationLike)
    } catch (error) {
      console.error('Заявки собственников: не удалось найти совпадения:', error)
    }
  }

  return {
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
    contactConfirmedAt: str(doc.contactConfirmedAt) || null,
    contactConfirmMethod: str(doc.contactConfirmMethod) || null,
    contactConfirmedById: contactConfirmedBy ? refId(doc.contactConfirmedBy) : null,
    contactConfirmedByName: contactConfirmedBy ? str(contactConfirmedBy.name) || null : null,
    publishPhoneConsent: doc.publishPhoneConsent === true,
    publishPhoneConsentAt: str(doc.publishPhoneConsentAt) || null,
    consent: doc.consent === true,
    consentAt: str(doc.consentAt) || null,
    agentId,
    agentName: agentDoc ? str(agentDoc.name) || null : null,
    boardAdId,
    boardPublished: boardAd ? boardVisible(boardAd as never) : false,
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
    const open = isOpenOwnerStatus(str(doc.status) || 'new')
    const withDuplicates = open && searched < maxSearches
    if (withDuplicates) searched += 1
    rows.push(await ownerBoardRowFromDoc(payload, doc, withDuplicates))
  }
  return rows
}

/**
 * Полная карточка одной заявки: та же строка, что и в списке, но без
 * ограничения очереди — администратор открыл заявку целиком, чтобы увидеть
 * все данные собственника, историю и комментарий (см. страницу
 * /crm/owner-applications/[id]). Совпадения с базой здесь ищутся всегда:
 * по одной заявке это недорого, а решение «дубль или нет» принимается
 * именно в карточке. null — заявки нет (удалена) или она недоступна.
 */
export async function loadOwnerApplication(
  payload: Payload,
  id: number,
): Promise<OwnerBoardRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  try {
    const doc = await payload.findByID({
      collection: 'owner-applications',
      id,
      depth: 1,
      overrideAccess: true,
    })
    if (!doc) return null
    return await ownerBoardRowFromDoc(payload, doc as unknown as Record<string, unknown>, true)
  } catch {
    return null
  }
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

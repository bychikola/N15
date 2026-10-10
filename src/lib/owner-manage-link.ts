/**
 * Защищённые ссылки для управления объявлениями собственников.
 *
 * Собственник, чьё объявление вышло на доску, не заводит личный кабинет:
 * администратор по подтверждённому контакту (WhatsApp или звонок) выдаёт ему
 * персональную ссылку. Ссылка ведёт ровно к его объявлению, живёт 24 часа и
 * не даёт доступа ни к чему другому.
 *
 * Токен — 32 случайных байта (base64url), в базе лежит только его
 * необратимый хеш с секретом сайта (как у кодов подтверждения, см.
 * src/lib/owner-verify.ts): дамп базы не даёт воспользоваться чужой ссылкой.
 * Сравнение — постоянного времени. Поиск идёт по хешу, а не по номеру
 * объявления, поэтому подставить чужой номер нельзя.
 *
 * Выдача возможна только для объявления «от собственника», у которого
 * привязанная заявка прошла ручное подтверждение контакта. Ссылку никогда
 * не отправляем сами: её получает администратор и передаёт владельцу —
 * автоматическая рассылка на произвольный номер запрещена требованием этапа.
 *
 * Этот модуль отвечает только за ВЫДАЧУ и ПРОВЕРКУ доступа. Редактирование,
 * удаление и повторная публикация объявления по ссылке — следующий этап.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

/** Сколько живёт ссылка управления */
export const OWNER_MANAGE_TTL_MS = 24 * 60 * 60_000

/** Путь страницы управления: к нему добавляется токен */
export const OWNER_MANAGE_PATH = '/board/manage/'

/** Токен — 32 байта в base64url: 43 знака без «=» */
export const OWNER_MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** Новый случайный токен ссылки (в базе не хранится — только его хеш) */
export function generateOwnerManageToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Необратимый хеш токена с секретом сайта: в базе хранится только он */
export function hashOwnerManageToken(token: string): string {
  const secret = process.env.PAYLOAD_SECRET || 'n15-dev-secret-change-in-production'
  return createHash('sha256').update(`n15-owner-manage|${secret}|${token}`).digest('hex')
}

/** Совпадает ли токен с сохранённым хешем (сравнение постоянного времени) */
export function ownerManageTokenMatches(storedHash: unknown, token: string): boolean {
  if (typeof storedHash !== 'string' || !OWNER_MANAGE_TOKEN_RE.test(token)) return false
  const a = Buffer.from(storedHash, 'hex')
  const b = Buffer.from(hashOwnerManageToken(token), 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

/** Истёк ли срок действия ссылки (нет даты — считаем истёкшей) */
export function ownerManageLinkExpired(expiresAt: unknown, now: number = Date.now()): boolean {
  const iso = typeof expiresAt === 'string' ? expiresAt : null
  if (!iso) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  return now >= t
}

/** Полная ссылка управления по токену; origin — домен сайта, если известен */
export function ownerManageLinkUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_SERVER_URL || 'https://n15-realty.ru').replace(/\/+$/, '')
  return `${base}${OWNER_MANAGE_PATH}${token}`
}

/** id связи (объект { id } или само число) — или null */
function refId(value: unknown): number | null {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export interface IssuedOwnerManageLink {
  ok: boolean
  error?: string
  /** Готовая ссылка — показывается администратору один раз */
  url?: string
  /** Сам токен — нужен, если ссылку собирают на другом домене */
  token?: string
  expiresAt?: string
  boardAdId?: number
}

/**
 * Выдача (или перевыпуск) ссылки управления для объявления собственника.
 *
 * Условия: объявление существует, его источник — «от собственника» (source:
 * 'owner'), а по привязанной заявке контакт владельца подтверждён вручную
 * (contactConfirmedAt). Перевыпуск разрешён в любой момент — именно так
 * собственник получает новую ссылку, когда прежняя истекла (требование этапа),
 * но прежние активные ссылки гасятся: работает только последняя.
 *
 * Функция ничего никому не отправляет и не создаёт учётных записей: она лишь
 * выпускает токен и возвращает ссылку администратору.
 */
export async function issueOwnerManageLink(
  payload: Payload,
  boardAdId: number,
  opts: { user?: { id?: number | string } | null; origin?: string } = {},
): Promise<IssuedOwnerManageLink> {
  const id = Number(boardAdId)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Не указано объявление' }

  let ad: Record<string, unknown> | null = null
  try {
    ad = (await payload.findByID({
      collection: 'board-ads',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
  } catch {
    ad = null
  }
  if (!ad) return { ok: false, error: 'Объявление не найдено' }

  // Ссылка управления — только для объявлений собственников: у объявлений
  // агентства и обычных подач с доски есть личный кабинет, им токен не нужен
  if (String(ad.source || '') !== 'owner') {
    return { ok: false, error: 'Ссылка управления доступна только для объявлений собственников' }
  }

  const applicationId = refId(ad.ownerApplication)
  if (applicationId == null) {
    return { ok: false, error: 'Объявление не связано с заявкой собственника — ссылку выдать нельзя' }
  }

  let application: Record<string, unknown> | null = null
  try {
    application = (await payload.findByID({
      collection: 'owner-applications',
      id: applicationId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
  } catch {
    application = null
  }
  if (!application) return { ok: false, error: 'Заявка собственника не найдена — ссылку выдать нельзя' }

  // Ключевое условие этапа: ссылка выдаётся только после того, как
  // администратор вручную подтвердил контакт с собственником. Без этого
  // нельзя гарантировать, что номер принадлежит владельцу объявления
  if (!application.contactConfirmedAt) {
    return {
      ok: false,
      error: 'Сначала подтвердите контакт с собственником — после этого ссылку можно выдать',
    }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + OWNER_MANAGE_TTL_MS).toISOString()

  // Гасим прежние активные ссылки на это объявление: активной остаётся
  // только последняя. Сбой гашения не должен мешать выдаче новой
  try {
    await payload.update({
      collection: 'owner-manage-links',
      where: { and: [{ boardAd: { equals: id } }, { revokedAt: { exists: false } }] },
      data: { revokedAt: now.toISOString() },
      overrideAccess: true,
    })
  } catch (error) {
    console.error('Ссылки управления: не удалось погасить прежние ссылки:', error)
  }

  const token = generateOwnerManageToken()
  const issuedBy = refId(opts.user?.id)
  try {
    await payload.create({
      collection: 'owner-manage-links',
      data: {
        tokenHash: hashOwnerManageToken(token),
        boardAd: id,
        ownerApplication: applicationId,
        issuedAt: now.toISOString(),
        expiresAt,
        ...(issuedBy ? { issuedBy } : {}),
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  return { ok: true, url: ownerManageLinkUrl(token, opts.origin), token, expiresAt, boardAdId: id }
}

export interface ResolvedOwnerManageLink {
  linkId: number
  boardAdId: number
  ownerApplicationId: number | null
  expiresAt: string
}

/**
 * Проверка ссылки: по токену находим запись, убеждаемся, что она не отозвана
 * и не истекла. Возвращаем только идентификаторы — данные объявления отдаёт
 * вызывающая сторона, чтобы наружу не ушло ничего лишнего.
 *
 * Наружу причина отказа не различается: и «нет токена», и «истёк», и «отозван»
 * — одна и та же формулировка, чтобы перебором нельзя было понять, существует
 * ли ссылка.
 */
export async function resolveOwnerManageLink(
  payload: Payload,
  token: string,
): Promise<ResolvedOwnerManageLink | null> {
  if (typeof token !== 'string' || !OWNER_MANAGE_TOKEN_RE.test(token)) return null

  let doc: Record<string, unknown> | null = null
  try {
    const res = await payload.find({
      collection: 'owner-manage-links',
      where: { tokenHash: { equals: hashOwnerManageToken(token) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    doc = (res.docs[0] as unknown as Record<string, unknown>) || null
  } catch {
    return null
  }
  if (!doc) return null

  // Ещё раз сверяем хеш постоянным временем: запись могла быть подменена
  if (!ownerManageTokenMatches(doc.tokenHash, token)) return null
  if (doc.revokedAt) return null
  if (ownerManageLinkExpired(doc.expiresAt)) return null

  const boardAdId = refId(doc.boardAd)
  if (boardAdId == null) return null

  return {
    linkId: Number(doc.id),
    boardAdId,
    ownerApplicationId: refId(doc.ownerApplication),
    expiresAt: String(doc.expiresAt),
  }
}

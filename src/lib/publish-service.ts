/**
 * «Публикация на площадки» — серверная обвязка модуля.
 *
 * Движок (реестр площадок, валидация, тексты) — src/lib/publishing.ts,
 * сетевые адаптеры VK/Telegram — src/lib/publish-adapters.ts. Здесь:
 *
 * 1. сборка «объекта публикации» из документа (плоский текст описания
 *    из lexical, абсолютные URL фотографий, контактный номер — общий номер
 *    сайта из настроек; личные данные собственника в объявления не входят);
 * 2. операции кнопок карточки CRM (маршрут /api/objects/publish-manage):
 *    публикация и снятие по выбранным площадкам;
 * 3. фоновые синхронизации из хуков Objects.ts: при изменении объекта
 *    автоматически обновляем опубликованные посты VK/Telegram; при снятии
 *    с продажи (status = archived) — снимаем объявления со всех площадок;
 *    при удалении объекта — снимаем то, что осталось.
 *
 * Группа publishing (items + log) пишется целиком, как placements-service
 * пишет placements: Payload при обновлении group заменяет её содержимое.
 * Журнал ограничен LOG_LIMIT последними записями.
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'
import {
  PUBLISH_PLATFORMS,
  isPublishablePlatform,
  materialChanged,
  photosChanged,
  publishFingerprint,
  publishPlatformBySlug,
  validateForPublish,
  type PublishLogEvent,
  type PublishObjectLike,
  type PublishStatus,
  type ValidationIssue,
} from './publishing'
import {
  telegramEditCaption,
  telegramPublish,
  telegramWithdraw,
  vkPublish,
  vkUpdate,
  vkWithdraw,
} from './publish-adapters'

export interface PubItem {
  platform?: string
  status?: PublishStatus
  remoteId?: string | null
  externalUrl?: string | null
  publishedAt?: string | null
  lastExportAt?: string | null
  lastError?: string | null
  lastFingerprint?: string | null
  /** id строки массива Payload */
  id?: number | string
}

export interface PubLogRow {
  at?: string
  event?: PublishLogEvent
  platform?: string
  message?: string
  by?: string
}

export interface PublishingGroup {
  items?: PubItem[] | null
  log?: PubLogRow[] | null
}

/** Сколько последних записей журнала храним */
const LOG_LIMIT = 200

const iso = (ms: number): string => new Date(ms).toISOString()
const nowIso = (): string => iso(Date.now())

const asGroup = (p: unknown): PublishingGroup => (p && typeof p === 'object' ? (p as PublishingGroup) : {})

const asItems = (g: PublishingGroup): PubItem[] => (Array.isArray(g.items) ? (g.items as PubItem[]) : [])

const asLog = (g: PublishingGroup): PubLogRow[] => (Array.isArray(g.log) ? (g.log as PubLogRow[]) : [])

/** Публичный адрес сайта (для ссылок на объект и фотографии) */
export const serverOrigin = (): string => String(process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')

const absUrl = (u?: string | null): string | null => {
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  const origin = serverOrigin()
  return origin ? `${origin}${u.startsWith('/') ? u : `/${u}`}` : null
}

// --- richText (lexical) → плоский текст -------------------------------------------

interface LexNode {
  type?: string
  text?: string
  children?: LexNode[]
  tag?: string
}

/** Рекурсивный обход lexical-дерева: текст с переносами по блокам */
const lexText = (nodes: LexNode[] | undefined): string[] => {
  const out: string[] = []
  const walk = (list: LexNode[], block: string[]): void => {
    for (const node of list) {
      if (!node) continue
      if (typeof node.text === 'string' && node.text) {
        block.push(node.text)
        continue
      }
      const kids = node.children || []
      if (node.type === 'linebreak') {
        block.push('\n')
      } else if (kids.length && (node.type === 'paragraph' || node.type === 'heading' || node.type === 'quote' || node.type === 'list')) {
        // Блок: текст его детей — отдельной строкой
        const inner: string[] = []
        walk(kids, inner)
        const line = inner.join('').replace(/\s+/g, ' ').trim()
        if (line) out.push(node.type === 'list' ? `- ${line}` : line)
      } else if (kids.length) {
        walk(kids, block)
      }
    }
  }
  walk(nodes || [], out)
  return out
}

/** richText-описание (lexical JSON) → плоский текст для объявления */
export const richTextToPlainText = (content: unknown): string =>
  lexText(((content as { root?: { children?: LexNode[] } } | null | undefined)?.root?.children) || [])
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

// --- Сборка «объекта публикации» ---------------------------------------------------

const docNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Собирает объект публикации из документа (depth 0) + подтянутых media и
 * агента. Контактный номер — общий номер сайта из настроек site-settings
 * (личные номера собственника и агентов в объявления не попадают).
 */
export async function toPublishObject(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<PublishObjectLike> {
  const id = docNumber(doc.id)
  const photoIds = [docNumber(doc.primaryImage), ...(Array.isArray(doc.images) ? doc.images.map(docNumber) : [])].filter(
    (x): x is number => x != null,
  )
  const uniqueIds = [...new Set(photoIds)]

  let photoDocs: { url?: string | null }[] = []
  if (uniqueIds.length) {
    const res = await payload.find({
      collection: 'media',
      where: { id: { in: uniqueIds } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    photoDocs = res.docs as unknown as { url?: string | null }[]
  }
  const byId = new Map(photoDocs.map((m) => [Number((m as unknown as { id?: unknown }).id), m]))
  const photos = uniqueIds
    .map((pid) => absUrl(byId.get(pid)?.url))
    .filter((u): u is string => !!u)

  let agentName: string | null = null
  const agentId = docNumber(doc.agent)
  if (agentId != null) {
    try {
      const agent = await payload.findByID({
        collection: 'agents',
        id: agentId,
        depth: 0,
        overrideAccess: true,
      })
      agentName = ((agent as unknown as { name?: string }).name || '').trim() || 'Агент Н15'
    } catch {
      agentName = 'Агент Н15' // профиль удалён — объект всё равно закреплён за сотрудником
    }
  }

  // Общий номер сайта: первый телефон из настроек, иначе запасной (тот же,
  // что в шапке и контактах сайта)
  let contactPhone = ''
  try {
    const settings = await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })
    const phones = ((settings as unknown as { phones?: { phone?: string }[] }).phones || [])
      .map((p) => (p.phone || '').trim())
      .filter(Boolean)
    contactPhone = phones[0] || ''
  } catch {
    contactPhone = ''
  }
  if (!contactPhone) contactPhone = '+7 (958) 116-15-15'

  const addr = ((doc.address || {}) as Record<string, unknown>) || {}
  const address: PublishObjectLike['address'] = {
    city: typeof addr.city === 'string' ? addr.city : null,
    locality: typeof addr.locality === 'string' ? addr.locality : null,
    street: typeof addr.street === 'string' ? addr.street : null,
    house: typeof addr.house === 'string' ? addr.house : null,
    apartment: typeof addr.apartment === 'string' ? addr.apartment : null,
    snt: typeof addr.snt === 'string' ? addr.snt : null,
  }

  const origin = serverOrigin()
  return {
    id: id != null ? id : doc.id as string,
    title: typeof doc.title === 'string' ? doc.title : '',
    type: typeof doc.type === 'string' ? doc.type : null,
    category: typeof doc.category === 'string' ? doc.category : null,
    price: docNumber(doc.price),
    area: docNumber(doc.area),
    areaUnit: typeof doc.areaUnit === 'string' ? doc.areaUnit : 'sqm',
    rooms: docNumber(doc.rooms),
    floor: docNumber(doc.floor),
    totalFloors: docNumber(doc.totalFloors),
    address,
    description: richTextToPlainText(doc.description),
    photos,
    contactPhone,
    agentName,
    isPremium: doc.isPremium === true,
    urgentSale: doc.urgentSale === true,
    objectUrl: origin && id != null ? `${origin}/ru/catalog/${id}` : null,
  }
}

// --- Ведение группы publishing ------------------------------------------------------

/** Запись в журнал: старые записи отбрасываются (лимит LOG_LIMIT) */
function appendLog(group: PublishingGroup, row: PubLogRow): PublishingGroup {
  const log = [...asLog(group), { ...row, at: row.at || nowIso() }]
  return { ...group, log: log.slice(-LOG_LIMIT) }
}

function findItem(group: PublishingGroup, platform: string): PubItem | undefined {
  return asItems(group).find((it) => it.platform === platform)
}

/** Обновление строки площадки в группе (создаёт при отсутствии) */
function setItem(group: PublishingGroup, patch: PubItem): PublishingGroup {
  const items = asItems(group)
  const idx = items.findIndex((it) => it.platform === patch.platform)
  if (idx >= 0) {
    const next = [...items]
    next[idx] = { ...next[idx], ...patch }
    return { ...group, items: next }
  }
  return { ...group, items: [...items, patch] }
}

/** Сохранение группы в БД (вызывается из хуков и маршрута) */
async function savePubGroup(payload: Payload, objectId: number | string, group: PublishingGroup): Promise<void> {
  await payload.update({
    collection: 'objects',
    id: objectId,
    data: { publishing: group },
    depth: 0,
    overrideAccess: true,
  })
}

// --- Операции кнопок карточки --------------------------------------------------------

export interface ManageResult {
  platform: string
  name: string
  ok: boolean
  status: PublishStatus
  externalUrl?: string | null
  lastExportAt?: string | null
  error?: string
}

export interface ManageOutcome {
  /** Незаполненные обязательные поля — публикация заблокирована (пусто = можно) */
  validation: ValidationIssue[]
  results: ManageResult[]
}

/**
 * Публикация объекта на выбранные площадки (кнопка «Опубликовать»).
 * Сначала общая проверка обязательных полей — при незаполненных полях
 * не публикуется ни одна площадка. «Сайт N15» публикуется сменой статуса
 * объекта; VK/Telegram — постами через официальные API.
 */
export async function publishObject(
  payload: Payload,
  objectId: number,
  platforms: string[],
  by: string,
): Promise<ManageOutcome> {
  const doc = await payload.findByID({
    collection: 'objects',
    id: objectId,
    depth: 0,
    overrideAccess: true,
  })
  const d = (doc || {}) as Record<string, unknown>
  const group: PublishingGroup = asGroup(d.publishing)
  const results: ManageResult[] = []

  if (!doc || d.status === 'archived') {
    // Маршрут уже проверил существование; защита от гонок со снятием с продажи
    return { validation: [], results: [] }
  }

  // Объект публикации собираем один раз на все площадки (CRM — источник данных)
  const obj = await toPublishObject(payload, d)
  const issues = validateForPublish(obj)
  if (issues.length) {
    const logGroup = appendLog(group, {
      event: 'validate',
      platform: platforms.join(', ') || undefined,
      message: `Публикация отклонена: не заполнены обязательные поля — ${issues.map((i) => i.label).join(', ')}`,
      by,
    })
    if (logGroup.log !== group.log) {
      await savePubGroup(payload, objectId, logGroup)
    }
    return { validation: issues, results: [] }
  }

  const fp = publishFingerprint(d)
  let next: PublishingGroup = group

  for (const slug of platforms) {
    const spec = publishPlatformBySlug(slug)
    const prev = findItem(next, slug)
    const name = spec?.name || slug
    const alreadyPublished = prev?.status === 'published'
    const remoteId = prev?.remoteId || null
    const base: PubItem = {
      platform: slug,
      publishedAt: prev?.publishedAt || null,
      remoteId: remoteId || undefined,
      externalUrl: prev?.externalUrl || null,
    }

    if (!spec || !isPublishablePlatform(spec)) {
      results.push({ platform: slug, name, ok: false, status: 'error', error: 'Площадка ещё не подключена к автоматической публикации' })
      continue
    }

    if (slug === 'site') {
      // Сайт N15 «публикуется» статусом объекта: каталог читает status=published
      if (d.status !== 'published') {
        await payload.update({
          collection: 'objects',
          id: objectId,
          data: { status: 'published' },
          depth: 0,
          overrideAccess: true,
        })
      }
      const at = nowIso()
      next = appendLog(
        setItem(next, { ...base, status: 'published', externalUrl: obj.objectUrl, lastExportAt: at, lastError: null }),
        { event: 'publish', platform: slug, message: 'Опубликовано на сайте N15', by },
      )
      results.push({ platform: slug, name, ok: true, status: 'published', externalUrl: obj.objectUrl, lastExportAt: at })
      continue
    }

    // VK / Telegram: новая публикация либо «обновить сейчас» для опубликованной
    let res: { ok: boolean; remoteId?: string; externalUrl?: string; error?: string }
    if (slug === 'vk') {
      res = alreadyPublished && remoteId ? await vkUpdate(remoteId, obj, true) : await vkPublish(obj)
    } else if (slug === 'telegram') {
      res = alreadyPublished && remoteId ? await tgReplacePost(remoteId, obj) : await telegramPublish(obj)
    } else {
      results.push({ platform: slug, name, ok: false, status: 'error', error: 'Неизвестная площадка' })
      continue
    }

    const at = nowIso()
    if (res.ok) {
      const firstTime = !prev || prev.status !== 'published'
      next = appendLog(
        setItem(next, {
          ...base,
          status: 'published',
          remoteId: res.remoteId || remoteId || undefined,
          externalUrl: res.externalUrl || prev?.externalUrl || null,
          publishedAt: firstTime ? at : prev?.publishedAt || null,
          lastExportAt: at,
          lastError: null,
          lastFingerprint: fp,
        }),
        {
          event: alreadyPublished ? 'update' : 'publish',
          platform: slug,
          message: alreadyPublished ? `Объявление обновлено (${name})` : `Опубликовано: ${name}`,
          by,
        },
      )
      results.push({
        platform: slug,
        name,
        ok: true,
        status: 'published',
        externalUrl: res.externalUrl || prev?.externalUrl || null,
        lastExportAt: at,
      })
    } else {
      // Ошибка: старые remoteId/externalUrl не затираем — объявление могло остаться
      next = appendLog(
        setItem(next, { ...base, status: 'error', lastError: res.error || 'Неизвестная ошибка площадки' }),
        { event: 'error', platform: slug, message: res.error || 'Неизвестная ошибка площадки', by },
      )
      results.push({ platform: slug, name, ok: false, status: 'error', error: res.error })
    }
  }

  await savePubGroup(payload, objectId, next)
  return { validation: [], results }
}

/**
 * Снятие объекта с выбранных площадок (кнопка «Снять с публикации»).
 * Сайту отправляется перевод в черновик, VK/Telegram — удаление объявления.
 */
export async function unpublishObject(
  payload: Payload,
  objectId: number,
  platforms: string[],
  by: string,
): Promise<ManageResult[]> {
  const doc = await payload.findByID({
    collection: 'objects',
    id: objectId,
    depth: 0,
    overrideAccess: true,
  })
  const d = (doc || {}) as Record<string, unknown>
  const group: PublishingGroup = asGroup(d.publishing)
  const results: ManageResult[] = []
  let next: PublishingGroup = group

  for (const slug of platforms) {
    const spec = publishPlatformBySlug(slug)
    const name = spec?.name || slug
    const item = findItem(next, slug)
    if (!spec || !isPublishablePlatform(spec)) {
      results.push({ platform: slug, name, ok: false, status: 'error', error: 'Площадка ещё не подключена к автоматической публикации' })
      continue
    }
    if (!item || item.status !== 'published') {
      // Нечего снимать — считаем успехом (состояние уже «снято»)
      if (item && item.status !== 'published') {
        results.push({ platform: slug, name, ok: true, status: item.status || 'removed' })
      } else {
        results.push({ platform: slug, name, ok: true, status: 'removed' })
      }
      continue
    }

    if (slug === 'site') {
      // Снятие с сайта = перевод в черновик (не архив: объект остаётся в работе CRM).
      // Если объект уже в архиве — он и так снят с продажи, статус не меняем.
      if (d.status === 'published') {
        await payload.update({
          collection: 'objects',
          id: objectId,
          data: { status: 'draft' },
          depth: 0,
          overrideAccess: true,
        })
      }
      const at = nowIso()
      next = appendLog(
        setItem(next, { platform: slug, status: 'removed', lastExportAt: at, lastError: null }),
        { event: 'unpublish', platform: slug, message: 'Снято с сайта N15 (объект — в черновике)', by },
      )
      results.push({ platform: slug, name, ok: true, status: 'removed', lastExportAt: at })
      continue
    }

    // VK / Telegram — удаляем объявление на площадке
    const remoteId = item.remoteId
    const res = remoteId
      ? slug === 'vk'
        ? await vkWithdraw(remoteId)
        : await telegramWithdraw(remoteId)
      : { ok: false, error: `Нет id объявления на площадке (${name}) — снимите вручную` }

    const at = nowIso()
    if (res.ok) {
      next = appendLog(
        setItem(next, { platform: slug, status: 'removed', lastExportAt: at, lastError: null }),
        { event: 'unpublish', platform: slug, message: `Снято с публикации: ${name}`, by },
      )
      results.push({ platform: slug, name, ok: true, status: 'removed', lastExportAt: at })
    } else {
      next = appendLog(
        setItem(next, { platform: slug, status: 'error', lastError: res.error || 'Не удалось снять объявление' }),
        { event: 'error', platform: slug, message: res.error || 'Не удалось снять объявление', by },
      )
      results.push({ platform: slug, name, ok: false, status: 'error', error: res.error })
    }
  }

  await savePubGroup(payload, objectId, next)
  return results
}

/** Замена сообщения Telegram: удалить старое и опубликовать новое */
async function tgReplacePost(remoteId: string | null, obj: PublishObjectLike): Promise<{ ok: boolean; remoteId?: string; externalUrl?: string; error?: string }> {
  if (remoteId) {
    // Удалённое вручную сообщение deleteMessage не найдёт — это не мешает публикации
    await telegramWithdraw(remoteId).catch(() => undefined)
  }
  return telegramPublish(obj)
}

// --- Авто-синхронизация после изменения объекта --------------------------------------

/**
 * Фоновое обновление опубликованных постов: прошёл afterChange с реальным
 * изменением объекта — обновляем VK/Telegram, у которых статус published,
 * а отпечаток выгрузки отличается от текущего (lastFingerprint). Сайт N15
 * обновлять не нужно: он читает документ напрямую.
 */
async function syncPublished(payload: Payload, objectId: number, prevDoc: Record<string, unknown>): Promise<void> {
  try {
    const doc = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) return
    const d = doc as unknown as Record<string, unknown>
    if (d.status === 'archived') return
    const group: PublishingGroup = asGroup(d.publishing)
    const targets = asItems(group).filter((it) => it.status === 'published' && (it.platform === 'vk' || it.platform === 'telegram'))
    if (!targets.length) return

    const fp = publishFingerprint(d)
    const todo = targets.filter((it) => it.lastFingerprint !== fp)
    if (!todo.length) return

    // Объект публикации собираем один раз (фото/описание для всех площадок)
    const obj = await toPublishObject(payload, d)
    const photoChanged = photosChanged(prevDoc, d)
    let next: PublishingGroup = group

    for (const item of todo) {
      const slug = item.platform as 'vk' | 'telegram'
      const remoteId = item.remoteId
      if (!remoteId) {
        // Объявление есть, а его id мы не знаем — обновить нельзя, помечаем
        next = appendLog(
          setItem(next, { platform: slug, status: 'error', lastError: 'Нет id объявления — обновите вручную кнопкой «Опубликовать»' }),
          { event: 'error', platform: slug, message: 'Авто-обновление невозможно: не сохранён id объявления', by: 'CRM' },
        )
        continue
      }
      const res =
        slug === 'vk'
          ? await vkUpdate(remoteId, obj, photoChanged)
          : photoChanged
            ? await tgReplacePost(remoteId, obj)
            : await telegramEditCaption(remoteId, obj)

      const at = nowIso()
      if (res.ok) {
        next = appendLog(
          setItem(next, {
            platform: slug,
            remoteId: res.remoteId || remoteId,
            externalUrl: res.externalUrl || item.externalUrl || null,
            lastExportAt: at,
            lastError: null,
            lastFingerprint: fp,
          }),
          { event: 'update', platform: slug, message: 'Объект изменён — объявление обновлено автоматически', by: 'CRM' },
        )
      } else {
        next = appendLog(
          setItem(next, { platform: slug, status: 'error', lastError: res.error || 'Не удалось обновить объявление' }),
          { event: 'error', platform: slug, message: res.error || 'Не удалось обновить объявление', by: 'CRM' },
        )
      }
    }

    await savePubGroup(payload, objectId, next)
  } catch (e) {
    console.error(`Publish sync error for object ${objectId}:`, e)
  }
}

/**
 * Снятие всех опубликованных объявлений — при переводе объекта в архив
 * («снят с продажи») и при удалении объекта. Сайт N15 дополнительных
 * действий не требует: archived не показывается в каталоге.
 */
async function withdrawAll(payload: Payload, objectId: number, by = 'CRM'): Promise<void> {
  try {
    const doc = await payload.findByID({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) return
    const d = doc as unknown as Record<string, unknown>
    const group: PublishingGroup = asGroup(d.publishing)
    const published = asItems(group).filter((it) => it.status === 'published')
    if (!published.length) return

    let next: PublishingGroup = group
    for (const item of published) {
      const slug = item.platform || ''
      const name = publishPlatformBySlug(slug)?.name || slug
      if (slug === 'site') {
        // Объект уже в архиве — сайт его не показывает; строку просто гасим
        next = appendLog(
          setItem(next, { platform: slug, status: 'removed' }),
          { event: 'withdraw', platform: slug, message: 'Объект снят с продажи — снят с сайта N15', by },
        )
        continue
      }
      const remoteId = item.remoteId
      const res = remoteId
        ? slug === 'vk'
          ? await vkWithdraw(remoteId)
          : await telegramWithdraw(remoteId)
        : { ok: false, error: `Нет id объявления (${name}) — снимите вручную` }
      if (res.ok) {
        next = appendLog(
          setItem(next, { platform: slug, status: 'removed' }),
          { event: 'withdraw', platform: slug, message: `Объект снят с продажи — объявление снято (${name})`, by },
        )
      } else {
        next = appendLog(
          setItem(next, { platform: slug, status: 'error', lastError: res.error || 'Не удалось снять объявление' }),
          { event: 'error', platform: slug, message: `Объект снят с продажи, но объявление снять не удалось (${name}): ${res.error || ''}`, by },
        )
      }
    }
    await savePubGroup(payload, objectId, next)
  } catch (e) {
    console.error(`Publish withdraw error for object ${objectId}:`, e)
  }
}

/** Фоновая задача не должна ронять запрос сохранения объекта */
const schedule = (fn: () => Promise<void>): void => {
  setTimeout(() => {
    void fn()
  }, 0)
}

/**
 * Хук Objects.ts afterChange: авто-обновление публикаций и авто-снятие
 * при архивации. Реагируем только на изменение «материальных» полей или
 * статуса (наши собственные записи publishing в цикл не попадают).
 */
export const objectsAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  try {
    if (operation === 'create') return doc
    const d = doc as unknown as Record<string, unknown>
    const prev = (previousDoc || {}) as Record<string, unknown>
    const archiving = prev.status !== 'archived' && d.status === 'archived'
    if (!archiving && !materialChanged(prev, d)) return doc
    const id = typeof d.id === 'number' ? d.id : Number(d.id)
    if (!Number.isFinite(id)) return doc
    if (archiving) {
      // Снятие с продажи: команда снятия уходит на все опубликованные площадки
      schedule(() => withdrawAll(req.payload, id, 'CRM'))
    } else if (d.status !== 'archived') {
      schedule(() => syncPublished(req.payload, id, prev))
    }
  } catch (e) {
    console.error('Objects afterChange (publishing):', e)
  }
  return doc
}

/**
 * Хук Objects.ts afterDelete: снимаем объявления площадок, если объект
 * удалён (документа больше нет — журнал вести некуда, только сама команда).
 */
export const objectsAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  try {
    const d = doc as unknown as Record<string, unknown>
    const id = typeof d.id === 'number' ? d.id : Number(d.id)
    if (!Number.isFinite(id)) return doc
    const group = asGroup(d.publishing)
    const published = asItems(group).filter((it) => it.status === 'published')
    // Документа больше нет — журнал вести некуда: выполняем только команды снятия
    void (async () => {
      for (const item of published) {
        const remoteId = item.remoteId
        if (!remoteId) continue
        try {
          if (item.platform === 'vk') await vkWithdraw(remoteId)
          else if (item.platform === 'telegram') await telegramWithdraw(remoteId)
        } catch (e) {
          console.error(`Publish withdraw on delete ${id}:`, e)
        }
      }
    })()
  } catch (e) {
    console.error('Objects afterDelete (publishing):', e)
  }
  return doc
}

// --- Для карточки CRM ------------------------------------------------------------------

export interface PubSummaryItem {
  platform: string
  name: string
  status: PublishStatus
  /** Площадка доступна для автоматической публикации (иначе — причина в note) */
  available: boolean
  /** Причина недоступности/необходимые ключи (для подписи в карточке) */
  note: string
  /** Ключи окружения настроены (vk/telegram) */
  configured: boolean
  kind: string
  remoteId?: string | null
  externalUrl?: string | null
  publishedAt?: string | null
  lastExportAt?: string | null
  lastError?: string | null
}

/** Сводка для блока «Публикация» карточки CRM: реестр площадок + статусы */
export function publishingSummary(group: PublishingGroup | null | undefined): PubSummaryItem[] {
  const g = group || {}
  const items = asItems(g)
  return PUBLISH_PLATFORMS.map((spec) => {
    const item = items.find((it) => it.platform === spec.slug)
    const available = isPublishablePlatform(spec)
    const configured = available ? (spec.env ? spec.env.every((k) => process.env[k] && String(process.env[k]).trim()) : true) : false
    return {
      platform: spec.slug,
      name: spec.name,
      status: item?.status || 'off',
      available,
      note: spec.note,
      configured,
      kind: spec.kind,
      remoteId: item?.remoteId || null,
      externalUrl: item?.externalUrl || null,
      publishedAt: item?.publishedAt || null,
      lastExportAt: item?.lastExportAt || null,
      lastError: item?.lastError || null,
    }
  })
}

/** Журнал публикаций (новые записи первыми — для карточки) */
export function publishingLog(group: PublishingGroup | null | undefined): PubLogRow[] {
  return asLog(group || {}).slice().reverse()
}

/**
 * События и карточки посетителей сайта — данные для разделов CRM
 * «Аналитика → Посетители» и «Интерес к объектам».
 *
 * Чем это отличается от счётчика визитов (src/lib/site-stats.ts): счётчик
 * отвечает на вопрос «сколько людей и страниц», а здесь — «что именно человек
 * делал»: какие объекты открывал, какие фильтры применял, что добавил в
 * избранное, куда нажимал позвонить, отправлял ли заявку.
 *
 * Персональных данных здесь нет и не появляется:
 * — посетитель опознаётся необратимым хешем IP и браузера (соль — месяц,
 *   см. visitorHash в site-stats), сам IP и User-Agent не сохраняются;
 * — скрытой деанонимизации нет: имя, телефон и почта появляются в карточке
 *   только тогда, когда человек сам оставил их в форме (тогда заявка
 *   привязывается к карточке посетителя, см. Applications.ts);
 * — регион берётся только из заголовков прокси и CDN, по IP он не
 *   вычисляется: для этого нужен внешний сервис, а IP в базу не попадает.
 *
 * Записи создаёт и обновляет только сервер: маячок /api/visit (Local API с
 * overrideAccess) и хуки коллекций. Снаружи через REST коллекции visitors и
 * visitor-events не пишутся, читает их только администратор.
 */
import type { Payload } from 'payload'
import { clientIp } from './rate-limit'
import { isBot, visitorHash } from './site-stats'
import { HOUSE_TYPES, OBJECT_CATEGORIES } from './object-categories'
import { COMMERCIAL_TYPES } from './commercial-types'

/** Виды событий — те же значения, что в options коллекции visitor-events */
export const VISITOR_EVENT_KINDS = [
  'object_view',
  'filter_use',
  'favorite_add',
  'favorite_remove',
  'call_click',
  'whatsapp_click',
  'write_click',
  'lead_submit',
  'board_started',
  'board_published',
] as const

export type VisitorEventKind = (typeof VISITOR_EVENT_KINDS)[number]

/** Человекочитаемые названия событий для отчётов в CRM */
export const VISITOR_EVENT_LABELS: Record<string, string> = {
  object_view: 'Открыл карточку объекта',
  filter_use: 'Применил фильтр каталога',
  favorite_add: 'Добавил в избранное',
  favorite_remove: 'Убрал из избранного',
  call_click: 'Нажал «Позвонить»',
  whatsapp_click: 'Нажал WhatsApp',
  write_click: 'Нажал «Написать»',
  lead_submit: 'Отправил заявку',
  board_started: 'Начал подачу объявления',
  board_published: 'Отправил объявление на доску',
}

/**
 * События, которые разрешено присылать из браузера (маячок /api/visit).
 * Остальные ставит сервер: открытие объекта — по адресу страницы, заявка и
 * публикация объявления — в хуках коллекций. Так снаружи нельзя подделать
 * ни обращение, ни публикацию.
 */
export const CLIENT_EVENT_KINDS: readonly VisitorEventKind[] = [
  'favorite_add',
  'favorite_remove',
  'call_click',
  'whatsapp_click',
  'write_click',
  'board_started',
]

/** Срок хранения событий и карточек посетителей: старее — удаляем */
export const VISITOR_RETENTION_DAYS = 400

/** Заголовки, в которых регион сообщает прокси или CDN (если он их ставит) */
const REGION_HEADERS = ['cf-region', 'cf-ipcountry', 'x-vercel-ip-country', 'x-vercel-ip-city', 'x-geo-region']

/**
 * Приблизительный регион посетителя: только заголовок прокси или CDN.
 * Ничего не додумываем и не ищем по IP — если прокси регион не сообщает,
 * в отчёте будет «не определён».
 */
export function regionFromHeaders(headers: Headers): string | null {
  for (const name of REGION_HEADERS) {
    const value = (headers.get(name) || '').trim()
    if (value) return value.slice(0, 60)
  }
  return null
}

/** Подписи параметров фильтра каталога — для понятной записи «чем фильтровал» */
const FILTER_PARAM_LABELS: Record<string, string> = {
  category: 'Тип',
  house_type: 'Тип дома',
  commercial_type: 'Тип коммерции',
  type: 'Сделка',
  rooms: 'Комнаты',
  district: 'Район',
  cityDistrict: 'Район города',
  locality: 'Населённый пункт',
  city: 'Город',
  city_region: 'Регион',
  floor_min: 'Этаж от',
  floor_max: 'Этаж до',
  floors_min: 'Этажность от',
  floors_max: 'Этажность до',
  building: 'Материал дома',
  heating: 'Отопление',
  parking: 'Парковка',
  purchase: 'Вариант покупки',
  street: 'Улица',
  cadastral: 'Кадастровый номер',
}

/** Значения параметров, у которых есть короткая подпись (остальные — как есть) */
function filterValueLabel(param: string, value: string): string {
  if (param === 'category') return OBJECT_CATEGORIES.find((c) => c.value === value)?.label || value
  if (param === 'house_type') return HOUSE_TYPES.find((h) => h.value === value)?.label || value
  if (param === 'commercial_type') return COMMERCIAL_TYPES.find((c) => c.value === value)?.label || value
  if (param === 'type') return value === 'rent' ? 'Аренда' : value === 'sale' ? 'Покупка' : value
  if (param === 'rooms') return value === '4' ? '4+ комнат' : `${value} комн.`
  if (param === 'district' || param === 'cityDistrict') return value
  if (param === 'purchase') return value.split(',').length > 1 ? `${value.split(',').length} варианта` : value
  return value
}

/** Сумма в рублях по-русски: «5 000 000 ₽» */
function money(value: string): string {
  const n = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('ru-RU')} ₽` : value
}

/**
 * Понятная запись фильтров каталога из строки запроса: «Каталог: Тип — Квартира,
 * Комнаты — 2 комн., цена до 5 000 000 ₽». null — фильтров в адресе нет (или
 * страница не каталог): записывать нечего.
 */
export function filterLabel(path: string, search: string): string | null {
  // Каталог — единственная страница с фильтрами; остальные адреса не трогаем
  if (!/^\/[a-z]{2}\/catalog\/?$/.test(path)) return null
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const parts: string[] = []

  const category = params.get('category')
  if (category) parts.push(`Тип — ${filterValueLabel('category', category)}`)
  for (const [param, label] of Object.entries(FILTER_PARAM_LABELS)) {
    if (param === 'category') continue
    const value = params.get(param)
    if (!value) continue
    parts.push(`${label} — ${filterValueLabel(param, value)}`)
  }

  const priceMin = params.get('price_min')
  const priceMax = params.get('price_max')
  if (priceMin) parts.push(`цена от ${money(priceMin)}`)
  if (priceMax) parts.push(`цена до ${money(priceMax)}`)

  const areaMin = params.get('area_min')
  const areaMax = params.get('area_max')
  if (areaMin) parts.push(`площадь от ${areaMin}`)
  if (areaMax) parts.push(`площадь до ${areaMax}`)

  const q = (params.get('q') || '').trim()
  if (q) parts.push(`поиск: «${q.slice(0, 60)}»`)

  if (!parts.length) return null
  return `Каталог: ${parts.join(', ')}`.slice(0, 300)
}

/** Что известно о посетителе при обращении к счётчику */
export interface VisitorTouchInput {
  /** Обезличенный идентификатор (visitorHash) */
  visitor: string
  device: 'desktop' | 'mobile' | 'tablet'
  source: 'direct' | 'search' | 'social' | 'referral'
  /** Домен внешнего перехода — только для первого визита */
  referrer?: string | null
  /** Регион из заголовков прокси или CDN */
  region?: string | null
  /** Страница, на которой посетитель сейчас */
  path: string
  /** Начался новый визит: визит = серия просмотров с перерывом меньше 30 минут */
  newVisit?: boolean
}

interface VisitorDoc {
  id: number
  number?: number | null
  visitsCount?: number | null
  pageviewsCount?: number | null
}

/**
 * Обновить карточку посетителя: продлить последний визит, добавить просмотр,
 * при первом заходе — завести карточку с номером для подписи «Посетитель #N».
 * Ошибки глушим: статистика не должна ломать просмотр страницы.
 */
export async function touchVisitor(payload: Payload, input: VisitorTouchInput): Promise<void> {
  try {
    const now = new Date().toISOString()
    const found = await payload.find({
      collection: 'visitors',
      where: { visitor: { equals: input.visitor } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = found.docs[0] as unknown as VisitorDoc | undefined

    if (doc) {
      // Карточка уже есть: считаем визиты и просмотры, обновляем последнюю
      // активность. Источник, устройство и регион первого захода не трогаем —
      // они описывают знакомство, а не последний визит.
      await payload.update({
        collection: 'visitors',
        id: doc.id,
        data: {
          lastSeenAt: now,
          lastPath: input.path,
          visitsCount: (doc.visitsCount || 0) + (input.newVisit ? 1 : 0),
          pageviewsCount: (doc.pageviewsCount || 0) + 1,
        },
        overrideAccess: true,
      })
      return
    }

    // Номер карточки — сквозной: по нему посетитель подписан в отчётах
    // («Посетитель #184»). Одновременные первые заходы двух людей могут дать
    // один номер — карточки от этого не путаются: их различает хеш.
    const number = await nextVisitorNumber(payload)
    await payload.create({
      collection: 'visitors',
      data: {
        number,
        title: visitorTitle(number),
        visitor: input.visitor,
        firstSeenAt: now,
        lastSeenAt: now,
        lastPath: input.path,
        visitsCount: 1,
        pageviewsCount: 1,
        device: input.device,
        source: input.source,
        referrer: input.referrer || undefined,
        region: input.region || undefined,
      },
      overrideAccess: true,
    })
  } catch (e) {
    console.error('[visitors] не удалось обновить карточку посетителя:', e)
  }
}

/** Подпись посетителя в отчётах: «Посетитель #184» */
export function visitorTitle(number: number | null | undefined): string {
  return `Посетитель #${number || 0}`
}

/** Следующий номер карточки: сквозная нумерация по возрастанию */
async function nextVisitorNumber(payload: Payload): Promise<number> {
  try {
    const last = await payload.find({
      collection: 'visitors',
      sort: '-number',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { number: true },
    })
    const doc = last.docs[0] as unknown as VisitorDoc | undefined
    return Number(doc?.number || 0) + 1
  } catch {
    return 1
  }
}

/** Повторные события того же вида за пару секунд — двойной маячок, не считаем */
const recentEvents = new Map<string, number>()
const DOUBLE_EVENT_MS = 3_000

export interface VisitorEventInput {
  visitor: string
  kind: VisitorEventKind
  path?: string | null
  objectId?: number | null
  detail?: string | null
}

/**
 * Записать событие посетителя. Ошибки глушим: как и счётчик визитов,
 * события не важнее самой страницы.
 */
export async function trackVisitorEvent(payload: Payload, input: VisitorEventInput): Promise<void> {
  try {
    const key = `${input.visitor}|${input.kind}|${input.objectId || ''}|${input.detail || ''}`
    const now = Date.now()
    if (recentEvents.size > 5_000) recentEvents.clear()
    const last = recentEvents.get(key)
    recentEvents.set(key, now)
    if (last != null && now - last < DOUBLE_EVENT_MS) return

    await payload.create({
      collection: 'visitor-events',
      data: {
        visitor: input.visitor,
        kind: input.kind,
        path: input.path || undefined,
        objectId: typeof input.objectId === 'number' && input.objectId > 0 ? input.objectId : undefined,
        detail: input.detail ? input.detail.slice(0, 300) : undefined,
      },
      overrideAccess: true,
    })
  } catch (e) {
    console.error('[visitors] не удалось записать событие:', e)
  }
}

/** Названия типов заявок для записи в событиях — как в коллекции applications */
const LEAD_TYPE_LABELS: Record<string, string> = {
  viewing: 'Просмотр',
  callback: 'Обратный звонок',
  mortgage: 'Ипотека',
  consultation: 'Консультация',
  valuation: 'Оценка объекта',
  sale: 'Продажа объекта',
  selection: 'Подбор недвижимости',
  search: 'Заявка на поиск',
  installment: 'Рассрочка',
}

export interface ApplicationLinkInput {
  applicationId: number
  /** Тип заявки — для понятной записи «Отправил заявку: Просмотр» */
  type?: string | null
  /** Заголовки запроса, которым пришла форма: по ним считается тот же хеш */
  headers: Headers
  /** Автор заявки — если форма отправлена из личного кабинета */
  userId?: number | null
}

/**
 * Связать отправленную форму с карточкой посетителя.
 *
 * Связь ставится по тому же обезличенному хешу, что и визиты: заявка приходит
 * из того же браузера, что и просмотры, поэтому хеш в момент отправки
 * совпадает с хешем визитов — клиент ничего не присылает и подделать связь не
 * может. Карточка помечается «оставил обращение», и в CRM у обращения
 * появляется блок «Активность на сайте» (см. src/app/crm/messages).
 *
 * Деанонимизации здесь нет: имя, телефон и почта остаются в заявке, в карточке
 * посетителя хранится только ссылка на неё. Пропуски не считаем ошибкой —
 * например, если маячок не дошёл и карточки ещё нет.
 */
export async function linkApplicationToVisitor(payload: Payload, input: ApplicationLinkInput): Promise<void> {
  try {
    const ua = input.headers.get('user-agent')
    if (isBot(ua)) return
    const visitor = visitorHash(clientIp(input.headers), ua as string)

    const found = await payload.find({
      collection: 'visitors',
      where: { visitor: { equals: visitor } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = found.docs[0] as unknown as
      | { id: number; applications?: (number | { id: number })[] | null }
      | undefined
    if (!doc) return

    const applications = (doc.applications || []).map((a) => (typeof a === 'object' && a ? a.id : a))
    if (!applications.includes(input.applicationId)) applications.push(input.applicationId)

    await payload.update({
      collection: 'visitors',
      id: doc.id,
      data: {
        identified: true,
        applications,
        ...(input.userId ? { user: input.userId } : {}),
      },
      overrideAccess: true,
    })

    const label = LEAD_TYPE_LABELS[String(input.type || '')] || 'Заявка'
    await trackVisitorEvent(payload, {
      visitor,
      kind: 'lead_submit',
      detail: `${label} №${input.applicationId}`,
    })
  } catch (e) {
    console.error('[visitors] не удалось связать заявку с посетителем:', e)
  }
}

export interface BoardPublishedInput {
  headers: Headers
  /** Автор объявления: он вошёл в аккаунт, поэтому карточка связывается с ним */
  userId: number
  adId: number
}

/**
 * Отметить завершение размещения объявления: событие «опубликовал» и связь
 * карточки посетителя с аккаунтом автора. Начало подачи ставит маячок со
 * страницы /board/new (см. SiteVisitTracker) — вместе они показывают, сколько
 * людей дошли до конца формы, а сколько бросили её.
 */
export async function noteBoardPublished(payload: Payload, input: BoardPublishedInput): Promise<void> {
  try {
    const ua = input.headers.get('user-agent')
    if (isBot(ua)) return
    const visitor = visitorHash(clientIp(input.headers), ua as string)

    const found = await payload.find({
      collection: 'visitors',
      where: { visitor: { equals: visitor } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = found.docs[0] as unknown as { id: number } | undefined
    if (doc) {
      await payload.update({
        collection: 'visitors',
        id: doc.id,
        data: { identified: true, user: input.userId },
        overrideAccess: true,
      })
    }

    await trackVisitorEvent(payload, {
      visitor,
      kind: 'board_published',
      detail: `Объявление №${input.adId}`,
    })
  } catch (e) {
    console.error('[visitors] не удалось отметить публикацию объявления:', e)
  }
}

/** Когда последний раз чистили старые события и карточки (не чаще раза в сутки) */
let lastPrune = 0

/**
 * Удаление событий и карточек посетителей старше срока хранения. Запускается
 * вместе с чисткой визитов (см. trackPageview), ошибки глушим: чистка не
 * важнее самого хита. Карточки, на которые ссылаются обращения, не удаляем —
 * три года хранения заявок важнее (см. политику обработки персональных данных).
 */
export async function pruneVisitorData(payload: Payload): Promise<void> {
  const now = Date.now()
  if (now - lastPrune < 24 * 60 * 60 * 1000) return
  lastPrune = now
  try {
    const before = new Date(now - VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await payload.delete({
      collection: 'visitor-events',
      where: { createdAt: { less_than: before } },
      overrideAccess: true,
    })
    await payload.delete({
      collection: 'visitors',
      where: {
        and: [{ lastSeenAt: { less_than: before } }, { identified: { not_equals: true } }],
      },
      overrideAccess: true,
    })
  } catch (e) {
    console.error('[visitors] не удалось удалить старые данные посетителей:', e)
  }
}

/**
 * «Заявки собственников» — заявка на продажу или сдачу объекта от владельца,
 * пришедшая с сайта, по телефону или через сотрудника (см. коллекцию
 * owner-applications и форму на странице /sell).
 *
 * Заявка живёт отдельно от каталога и до проверки в публичную часть не
 * попадает вовсе: объекта в базе объектов нет, пока администратор не одобрит
 * заявку и не создаст карточку (черновиком). Телефон собственника
 * подтверждается кодом в SMS, а если отправка кода недоступна — вручную
 * администратором: без подтверждённого номера заявка не идёт дальше проверки.
 *
 * Здесь собрано общее для всех, кто работает с заявками: статусы и их
 * порядок, источники заявки, поиск пересечений с объектами базы (по телефону,
 * кадастровому номеру, адресу и совпадению характеристик с фотографиями) и
 * сборка черновика объекта из одобренной заявки.
 */
import type { Payload, Where } from 'payload'

import { formatRuPhone } from './phone'
import { cleanCadastral } from './cadastral'
// Признаки пересечения и их нормализация — тот же движок, что у проверки
// дублей в карточке объекта (см. src/lib/object-duplicates.ts)
import {
  duplicateMatches,
  duplicateStrength,
  normDuplicateCadastral,
  normDuplicatePhone,
  normalizeSignals,
  type DuplicateAddress,
} from './object-duplicates'
// Степень совпадения характеристик и фотографий — тот же движок, что у сверки
// с объявлениями площадок (см. src/lib/listing-check.ts)
import { MATCH_PARAM_LABELS, listingMatch, type ObjectLike } from './listing-check'
// Описание объекта — richText: для сравнения уходит плоским текстом тем же
// преобразователем, что у выгрузок на площадки (см. publish-service)
import { richTextToPlainText } from './publish-service'

/** Статусы заявки — в порядке прохождения: путь собственника от заявки до публикации */
export const OWNER_APPLICATION_STATUSES = [
  { value: 'new', label: 'Новая' },
  { value: 'phone_confirmed', label: 'Телефон подтверждён' },
  { value: 'checking', label: 'На проверке' },
  { value: 'owner_confirmed', label: 'Подтверждён собственник' },
  { value: 'approved', label: 'Одобрено' },
  { value: 'published', label: 'Опубликовано' },
  { value: 'rejected', label: 'Отклонено' },
  { value: 'duplicate', label: 'Дубль' },
] as const

export type OwnerApplicationStatus = (typeof OWNER_APPLICATION_STATUSES)[number]['value']

/** Подпись статуса для CRM и писем; неизвестное значение показываем как есть */
export const ownerStatusLabel = (value?: string | null): string =>
  OWNER_APPLICATION_STATUSES.find((s) => s.value === value)?.label || value || '—'

/** Статусы, в которых заявка ещё в работе (не закрыта отказом или дублем) */
export const isOpenOwnerStatus = (value?: string | null): boolean =>
  value !== 'rejected' && value !== 'duplicate'

/** Источник заявки: откуда владелец к нам пришёл (виден администратору) */
export const OWNER_APPLICATION_SOURCES = [
  { value: 'site', label: 'Форма на сайте' },
  { value: 'phone', label: 'Звонок в агентство' },
  { value: 'messenger', label: 'Мессенджер' },
  { value: 'office', label: 'Визит в офис' },
  { value: 'partner', label: 'Партнёр' },
  { value: 'other', label: 'Другое' },
] as const

/** Подпись источника заявки; неизвестное значение показываем как есть */
export const ownerSourceLabel = (value?: string | null): string =>
  OWNER_APPLICATION_SOURCES.find((s) => s.value === value)?.label || value || '—'

/** Способ подтверждения телефона: код из SMS или отметка администратора */
export const OWNER_CONFIRM_METHODS = [
  { value: 'code', label: 'Код из SMS' },
  { value: 'admin', label: 'Подтвердил администратор' },
] as const

/** Черновик объекта для формы: только те поля, что есть в заявке */
export interface OwnerApplicationLike {
  id?: number
  ownerName?: string | null
  ownerPhone?: string | null
  cadastralNumber?: string | null
  type?: string | null
  category?: string | null
  price?: number | null
  area?: number | null
  areaUnit?: string | null
  plotArea?: number | null
  plotAreaUnit?: string | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  address?: DuplicateAddress | null
  description?: string | null
  photos?: { file?: unknown }[] | null
  /** Уже связанный объект базы (созданный из заявки или выбранный как дубль) */
  object?: number | { id?: number } | null
}

/** Идентификатор связанного объекта, если он есть */
export const linkedObjectId = (app: OwnerApplicationLike): number | null => {
  const value = app.object
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id
  return null
}

/** Нормализованные признаки заявки — для поиска пересечений (те же, что у дублей) */
export function ownerSignals(app: OwnerApplicationLike) {
  return normalizeSignals(
    {
      ownerName: app.ownerName || undefined,
      ownerPhone: app.ownerPhone || undefined,
      cadastralNumber: app.cadastralNumber || undefined,
      address: app.address || null,
    },
    true,
  )
}

/** Найденное пересечение заявки с объектом базы — карточка для CRM */
export interface OwnerDuplicate {
  objectId: number
  slug: string | null
  title: string
  status: string | null
  price: number | null
  address: string
  agentName: string | null
  /** Совпавшие жёсткие признаки: телефон, кадастровый, адрес, имя */
  signals: string[]
  /** Совпадение характеристик и фотографий, 0..100 (движок площадок) */
  score: number
  matched: string[]
  strength: 'strong' | 'weak'
}

const HARD_SIGNAL_LABELS: Record<string, string> = {
  phone: 'телефон',
  cadastral: 'кадастровый номер',
  address: 'адрес',
  name: 'имя собственника',
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const addressLine = (a: DuplicateAddress | null | undefined): string =>
  [a?.city, a?.locality, a?.snt, a?.street, a?.house].map(text).filter(Boolean).join(', ')

/** Фотографии заявки для сравнения: имена файлов из закрытого хранилища */
const photoNames = (app: OwnerApplicationLike): string[] =>
  (app.photos || [])
    .map((p) => {
      const file = p?.file
      if (file && typeof file === 'object') return text((file as { filename?: unknown }).filename)
      return ''
    })
    .filter(Boolean)

/** Адрес заявки для движка сравнения: значения-«пусто» приводим к undefined */
const listingAddress = (a: DuplicateAddress | null | undefined): ObjectLike['address'] => {
  if (!a) return null
  const out = {
    city: a.city ?? undefined,
    locality: a.locality ?? undefined,
    street: a.street ?? undefined,
    house: a.house ?? undefined,
    apartment: a.apartment ?? undefined,
  }
  return Object.values(out).some(Boolean) ? out : null
}

/** Документ объекта → данные для сравнения характеристик (движок площадок) */
function objectLike(doc: Record<string, unknown>): ObjectLike {
  // Фотографии сравниваются по именам файлов (движок площадок): у объекта
  // это media (depth 1), у заявки — закрытое хранилище заявок
  const photos = [...(Array.isArray(doc.images) ? doc.images : []), doc.primaryImage]
    .map((img) => (img && typeof img === 'object' ? text((img as { filename?: unknown }).filename) : ''))
    .filter(Boolean)
  return {
    address: listingAddress(doc.address as DuplicateAddress | null),
    cadastralNumber: text(doc.cadastralNumber) || null,
    price: num(doc.price),
    area: num(doc.area),
    rooms: num(doc.rooms),
    floor: num(doc.floor),
    totalFloors: num(doc.totalFloors),
    photos,
    description: richTextToPlainText(doc.description),
  }
}

/**
 * Пересечения заявки с объектами базы: телефон, кадастровый номер, адрес —
 * жёсткие признаки, характеристики и фотографии — степень совпадения по
 * движку площадок (цена, площадь, комнаты, этаж, описание, фото). Заявка
 * сверяется со всей базой, включая черновики: тот же объект мог быть заведён
 * агентом раньше, и второй карточки быть не должно (см. действие CRM
 * «Дубль»). Результат — до восьми ближайших совпадений, сильные первыми.
 */
export async function findOwnerDuplicates(
  payload: Payload,
  app: OwnerApplicationLike,
): Promise<OwnerDuplicate[]> {
  const signals = ownerSignals(app)
  const candidates = new Map<number, Record<string, unknown>>()
  const add = (docs: unknown[]) => {
    for (const doc of docs) {
      const d = doc as Record<string, unknown>
      const id = Number(d.id)
      if (Number.isInteger(id) && !candidates.has(id)) candidates.set(id, d)
    }
  }

  const limit = 8
  // Жёсткие признаки: телефон собственника, кадастровый номер и адрес дома
  if (signals.phone) {
    const res = await payload.find({
      collection: 'objects',
      where: { ownerPhone: { equals: normDuplicatePhone(app.ownerPhone) } },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    add(res.docs)
  }
  if (signals.cadastral) {
    const res = await payload.find({
      collection: 'objects',
      where: { cadastralNumber: { equals: normDuplicateCadastral(app.cadastralNumber) } },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    add(res.docs)
  }
  const addr = app.address || {}
  const street = text(addr.street)
  const house = text(addr.house)
  if (street && house) {
    const res = await payload.find({
      collection: 'objects',
      where: { and: [{ 'address.street': { equals: street } }, { 'address.house': { equals: house } }] },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    add(res.docs)
  } else if (street) {
    const res = await payload.find({
      collection: 'objects',
      where: { 'address.street': { equals: street } },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    add(res.docs)
  } else if (text(addr.snt)) {
    const res = await payload.find({
      collection: 'objects',
      where: { 'address.snt': { equals: text(addr.snt) } },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    add(res.docs)
  }

  // Характеристики: та же категория и сделка, цена и площадь рядом — по ним
  // ищем даже без совпадения адреса (агент мог записать адрес иначе)
  if (app.category) {
    const where: Where[] = [
      { category: { equals: app.category } },
      { status: { not_equals: 'archived' } },
    ]
    if (app.type) where.push({ type: { equals: app.type } })
    if (num(app.price)) {
      where.push({ price: { greater_than: Math.round(num(app.price)! * 0.7) } })
      where.push({ price: { less_than: Math.round(num(app.price)! * 1.3) } })
    }
    const res = await payload.find({
      collection: 'objects',
      where: { and: where },
      limit: 40,
      depth: 1,
      overrideAccess: true,
      sort: '-createdAt',
    })
    add(res.docs)
  }

  const appPhotos = photoNames(app)
  const found: OwnerDuplicate[] = []
  for (const [id, doc] of candidates) {
    const hard = duplicateMatches(doc, signals)
    const like = listingMatch(objectLike(doc), {
      address: listingAddress(app.address),
      cadastralNumber: text(app.cadastralNumber) || null,
      price: num(app.price),
      area: num(app.area),
      rooms: num(app.rooms),
      floor: num(app.floor),
      totalFloors: num(app.totalFloors),
      photos: appPhotos,
      description: text(app.description),
    })
    // Слабое совпадение характеристик без единого жёсткого признака в CRM
    // показывать не за чем — это просто похожие объекты каталога
    if (!hard.length && like.match < 45) continue
    if (linkedObjectId(app) === id) continue
    const strong = duplicateStrength(hard) === 'strong' || like.match >= 75
    found.push({
      objectId: id,
      slug: text(doc.slug) || null,
      title: text(doc.title) || `Объект №${id}`,
      status: text(doc.status) || null,
      price: num(doc.price),
      address: addressLine((doc.address as DuplicateAddress | null) || null),
      agentName: text((doc.agent as { name?: unknown } | undefined)?.name) || null,
      signals: hard.map((m) => HARD_SIGNAL_LABELS[m] || m),
      score: like.match,
      matched: like.matched.map((m) => MATCH_PARAM_LABELS[m] || m),
      strength: strong ? 'strong' : 'weak',
    })
  }

  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Текст заявки → описание объекта (richText lexical, как в форме CRM) */
export const ownerDescriptionLexical = (value: string) => ({
  root: {
    children: value
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => ({
        children: [{ text: block, type: 'text', version: 1 }],
        type: 'paragraph',
        version: 1,
      })),
    type: 'root',
    version: 1,
  },
})

/**
 * Черновик объекта из одобренной заявки: данные собственника, адрес, цена и
 * характеристики, описание — и ничего лишнего. Статус — черновик, источник —
 * «собственник»: объект попадает в каталог только после публикации в CRM.
 * Номер объекта идёт из базы, а не из заявки. Ответственный агент обязателен:
 * его id передаёт сервис заявок (agentId) — без него объект не создаётся
 * (см. validateResponsibleAgent в Objects.ts).
 */
export function ownerObjectData(
  app: OwnerApplicationLike,
  photoIds: number[] = [],
  agentId: number | null = null,
): Record<string, unknown> {
  const addr = app.address || {}
  const address: Record<string, unknown> = {
    city: text(addr.city) || 'Владикавказ',
    district: text(addr.district) || undefined,
    cityDistrict: text(addr.cityDistrict) || undefined,
    locality: text(addr.locality) || undefined,
    snt: text(addr.snt) || undefined,
    street: text(addr.street) || undefined,
    house: text(addr.house) || undefined,
  }
  return {
    title: ownerObjectTitle(app),
    type: app.type === 'rent' ? 'rent' : 'sale',
    category: app.category || 'apartment',
    status: 'draft',
    origin: 'owner',
    // Ответственный агент обязателен для нового объекта (validateResponsibleAgent
    // в Objects.ts): без него создание отклоняется — вызывающая сторона обязана
    // передать агента (см. createObjectFromApplication)
    agent: agentId ?? undefined,
    price: num(app.price) || 0,
    area: num(app.area) || undefined,
    areaUnit: text(app.areaUnit) || undefined,
    plotArea: num(app.plotArea) || undefined,
    plotAreaUnit: text(app.plotAreaUnit) || undefined,
    rooms: num(app.rooms) || undefined,
    floor: num(app.floor) || undefined,
    totalFloors: num(app.totalFloors) || undefined,
    address,
    cadastralNumber: cleanCadastral(app.cadastralNumber || '') || undefined,
    ownerName: text(app.ownerName) || undefined,
    ownerPhone: formatRuPhone(app.ownerPhone || '') || undefined,
    description: text(app.description) ? ownerDescriptionLexical(text(app.description)) : undefined,
    // Копии фотографий в открытом хранилище media: файлы заявки лежат
    // в закрытом (owner-materials) и на сайт не отдаются — копии делает
    // owner-service при создании объекта
    images: photoIds.length ? photoIds : undefined,
    primaryImage: photoIds[0],
  }
}

/** Название объекта из заявки: вид сделки, категория и место — «Дом, Владикавказ» */
export function ownerObjectTitle(app: OwnerApplicationLike): string {
  const categoryLabel =
    {
      apartment: 'Квартира',
      room: 'Комната',
      house: 'Дом',
      part_house: 'Часть дома',
      townhouse: 'Таунхаус',
      cottage: 'Коттедж',
      dacha: 'Дача',
      land: 'Земельный участок',
      commercial: 'Коммерческий объект',
      garage: 'Гараж',
    }[app.category || ''] || 'Объект'
  const place = text(app.address?.locality) || text(app.address?.street) || text(app.address?.city)
  return [categoryLabel, place].filter(Boolean).join(', ')
}

/**
 * Публичный адрес объекта: /ru/catalog/kvartira-vesennyaya-40m2-a1b2.
 *
 * Раньше slug был служебным «object-<uuid>», а ссылки на карточки строились
 * по числовому id — по адресу /catalog/199 объекты перебирались подряд.
 * Теперь адрес собирается из понятных частей: вид объекта, улица (или
 * населённый пункт/товарищество), площадь и короткий случайный хвост,
 * который и обеспечивает уникальность. Хвост не связан с id записи, поэтому
 * по адресу нельзя узнать ни номер объекта в базе, ни их общее количество.
 *
 * Латиница, а не кириллица: кириллические сегменты адреса эта сборка Next.js
 * не матчит роутером (проверено на slug прежних объектов — 404 и в сыром,
 * и в percent-encoded виде), поэтому транслитерация — не украшение,
 * а условие работоспособности ссылки.
 *
 * Модуль используется и хуком коллекции objects (Objects.ts), и разовым
 * переименованием старых записей (object-slug-backfill.ts), поэтому не
 * зависит от Payload.
 */
import { translitSlug } from './slug'

/**
 * Ключ контекста запроса, которым задача переноса старых адресов
 * (object-slug-backfill.ts) разрешает смену slug документа: без него хук
 * коллекции objects стирает присланный slug при любой правке.
 */
export const OBJECT_SLUG_BACKFILL = 'objectSlugBackfill'

/** Вид объекта первым словом адреса: kvartira-…, dom-…, uchastok-… */
const CATEGORY_WORDS: Record<string, string> = {
  apartment: 'kvartira',
  room: 'komnata',
  house: 'dom',
  part_house: 'chast-doma',
  townhouse: 'taunhaus',
  cottage: 'kottedzh',
  dacha: 'dacha',
  land: 'uchastok',
  commercial: 'kommercheskaya',
  garage: 'garazh',
}

/** Единица площади в адресе: 40m2, 6sotok, 1-2ga */
const AREA_UNITS: Record<string, string> = {
  sqm: 'm2',
  are: 'sotok',
  ha: 'ga',
}

/** Источник для частей адреса — документ объекта (или заявки) */
export interface ObjectSlugSource {
  category?: string | null
  title?: string | null
  area?: number | null
  areaUnit?: string | null
  plotArea?: number | null
  plotAreaUnit?: string | null
  address?: {
    street?: string | null
    locality?: string | null
    city?: string | null
    snt?: string | null
  } | null
}

/** Число в адресе: 40, 1.2 → «40», «1-2» (точка в slug не нужна) */
const numberPart = (n: number): string =>
  String(Math.round(n * 100) / 100).replace('.', '-').replace(/[^0-9-]/g, '')

/** Площадь с единицей — «40m2», «6sotok», «1-2ga»; пусто, если площади нет */
function areaPart(area: number | null | undefined, unit: string | null | undefined): string {
  if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) return ''
  const value = numberPart(area)
  if (!value) return ''
  return `${value}${AREA_UNITS[unit || 'sqm'] || 'm2'}`
}

/** Улица, населённый пункт или товарищество — до 4 слов и 40 знаков */
function placePart(source: ObjectSlugSource): string {
  const addr = source.address || {}
  const candidates = [addr.street, addr.locality, addr.snt, addr.city]
  for (const raw of candidates) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    // «Владикавказ» сам по себе слишком общий — оставляем его только когда
    // ничего конкретнее нет (город по умолчанию есть у всех карточек)
    if (value.toLowerCase() === 'владикавказ' && raw !== addr.city) continue
    const slug = translitSlug(value).split('-').slice(0, 4).join('-').slice(0, 40)
    if (slug) return slug
  }
  // Ни улицы, ни пункта — собираем из названия: «2х-уровневая квартира» →
  // «2kh-urovnevaya-kvartira»; обрезаем, чтобы адрес не разрастался
  return translitSlug(source.title || '').split('-').slice(0, 4).join('-').slice(0, 40)
}

/**
 * Случайный хвост адреса. Не связан с id и не меняется при правках карточки:
 * по нему адрес остаётся уникальным, даже если у двух объектов совпали вид,
 * улица и площадь. Длина — 6 знаков: меньше шанс совпадения, чем у четырёх,
 * и всё ещё короткий адрес.
 */
export function objectSlugSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 6)
}

/**
 * Публичный адрес объекта. Части склеиваются дефисом, пустые опускаются:
 * «kvartira-vesennyaya-40m2-a1b2c3». Участок берёт площадь участка, если
 * площадь объекта не заполнена (у земли это одно и то же поле).
 */
export function buildObjectSlug(source: ObjectSlugSource, suffix: string): string {
  const isLand = source.category === 'land'
  const area = isLand ? source.area ?? source.plotArea : source.area ?? source.plotArea
  const unit = isLand ? source.areaUnit ?? source.plotAreaUnit : source.areaUnit ?? source.plotAreaUnit
  const parts = [
    CATEGORY_WORDS[source.category || ''] || 'obekt',
    placePart(source),
    areaPart(area, unit),
    suffix,
  ].filter(Boolean)
  return parts.join('-').slice(0, 120)
}

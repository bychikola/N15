/**
 * Подбор квартир от застройщиков для раздела «Новостройки» (кнопка «Подбор»,
 * таблица src/components/newbuildings/NewbuildingsPick.tsx).
 *
 * Источник — те же объекты CRM, что и подборка «Новостройки» каталога
 * (см. /api/objects/newbuildings): опубликованная квартира (category
 * apartment) с типом жилья «Новостройка» (поле market, см.
 * src/lib/object-market.ts), привязанная к застройщику. Реализованные объекты
 * ЖК (unitStatus sold) в подборку не попадают; квартиры без застройщика —
 * тоже: это не подборка новостроек. Готовность дома на показ не влияет: в
 * сданных домах квартиры — те же новостройки.
 *
 * Связи developer/complex и корпус дома закрыты для гостя (access полей в
 * Objects.ts), поэтому строки собирает сервер с overrideAccess, а на клиент
 * уходят только открытые сведения: название компании и ЖК, публичный
 * «Дом/корпус в ЖК» (Objects.building), комнатность, площадь, этаж, цена,
 * способы оплаты и наличие. Ни контактов застройщика, ни точного адреса
 * (номер дома и корпус из блока «Адрес» — закрытые поля) в строках нет.
 */
import type { Payload } from 'payload'

export interface NewbuildingRow {
  id: number
  /** Человекочитаемый адрес карточки; пусто — строка не кликабельна */
  slug?: string
  title: string
  developerId: number
  developerName: string
  complexId: number | null
  complexName: string
  /** Публичный «Дом/корпус в ЖК» (Objects.building); пусто — не заполнено */
  building: string
  rooms: number | null
  area: number | null
  floor: number | null
  totalFloors: number | null
  price: number
  /** Коды вариантов покупки, см. src/lib/purchase-options.ts */
  purchaseOptions: string[]
  /** Статус: 'available' (в том числе пусто) или 'reserved'; 'sold' не сюда */
  unitStatus: 'available' | 'reserved'
}

/** Потолок выдачи: таблица грузится целиком, фильтры работают на клиенте */
const MAX_ROWS = 500

/** Число из поля Payload: строка «70» и число 70 читаются одинаково */
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

/** Связь при depth 1 — документ; иначе null */
const rel = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

/**
 * Строки подбора новостроек. Порядок — как в таблице: застройщик, ЖК,
 * комнатность, цена. Свежие публикации внутри одной группы — первыми.
 */
export async function loadNewbuildingRows(payload: Payload): Promise<NewbuildingRow[]> {
  const { docs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { status: { equals: 'published' } },
        { category: { equals: 'apartment' } },
        { market: { equals: 'new' } },
      ],
    },
    sort: '-createdAt',
    limit: MAX_ROWS,
    depth: 1,
    overrideAccess: true,
  })

  const rows: NewbuildingRow[] = []
  for (const raw of docs as unknown as Record<string, unknown>[]) {
    const id = Number(raw.id)
    if (!Number.isInteger(id)) continue

    // Застройщик обязателен и должен быть открыт на сайте: у скрытой компании
    // страницы нет, её квартир в подборке тоже быть не должно
    const developer = rel(raw.developer)
    if (!developer) continue
    const developerId = Number(developer.id)
    const developerName = String(developer.name || '').trim()
    if (!Number.isInteger(developerId) || !developerName) continue
    if (developer.showOnSite !== true || developer.status === 'archived') continue

    // Реализованные квартиры ЖК — уже не предложение
    const unitStatus = String(raw.unitStatus || '')
    if (unitStatus === 'sold') continue

    const price = num(raw.price)
    if (price === null) continue

    const complex = rel(raw.complex)
    rows.push({
      id,
      slug: String(raw.slug || '') || undefined,
      title: String(raw.title || '').trim(),
      developerId,
      developerName,
      complexId: complex ? Number(complex.id) : null,
      complexName: complex ? String(complex.name || '').trim() : '',
      building: String(raw.building || '').trim(),
      rooms: num(raw.rooms),
      area: num(raw.area),
      floor: num(raw.floor),
      totalFloors: num(raw.totalFloors),
      price,
      purchaseOptions: (Array.isArray(raw.purchaseOptions) ? raw.purchaseOptions : []).map(String),
      unitStatus: unitStatus === 'reserved' ? 'reserved' : 'available',
    })
  }

  const text = (v: string): string => v.toLocaleLowerCase('ru-RU')
  rows.sort(
    (a, b) =>
      text(a.developerName).localeCompare(text(b.developerName)) ||
      text(a.complexName).localeCompare(text(b.complexName)) ||
      (a.rooms ?? Number.MAX_SAFE_INTEGER) - (b.rooms ?? Number.MAX_SAFE_INTEGER) ||
      a.price - b.price ||
      a.id - b.id,
  )
  return rows
}

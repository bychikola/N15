/**
 * Карточка объявления доски в выдаче.
 *
 * Отдельный тип и отдельный маппер, а не документ Payload: в записи лежат
 * телефон автора, его почта, IP и журнал модерации — на сайт ничего из этого
 * попадать не должно. Здесь перечислено ровно то, что видит посетитель,
 * и маршрут выдачи отдаёт этот объект, а не документ (см.
 * src/app/api/board/ads/route.ts).
 */
import { boardPublicAddress, type BoardAddressLike } from './board'

/** Фотография объявления — копия в media, созданная при публикации */
export interface BoardPhoto {
  url?: string
  alt?: string
  sizes?: {
    card?: { url?: string }
    thumbnail?: { url?: string }
  }
}

export interface BoardListItem {
  id: number
  title: string
  /** sale | rent */
  dealType: string
  category: string
  price: number | null
  area: number | null
  areaUnit: string
  plotArea: number | null
  plotAreaUnit: string
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  /** Адрес без номера дома — его на доске не показываем (см. boardPublicAddress) */
  address: string
  /** Район или район города — для фильтров и подписи */
  district: string
  locality: string
  /** private | agency */
  authorKind: string
  /** Имя, которое автор указал для связи */
  authorName: string
  publishedAt: string | null
  photo?: BoardPhoto
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Документ объявления (Payload) → карточка выдачи */
export function boardToListItem(doc: Record<string, unknown>): BoardListItem {
  const addr = (doc.address || {}) as BoardAddressLike & { house?: string | null }
  // Фото берём из копий в media (publicPhotos): они появляются при публикации,
  // поэтому непроверенные снимки из закрытого хранилища на сайт не попадают
  const photos = Array.isArray(doc.publicPhotos) ? (doc.publicPhotos as BoardPhoto[]) : []
  const cover = photos.find((p) => p && typeof p === 'object') || undefined

  return {
    id: Number(doc.id),
    title: str(doc.title),
    dealType: str(doc.dealType) || 'sale',
    category: str(doc.category),
    price: num(doc.price),
    area: num(doc.area),
    areaUnit: str(doc.areaUnit) || 'sqm',
    plotArea: num(doc.plotArea),
    plotAreaUnit: str(doc.plotAreaUnit),
    rooms: num(doc.rooms),
    floor: num(doc.floor),
    totalFloors: num(doc.totalFloors),
    address: boardPublicAddress(addr),
    district: str(addr.cityDistrict) || str(addr.district),
    locality: str(addr.locality) || str(addr.city),
    authorKind: str(doc.authorKind) || 'private',
    authorName: str(doc.contactName),
    publishedAt: str(doc.publishedAt) || null,
    photo: cover,
  }
}

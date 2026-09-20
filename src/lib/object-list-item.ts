import type { ObjectListItem } from '@/components/objects/ObjectCard'

/**
 * Документ объекта из Payload → карточка каталога (ObjectCard). Общий
 * преобразователь для списков объектов: каталог (клиентская выдача
 * /api/objects) и страница населённого пункта межрегиональной недвижимости
 * (серверная выдача) показывают карточки одинаково.
 * Поля необязательные — берём только то, что есть в документе.
 */
export function objectToListItem(doc: Record<string, unknown>): ObjectListItem {
  return {
    id: doc.id as number,
    title: doc.title as string,
    type: doc.type as 'sale' | 'rent',
    category: doc.category as string,
    price: doc.price as number,
    slug: doc.slug as string | undefined,
    area: doc.area as number | undefined,
    areaUnit: doc.areaUnit as ObjectListItem['areaUnit'],
    plotArea: doc.plotArea as number | undefined,
    plotAreaUnit: doc.plotAreaUnit as ObjectListItem['plotAreaUnit'],
    rooms: doc.rooms as number | undefined,
    floor: doc.floor as number | undefined,
    totalFloors: doc.totalFloors as number | undefined,
    // Варианты покупки — значки на обложке карточки (см. purchaseBadges)
    purchaseOptions: doc.purchaseOptions as string[] | undefined,
    address: doc.address as ObjectListItem['address'],
    // Координаты точки объекта (их ставит карта в форме CRM). Карточке они
    // не нужны: она показывает адрес, а точки для режима «На карте» каталог
    // берёт у сервера (см. /api/objects/map)
    coordinates: doc.coordinates as ObjectListItem['coordinates'],
    primaryImage: (doc.primaryImage && typeof doc.primaryImage === 'object'
      ? doc.primaryImage
      : undefined) as ObjectListItem['primaryImage'],
    agent: doc.agent as ObjectListItem['agent'],
  }
}

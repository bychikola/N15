/**
 * Пересечения объектов в CRM: поиск дублей перед сохранением и безопасный
 * просмотр найденного объекта.
 *
 * Признаки пересечения (адрес, телефон и имя собственника, кадастровый номер)
 * и их нормализация — общие для проверки карточки (/api/objects/check-duplicate)
 * и для просмотра пересекающегося объекта (/api/objects/duplicate-view):
 * просмотр открывается только тогда, когда объект действительно совпадает
 * с проверяемым по тем же признакам, — то есть только из уведомления
 * о пересечении, а не по произвольному id.
 *
 * Возврат просмотра — белый список полей (см. duplicateView): данных
 * собственника, кадастровых номеров, внутренних комментариев, оценки
 * и служебных отметок в нём нет. Новое поле карточки само в просмотр
 * не попадёт — его нужно добавить сюда осознанно.
 */
import type { Payload } from 'payload'
import { cleanCadastral } from './cadastral'
import { formatRuPhone } from './phone'
// Описание объекта — richText (lexical): в просмотр уходит плоский текст,
// тот же, что используется для выгрузок на площадки (см. publish-service)
import { richTextToPlainText } from './publish-service'

/** Адрес объекта в том виде, в каком он лежит в карточке */
export interface DuplicateAddress {
  city?: string | null
  district?: string | null
  cityDistrict?: string | null
  locality?: string | null
  snt?: string | null
  street?: string | null
  house?: string | null
  corpus?: string | null
  apartment?: string | null
  fullAddress?: string | null
}

/** Признаки проверяемой карточки, с которыми сверяются объекты базы */
export interface DuplicateSignals {
  ownerName?: string
  ownerPhone?: string
  cadastralNumber?: string
  address?: DuplicateAddress | null
}

/** Нормализованные признаки: пустая строка — признака нет */
export interface NormalizedSignals {
  phone: string
  cadastral: string
  address: string
  name: string
}

// Телефон и кадастровый — в том же виде, в каком они лежат в объекте:
// иначе поиск по базе (равенство значений) не найдёт уже сохранённую карточку
// с тем же номером: см. beforeChange коллекции Objects
export const normDuplicatePhone = (v?: string | null) => formatRuPhone(v || '')
export const normDuplicateCadastral = (v?: string | null) => cleanCadastral(v)
export const normDuplicateName = (v?: string | null) => (v || '').trim().toLowerCase()

/**
 * Ключ адреса для сравнения: город сам по себе слишком общий — совпадение
 * адреса считаем только когда указана улица или дом.
 */
export const duplicateAddressKey = (a?: DuplicateAddress | null): string => {
  if (!a?.street && !a?.house) return ''
  return `${a?.city || ''}${a?.street || ''}${a?.house || ''}${a?.apartment || ''}`
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/g, '')
}

/**
 * Признаки проверяемой карточки в нормализованном виде. Данные собственника
 * и кадастровый номер — закрытые сведения: у не-администратора они не
 * участвуют ни в поиске, ни в сравнении (см. check-duplicate).
 */
export function normalizeSignals(signals: DuplicateSignals, isAdmin: boolean): NormalizedSignals {
  return {
    phone: isAdmin ? normDuplicatePhone(signals.ownerPhone) : '',
    cadastral: isAdmin ? normDuplicateCadastral(signals.cadastralNumber) : '',
    name: isAdmin ? normDuplicateName(signals.ownerName) : '',
    address: duplicateAddressKey(signals.address),
  }
}

/** Есть ли признаки, по которым вообще можно искать пересечение */
export const hasSignals = (s: NormalizedSignals): boolean =>
  Boolean(s.phone || s.cadastral || s.address || s.name)

/** Совпавшие признаки объекта (пустой список — пересечения нет) */
export function duplicateMatches(
  doc: Record<string, unknown>,
  s: NormalizedSignals,
): string[] {
  const matches: string[] = []
  if (s.phone && normDuplicatePhone(doc.ownerPhone as string | undefined) === s.phone) matches.push('phone')
  if (s.cadastral && normDuplicateCadastral(doc.cadastralNumber as string | undefined) === s.cadastral) matches.push('cadastral')
  if (s.address && duplicateAddressKey(doc.address as DuplicateAddress | null) === s.address) matches.push('address')
  if (s.name && normDuplicateName(doc.ownerName as string | undefined) === s.name) matches.push('name')
  return matches
}

/** Только имя — слабое совпадение: оно не блокирует сохранение */
export const duplicateStrength = (matches: string[]): 'strong' | 'weak' =>
  matches.some((m) => m !== 'name') ? 'strong' : 'weak'

/**
 * Просмотр пересекающегося объекта: тип, фото, адрес, площадь, цена,
 * описание, статус и ответственный агент — и ничего сверх этого. Данных
 * собственника, кадастровых номеров, внутренних комментариев, комиссии
 * и служебных полей здесь нет вовсе.
 */
export interface DuplicateView {
  id: number
  title: string
  type: string | null
  category: string | null
  status: string | null
  price: number | null
  area: number | null
  areaUnit: string | null
  plotArea: number | null
  plotAreaUnit: string | null
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  address: DuplicateAddress
  description: string
  photos: string[]
  agentName: string | null
}

const viewStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const viewNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** URL вложения: у фото это media-документ (depth 1), а не голая ссылка */
const mediaUrl = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null
  return viewStr((v as { url?: unknown }).url)
}

/** Просмотр объекта по белому списку полей (см. DuplicateView) */
export function duplicateView(doc: Record<string, unknown>): DuplicateView {
  const photos: string[] = []
  const primary = mediaUrl(doc.primaryImage)
  if (primary) photos.push(primary)
  for (const img of (doc.images as unknown[] | undefined) || []) {
    const url = mediaUrl(img)
    if (url && !photos.includes(url)) photos.push(url)
  }
  const addr = (doc.address as DuplicateAddress | null) || {}
  const agent = doc.agent as { name?: unknown } | undefined
  return {
    id: doc.id as number,
    title: viewStr(doc.title) || '',
    type: viewStr(doc.type),
    category: viewStr(doc.category),
    status: viewStr(doc.status),
    price: viewNum(doc.price),
    area: viewNum(doc.area),
    areaUnit: viewStr(doc.areaUnit),
    plotArea: viewNum(doc.plotArea),
    plotAreaUnit: viewStr(doc.plotAreaUnit),
    rooms: viewNum(doc.rooms),
    floor: viewNum(doc.floor),
    totalFloors: viewNum(doc.totalFloors),
    // Адрес — части карточки без служебных сведений: собственника и кадастра
    // в адресе нет, а улица и дом нужны, чтобы сверить совпадение
    address: {
      city: viewStr(addr.city),
      district: viewStr(addr.district),
      cityDistrict: viewStr(addr.cityDistrict),
      locality: viewStr(addr.locality),
      snt: viewStr(addr.snt),
      street: viewStr(addr.street),
      house: viewStr(addr.house),
      corpus: viewStr(addr.corpus),
      apartment: viewStr(addr.apartment),
      fullAddress: viewStr(addr.fullAddress),
    },
    description: richTextToPlainText(doc.description),
    photos,
    agentName: viewStr(agent?.name),
  }
}

/**
 * Пересекающийся объект, к которому разрешён просмотр: объект читается
 * служебно (overrideAccess) — так агент не получает доступ к чужой карточке
 * вообще, а просмотр открывается только после сверки признаков и только
 * на чтение. null — объекта нет, он был исключён или пересечения нет.
 */
export async function findIntersectingObject(
  payload: Payload,
  id: number,
  signals: NormalizedSignals,
  excludeId?: number,
): Promise<Record<string, unknown> | null> {
  if (!hasSignals(signals)) return null
  if (excludeId != null && id === excludeId) return null
  try {
    const doc = (await payload.findByID({
      collection: 'objects',
      id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    return duplicateMatches(doc, signals).length ? doc : null
  } catch {
    // Объект не найден (удалён в другой вкладке) — просмотра нет
    return null
  }
}

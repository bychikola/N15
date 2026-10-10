/**
 * Разбор и проверка формы заявки собственника (страница /sell). Форму шлёт
 * владелец объекта — не сотрудник, поэтому все проверки собраны здесь:
 * маршрут /api/owner-applications/submit принимает только то, что прошло эту
 * функцию. Публичного создания через REST у коллекции owner-applications
 * нет, так что обойти проверки запросом в обход формы нельзя.
 *
 * Поля адреса — служебные: точный дом нужен администратору для поиска
 * дублей и в публичную часть сайта не попадает. Телефон приводится к тому же
 * виду, что в объектах («+7 (918) 828-40-88»), чтобы поиск по нему работал
 * независимо от того, как владелец записал номер.
 */
import { isCadastralFormat, cleanCadastral } from './cadastral'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from './districts'
import { OBJECT_CATEGORY_VALUES } from './object-categories'
import { formatRuPhone } from './phone'
import { PHOTO_FORMATS_LABEL, PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, isAllowedPhoto } from './photo-rules'
import { SNT_AREAS } from '@/components/home/landing-data'

/** Сколько фотографий принимаем от собственника */
export const OWNER_MAX_PHOTOS = 10
/** Пределы описания и имени — как у остальных публичных форм */
export const OWNER_DESCRIPTION_MAX = 4000
const NAME_MAX = 120
const ADDRESS_MAX = 120

export interface OwnerApplicationInput {
  ownerName: string
  ownerPhone: string
  type: 'sale' | 'rent'
  category: string
  price?: number
  area?: number
  areaUnit?: string
  plotArea?: number
  plotAreaUnit?: string
  rooms?: number
  floor?: number
  totalFloors?: number
  cadastralNumber?: string
  address: {
    city: string
    district?: string
    cityDistrict?: string
    locality?: string
    snt?: string
    street?: string
    house?: string
  }
  description?: string
}

const text = (value: unknown, max = ADDRESS_MAX): string =>
  (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max)

const areaUnitOf = (value: unknown): string | undefined =>
  value === 'sqm' || value === 'are' || value === 'ha' ? value : undefined

const number = (value: unknown, max: number): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(String(value).replace(/\s+/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined
  return n
}

const pick = (value: unknown, options: readonly { value: string }[] | readonly string[]): string | undefined => {
  const v = text(value)
  if (!v) return undefined
  return options.some((o) => (typeof o === 'string' ? o === v : o.value === v)) ? v : undefined
}

/** Номер в каноническом виде — или null, если это не российский номер */
export const ownerPhoneDigits = (raw: unknown): string | null => {
  const formatted = formatRuPhone(typeof raw === 'string' ? raw : '')
  return /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(formatted) ? formatted : null
}

/**
 * Проверить и нормализовать заявку. Все ошибки — текстом для формы: это
 * публичная форма, и человек должен понимать, что именно не так.
 */
export function parseOwnerApplicationForm(
  form: FormData,
): { ok: true; data: OwnerApplicationInput } | { ok: false; error: string } {
  const ownerName = text(form.get('ownerName'), NAME_MAX)
  if (ownerName.length < 2) return { ok: false, error: 'Укажите имя — как к вам обращаться' }

  const ownerPhone = ownerPhoneDigits(form.get('ownerPhone'))
  if (!ownerPhone) {
    return { ok: false, error: 'Укажите телефон в формате +7 (918) 123-45-67 — на него придёт код подтверждения' }
  }

  const typeRaw = text(form.get('type'))
  const type = typeRaw === 'rent' ? 'rent' : 'sale'

  const category = pick(form.get('category'), OBJECT_CATEGORY_VALUES.map((v) => ({ value: v })))
  if (!category) return { ok: false, error: 'Выберите категорию объекта' }

  const cadastralRaw = cleanCadastral(text(form.get('cadastralNumber'), 40))
  if (cadastralRaw && !isCadastralFormat(cadastralRaw)) {
    return { ok: false, error: 'Кадастровый номер — в формате 15:07:0030021:123' }
  }

  const address = {
    city: text(form.get('city')) || 'Владикавказ',
    district: pick(form.get('district'), DISTRICT_OPTIONS),
    cityDistrict: pick(form.get('cityDistrict'), CITY_DISTRICT_OPTIONS),
    locality: text(form.get('locality')) || undefined,
    snt: pick(form.get('snt'), SNT_AREAS),
    street: text(form.get('street')) || undefined,
    house: text(form.get('house'), 20) || undefined,
  }
  // Адрес — служебные сведения и необязательное условие: в форме он не помечен
  // обязательным (человек вправе не называть точный дом), поэтому заявку без
  // адреса принимаем и создаём запись в CRM. Адрес уточнит администратор при
  // звонке; терять из-за него заявку с телефоном, характеристиками и фото
  // нельзя — в этом и был сбой: форма выглядела заполненной, а сервер отвечал
  // отказом, и заявка не появлялась нигде.

  const description = text(form.get('description'), OWNER_DESCRIPTION_MAX) || undefined

  return {
    ok: true,
    data: {
      ownerName,
      ownerPhone,
      type,
      category,
      price: number(form.get('price'), 1_000_000_000_000),
      area: number(form.get('area'), 10_000_000),
      areaUnit: areaUnitOf(form.get('areaUnit')),
      plotArea: number(form.get('plotArea'), 10_000_000),
      plotAreaUnit: areaUnitOf(form.get('plotAreaUnit')),
      rooms: number(form.get('rooms'), 1000),
      floor: number(form.get('floor'), 1000),
      totalFloors: number(form.get('totalFloors'), 1000),
      cadastralNumber: cadastralRaw || undefined,
      address,
      description,
    },
  }
}

/** Фотографии из формы — с проверкой формата и размера, как у доски */
export function ownerPhotosFromForm(form: FormData): { ok: true; files: File[] } | { ok: false; error: string } {
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  for (const file of files) {
    if (!isAllowedPhoto({ name: file.name, type: file.type })) {
      return { ok: false, error: `Формат не поддерживается — нужны ${PHOTO_FORMATS_LABEL}` }
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: `Фотография больше ${PHOTO_MAX_LABEL}` }
    }
  }
  return { ok: true, files }
}

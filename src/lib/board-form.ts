/**
 * Разбор и проверка формы объявления доски — общий для подачи и правки.
 *
 * Одна и та же форма приходит и с POST /api/board/ads (новое объявление),
 * и с POST /api/board/ads/manage, action=update (правка автором). Проверки
 * у них одинаковые, поэтому живут здесь: разойдись они — правка стала бы
 * лазейкой в обход правил подачи.
 *
 * Согласия здесь не проверяются: у подачи они обязательны, а при правке
 * уже приняты (дата и версия правил хранятся в объявлении и не переписываются).
 */
import { BOARD_TEXT_LIMITS } from './board'
import { OBJECT_CATEGORY_VALUES, HOUSE_TYPE_VALUES } from './object-categories'
import { COMMERCIAL_TYPE_VALUES } from './commercial-types'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from './districts'
import { formatRuPhone } from './phone'
import { PHOTO_FORMATS_LABEL, PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, isAllowedPhoto } from './photo-rules'

/** Текст из формы: обрезка и предел длины (пусто → undefined) */
const text = (v: unknown, max: number): string | undefined => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || undefined
}

/** Значение из справочника: чужое молча отбрасываем */
const pick = (v: unknown, allowed: readonly string[]): string | undefined => {
  const s = String(v ?? '').trim()
  return allowed.includes(s) ? s : undefined
}

/**
 * Число из формы: пусто, мусор и минус → undefined.
 *
 * Пустая строка проверяется отдельно: Number('') — это 0, и без проверки
 * незаполненное поле («Комнат», «Этаж») превращалось в ноль, а объявление
 * не проходило проверку «Комнат: минимум 1» — форма с пустыми полями падала
 * с общей ошибкой отправки.
 */
const number = (v: unknown): number | undefined => {
  if (v == null) return undefined
  const raw = String(v).trim().replace(',', '.')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Проверенные поля объявления — в этом виде уходят в базу */
export interface BoardAdInput {
  dealType: string
  category: string
  title: string
  description: string
  price: number
  contactName: string
  phone: string
  email?: string
  houseType?: string
  commercialType?: string
  area?: number
  areaUnit: string
  plotArea?: number
  plotAreaUnit?: string
  rooms?: number
  floor?: number
  totalFloors?: number
  videoLinks?: string
  address: {
    city: string
    district?: string
    cityDistrict?: string
    locality?: string
    snt?: string
    street?: string
    house?: string
  }
}

/**
 * Разбор формы: возвращает либо готовые поля, либо текст ошибки для человека.
 * Проверки те же, что были в маршруте подачи, — включая телефон (не короче
 * 10 цифр) и почту (простая проверка формата).
 */
export function parseBoardAdForm(form: FormData): { ok: true; data: BoardAdInput } | { ok: false; error: string } {
  const dealType = pick(form.get('dealType'), ['sale', 'rent'])
  const category = pick(form.get('category'), OBJECT_CATEGORY_VALUES)
  const title = text(form.get('title'), BOARD_TEXT_LIMITS.title)
  const description = text(form.get('description'), BOARD_TEXT_LIMITS.description)
  const price = number(form.get('price'))
  const contactName = text(form.get('contactName'), BOARD_TEXT_LIMITS.name)
  const phoneRaw = text(form.get('phone'), 40)

  if (!dealType) return { ok: false, error: 'Укажите, продажа это или аренда' }
  if (!category) return { ok: false, error: 'Выберите категорию объекта' }
  if (!title) return { ok: false, error: 'Заполните заголовок объявления' }
  if (!description) return { ok: false, error: 'Заполните описание объекта' }
  if (price === undefined) return { ok: false, error: 'Укажите цену' }
  if (!contactName) return { ok: false, error: 'Укажите контактное лицо' }
  if (!phoneRaw || phoneRaw.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Укажите телефон для связи' }
  }

  const email = text(form.get('email'), 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: 'Проверьте адрес электронной почты' }
  }

  return {
    ok: true,
    data: {
      dealType,
      category,
      title,
      description,
      price,
      contactName,
      // Телефон в одном виде: на сайте он отдаётся кнопкой, но хранится
      // каноничным — как у агентов и объектов (см. src/lib/phone.ts)
      phone: formatRuPhone(phoneRaw),
      email,
      houseType: pick(form.get('houseType'), HOUSE_TYPE_VALUES),
      commercialType: pick(form.get('commercialType'), COMMERCIAL_TYPE_VALUES),
      area: number(form.get('area')),
      areaUnit: pick(form.get('areaUnit'), ['sqm', 'are', 'ha']) || 'sqm',
      plotArea: number(form.get('plotArea')),
      plotAreaUnit: pick(form.get('plotAreaUnit'), ['are', 'ha', 'sqm']),
      rooms: number(form.get('rooms')),
      floor: number(form.get('floor')),
      totalFloors: number(form.get('totalFloors')),
      videoLinks: text(form.get('videoLinks'), 1000),
      address: {
        city: text(form.get('city'), BOARD_TEXT_LIMITS.address) || 'Владикавказ',
        district: pick(form.get('district'), DISTRICT_OPTIONS),
        cityDistrict: pick(form.get('cityDistrict'), CITY_DISTRICT_OPTIONS),
        locality: text(form.get('locality'), BOARD_TEXT_LIMITS.address),
        snt: text(form.get('snt'), BOARD_TEXT_LIMITS.address),
        street: text(form.get('street'), BOARD_TEXT_LIMITS.address),
        house: text(form.get('house'), 20),
      },
    },
  }
}

/** Новые фотографии из формы — с проверкой формата и размера */
export function boardPhotosFromForm(form: FormData): { ok: true; files: File[] } | { ok: false; error: string } {
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

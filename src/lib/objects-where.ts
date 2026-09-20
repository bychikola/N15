/**
 * Проверка условий выдачи каталога, пришедших из браузера.
 *
 * Каталог собирает where функцией buildWhere (components/objects/CatalogFilters.tsx)
 * и отправляет его на публичные маршруты, которые читают объекты локальным
 * API Payload с overrideAccess (см. /api/objects/map). Локальное API полевую
 * проверку коллекции не применяет: без фильтра такой маршрут стал бы дырой —
 * закрытые для посетителей поля (cadastralNumber у участков, createdBy и т.п.)
 * спрашивались бы напрямую. Ровно против этого заведён /api/objects/by-cadastral,
 * который отдаёт наружу только id найденных объектов.
 *
 * Поэтому маршрут пропускает к базе только условия по белому списку полей и
 * операторов. Список — это то, что строит buildWhere: новый фильтр каталога
 * нужно добавить и сюда (иначе маршрут ответит 400, а не покажет выдачу шире
 * списка), поэтому оба места живут рядом в репозитории.
 */

export type ObjectsWhere = Record<string, unknown>

/** Поля, по которым каталогу разрешено фильтровать выдачу */
const ALLOWED_FIELDS = new Set([
  // Служебные: статус публикации и id (в id: { in } каталог передаёт объекты,
  // найденные по кадастровому номеру — см. cadastralIds в buildWhere)
  'status',
  'id',
  'title',
  // Характеристики объекта
  'type',
  'category',
  'commercialType',
  'price',
  'area',
  'plotArea',
  'livingArea',
  'kitchenArea',
  'rooms',
  'floor',
  'totalFloors',
  'heating',
  'buildingType',
  'gas',
  'elevator',
  'yard',
  'purchaseOptions',
  'agent',
  // Адрес — поля группы address.*
  'address.city',
  'address.district',
  'address.cityDistrict',
  'address.locality',
  'address.street',
  'address.snt',
])

/** Операторы сравнения: те же, что строит buildWhere */
const ALLOWED_OPERATORS = new Set([
  'equals',
  'not_equals',
  'in',
  'not_in',
  'contains',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
])

const MAX_DEPTH = 5
/** Потолок числа условий: у каталога их десятки, больше — уже не фильтр */
const MAX_CONDITIONS = 80
/** Потолок длины списка значений в in: каталог передаёт id найденных объектов */
const MAX_VALUES = 200

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isPrimitive = (v: unknown): boolean =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/**
 * Условия по полю: { поле: { оператор: значение } }. Значение — примитив
 * (строка, число, флаг) или список примитивов для in/not_in.
 */
function sanitizeCondition(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null
  const out: Record<string, unknown> = {}
  for (const [op, raw] of Object.entries(value)) {
    if (!ALLOWED_OPERATORS.has(op)) return null
    if (Array.isArray(raw)) {
      if (raw.length === 0 || raw.length > MAX_VALUES) return null
      if (!raw.every(isPrimitive)) return null
      out[op] = raw
    } else {
      if (!isPrimitive(raw)) return null
      out[op] = raw
    }
  }
  return Object.keys(out).length ? out : null
}

/**
 * where из запроса → where, безопасный для локального API.
 * null — условие не разобрано (маршрут отвечает ошибкой запроса).
 */
export function sanitizeObjectsWhere(input: unknown): ObjectsWhere | null {
  let conditions = 0

  const walk = (node: unknown, depth: number): ObjectsWhere | null => {
    if (depth > MAX_DEPTH || !isPlainObject(node)) return null
    const out: ObjectsWhere = {}
    for (const [key, value] of Object.entries(node)) {
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CONDITIONS) return null
        const parts: ObjectsWhere[] = []
        for (const item of value) {
          const part = walk(item, depth + 1)
          if (!part) return null
          parts.push(part)
        }
        out[key] = parts
        continue
      }
      if (!ALLOWED_FIELDS.has(key)) return null
      if (++conditions > MAX_CONDITIONS) return null
      const condition = sanitizeCondition(value)
      if (!condition) return null
      out[key] = condition
    }
    return out
  }

  return walk(input, 0)
}

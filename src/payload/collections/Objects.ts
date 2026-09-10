import type { CollectionBeforeChangeHook, CollectionConfig, Payload, Where } from 'payload'
import { DISTRICT_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
// Садовые товарищества — тот же справочник, что в разделах СТ/СНТ/СНО
// на главной, в каталоге и форме CRM (landing-data.ts)
import { SNT_AREAS } from '@/components/home/landing-data'
import { evaluateValuation, paramsFromDoc, type ValuationDocLike } from '@/lib/valuation'
// Автоматическая синхронизация публикаций на площадки: при изменении объекта
// обновляем опубликованные посты, при снятии с продажи (archived) — снимаем
// объявления (см. src/lib/publish-service.ts)
import { objectsAfterChange, objectsAfterDelete } from '@/lib/publish-service'

const normPhone = (v?: string) => (v || '').replace(/[^\d+]/g, '')
const normCadastral = (v?: string) => (v || '').toLowerCase().replace(/\s+/g, '')

/**
 * Чтение булева флага из query-параметра запроса. В разных окружениях
 * Payload кладёт его в req.query / req.searchParams / req.nextUrl.
 */
function flagFromReq(req: unknown, name: string): boolean {
  const anyReq = req as {
    searchParams?: URLSearchParams
    nextUrl?: { searchParams?: URLSearchParams }
    query?: URLSearchParams | Record<string, unknown>
  }
  const sp = anyReq?.searchParams || anyReq?.nextUrl?.searchParams
  if (sp && typeof sp.get === 'function') {
    const v = sp.get(name)
    if (v === 'true' || v === '1') return true
  }
  const q = anyReq?.query
  if (q && typeof q === 'object' && 'get' in q) {
    const v = (q as URLSearchParams).get(name)
    if (v === 'true' || v === '1') return true
  }
  return false
}

/** Запрос внутри access-функций коллекции (payload + текущий пользователь) */
type AccessReq = { payload: Payload; user?: { id?: number | string; role?: string } | null }

// Мемоизация поиска агентских профилей пользователя на время одного запроса:
// полевой read-access вызывается для каждого документа в выдаче, а ids
// профилей одного пользователя не меняются — лишние запросы к agents не нужны.
const myAgentIdsCache = new WeakMap<object, Promise<Set<number>>>()

/** ids профилей агентов (коллекция agents), привязанных к текущему пользователю */
async function myAgentIds(req: AccessReq): Promise<Set<number>> {
  const cached = myAgentIdsCache.get(req)
  if (cached) return cached
  const promise = (async () => {
    const ids = new Set<number>()
    const userId = req.user?.id
    if (userId == null) return ids
    try {
      const { docs } = await req.payload.find({
        collection: 'agents',
        where: { user: { equals: userId } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const agent of docs) {
        if (typeof agent.id === 'number') ids.add(agent.id)
      }
    } catch {
      // не нашли профили — считаем, что своих объектов у пользователя нет
    }
    return ids
  })()
  myAgentIdsCache.set(req, promise)
  return promise
}

/** id профиля агента из relationship-поля (в doc лежит id или объект) */
const agentIdOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/**
 * «Свой» объект для текущего пользователя: в объекте указан профиль агента,
 * привязанный к его учётной записи (agents.user = этот пользователь).
 * Объекты без агента и с чужим агентом «своими» не считаются — их контакты
 * собственника агент не видит и редактировать их не может.
 */
async function isOwnObjectFor(req: AccessReq, doc: { agent?: unknown } | null | undefined): Promise<boolean> {
  if (!doc) return false
  const agentId = agentIdOf(doc.agent)
  if (agentId == null) return false
  const mine = await myAgentIds(req)
  return mine.has(agentId)
}

/**
 * Автоматический пересчёт рыночной оценки — внутренний инструмент CRM.
 *
 * Оценка ориентировочная, движок src/lib/valuation.ts: справочные ставки
 * Н15 по ценовому поясу (район города / пригород / СТ / район республики)
 * + поправочные коэффициенты по заполненным параметрам; если в базе есть
 * >=3 опубликованных объекта той же категории, типа сделки и локации —
 * базовая ставка берётся из медианы их цен за единицу.
 *
 * Пересчёт запускается при создании объекта и при изменении любого
 * параметра, влияющего на стоимость (площадь, адрес, категория, цена,
 * этаж, комнаты, состояние и т.п. — см. VALUATION_TRIGGER_KEYS), а также
 * по явному запросу ?recalc=true. Обновление самой группы valuation
 * (ручная корректировка агента в CRM) тоже пересчитывает системные поля:
 * они остаются «честными», а ручное значение живёт в manual* и является
 * действующим (finalEstimate).
 *
 * ВАЖНО: это ориентировочный анализ агентства, а не официальная
 * независимая оценка — точную стоимость определяют осмотр и оценщик.
 */
const VALUATION_TRIGGER_KEYS = [
  'type', 'category', 'price', 'area', 'livingArea', 'kitchenArea', 'rooms',
  'floor', 'totalFloors', 'buildingType', 'condition', 'builtYear', 'heating',
  'balcony', 'water', 'sewerage', 'electricity', 'gas', 'internet', 'elevator',
  'yard', 'parking', 'address', 'features', 'valuation',
]

/** Сопоставимые объекты базы: та же категория/сделка/локация, опубликованы */
async function comparableUnitsFromDb(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  doc: Record<string, unknown>,
): Promise<number[]> {
  const category = typeof doc.category === 'string' ? doc.category : ''
  const type = typeof doc.type === 'string' ? doc.type : ''
  if (!category || !type) return []
  const addr = (doc.address || {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const snt = str(addr.snt)
  const cityDistrict = str(addr.cityDistrict)
  const locality = str(addr.locality)
  const district = str(addr.district)
  const city = str(addr.city)

  const cond: Where[] = [
    { status: { equals: 'published' } },
    { category: { equals: category } },
    { type: { equals: type } },
  ]
  if (typeof doc.id === 'number' || typeof doc.id === 'string') {
    cond.push({ id: { not_equals: doc.id } })
  }
  // Локация — с тем же приоритетом, что ценовой пояс в движке:
  // СТ/СНТ → район города → населённый пункт → район → город
  if (snt) cond.push({ 'address.snt': { equals: snt } })
  else if (cityDistrict) cond.push({ 'address.cityDistrict': { equals: cityDistrict } })
  else if (locality) cond.push({ 'address.locality': { equals: locality } })
  else if (district) cond.push({ 'address.district': { equals: district } })
  else if (city) {
    // Объект в городе без района сравнивается только с такими же
    // «нерайонированными» — у объектов с указанным районом свой пояс
    cond.push({ 'address.city': { equals: city } }, { 'address.cityDistrict': { exists: false } })
  }

  // Собираем не более 300 компараблей страницами (лимит Payload — 100)
  const units: number[] = []
  for (let page = 1; page <= 3; page++) {
    const { docs, totalPages } = await req.payload.find({
      collection: 'objects',
      where: { and: cond },
      sort: '-createdAt',
      page,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) {
      const o = d as unknown as Record<string, unknown>
      const price = typeof o.price === 'number' ? o.price : null
      const area = typeof o.area === 'number' ? o.area : null
      if (!price || price <= 0 || !area || area <= 0) continue
      units.push(category === 'land' && type === 'sale' ? price / (area / 100) : price / area)
    }
    if (page >= totalPages) break
  }
  return units
}

/** Пересчёт оценки при создании/изменении объекта (см. шапку выше) */
const recalcValuationHook: CollectionBeforeChangeHook = async ({ data, req, operation, originalDoc }) => {
  if (!data) return data
  const prev = (originalDoc || {}) as Record<string, unknown>
  const doc = { ...prev, ...data } as Record<string, unknown>
  const manualSent =
    'valuation' in data &&
    data.valuation != null &&
    typeof data.valuation === 'object' &&
    ['manualEnabled', 'manualValue', 'manualNote'].some((k) => k in (data.valuation as Record<string, unknown>))

  const needsRecalc =
    operation === 'create' ||
    'valuation' in data ||
    flagFromReq(req, 'recalc') ||
    VALUATION_TRIGGER_KEYS.some((k) => k in data)
  if (!needsRecalc) return data

  const comparableUnits = await comparableUnitsFromDb(req, doc)
  const res = evaluateValuation(paramsFromDoc(doc as unknown as ValuationDocLike), comparableUnits)

  // Ручная корректировка агента: значения присылает CRM вместе с формой;
  // всё, что агент не менял, переносим из предыдущей версии группы
  const prevVal = (prev.valuation || {}) as Record<string, unknown>
  const nextVal = (data.valuation && typeof data.valuation === 'object'
    ? data.valuation
    : {}) as Record<string, unknown>
  const manualEnabled =
    typeof nextVal.manualEnabled === 'boolean'
      ? nextVal.manualEnabled
      : typeof prevVal.manualEnabled === 'boolean'
        ? prevVal.manualEnabled
        : false
  const manualValue =
    typeof nextVal.manualValue === 'number'
      ? nextVal.manualValue
      : typeof prevVal.manualValue === 'number'
        ? prevVal.manualValue
        : null
  const manualActive = manualEnabled && typeof manualValue === 'number' && manualValue > 0
  const user = (req as { user?: { email?: string; name?: string } }).user
  const manualBy = manualActive ? user?.name || user?.email || 'CRM' : null
  const manualNote =
    typeof nextVal.manualNote === 'string'
      ? nextVal.manualNote
      : typeof prevVal.manualNote === 'string'
        ? prevVal.manualNote
        : null

  // Действующая оценка: ручная правка агента либо системный расчёт.
  // Вердикт «ниже/соответствует/выше рынка» всегда считается от неё.
  const price = typeof doc.price === 'number' ? doc.price : null
  const finalEstimate = manualActive ? manualValue : res.estimate
  let deviationRub: number | null = null
  let deviationPct: number | null = null
  let verdict = res.verdict
  if (price && price > 0 && finalEstimate) {
    deviationRub = Math.round(price - finalEstimate)
    deviationPct = Math.round(((price - finalEstimate) / finalEstimate) * 1000) / 10
    verdict = deviationPct <= -5 ? 'below' : deviationPct >= 5 ? 'above' : 'match'
  }

  data.valuation = {
    // Системный расчёт (всегда «честный», от него считается ручная правка)
    estimate: res.estimate,
    estimateMin: res.estimateMin,
    estimateMax: res.estimateMax,
    perUnit: res.perUnit,
    unit: res.unit,
    source: res.source,
    comparablesCount: res.comparablesCount,
    confidence: res.confidence,
    insufficient: res.insufficient,
    missingParams: res.missing,
    usedParams: res.used,
    method: res.method,
    calculatedAt: res.at,
    // Действующая оценка и сравнение с ценой
    finalEstimate,
    deviationRub,
    deviationPct,
    verdict,
    // Ручная корректировка агента
    manualEnabled: manualActive,
    manualValue: manualActive ? manualValue : null,
    manualNote,
    manualBy,
    manualAt: manualActive && manualSent ? new Date().toISOString() : (prevVal.manualAt || null),
  }
  return data
}

export const Objects: CollectionConfig = {
  slug: 'objects',
  labels: { singular: 'Объект', plural: 'Объекты' },
  admin: {
    useAsTitle: 'title',
    group: 'Недвижимость',
    defaultColumns: ['title', 'type', 'category', 'price', 'status'],
  },
  access: {
    // Каталог на сайте читает объекты без авторизации
    read: () => true,
    // Добавлять объекты могут только сотрудники (агент или администратор).
    // Клиенты регистрируются на сайте и работают через заявки — создание
    // объекта напрямую из REST им не нужно и раньше было открыто всем.
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    // Агент добавляет/редактирует/публикует только «свои» объекты (в карточке
    // указан его профиль из коллекции agents, agents.user = этот пользователь).
    // Общую базу агент видит на чтение, править чужие — только администратор.
    // Возвращаем query-констрейнт — Payload сам ограничит выборку документа.
    update: async ({ req }) => {
      const user = req.user as AccessReq['user'] | undefined
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role !== 'agent') return false
      const mine = await myAgentIds(req)
      if (!mine.size) return false
      const where: Where = { agent: { in: [...mine] } }
      return where
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    // Slug — чисто служебное поле: его генерирует сервер ДО валидации и
    // записи (beforeValidate выполняется раньше проверок полей и beforeChange),
    // поэтому формам и API присылать slug не нужно, а поле в схеме не
    // обязательное. Формат — object-<уникальный-id>: id записи БД выдаёт уже
    // после хуков, поэтому уникальность даёт сам UUID (полный), а не проверка
    // занятости с суффиксами -2, -3… У старых записей slug остаётся как есть.
    beforeValidate: [
      // Необязательные select-поля адреса (район, район города, товарищество):
      // Payload считает пустую строку '' недействительным вариантом выбора
      // («Следующее поле недействительно: Адрес > …») — формы присылают ''
      // в невыбранных полях. Приводим '' к null («значение не указано»),
      // как это делает сама админка, до проверки полей.
      async ({ data }) => {
        if (!data) return data
        const addr = data.address
        if (addr && typeof addr === 'object') {
          for (const key of ['district', 'cityDistrict', 'snt'] as const) {
            const value = (addr as Record<string, unknown>)[key]
            if (typeof value === 'string' && !value.trim()) {
              ;(addr as Record<string, unknown>)[key] = null
            }
          }
        }
        return data
      },
      async ({ data, operation }) => {
        if (!data) return data
        if (operation === 'create') {
          // Всегда пересобираем: присланный клиентом slug не принимаем.
          data.slug = `object-${crypto.randomUUID()}`
        } else {
          // На правке slug не трогаем и клиентские значения игнорируем:
          // изменение названия/цены/статуса не должно переименовывать объект.
          delete data.slug
        }
        return data
      },
    ],
    beforeChange: [
      // Нормализация полей собственника + защита от жёстких дублей.
      // Полный анализ (включая адрес и имя) делает клиент через
      // /api/objects/check-duplicate; здесь — телефон и кадастровый,
      // чтобы дубль нельзя было создать ни через API, ни через админку.
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        if (data.ownerPhone) {
          data.ownerPhone = normPhone(data.ownerPhone)
        }
        if (data.cadastralNumber) {
          data.cadastralNumber = normCadastral(data.cadastralNumber)
        }
        // Единица площади участка: подсказка показа («6 соток» у участка,
        // «600 м²» у квартиры). Сама площадь ВСЕГДА хранится в м² — конвертацию
        // (1 сотка = 100 м²) делает форма CRM, движок оценки и фильтры.
        // У не-участков и у присланных значений поле приводим к м².
        if (data.areaUnit !== undefined || data.category !== undefined) {
          const prev = originalDoc as { category?: string } | undefined
          const category = data.category !== undefined ? data.category : prev?.category
          if (category !== 'land') {
            data.areaUnit = 'sqm'
          } else if (data.areaUnit !== undefined) {
            data.areaUnit = data.areaUnit === 'are' ? 'are' : 'sqm'
          }
        }
        // force=true приходит query-параметром (см. flagFromReq)
        if (flagFromReq(req, 'force')) return data
        const or: Where[] = []
        if (data.ownerPhone) {
          or.push({ ownerPhone: { equals: data.ownerPhone } })
        }
        if (data.cadastralNumber) {
          or.push({ cadastralNumber: { equals: data.cadastralNumber } })
        }
        if (or.length) {
          const where: Where = data.id ? { and: [{ or }, { id: { not_equals: data.id } }] } : { or }
          const { docs } = await req.payload.find({
            collection: 'objects',
            where,
            limit: 5,
            depth: 0,
            overrideAccess: true,
          })
          if (docs.length) {
            throw new Error('Такой объект уже есть в базе: совпал телефон или кадастровый номер собственника')
          }
        }
        return data
      },
      // Автоматическая оценка рыночной стоимости (см. шапку рекалк-хука).
      // Идёт после нормализации и защиты от дублей: если запись отклонена
      // (дубль), лишних вычислений не делаем.
      recalcValuationHook,
    ],
    // Синхронизация публикаций на площадки (модуль «Публикация», см.
    // src/lib/publish-service.ts): при изменении объекта автоматически
    // обновляем опубликованные объявления VK/Telegram, при снятии с продажи
    // (status=archived) — снимаем их; при удалении — снимаем объявления.
    // Сами хуки тяжёлых сетевых вызовов не ждут: синхронизация уходит
    // в фоновые задачи (статусы площадок обновятся следом).
    afterChange: [objectsAfterChange],
    afterDelete: [objectsAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название объекта',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL-путь',
      unique: true,
      // Поле служебное: slug всегда генерируется сервером автоматически
      // (см. хук beforeValidate выше), пользователю не показываем.
      admin: {
        hidden: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Черновик', value: 'draft' },
        { label: 'Опубликован', value: 'published' },
        { label: 'Архив', value: 'archived' },
      ],
      defaultValue: 'draft',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      label: 'Тип сделки',
      options: [
        { label: 'Продажа', value: 'sale' },
        { label: 'Аренда', value: 'rent' },
      ],
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      label: 'Категория',
      options: [
        { label: 'Квартира', value: 'apartment' },
        { label: 'Дом', value: 'house' },
        { label: 'Таунхаус', value: 'townhouse' },
        { label: 'Коммерческая', value: 'commercial' },
        { label: 'Участок', value: 'land' },
      ],
      required: true,
    },
    {
      name: 'price',
      type: 'number',
      label: 'Цена (₽)',
      required: true,
      min: 0,
    },
    {
      name: 'area',
      type: 'number',
      label: 'Площадь (м²)',
      admin: {
        description: 'Всегда в м² (у участков 6 соток = 600 м²). Какую единицу показывать на сайте — см. «Единица площади»',
      },
    },
    {
      name: 'areaUnit',
      type: 'select',
      label: 'Единица площади',
      options: [
        { label: 'м²', value: 'sqm' },
        { label: 'сотки', value: 'are' },
      ],
      defaultValue: 'sqm',
      // Поле только для участков: квартиры, дома и коммерция — всегда м²
      admin: {
        condition: (_data, siblingData) => (siblingData as { category?: string } | undefined)?.category === 'land',
        description: 'Для земельных участков: в каких единицах агент вводил площадь. На сайте показывается «6 соток»; в базе площадь хранится в м² (1 сотка = 100 м²)',
      },
    },
    {
      name: 'livingArea',
      type: 'number',
      label: 'Жилая площадь (м²)',
    },
    {
      name: 'kitchenArea',
      type: 'number',
      label: 'Площадь кухни (м²)',
    },
    {
      name: 'rooms',
      type: 'number',
      label: 'Кол-во комнат',
    },
    {
      name: 'floor',
      type: 'number',
      label: 'Этаж',
    },
    {
      name: 'totalFloors',
      type: 'number',
      label: 'Всего этажей',
    },
    {
      name: 'buildingType',
      type: 'text',
      label: 'Тип дома',
      admin: {
        description: 'Любое значение. Например: Кирпичный, Монолитный, Панельный',
      },
    },
    {
      name: 'condition',
      type: 'text',
      label: 'Состояние',
      admin: {
        description: 'Любое значение. Например: Новое, Хорошее, Требует ремонта',
      },
    },
    {
      name: 'heating',
      type: 'text',
      label: 'Отопление',
      admin: {
        description: 'Любое значение. Например: Центральное, Автономное, Газовое',
      },
    },
    {
      name: 'water',
      type: 'text',
      label: 'Вода',
      admin: {
        description: 'Любое значение. Например: Есть, Центральная, Своя',
      },
    },
    {
      name: 'sewerage',
      type: 'text',
      label: 'Канализация',
      admin: {
        description: 'Любое значение. Например: Есть, Центральная, Септик',
      },
    },
    {
      name: 'electricity',
      type: 'text',
      label: 'Электричество',
      admin: {
        description: 'Любое значение. Например: Есть, Нет',
      },
    },
    {
      name: 'gas',
      type: 'text',
      label: 'Газ',
      admin: {
        description: 'Любое значение. Например: Есть, Магистральный, Баллонный',
      },
    },
    {
      name: 'internet',
      type: 'text',
      label: 'Интернет',
      admin: {
        description: 'Любое значение. Например: Есть, Нет',
      },
    },
    {
      name: 'balcony',
      type: 'text',
      label: 'Балкон',
      admin: {
        description: 'Любое значение. Например: Есть, Лоджия, Несколько',
      },
    },
    {
      name: 'builtYear',
      type: 'number',
      label: 'Год постройки',
      admin: {
        description: 'Например: 2016. Влияет на рыночную оценку',
      },
    },
    {
      name: 'elevator',
      type: 'text',
      label: 'Лифт',
      admin: {
        description: 'Любое значение. Например: Есть, Нет',
      },
    },
    {
      name: 'yard',
      type: 'text',
      label: 'Двор',
      admin: {
        description: 'Любое значение. Например: Закрытый, Охраняемый, Благоустроенный',
      },
    },
    {
      name: 'parking',
      type: 'text',
      label: 'Парковка',
      admin: {
        description: 'Любое значение. Например: Подземный паркинг, Гостевая, Нет',
      },
    },
    {
      name: 'address',
      type: 'group',
      label: 'Адрес',
      fields: [
        { name: 'city', type: 'text', label: 'Город', defaultValue: 'Владикавказ' },
        {
          name: 'district',
          type: 'select',
          label: 'Район',
          options: DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
        },
        {
          name: 'cityDistrict',
          type: 'select',
          label: 'Район города',
          // Внутригородские районы Владикавказа — отдельно от района республики
          // (address.district): квартиры и дома в черте города.
          options: CITY_DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
          admin: {
            isClearable: true,
            description: 'Район внутри Владикавказа (Иристонский, Затеречный и др.). Пусто — если объект вне города',
          },
        },
        {
          name: 'locality',
          type: 'text',
          label: 'Населённый пункт',
          admin: {
            description: 'Например: Владикавказ, Ногир, Заводской…',
          },
        },
        {
          name: 'snt',
          type: 'select',
          label: 'Садоводческое товарищество',
          // Выпадающий список разделов — как на сайте: админке не нужно
          // вписывать товарищество вручную. Все СНТ/СНО/ДНТ живут только
          // внутри Владикавказского городского округа (см. src/lib/districts.ts)
          options: SNT_AREAS.map((s) => ({ label: s, value: s })),
          admin: {
            isClearable: true,
            description: 'Товарищество (СТ/СНТ/СНО/ДНТ) для участков и домов вне города, например СТ Кобань. Пусто — если объект не в товариществе',
          },
        },
        { name: 'street', type: 'text', label: 'Улица' },
        { name: 'house', type: 'text', label: 'Дом' },
        { name: 'apartment', type: 'text', label: 'Квартира' },
      ],
    },
    {
      name: 'coordinates',
      type: 'group',
      label: 'Координаты',
      // Ручной ввод убран: координаты ставит карта в форме CRM (поиск адреса,
      // метка перетаскивается). Поля остаются в схеме — значения приходят
      // через REST, как и раньше.
      admin: {
        hidden: true,
      },
      fields: [
        { name: 'lat', type: 'number', label: 'Широта' },
        { name: 'lng', type: 'number', label: 'Долгота' },
      ],
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Описание',
    },
    {
      name: 'features',
      type: 'array',
      label: 'Особенности',
      fields: [
        { name: 'feature', type: 'text', label: 'Особенность' },
      ],
    },
    {
      name: 'images',
      type: 'upload',
      label: 'Фотографии',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'primaryImage',
      type: 'upload',
      label: 'Главное фото',
      relationTo: 'media',
    },
    {
      name: 'floorPlan',
      type: 'upload',
      label: 'План этажа',
      relationTo: 'media',
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Агент',
      relationTo: 'agents',
    },
    {
      name: 'ownerName',
      type: 'text',
      label: 'Собственник (имя)',
      // Контакты собственника — персональные данные: посетители и клиенты их
      // не видят вовсе, агент — только у своих объектов (см. isOwnObjectFor),
      // администратор — у всех. Поле просто исчезает из выдачи REST.
      access: {
        read: async ({ req, doc }) => {
          const user = req.user as AccessReq['user'] | undefined
          if (!user) return false
          if (user.role === 'admin') return true
          if (user.role !== 'agent') return false
          return isOwnObjectFor(req, doc)
        },
      },
      admin: {
        description: 'По имени и телефону собственника система находит дубли объекта',
      },
    },
    {
      name: 'ownerPhone',
      type: 'text',
      label: 'Собственник (телефон)',
      access: {
        read: async ({ req, doc }) => {
          const user = req.user as AccessReq['user'] | undefined
          if (!user) return false
          if (user.role === 'admin') return true
          if (user.role !== 'agent') return false
          return isOwnObjectFor(req, doc)
        },
      },
      admin: {
        description: 'Хранится нормализованно: только цифры и +',
      },
    },
    {
      name: 'cadastralNumber',
      type: 'text',
      label: 'Кадастровый номер',
      access: {
        read: async ({ req, doc }) => {
          const user = req.user as AccessReq['user'] | undefined
          if (!user) return false
          if (user.role === 'admin') return true
          if (user.role !== 'agent') return false
          return isOwnObjectFor(req, doc)
        },
      },
      admin: {
        description: 'Например: 15:07:0030021:123',
      },
    },
    {
      name: 'isPremium',
      type: 'checkbox',
      label: 'Премиум-объект',
      defaultValue: false,
    },
    {
      name: 'isExclusive',
      type: 'checkbox',
      label: 'Эксклюзив',
      defaultValue: false,
    },
    {
      name: 'urgentSale',
      type: 'checkbox',
      label: 'Срочная продажа',
      defaultValue: false,
      admin: {
        description: 'Показывает объект в блоке «Срочные продажи» на главной странице. Объект остаётся в каталоге и доступен по всем фильтрам',
      },
    },
    {
      // Рыночная оценка — внутренний инструмент CRM. Значения рассчитывает
      // серверный хук (см. recalcValuationHook); в админ-панели группа
      // скрыта, чтобы её нельзя было случайно изменить — ручная правка
      // агента выполняется в интерфейсе CRM (manual* поля).
      name: 'valuation',
      type: 'group',
      label: 'Рыночная оценка (внутренняя)',
      admin: {
        hidden: true,
        description: 'Ориентировочный анализ агентства, не официальная независимая оценка',
      },
      fields: [
        { name: 'estimate', type: 'number', label: 'Оценка (системная), ₽' },
        { name: 'estimateMin', type: 'number', label: 'Нижняя граница, ₽' },
        { name: 'estimateMax', type: 'number', label: 'Верхняя граница, ₽' },
        { name: 'finalEstimate', type: 'number', label: 'Действующая оценка, ₽' },
        { name: 'perUnit', type: 'number', label: 'Оценка за единицу' },
        {
          name: 'unit',
          type: 'select',
          label: 'Единица сравнения',
          options: [
            { label: 'м²', value: 'sqm' },
            { label: 'сотка', value: 'are' },
            { label: 'м² в месяц', value: 'sqmMonth' },
          ],
        },
        {
          name: 'source',
          type: 'select',
          label: 'Источник базовой ставки',
          options: [
            { label: 'Сопоставимые объекты базы Н15', value: 'comparables' },
            { label: 'Справочные ставки Н15', value: 'rates' },
          ],
        },
        { name: 'comparablesCount', type: 'number', label: 'Компараблей использовано' },
        {
          name: 'confidence',
          type: 'select',
          label: 'Уверенность',
          options: [
            { label: 'Низкая', value: 'low' },
            { label: 'Средняя', value: 'medium' },
            { label: 'Высокая', value: 'high' },
          ],
        },
        { name: 'insufficient', type: 'checkbox', label: 'Недостаточно данных' },
        { name: 'missingParams', type: 'text', hasMany: true, label: 'Чего не хватает' },
        { name: 'usedParams', type: 'text', hasMany: true, label: 'Учтённые параметры' },
        { name: 'method', type: 'text', label: 'Метод' },
        { name: 'calculatedAt', type: 'date', label: 'Дата последнего расчёта' },
        { name: 'deviationRub', type: 'number', label: 'Отклонение от цены, ₽' },
        { name: 'deviationPct', type: 'number', label: 'Отклонение от цены, %' },
        {
          name: 'verdict',
          type: 'select',
          label: 'Вывод',
          options: [
            { label: 'Ниже рынка', value: 'below' },
            { label: 'Соответствует рынку', value: 'match' },
            { label: 'Выше рынка', value: 'above' },
          ],
        },
        { name: 'manualEnabled', type: 'checkbox', label: 'Ручная корректировка агента' },
        { name: 'manualValue', type: 'number', label: 'Ручная оценка, ₽' },
        { name: 'manualNote', type: 'textarea', label: 'Комментарий к ручной правке' },
        { name: 'manualBy', type: 'text', label: 'Кто скорректировал' },
        { name: 'manualAt', type: 'date', label: 'Когда скорректировано' },
      ],
    },
    {
      // «Где размещён объект» — внутренний инструмент CRM. Привязанные к
      // карточке объявления площадок (Авито, ЦИАН, Домклик, Яндекс и др.)
      // и служебные метки проверок заполняет сервер (см. src/lib/listing-check.ts
      // и placements-service.ts); в админ-панели группа скрыта — работа ведётся
      // в интерфейсе CRM (блок «Где размещён объект»).
      name: 'placements',
      type: 'group',
      label: 'Где размещён объект (внутреннее)',
      admin: {
        hidden: true,
        description:
          'Объявления на площадках недвижимости, привязанные к объекту. Проверки запускает кнопка «Проверить сейчас» и автоматический проход',
      },
      fields: [
        {
          name: 'lastCheckedAt',
          type: 'date',
          label: 'Последняя проверка площадок',
        },
        {
          name: 'nextCheckAt',
          type: 'date',
          label: 'Следующая автоматическая проверка',
        },
        {
          name: 'note',
          type: 'textarea',
          label: 'Пометка о режиме проверки',
        },
        {
          // Снимок кнопки «Проверить размещение»: что нашлось по каждой
          // площадке (включая «проверка недоступна» без официального канала).
          // Пишет сервер (см. src/lib/placement-search-service.ts), тип —
          // PlacementProbe[]; хранится снимком, чтобы карточка показывала
          // последнюю проверку до повторного нажатия кнопки.
          name: 'search',
          type: 'json',
          label: 'Проверка размещения (снимок)',
        },
        {
          name: 'searchAt',
          type: 'date',
          label: 'Когда проверяли размещение',
        },
        {
          name: 'items',
          type: 'array',
          label: 'Найденные объявления',
          labels: { singular: 'Объявление на площадке', plural: 'Объявления на площадках' },
          fields: [
            {
              name: 'platform',
              type: 'text',
              label: 'Площадка',
              required: true,
              admin: { description: 'Код площадки: avito, cian, domclick, yandex…' },
            },
            { name: 'url', type: 'text', label: 'Ссылка на объявление' },
            { name: 'title', type: 'text', label: 'Название объявления' },
            {
              name: 'source',
              type: 'select',
              label: 'Откуда запись',
              options: [
                { label: 'Ручная ссылка агента', value: 'manual' },
                { label: 'Автоматическая сверка', value: 'auto' },
              ],
              defaultValue: 'manual',
            },
            {
              name: 'status',
              type: 'select',
              label: 'Статус объявления',
              options: [
                { label: 'Активно', value: 'active' },
                { label: 'Снято', value: 'removed' },
                { label: 'Требует проверки', value: 'needsCheck' },
              ],
              defaultValue: 'needsCheck',
            },
            {
              name: 'match',
              type: 'number',
              label: 'Степень совпадения, %',
              min: 0,
              max: 100,
              admin: { description: 'Насколько объявление похоже на объект Н15 (пересечение признаков)' },
            },
            {
              name: 'matchParams',
              type: 'text',
              hasMany: true,
              label: 'Совпавшие признаки',
            },
            { name: 'price', type: 'number', label: 'Цена в объявлении, ₽' },
            { name: 'priceInitial', type: 'number', label: 'Цена при первом обнаружении, ₽' },
            { name: 'firstSeenAt', type: 'date', label: 'Когда обнаружено' },
            { name: 'lastCheckedAt', type: 'date', label: 'Последняя реальная проверка' },
            { name: 'note', type: 'text', label: 'Пометка' },
          ],
        },
      ],
    },
    {
      // «Публикация на площадках» — выгрузка объектов CRM наружу (сайт N15,
      // VK, Telegram; Авито/ЦИАН/Яндекс/Домклик — по мере подключения
      // официальных API/фидов). CRM — единственный источник данных: тексты
      // объявлений собираются из документа при каждой выгрузке. Группу ведёт
      // сервер (см. src/lib/publish-service.ts и publish-adapters.ts),
      // работа ведётся в интерфейсе CRM (блок «Публикация» карточки);
      // в админ-панели группа скрыта, как valuation и placements.
      name: 'publishing',
      type: 'group',
      label: 'Публикация на площадках (внутреннее)',
      admin: {
        hidden: true,
        description: 'Статусы выгрузки объекта на площадки. Управляется в карточке CRM (кнопки «Опубликовать»/«Снять с публикации»)',
      },
      fields: [
        {
          name: 'items',
          type: 'array',
          label: 'Площадки публикации',
          labels: { singular: 'Площадка публикации', plural: 'Площадки публикации' },
          fields: [
            {
              name: 'platform',
              type: 'text',
              label: 'Площадка',
              required: true,
              admin: { description: 'Код площадки: site, vk, telegram, avito, cian, yandex, domclick, instagram' },
            },
            {
              name: 'status',
              type: 'select',
              label: 'Статус',
              options: [
                { label: 'Не опубликован', value: 'off' },
                { label: 'Опубликован', value: 'published' },
                { label: 'Ошибка', value: 'error' },
                { label: 'Снят', value: 'removed' },
              ],
              defaultValue: 'off',
              required: true,
            },
            {
              name: 'remoteId',
              type: 'text',
              label: 'id объявления на площадке',
              admin: { description: 'Служебное: для обновления и снятия объявления (пост VK, message_id Telegram)' },
            },
            { name: 'externalUrl', type: 'text', label: 'Ссылка на объявление' },
            { name: 'publishedAt', type: 'date', label: 'Когда впервые опубликовано' },
            { name: 'lastExportAt', type: 'date', label: 'Дата и время последней выгрузки' },
            { name: 'lastError', type: 'textarea', label: 'Сообщение об ошибке' },
            {
              name: 'lastFingerprint',
              type: 'text',
              label: 'Отпечаток последней выгрузки',
              admin: { description: 'Служебное: чтобы обновлять объявления только при реальных изменениях объекта' },
            },
          ],
        },
        {
          name: 'log',
          type: 'array',
          label: 'Журнал изменений публикаций',
          labels: { singular: 'Запись журнала', plural: 'Записи журнала' },
          fields: [
            { name: 'at', type: 'date', label: 'Когда', required: true },
            {
              name: 'event',
              type: 'select',
              label: 'Событие',
              required: true,
              options: [
                { label: 'Публикация', value: 'publish' },
                { label: 'Обновление', value: 'update' },
                { label: 'Снятие с публикации', value: 'unpublish' },
                { label: 'Снятие с продажи', value: 'withdraw' },
                { label: 'Ошибка', value: 'error' },
                { label: 'Проверка полей', value: 'validate' },
                { label: 'Пометка', value: 'note' },
              ],
            },
            { name: 'platform', type: 'text', label: 'Площадка' },
            { name: 'message', type: 'textarea', label: 'Сообщение' },
            { name: 'by', type: 'text', label: 'Кто выполнил' },
          ],
        },
      ],
    },
    {
      // «Данные о доме» — характеристики многоквартирного дома из открытого
      // реестра АИС ППК «ФРТ» (см. src/lib/house-info.ts). Кнопка «Получить
      // данные о доме» в карточке CRM запускает проверку, снимок пишет сервер
      // (см. src/lib/house-info-service.ts). Здесь же живёт подтверждение
      // агентом: до него значения клиенту не показываются. У каждой
      // характеристики — источник, поставщик данных и дата проверки;
      // расхождения поставщиков помечаются «Требует проверки», отсутствие
      // сведений — «Не найдено». Группа закрыта для посетителей и клиентов:
      // её читают только сотрудники (агент и администратор).
      name: 'houseInfo',
      type: 'group',
      label: 'Данные о доме (внутреннее)',
      admin: {
        hidden: true,
        description: 'Характеристики дома из официального реестра, подтверждение агентом',
      },
      access: {
        read: ({ req: { user } }) => {
          const staff = user as { role?: string } | null | undefined
          return staff?.role === 'agent' || staff?.role === 'admin'
        },
      },
      fields: [
        {
          name: 'status',
          type: 'select',
          label: 'Итог проверки',
          options: [
            { label: 'Дом найден', value: 'found' },
            { label: 'Дом не найден', value: 'notFound' },
            { label: 'Найдено несколько домов', value: 'ambiguous' },
            { label: 'Проверка недоступна', value: 'unavailable' },
            { label: 'Не указан адрес', value: 'noAddress' },
          ],
        },
        { name: 'checkedAt', type: 'date', label: 'Дата проверки' },
        { name: 'registry', type: 'text', label: 'Источник (реестр)' },
        { name: 'registryUrl', type: 'text', label: 'Ссылка на карточку дома в реестре' },
        { name: 'houseId', type: 'text', label: 'Номер дома в реестре' },
        { name: 'houseAddress', type: 'text', label: 'Адрес дома в реестре' },
        { name: 'registryUpdatedAt', type: 'date', label: 'Актуализировано в реестре' },
        { name: 'plotCadastral', type: 'text', label: 'Кадастровый номер участка по реестру' },
        { name: 'query', type: 'text', label: 'Поисковый запрос' },
        {
          name: 'matchedBy',
          type: 'select',
          label: 'Чем подтверждён дом',
          options: [
            { label: 'Адресом', value: 'address' },
            { label: 'Кадастровым номером', value: 'cadastral' },
          ],
        },
        {
          // Снимок характеристик: HouseInfoField[] из src/lib/house-info.ts —
          // значение, статус (подтверждено / требует проверки / не найдено),
          // источник, поставщик данных и дата проверки. Хранится снимком,
          // чтобы карточка показывала последнюю проверку до повторного нажатия
          name: 'fields',
          type: 'json',
          label: 'Характеристики дома (снимок)',
        },
        { name: 'note', type: 'textarea', label: 'Пояснение к проверке' },
        {
          // Подтверждение агентом: { [ключ характеристики]: true }. Только
          // подтверждённое уходит клиенту (группа housePublic)
          name: 'approved',
          type: 'json',
          label: 'Подтверждено агентом',
        },
        { name: 'approvedAt', type: 'date', label: 'Когда подтверждено' },
        { name: 'approvedBy', type: 'text', label: 'Кто подтвердил' },
        {
          name: 'log',
          type: 'array',
          label: 'Журнал проверок и подтверждений',
          labels: { singular: 'Запись журнала', plural: 'Записи журнала' },
          fields: [
            { name: 'at', type: 'date', label: 'Когда', required: true },
            {
              name: 'event',
              type: 'select',
              label: 'Событие',
              options: [
                { label: 'Проверка реестра', value: 'check' },
                { label: 'Подтверждение', value: 'approve' },
              ],
            },
            { name: 'message', type: 'textarea', label: 'Сообщение' },
            { name: 'by', type: 'text', label: 'Кто выполнил' },
          ],
        },
      ],
    },
    {
      // Публичная часть «Данных о доме»: только те характеристики, которые
      // агент подтвердил (см. approveHouseInfo). Это единственное, что
      // показывается клиенту на странице объекта — вместе с источником
      // (АИС ППК «ФРТ», ГИС ЖКХ) и датой проверки. Пишет группу сервер.
      name: 'housePublic',
      type: 'group',
      label: 'Характеристики дома (подтверждённые)',
      admin: {
        hidden: true,
        description: 'Подтверждённые агентом характеристики дома — показываются клиенту на странице объекта',
      },
      fields: [
        {
          // HousePublicItem[] из src/lib/house-info.ts: подпись, значение,
          // источник и дата проверки
          name: 'items',
          type: 'json',
          label: 'Подтверждённые характеристики',
        },
        { name: 'confirmedAt', type: 'date', label: 'Когда подтверждено' },
      ],
    },
  ],
}

import type { CollectionBeforeChangeHook, CollectionConfig, Payload, TextFieldSingleValidation, Where } from 'payload'
import { DISTRICT_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
// Садовые товарищества — тот же справочник, что в разделах СТ/СНТ/СНО
// на главной, в каталоге и форме CRM (landing-data.ts)
import { SNT_AREAS } from '@/components/home/landing-data'
import { evaluateValuation, paramsFromDoc, type ValuationDocLike } from '@/lib/valuation'
// Единицы площади участков (м² / сотки / га) — общий хелпер показа и разбора,
// см. src/lib/area-format.ts
import { areaUnitOf } from '@/lib/area-format'
// «Архив объектов»: причины переноса, журнал и группа archive документа —
// см. src/lib/archive.ts и раздел CRM /crm/archive
import { ARCHIVE_LOG_LIMIT, ARCHIVE_REASONS, archiveFromDoc, isArchiveReason, type ArchiveGroup } from '@/lib/archive'
// Автоматическая синхронизация публикаций на площадки: при изменении объекта
// обновляем опубликованные посты, при снятии с продажи (archived) — снимаем
// объявления (см. src/lib/publish-service.ts)
import { objectsAfterChange, objectsAfterDelete } from '@/lib/publish-service'
// Телефон собственника — к одному виду «+7 (918) 828-40-88»: те же функции,
// что у телефонов агентов (см. src/lib/phone.ts), иначе один и тот же номер,
// набранный как «8 918…» и как «+7 918…», не считался бы дублем
import { formatRuPhone } from '@/lib/phone'
// Кадастровый номер — общий формат с формой CRM и юрэкспертизой
// (см. src/lib/cadastral.ts)
import { cleanCadastral, isCadastralFormat } from '@/lib/cadastral'
// «Свой» объект сотрудника (ответственный агент или автор карточки) —
// общее правило с маршрутами API и сервисами, см. src/lib/object-access.ts
import { isOwnObjectDoc, ownObjectsWhere } from '@/lib/object-access'
// Варианты покупки (ипотечные программы, рассрочка, маткапитал) — общий
// список и правила с каталогом, страницей объекта и фильтрами,
// см. src/lib/purchase-options.ts
import { PURCHASE_OPTIONS, purchaseOptionsApply } from '@/lib/purchase-options'

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

/**
 * Ошибка формата кадастрового номера или null, если номер пуст либо записан
 * верно. Общая для всех кадастровых полей: номер дома (cadastralNumber) и
 * номер участка (plotCadastralNumber) — номера разных объектов учёта, но
 * формат у них один, ЕГРН.
 */
function cadastralFormatError(value: unknown): string | null {
  const number = cleanCadastral(typeof value === 'string' ? value : '')
  if (number && !isCadastralFormat(number)) {
    return 'Кадастровый номер — в формате 15:07:0030021:123 (только цифры и двоеточия)'
  }
  return null
}

/**
 * Проверка кадастрового номера объекта: формат ЕГРН и обязательность у участка.
 *
 * Стоит полем в коллекции, а не только в форме CRM: номер приходит и из
 * админки, и через API. Пробелы и дефисы не мешают (их снимает
 * cleanCadastral), а «12345» записать нельзя — по такому номеру потом не
 * ищется ни выписка ЕГРН, ни карточка в реестре.
 *
 * У земельного участка номер обязателен при создании карточки: это главный
 * признак участка. Уже сохранённые участки без номера правятся как раньше —
 * иначе агент не смог бы поправить цену, пока собственник не назовёт номер.
 */
const validateCadastralNumber: TextFieldSingleValidation = (value, { data, operation }) => {
  const error = cadastralFormatError(value)
  if (error) return error
  const number = cleanCadastral(typeof value === 'string' ? value : '')
  if (!number && operation === 'create' && (data as { category?: string } | undefined)?.category === 'land') {
    return 'Для земельного участка укажите кадастровый номер'
  }
  return true
}

/**
 * Проверка кадастрового номера земельного участка частного дома: формат тот
 * же, что у номера дома, но без обязательности — участок у дома есть не
 * всегда, а номер вносят, когда он есть под рукой (у дома без участка поле
 * остаётся пустым).
 */
const validatePlotCadastralNumber: TextFieldSingleValidation = (value) =>
  cadastralFormatError(value) ?? true

/**
 * У каких категорий есть земельный участок — общее условие полей участка
 * (площадь, кадастровые сведения): дом, таунхаус и коммерция.
 *
 * Коммерция добавлена ради объектов с землёй — баз отдыха, гостиниц,
 * ресторанов и туристических объектов: у них площадь здания (поле «Площадь»)
 * и площадь земли — разные величины, и участок входит в стоимость лота.
 * У квартир участка нет, у земельных участков площадь самого объекта
 * хранится в «Площади».
 */
const isPlotCategoryCode = (category: unknown): boolean =>
  category === 'house' || category === 'townhouse' || category === 'commercial'

const isPlotCategory = (siblingData: unknown): boolean =>
  isPlotCategoryCode((siblingData as { category?: string } | undefined)?.category)

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

/**
 * Автор и агент объекта из базы — для полевых правил при чтении.
 *
 * В afterRead поля обходят по порядку, и закрытый createdBy (чтение только
 * администратору) успевает выпасть из документа раньше, чем проверяются
 * права на соседние поля с собственником и кадастром: агент-автор карточки
 * видел бы их пустыми. Поэтому владельца документа уточняем в базе — как и
 * myAgentIds, одним запросом на документ в пределах запроса.
 */
const ownDocCache = new WeakMap<object, Map<string, Promise<unknown>>>()

async function ownershipDoc(req: AccessReq, id: unknown): Promise<unknown> {
  if (id == null) return null
  let byId = ownDocCache.get(req)
  if (!byId) {
    byId = new Map()
    ownDocCache.set(req, byId)
  }
  const key = String(id)
  const cached = byId.get(key)
  if (cached) return cached
  const promise = (async () => {
    try {
      return await req.payload.findByID({
        collection: 'objects',
        id: id as number,
        depth: 0,
        overrideAccess: true,
        select: { agent: true, createdBy: true },
      })
    } catch {
      // документ не нашли — считаем, что своих прав на него нет
      return null
    }
  })()
  byId.set(key, promise)
  return promise
}

/** Сотрудник CRM: агент или администратор (у клиента доступа к объектам нет) */
const isStaff = (user?: { role?: string } | null): boolean =>
  user?.role === 'agent' || user?.role === 'admin'

/**
 * Свой ли объект сотруднику: он указан ответственным агентом (в карточке
 * стоит профиль из коллекции agents, привязанный к его учётной записи,
 * agents.user) или он создал карточку (createdBy — его учётная запись).
 *
 * Это единственное определение «своего» объекта для прав: по нему агент
 * правит карточку (см. access.update), распоряжается её архивом и видит
 * данные собственника. Администратору доступно всё. Правило общее с
 * маршрутами API и сервисами — см. src/lib/object-access.ts.
 */
async function isOwnObject(req: AccessReq, doc: unknown): Promise<boolean> {
  if (!req.user) return false
  if (req.user.role === 'admin') return true
  const mine = await myAgentIds(req)
  return isOwnObjectDoc(doc, req.user, mine)
}

/**
 * Доступ к закрытым сведениям объекта — данным собственника (имя, телефон)
 * и кадастровым номерам. Администратору — у любого объекта, агенту — только
 * у своих (см. isOwnObject): чужие карточки сотрудник видит в общей базе,
 * но персональные данные и кадастр чужих собственников ему не отдаются и
 * не правятся. На публичном сайте поля не показываются никому.
 */
const privateFieldsAccess = {
  create: ({ req }: { req: AccessReq }): boolean => isStaff(req.user),
  // При чтении владельца берём из базы: к этому моменту createdBy уже вырезан
  // из документа (см. ownershipDoc), при правке в doc приходит исходный
  // документ целиком — там автор и агент на месте
  read: async ({ req, id }: { req: AccessReq; id?: number | string | null }): Promise<boolean> => {
    if (!req.user) return false
    if (req.user.role === 'admin') return true
    if (req.user.role !== 'agent') return false
    return isOwnObject(req, await ownershipDoc(req, id))
  },
  update: ({ req, doc }: { req: AccessReq; doc?: unknown }): Promise<boolean> => isOwnObject(req, doc),
}

/**
 * Доступ к вариантам покупки (ипотечные программы, рассрочка, маткапитал).
 *
 * Читают все: значки на обложке карточки каталога, список на странице объекта
 * и фильтр каталога открыты и посетителям, без авторизации. Правит агент
 * только у своего объекта, администратор — у любого (то же правило, что у
 * данных собственника, см. privateFieldsAccess): у чужой карточки выбор
 * вариантов не перезапишется ни из формы, ни прямым запросом к API.
 */
const purchaseOptionsAccess = {
  read: (): boolean => true,
  create: ({ req }: { req: AccessReq }): boolean => isStaff(req.user),
  update: ({ req, doc }: { req: AccessReq; doc?: unknown }): Promise<boolean> => isOwnObject(req, doc),
}

/**
 * Ответственный агент и автор карточки.
 *
 * Новый объект агента сразу «свой»: его профиль из коллекции agents
 * подставляется ответственным агентом, а в createdBy записывается его
 * учётная запись. Выбирать ничего не нужно, и объект не потеряется —
 * без агента он был бы доступен только администратору.
 *
 * При правке ответственного агента и автора меняет только администратор:
 * агент не передаёт свой объект другому и не забирает чужой (правку чужого
 * не пропускает access.update, поле «Агент» закрыто от агента на уровне
 * поля). У не-администратора присланные значения просто не принимаются —
 * в карточке остаются прежние.
 */
const objectsOwnershipHook: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (!data) return data
  const user = (req as { user?: { id?: number | string; role?: string } }).user
  if (!user) return data
  if (operation === 'create') {
    if (user.id != null) data.createdBy = user.id
    if (user.role === 'agent') {
      const mine = await myAgentIds(req as unknown as AccessReq)
      const own = mine.values().next().value
      if (own != null) data.agent = own
    }
    return data
  }
  if (user.role !== 'admin') {
    delete data.agent
    delete data.createdBy
  }
  return data
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
  'type', 'category', 'price', 'area', 'livingArea', 'kitchenArea', 'plotArea', 'rooms',
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
    // Отчёт «оценка по рынку» (кнопка в CRM, формат см. src/lib/market-valuation.ts)
    // живёт в этой же группе отдельным снимком: пересчёт системной оценки его
    // не трогает, снимок заменяется только новым запуском оценки
    marketRun: 'marketRun' in nextVal ? nextVal.marketRun : (prevVal.marketRun ?? null),
  }
  return data
}

/**
 * Перенос объекта в архив и возврат из архива — журнал группы archive.
 *
 * Архивных объектов не удаляем: «Переместить в архив» (кнопка карточки CRM
 * или смена статуса) фиксирует причину, комментарий, дату, автора и прежний
 * статус. По прежнему статусу кнопка «Восстановить объект» возвращает объект
 * в работу и снова открывает его для публикации. Каждый перенос и возврат
 * попадает в историю изменений (archive.log) — её показывает раздел
 * «Архив объектов» и карточка объекта.
 *
 * Снятие объявлений при архивации и запрет публикации архивных объектов
 * обеспечивает модуль публикации (см. src/lib/publish-service.ts): смена
 * статуса на archived здесь только фиксируется в документе.
 */
const archiveTransitionHook: CollectionBeforeChangeHook = ({ data, req, originalDoc }) => {
  if (!data) return data
  const prev = (originalDoc || {}) as Record<string, unknown>
  const prevStatus = typeof prev.status === 'string' ? prev.status : undefined
  const nextStatus = typeof data.status === 'string' ? data.status : prevStatus
  if (!nextStatus) return data

  const entering = nextStatus === 'archived' && prevStatus !== 'archived'
  const leaving = prevStatus === 'archived' && nextStatus !== 'archived'
  if (!entering && !leaving) return data

  const prevArchive = archiveFromDoc(prev)
  const incoming = (data.archive && typeof data.archive === 'object' ? data.archive : {}) as ArchiveGroup
  const user = (req as { user?: { name?: string; email?: string } }).user
  const by = user?.name || user?.email || 'CRM'
  const at = new Date().toISOString()
  const log = Array.isArray(prevArchive.log) ? prevArchive.log : []

  if (entering) {
    // Причина приходит вместе с формой (модалка «Переместить в архив»); при
    // смене статуса вручную оставляем прежнюю причину либо «Другая причина»
    const reason = isArchiveReason(incoming.reason)
      ? incoming.reason
      : isArchiveReason(prevArchive.reason)
        ? prevArchive.reason
        : 'other'
    const comment = typeof incoming.comment === 'string' ? incoming.comment.trim() : prevArchive.comment || ''
    data.archive = {
      reason,
      comment,
      archivedAt: at,
      archivedBy: by,
      // Вернуть объект можно только в черновик или публикацию — архив в архив
      // не восстанавливаем; объект без прежнего статуса вернётся черновиком
      previousStatus: prevStatus === 'published' ? 'published' : 'draft',
      log: [...log, { at, event: 'archive', reason, comment, by }].slice(-ARCHIVE_LOG_LIMIT),
    }
  } else {
    // Возврат из архива: причина и комментарий остаются в истории изменений
    data.archive = {
      ...prevArchive,
      log: [
        ...log,
        { at, event: 'restore', reason: prevArchive.reason || null, comment: prevArchive.comment || null, by },
      ].slice(-ARCHIVE_LOG_LIMIT),
    }
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
    // Каталог на сайте читает объекты без авторизации. Архивные объекты
    // (снятые с продажи) посетителям и клиентам не отдаём вовсе: они живут
    // только в разделе CRM «Архив объектов» — сайт, каталог, поиск и рекламные
    // выгрузки берут объекты без статуса archived (см. src/lib/archive.ts).
    read: ({ req: { user } }) => {
      const staff = user as { role?: string } | null | undefined
      if (staff?.role === 'agent' || staff?.role === 'admin') return true
      return { status: { not_equals: 'archived' } }
    },
    // Добавлять объекты могут только сотрудники (агент или администратор).
    // Клиенты регистрируются на сайте и работают через заявки — создание
    // объекта напрямую из REST им не нужно и раньше было открыто всем.
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    // Агент добавляет/редактирует/публикует только «свои» объекты: он указан
    // в карточке ответственным агентом (профиль из коллекции agents,
    // agents.user = этот пользователь) или создал её (createdBy — см. поле
    // ниже). Общую базу агент видит на чтение, править чужие — только
    // администратор. Возвращаем query-констрейнт: Payload сам проверит по нему
    // документ, поэтому прямой PATCH чужого объекта из REST тоже отклоняется,
    // а не только прячется кнопка в интерфейсе.
    update: async ({ req }) => {
      const user = req.user as AccessReq['user'] | undefined
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role !== 'agent') return false
      const mine = await myAgentIds(req)
      return ownObjectsWhere(user.id, mine) ?? false
    },
    // Удаление объектов агентам запрещено: «Удалить окончательно» есть только
    // у администратора (кнопка в CRM — там же). Агент снимает объект с
    // продажи переносом в архив — это правка статуса, а не удаление.
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
      // Ответственный агент и автор карточки (см. шапку хука): первым —
      // остальные хуки и права работают уже с заполненной карточкой
      objectsOwnershipHook,
      // Нормализация полей собственника + защита от жёстких дублей.
      // Полный анализ (включая адрес и имя) делает клиент через
      // /api/objects/check-duplicate; здесь — телефон и кадастровый,
      // чтобы дубль нельзя было создать ни через API, ни через админку.
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        if (data.ownerPhone) {
          data.ownerPhone = formatRuPhone(data.ownerPhone)
        }
        if (data.cadastralNumber) {
          data.cadastralNumber = cleanCadastral(data.cadastralNumber)
        }
        // Номер участка частного дома — отдельное поле: у дома и участка
        // разные кадастровые номера, приводятся к одному виду так же
        if (data.plotCadastralNumber) {
          data.plotCadastralNumber = cleanCadastral(data.plotCadastralNumber)
        }
        // Единица площади участка: подсказка показа («6 соток» / «1,2 га» у
        // участка, «600 м²» у квартиры). Сама площадь ВСЕГДА хранится в м² —
        // конвертацию (1 сотка = 100 м², 1 га = 10000 м²) делает форма CRM,
        // движок оценки и фильтры. У не-участков и у присланных мусорных
        // значений поле приводим к м².
        const prevDoc = originalDoc as { category?: string } | undefined
        const category = data.category !== undefined ? data.category : prevDoc?.category
        if (data.areaUnit !== undefined || data.category !== undefined) {
          if (category !== 'land') {
            data.areaUnit = 'sqm'
          } else if (data.areaUnit !== undefined) {
            data.areaUnit = areaUnitOf(data.areaUnit)
          }
        }
        // То же для площади участка (plotAreaUnit): поле живёт у дома,
        // таунхауса и коммерции (базы отдыха, гостиницы, рестораны,
        // туристические объекты), у остальных категорий хранится м²
        if (data.plotAreaUnit !== undefined || data.category !== undefined) {
          if (!isPlotCategoryCode(category)) {
            data.plotAreaUnit = 'sqm'
          } else if (data.plotAreaUnit !== undefined) {
            data.plotAreaUnit = areaUnitOf(data.plotAreaUnit)
          }
        }
        // Варианты покупки: у аренды и земельных участков их не бывает —
        // при смене типа сделки или категории прежний выбор снимаем, иначе на
        // обложке появившейся из продажи аренды осталась бы «Ипотека»
        const prevType = (originalDoc as { type?: string } | undefined)?.type
        const dealType = data.type !== undefined ? data.type : prevType
        if (data.purchaseOptions !== undefined || data.type !== undefined || data.category !== undefined) {
          if (!purchaseOptionsApply(dealType, category)) data.purchaseOptions = []
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
          // Сам правимый документ из поиска исключаем по originalDoc.id: в
          // beforeChange приходит data, куда Payload уже подмешал поля
          // исходного документа (merge в beforeValidate), а data.id при
          // правке не заполняется — по нему объект находился как «свой же
          // дубль» и падала любая правка с заполненным телефоном/кадастровым
          const selfId = (originalDoc as { id?: number } | undefined)?.id
          const where: Where = selfId ? { and: [{ or }, { id: { not_equals: selfId } }] } : { or }
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
      // Перенос в архив и возврат из архива (см. шапку хука выше). Последним:
      // журнал архива пишется уже по принятому документу — если запись
      // отклонена (дубль), события архива не фиксируем.
      archiveTransitionHook,
    ],
    // Синхронизация публикаций на площадки (модуль «Публикация», см.
    // src/lib/publish-service.ts): при изменении объекта автоматически
    // обновляем опубликованные объявления VK/Telegram, при снятии с продажи
    // (status=archived) — снимаем их; при удалении — снимаем объявления.
    // Сами хуки тяжёлых сетевых вызовов не ждут: синхронизация уходит
    // в фоновые задачи (статусы площадок обновятся следом).
    /**
     * Телефон собственника на чтении — в том же виде, что в поле ввода
     * («+7 (918) 828-40-88»). Записи, сохранённые до нормализации
     * («89188284088»), показываются ровным номером без разовой правки базы —
     * так же, как телефоны агентов (см. src/lib/phone.ts).
     */
    afterRead: [
      ({ doc }) => {
        if (typeof doc?.ownerPhone === 'string') doc.ownerPhone = formatRuPhone(doc.ownerPhone)
        return doc
      },
    ],
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
      // Какими программами покупки объект продаётся: ипотека (гражданская,
      // семейная, военная), рассрочка, материнский капитал, покупка без
      // первоначального взноса. Отметок может быть несколько — на обложке
      // карточки каталога они показываются значками, полный список — на
      // странице объекта, а в каталоге по ним есть фильтр
      // (см. src/lib/purchase-options.ts).
      name: 'purchaseOptions',
      type: 'select',
      hasMany: true,
      label: 'Варианты покупки',
      options: PURCHASE_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
      access: purchaseOptionsAccess,
      admin: {
        // Блок только у продажи жилья и коммерции: у аренды программ покупки
        // нет, у земельных участков их не бывает (см. purchaseOptionsApply)
        condition: (_data, siblingData) => {
          const s = siblingData as { type?: string; category?: string } | undefined
          return purchaseOptionsApply(s?.type, s?.category)
        },
        description: 'Отмечайте только подтверждённые варианты: одобрение банка не гарантируется',
      },
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
        description: 'Всегда в м² (у участков 6 соток = 600 м², 1,2 га = 12000 м²). У коммерции — площадь здания или комплекса, у базы отдыха она отдельная от площади земли (см. «Земельный участок»). Какую единицу показывать на сайте — см. «Единица площади»',
      },
    },
    {
      name: 'areaUnit',
      type: 'select',
      label: 'Единица площади',
      options: [
        { label: 'м²', value: 'sqm' },
        { label: 'сотки', value: 'are' },
        { label: 'гектары', value: 'ha' },
      ],
      defaultValue: 'sqm',
      // Поле только для участков: квартиры, дома и коммерция — всегда м²
      admin: {
        condition: (_data, siblingData) => (siblingData as { category?: string } | undefined)?.category === 'land',
        description: 'Для земельных участков: в каких единицах агент вводил площадь (дробные значения — «5,5 сотки», «1,2 га»). На сайте показывается «6 соток»; в базе площадь хранится в м² (1 сотка = 100 м², 1 га = 10000 м²)',
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
      // Земельный участок — отдельный ценообразующий признак
      // (6 соток = 600 м²): у дома это участок вокруг дома, у коммерции —
      // земля под базой отдыха, гостиницей, рестораном или туристическим
      // объектом. У квартир участка нет, у земельных участков площадь самого
      // объекта хранится в «Площади»
      name: 'plotArea',
      type: 'number',
      label: 'Земельный участок (м²)',
      admin: {
        condition: (_data, siblingData) => isPlotCategory(siblingData),
        description: 'Площадь земельного участка в м² (6 соток = 600 м², 1,2 га = 12000 м²). Отдельно от «Площади» — у базы отдыха это площадь здания или комплекса. Какую единицу показывать на сайте — см. «Единица площади участка»',
      },
    },
    {
      // Единица показа площади участка: 6 соток = 600 м², 1,2 га = 12000 м².
      // Хранится рядом с plotArea — как areaUnit у земельных участков
      name: 'plotAreaUnit',
      type: 'select',
      label: 'Единица площади участка',
      options: [
        { label: 'м²', value: 'sqm' },
        { label: 'сотки', value: 'are' },
        { label: 'гектары', value: 'ha' },
      ],
      defaultValue: 'sqm',
      admin: {
        condition: (_data, siblingData) => isPlotCategory(siblingData),
        description: 'В каких единицах агент вводил площадь участка (дробные значения — «5,5 сотки», «1,2 га»). В базе площадь хранится в м²',
      },
    },
    {
      // Кадастровые сведения участка — отдельная группа полей, не связанная
      // с номером здания: у дома и участка, у базы отдыха и земли под ней это
      // разные объекты учёта, и один номер вместо двух не подходит (у дома
      // и участка свои кадастровые номера). Заполняются в CRM: у дома в блоке
      // «Кадастровые данные участка», у коммерции — в блоке «Земельный
      // участок» (см. CrmObjects) — в админке стоят рядом с площадью участка.
      // Как и номер дома, это закрытые сведения: на сайте их не показывают,
      // в чужих объектах агент их не видит, в своих — заполняет сам
      // (см. privateFieldsAccess)
      name: 'plotCadastralNumber',
      type: 'text',
      label: 'Кадастровый номер земельного участка',
      access: privateFieldsAccess,
      admin: {
        condition: (_data, siblingData) => isPlotCategory(siblingData),
        description: 'Например: 15:07:0030021:123. Номер дома (строения) хранится отдельным полем «Кадастровый номер». Виден администратору и агенту в своём объекте',
      },
      // Формат ЕГРН без обязательности — см. validatePlotCadastralNumber
      validate: validatePlotCadastralNumber,
    },
    {
      // Категория земель участка: «Земли населённых пунктов», «Земли
      // сельскохозяйственного назначения» и т.д. Свободный текст, как у
      // типа дома и состояния: категорию пишут так, как она названа в
      // выписке ЕГРН
      name: 'plotLandCategory',
      type: 'text',
      label: 'Категория земель',
      access: privateFieldsAccess,
      admin: {
        condition: (_data, siblingData) => isPlotCategory(siblingData),
        description: 'Например: Земли населённых пунктов. Видна администратору и агенту в своём объекте',
      },
    },
    {
      // Вид разрешённого использования (ВРИ) участка: «Для индивидуального
      // жилищного строительства», «Личное подсобное хозяйство» и т.п.
      // Свободный текст: в выписке ЕГРН ВРИ указывают строкой, иногда с
      // кодом («2.1»)
      name: 'plotPermittedUse',
      type: 'text',
      label: 'Вид разрешённого использования',
      access: privateFieldsAccess,
      admin: {
        condition: (_data, siblingData) => isPlotCategory(siblingData),
        description: 'Например: Для индивидуального жилищного строительства (2.1). Виден администратору и агенту в своём объекте',
      },
    },
    {
      // Назначение участка — для чего земля используется по факту:
      // «под базой отдыха», «для рекреационных целей», «под гостиницей».
      // Отдельно от категории земель (что это за земли по ЕГРН) и ВРИ
      // (что на них разрешено): у коммерческого объекта назначение описывает
      // сам объект, ради которого участок куплен. Только коммерция — у дома
      // назначение участка повторяло бы ВРИ (ИЖС, ЛПХ)
      name: 'plotPurpose',
      type: 'text',
      label: 'Назначение участка',
      access: privateFieldsAccess,
      admin: {
        condition: (_data, siblingData) =>
          (siblingData as { category?: string } | undefined)?.category === 'commercial',
        description: 'Например: Под базой отдыха. Видно администратору и агенту в своём объекте',
      },
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
      // Описания помещений по этажам частного дома: «1 этаж — кухня-гостиная,
      // санузел, спальня», «2 этаж — две спальни, санузел, балкон». Этажность
      // дома хранится в totalFloors (в CRM — выпадающий список «1/2/3 этажа»),
      // здесь — только тексты по каждому этажу, отдельной строкой на этаж.
      // Заполняется только у дома и таунхауса (у квартир этаж один — этаж
      // квартиры в доме, участкам и коммерции поэтажные описания не нужны);
      // показывается в карточке объекта на сайте.
      name: 'floorDescriptions',
      type: 'array',
      label: 'Этажи дома',
      admin: {
        condition: (_data, siblingData) => {
          const category = (siblingData as { category?: string } | undefined)?.category
          return category === 'house' || category === 'townhouse'
        },
        description: 'Помещения каждого этажа дома: «1 этаж — кухня-гостиная, санузел», «2 этаж — спальни, балкон». Показывается в карточке объекта на сайте',
      },
      fields: [
        { name: 'floorNumber', type: 'number', label: 'Этаж', required: true },
        { name: 'description', type: 'textarea', label: 'Помещения' },
      ],
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
        {
          name: 'corpus',
          type: 'text',
          label: 'Корпус',
          admin: {
            description: 'Корпус или строение дома, если есть: дом 16, корпус 2. Пусто — если корпуса нет',
          },
        },
        {
          name: 'fullAddress',
          type: 'text',
          label: 'Полный адрес',
          admin: {
            description: 'Адрес одной строкой — собирается формой CRM из города, пункта, улицы, дома и корпуса',
          },
        },
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
      // Ответственный агент — тот, кто ведёт объект. Назначает его только
      // администратор: агент не может ни отдать свой объект другому, ни
      // забрать чужой (второе не пройдёт и по access.update). Свой объект
      // агент получает автоматически при создании карточки — профиль агента
      // подставляет хук (см. objectsOwnershipHook).
      name: 'agent',
      type: 'relationship',
      label: 'Агент',
      relationTo: 'agents',
      access: {
        create: ({ req: { user } }) => user?.role === 'admin',
        update: ({ req: { user } }) => user?.role === 'admin',
      },
      admin: {
        description: 'Ответственный агент объекта. Меняет только администратор; у нового объекта агента проставляется сам',
      },
    },
    {
      // Автор карточки — учётная запись, создавшая объект (заполняется хуком
      // при создании). Второй признак «своего» объекта для агента: объект,
      // который он завёл, остаётся ему доступен на правку, даже если
      // администратор передал ведение другому агенту (см. access.update).
      // В форме не участвует и автором не переписывается.
      name: 'createdBy',
      type: 'relationship',
      label: 'Создал',
      relationTo: 'users',
      access: {
        read: ({ req: { user } }) => user?.role === 'admin',
        update: ({ req: { user } }) => user?.role === 'admin',
      },
      admin: {
        readOnly: true,
        description: 'Кто завёл карточку: агент сохраняет доступ к своим объектам, даже если объект передан другому агенту',
      },
    },
    {
      name: 'ownerName',
      type: 'text',
      label: 'Имя собственника',
      // Данные собственника — персональные данные: на публичном сайте их нет
      // вовсе, чужой карточки агент не видит, а в своей — заполняет и правит
      // (см. privateFieldsAccess). Администратору доступно всё.
      access: privateFieldsAccess,
      admin: {
        description: 'По имени и телефону собственника система находит дубли объекта',
      },
    },
    {
      name: 'ownerPhone',
      type: 'text',
      label: 'Телефон собственника',
      // Как и имя собственника — персональные данные: в чужих объектах полей
      // нет, в своих агент заполняет их сам
      access: privateFieldsAccess,
      admin: {
        description: 'Хранится в одном виде: +7 (918) 828-40-88',
      },
    },
    {
      name: 'cadastralNumber',
      type: 'text',
      label: 'Кадастровый номер объекта',
      // Кадастровые номера — закрытые сведения: в чужих объектах их не видно
      // и не править (значение остаётся прежним — Payload возвращает его из
      // исходного документа), в своих агент заполняет номер сам
      access: privateFieldsAccess,
      admin: {
        description: 'Например: 15:07:0030021:123. У частного дома это номер дома (строения): номер участка хранится отдельным полем «Кадастровый номер земельного участка». Виден только администратору',
      },
      // Формат номера и обязательность у участка — см. validateCadastralNumber
      validate: validateCadastralNumber,
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
        {
          // Снимок отчёта «оценка по рынку» (диапазон, аналоги, дата расчёта,
          // предупреждение) — внутренний документ агентства, формируется
          // кнопкой в карточке объекта, см. src/lib/market-valuation.ts
          name: 'marketRun',
          type: 'json',
          label: 'Оценка по рынку (отчёт)',
          // Кнопка «Провести оценку по рынку» — администраторская: отчёт
          // виден и перезаписывается только им (см. app/api/objects/market-valuation)
          access: {
            read: ({ req: { user } }) => user?.role === 'admin',
            update: ({ req: { user } }) => user?.role === 'admin',
          },
          admin: {
            description: 'Предварительный расчёт агентства по фактическим объявлениям, не отчёт об оценке',
          },
        },
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
      // «Архив объекта» — служебная группа: почему объект снят с продажи,
      // комментарий, кто и когда его перенёс и в каком статусе он был до
      // этого (в него объект возвращает «Восстановить объект»). Заполняет
      // сервер (хук archiveTransitionHook выше), работа ведётся в разделе CRM
      // «Архив объектов». Причину, дату и историю читают сотрудники (агент и
      // администратор), а внутренние комментарии (комментарий к переносу и
      // комментарии истории) — только администратор; посетителям и клиентам
      // группа не отдаётся вовсе.
      name: 'archive',
      type: 'group',
      label: 'Архив объекта (внутреннее)',
      admin: {
        hidden: true,
        description:
          'Перенос объекта в архив: причина, комментарий, дата и автор. Архивные объекты остаются в базе, скрыты с сайта и площадок; возврат — кнопкой «Восстановить объект»',
      },
      access: {
        read: ({ req: { user } }) => {
          const staff = user as { role?: string } | null | undefined
          return staff?.role === 'agent' || staff?.role === 'admin'
        },
      },
      fields: [
        {
          name: 'reason',
          type: 'select',
          label: 'Причина переноса',
          options: ARCHIVE_REASONS.map((r) => ({ label: r.label, value: r.value })),
        },
        {
          // Внутренний комментарий — только администратору (как и остальные
          // внутренние комментарии объекта, см. ownerName/cadastralNumber)
          name: 'comment',
          type: 'textarea',
          label: 'Комментарий к переносу',
          access: { read: ({ req: { user } }) => user?.role === 'admin' },
        },
        { name: 'archivedAt', type: 'date', label: 'Дата переноса' },
        { name: 'archivedBy', type: 'text', label: 'Кто перенёс' },
        {
          name: 'previousStatus',
          type: 'select',
          label: 'Прежний статус (для восстановления)',
          options: [
            { label: 'Черновик', value: 'draft' },
            { label: 'Опубликован', value: 'published' },
          ],
        },
        {
          name: 'log',
          type: 'array',
          label: 'История изменений архива',
          labels: { singular: 'Запись истории', plural: 'Записи истории' },
          fields: [
            { name: 'at', type: 'date', label: 'Когда', required: true },
            {
              name: 'event',
              type: 'select',
              label: 'Событие',
              options: [
                { label: 'Перенос в архив', value: 'archive' },
                { label: 'Восстановление', value: 'restore' },
              ],
            },
            { name: 'reason', type: 'text', label: 'Причина' },
            {
              // Внутренний комментарий истории — только администратору
              name: 'comment',
              type: 'textarea',
              label: 'Комментарий',
              access: { read: ({ req: { user } }) => user?.role === 'admin' },
            },
            { name: 'by', type: 'text', label: 'Кто выполнил' },
          ],
        },
      ],
    },
    {
      // «Данные о доме» — характеристики дома из открытых источников (см.
      // src/lib/house-info.ts). Кнопка «Искать в открытых источниках» в
      // карточке CRM запускает проверку, снимок пишет сервер (см.
      // src/lib/house-info-service.ts). Источник не один: реестр АИС ППК
      // «ФРТ» (паспорт дома, программа капремонта, управление), официальные
      // порталы, муниципальные базы, сайт УК и открытые карточки площадок —
      // отчёт по каждому лежит в поле sources. Здесь же живёт подтверждение
      // агентом: до него значения клиенту не показываются. У каждой
      // характеристики — источник, поставщик данных, ссылка и дата проверки;
      // расхождения помечаются «Требует проверки», неполное совпадение адреса
      // значения не подставляет, а отсутствие сведений в одном источнике не
      // даёт общего «данных нет». Группа закрыта для посетителей и клиентов:
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
            { label: 'Не найдено в одном источнике — ищем в других', value: 'checkingOthers' },
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
        {
          // Кадастровые сведения — только администратору (в маршруте данных о
          // доме снимок дополнительно чистится для остальных сотрудников)
          name: 'plotCadastral',
          type: 'text',
          label: 'Кадастровый номер участка по реестру',
          access: { read: ({ req: { user } }) => user?.role === 'admin' },
        },
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
        {
          // HouseSourceReport[] из src/lib/house-info.ts — отчёт по каждому
          // источнику: где дом найден, где не найден, что недоступно с сервера
          // и что проверяется по ссылке. Кнопка «Искать в открытых
          // источниках» кладёт сюда снимок, чтобы агент видел источники и их
          // ссылки, а не общий статус «данных нет»
          name: 'sources',
          type: 'json',
          label: 'Отчёт по источникам',
        },
        {
          // Адрес объекта, разобранный на части (город, улица, дом, корпус,
          // строение) — тот же вид, в котором он уходит в источники
          // (NormalizedAddress из src/lib/house-info.ts)
          name: 'addressParts',
          type: 'json',
          label: 'Адрес по частям',
        },
        {
          // Частный дом или участок: в ГИС ЖКХ карточки такого дома обычно
          // нет, поэтому порядок поиска другой
          name: 'privateHouse',
          type: 'checkbox',
          label: 'Частный дом или участок',
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

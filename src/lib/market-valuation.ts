/**
 * «Оценка по рынку» — предварительный расчёт стоимости объекта по фактическим
 * объявлениям (кнопка в карточке объекта CRM, только администратор).
 *
 * Отличие от системной оценки (src/lib/valuation.ts, хук коллекции Objects):
 * там базовая ставка берётся из справочных таблиц Н15 и лишь при >=3 похожих
 * объектах — из медианы нашей же базы. Здесь базовая ставка и коридор считаются
 * по реальным чужим объявлениям из «Парсера рынка» (коллекция market-listings):
 * объявление считается аналогом, если оно похоже на объект по адресу, площади,
 * комнатам и цене (та же метрика, что в «Парсере рынка», см. listing-check.ts),
 * а его цена за единицу не выбивается из ценового пояса объекта.
 *
 * Движок самодостаточен (сервер и быстрые проверки node): на вход подаются
 * параметры объекта и список записей рынка, на выходе — готовый отчёт для
 * хранения в valuation.marketRun и показа в карточке CRM.
 *
 * ВАЖНО: это предварительная рыночная оценка агентства, а не отчёт об оценке
 * и не официальное заключение — итоговый текст предупреждения уходит в отчёт
 * вместе с результатом (см. MARKET_WARNING).
 */
import { MARKET_PLATFORM_NAMES, marketListingMatch } from './market-parser'
import { MATCH_PARAM_LABELS, type ObjectLike } from './listing-check'
import {
  evaluateValuation,
  formatMoney,
  niceRound,
  type ValuationParams,
  type ValuationUnit,
} from './valuation'

/** Версия движка — хранится в отчёте: старые расчёты видно по номеру */
export const MARKET_ENGINE_VERSION = 1

/** Нижняя граница похожести, с которой объявление считаем аналогом (%) */
export const MARKET_MIN_MATCH = 45

/** Сколько аналогов показываем в отчёте (в медиану входят все отобранные) */
export const MARKET_MAX_ANALOGUES = 8

/** Допустимое отклонение цены за единицу аналога от ценового пояса объекта */
const BAND_MIN = 0.45
const BAND_MAX = 2.2

/** Предупреждение, которое всегда идёт с результатом (требование к отчёту) */
export const MARKET_WARNING =
  'Предварительная рыночная оценка агентства Н15 по фактическим объявлениям о продаже. ' +
  'Это не отчёт об оценке и не официальное заключение об оценке: точную стоимость ' +
  'определяют осмотр объекта и оценщик с соответствующей квалификацией.'

/** Запись рынка, как она приходит из коллекции market-listings */
export interface MarketListingLike {
  id: number | string
  url?: string | null
  platform?: string | null
  title?: string | null
  address?: string | null
  price?: number | null
  area?: number | null
  rooms?: number | null
  status?: string | null
  publishedAt?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  matchedObject?: number | string | null
  matchPct?: number | null
}

/** Найденный аналог в отчёте */
export interface MarketAnalogue {
  id: number | string
  url: string
  platform: string
  /** Название площадки для карточки: «Авито», «ЦИАН»… */
  platformName: string
  title: string
  address: string
  price: number
  area: number
  rooms: number | null
  /** Цена за единицу сравнения объекта: ₽/м², ₽/сотку или ₽/м² в месяц */
  perUnit: number
  /** Отличие цены аналога за единицу от итоговой ставки отчёта, % */
  diffPct: number | null
  /** Похожесть на объект, 0..100 (метрика «Парсера рынка», см. listing-check) */
  match: number
  matched: string[]
  matchedLabels: string[]
  /** Объявление уже связано с этим же объектом — это тот же лот, не аналог */
  sameObject: boolean
  /** Участвует ли в расчёте базовой ставки (тот же лот не участвует) */
  usedInBaseRate: boolean
  publishedAt: string | null
  seenAt: string | null
}

/** Строка «что учтено»: параметр объекта, его значение и заполнен ли он */
export interface MarketInputRow {
  key: string
  label: string
  value: string
  ok: boolean
}

/** Итоговый отчёт (хранится в valuation.marketRun) */
export interface MarketValuationReport {
  ok: boolean
  engineVersion: number
  /** Дата и время расчёта, ISO */
  checkedAt: string
  /** Кто запустил расчёт */
  checkedBy: string
  objectId: number | null
  objectTitle: string
  address: string
  category: string
  categoryLabel: string
  dealType: 'sale' | 'rent'
  dealLabel: string
  /** Единица сравнения: м² / сотка / м² в месяц */
  unit: ValuationUnit | null
  unitLabel: string
  /** Примерный ценовой диапазон, ₽ */
  estimate: number | null
  estimateMin: number | null
  estimateMax: number | null
  /** Рыночная ставка с поправками по параметрам, ₽ за единицу сравнения */
  perUnit: number | null
  /** Справочная ставка Н15 за ту же единицу — для сравнения, ₽ */
  referencePerUnit: number | null
  /** Цена объекта за единицу (для сравнения), ₽ */
  pricePerUnit: number | null
  /** Откуда базовая ставка: фактические объявления или справочник Н15 */
  baseSource: 'listings' | 'reference'
  /** Ширина диапазона, % (в отчёте показывается как ±) */
  spreadPct: number
  analoguesCount: number
  sameObjectCount: number
  analogues: MarketAnalogue[]
  /** Параметры, по которым считали: адрес, тип, площадь, комнаты, этаж… */
  inputs: MarketInputRow[]
  /** Подписи параметров, реально повлиявших на расчёт */
  takenIntoAccount: string[]
  /** Подписи важных параметров, которых не хватает */
  missing: string[]
  notes: string[]
  method: string
  warning: string
  /** Системная оценка Н15 того же объекта — для сравнения (может быть null) */
  systemEstimate: number | null
  systemEstimateMin: number | null
  systemEstimateMax: number | null
}

const norm = (v?: string | null) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim()
const num = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  house: 'Дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая недвижимость',
  land: 'Земельный участок',
  room: 'Комната',
  garage: 'Гараж',
  dacha: 'Дача',
  cottage: 'Коттедж',
  part_house: 'Часть дома',
}

const UNIT_LABELS: Record<ValuationUnit, string> = {
  sqm: 'м²',
  are: 'сотка',
  sqmMonth: 'м² в месяц',
}

/** Подписи параметров объекта для блоков «учтено» и «чего не хватает» */
const PARAM_LABELS: Record<string, string> = {
  category: 'тип объекта',
  area: 'площадь',
  'area-size': 'размер объекта (крупные лоты дешевле за единицу)',
  location: 'адрес и район',
  city: 'город / район города',
  snt: 'СТ/СНТ',
  'street-prestige': 'престижная улица',
  rooms: 'количество комнат',
  floor: 'этаж и этажность',
  plotArea: 'земельный участок',
  condition: 'состояние',
  builtYear: 'год постройки',
  buildingType: 'тип дома / материал стен',
  utilities: 'коммуникации (газ, вода, канализация, электричество)',
  livingArea: 'жилая площадь',
  balcony: 'балкон / лоджия',
  yard: 'двор',
  parking: 'парковка',
  elevator: 'лифт',
  features: 'особенности объекта',
  comparables: 'фактические объявления-аналоги',
  locality: 'населённый пункт',
  infrastructure: 'коммуникации участка',
}

const paramLabel = (key: string): string => PARAM_LABELS[key] || key

/** Читаемый адрес объекта из плоских параметров оценки */
function addressText(p: ValuationParams): string {
  const parts = [
    p.snt || p.locality || p.city,
    p.locality && p.city && norm(p.locality) !== norm(p.city) ? p.city : '',
    p.cityDistrict,
    !p.cityDistrict && p.district ? p.district : '',
    p.street,
    p.house,
    p.apartment ? `кв. ${p.apartment}` : '',
  ]
  return parts.map((s) => (s || '').trim()).filter(Boolean).join(', ')
}

/** Цена объявления за единицу сравнения объекта (₽/м², ₽/сотку, ₽/м² в месяц) */
function perUnitOf(price: number, area: number, unit: ValuationUnit): number {
  if (unit === 'are') return price / (area / 100)
  return price / area
}

/** Квартили цен за единицу: медиана и разброс между p25 и p75 */
function spreadOf(values: number[]): { median: number; spread: number } {
  const s = [...values].sort((a, b) => a - b)
  const q = (frac: number): number => {
    const idx = (s.length - 1) * frac
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo)
  }
  const median = q(0.5)
  const spread = median > 0 ? (q(0.75) - q(0.25)) / (2 * median) : 0
  return { median, spread }
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)

/**
 * Основной расчёт: параметры объекта + записи «Парсера рынка».
 * Чистая функция — ни Payload, ни сети: сбор записей делает маршрут
 * /api/objects/market-valuation (см. app/api/objects/market-valuation).
 */
export function evaluateMarketValuation(
  params: ValuationParams,
  listings: MarketListingLike[],
  opts: {
    objectId?: number | string | null
    objectTitle?: string | null
    dealType?: string | null
    checkedBy?: string
    now?: Date
  } = {},
): MarketValuationReport {
  const at = (opts.now || new Date()).toISOString()
  const category = norm(params.category as string) || ''
  const dealType: 'sale' | 'rent' = norm(opts.dealType || params.type || 'sale') === 'rent' ? 'rent' : 'sale'
  const dealLabel = dealType === 'rent' ? 'Аренда' : 'Продажа'
  const address = addressText(params)

  // Справочный расчёт движка Н15: он же — границы ценового пояса для отбора
  // аналогов и запасной вариант, когда объявлений-аналогов нет вовсе
  const reference = evaluateValuation(params)

  const notes: string[] = []
  const inputs: MarketInputRow[] = []
  const unit = reference.unit
  const unitLabel = unit ? UNIT_LABELS[unit] : ''

  // ── Что учтено: значения параметров объекта (вход расчёта) ───────────
  const areaSqm = num(params.area)
  const areaValue =
    areaSqm == null
      ? ''
      : category === 'land'
        ? `${Math.round(areaSqm / 100)} соток (${new Intl.NumberFormat('ru-RU').format(Math.round(areaSqm))} м²)`
        : `${new Intl.NumberFormat('ru-RU').format(Math.round(areaSqm))} м²`
  const pushInput = (key: string, label: string, value: string, ok: boolean) =>
    inputs.push({ key, label, value: value || 'не заполнено', ok })

  pushInput('address', 'Адрес и район', address, Boolean(address))
  pushInput('category', 'Тип объекта', CATEGORY_LABELS[category] ? `${CATEGORY_LABELS[category]}, ${dealLabel.toLowerCase()}` : '', Boolean(CATEGORY_LABELS[category]))
  pushInput('area', 'Площадь', areaValue, Boolean(areaValue))
  pushInput('rooms', 'Количество комнат', num(params.rooms) ? `${num(params.rooms)}` : '', num(params.rooms) != null)
  pushInput(
    'floor',
    'Этаж и всего этажей',
    num(params.floor) || num(params.totalFloors) ? `${num(params.floor) ?? '—'} из ${num(params.totalFloors) ?? '—'}` : '',
    num(params.floor) != null && num(params.totalFloors) != null,
  )
  pushInput('condition', 'Состояние', (params.condition || '').trim(), Boolean((params.condition || '').trim()))
  // Земля — отдельный вход расчёта у дома, таунхауса и коммерции
  // (у базы отдыха комплекс и участок оцениваются вместе)
  if (category === 'house' || category === 'townhouse' || category === 'commercial') {
    const plot = num(params.plotArea)
    pushInput(
      'plotArea',
      'Земельный участок',
      plot ? `${Math.round((plot / 100) * 10) / 10} соток (${new Intl.NumberFormat('ru-RU').format(Math.round(plot))} м²)` : '',
      plot != null && plot > 0,
    )
  }

  // ── Отбор аналогов среди объявлений рынка ────────────────────────────
  // Похожесть считается той же метрикой, что в «Парсере рынка»
  // (listing-check: адрес, цена, площадь, комнаты, этаж), плюс фильтр по
  // ценовому поясу объекта — он отсекает объявления другого типа сделки
  // (аренда не попадает в продажу и наоборот) и явные выбросы.
  const objectLike: ObjectLike = {
    address: {
      city: params.city || undefined,
      locality: params.locality || undefined,
      street: params.street || undefined,
      house: params.house || undefined,
      apartment: params.apartment || undefined,
    },
    price: num(params.price),
    area: num(params.area),
    rooms: num(params.rooms),
    floor: num(params.floor),
    totalFloors: num(params.totalFloors),
  }

  const refPerUnit = reference.perUnit
  const canBand = Boolean(unit) && refPerUnit != null && refPerUnit > 0
  const found: MarketAnalogue[] = []
  for (const l of listings) {
    if (!l || l.status === 'removed') continue
    if (!canBand || !unit || refPerUnit == null) break
    const price = num(l.price)
    const la = num(l.area)
    if (price == null || price <= 0 || la == null || la <= 0) continue
    const perUnit = perUnitOf(price, la, unit)
    if (perUnit < refPerUnit * BAND_MIN || perUnit > refPerUnit * BAND_MAX) continue

    const sameObject =
      opts.objectId != null && l.matchedObject != null && String(l.matchedObject) === String(opts.objectId)
    const m = marketListingMatch(
      { address: l.address, price, area: la, rooms: l.rooms },
      objectLike,
    )
    if (!sameObject && m.match < MARKET_MIN_MATCH) continue

    found.push({
      id: l.id,
      url: l.url || '',
      platform: l.platform || 'other',
      platformName: MARKET_PLATFORM_NAMES[l.platform || 'other'] || 'Другая площадка',
      title: (l.title || '').trim(),
      address: (l.address || '').trim(),
      price,
      area: la,
      rooms: num(l.rooms),
      perUnit: Math.round(perUnit),
      diffPct: null,
      match: m.match,
      matched: m.matched,
      matchedLabels: m.matched.map((k) => MATCH_PARAM_LABELS[k] || k),
      sameObject,
      usedInBaseRate: !sameObject,
      publishedAt: l.publishedAt || null,
      seenAt: l.lastSeenAt || l.firstSeenAt || null,
    })
  }
  found.sort((a, b) => (b.match - a.match) || a.perUnit - b.perUnit)

  const sameObjectListings = found.filter((f) => f.sameObject)
  const analogues = found.filter((f) => !f.sameObject)
  const analogueUnits = analogues.map((a) => a.perUnit)
  if (sameObjectListings.length) {
    notes.push(
      `Объявлений, уже связанных с этим объектом: ${sameObjectListings.length} — это тот же лот, в базовую ставку он не взят`,
    )
  }

  // ── Базовая ставка и итоговый расчёт ─────────────────────────────────
  // Движок оценки берёт медиану аналогов как базу начиная с трёх объявлений
  // (малая выборка смешивается со справочником, см. valuation.ts)
  const result = evaluateValuation(params, analogueUnits)
  const baseSource: MarketValuationReport['baseSource'] =
    result.source === 'comparables' && analogueUnits.length >= 3 ? 'listings' : 'reference'

  const unitsSpread = analogueUnits.length >= 3 ? spreadOf(analogueUnits) : null
  if (unitsSpread) {
    notes.push(`Аналогов в расчёте ставки: ${analogueUnits.length} (медиана ${formatMoney(unitsSpread.median)} за ${unitLabel})`)
  } else if (analogueUnits.length > 0) {
    notes.push(
      `Найдено аналогов: ${analogueUnits.length} — меньше трёх, поэтому ставка справочная, а объявления показаны как ориентиры`,
    )
  } else {
    notes.push(
      'Сопоставимых объявлений в базе «Парсера рынка» нет — расчёт по справочным ставкам Н15. Добавьте ссылки на похожие объявления, и расчёт станет точнее',
    )
  }
  if (result.insufficient || result.estimate == null) {
    notes.push('Недостаточно данных для расчёта — заполните адрес, площадь и категорию объекта')
  }

  // Коридор: обычный разброс оценки категории расширяем, если фактические
  // цены аналогов разошлись сильнее (и не сужаем — выборка мала)
  const normalSpread =
    result.estimate && result.estimateMin != null && result.estimateMax != null
      ? (result.estimateMax - result.estimateMin) / (2 * result.estimate)
      : 0.15
  let spread = normalSpread
  if (unitsSpread) {
    const s = unitsSpread.spread
    spread = clamp(Math.max(normalSpread, s), 0.05, 0.3)
    if (s > normalSpread) {
      notes.push(`Коридор расширен по фактическому разбросу цен аналогов: ±${Math.round(s * 100)}%`)
    }
  }
  if (result.estimate == null) spread = 0

  const estimateMin = result.estimate == null ? null : niceRound(result.estimate * (1 - spread))
  const estimateMax = result.estimate == null ? null : niceRound(result.estimate * (1 + spread))

  // Отличие каждого аналога от итоговой ставки
  const finalPerUnit = result.perUnit
  for (const a of found) {
    a.diffPct =
      finalPerUnit && finalPerUnit > 0 ? Math.round(((a.perUnit - finalPerUnit) / finalPerUnit) * 1000) / 10 : null
  }

  const method =
    baseSource === 'listings'
      ? `Фактические объявления рынка (${analogueUnits.length} шт., медиана за ${unitLabel}) + коэффициенты по параметрам объекта`
      : 'Справочные ставки Н15 по ценовому поясу + коэффициенты по параметрам объекта (аналогов в базе рынка недостаточно)'

  notes.push('Расчёт предварительный и не заменяет отчёт об оценке — см. предупреждение')

  return {
    ok: !result.insufficient && result.estimate != null,
    engineVersion: MARKET_ENGINE_VERSION,
    checkedAt: at,
    checkedBy: opts.checkedBy || '',
    objectId: opts.objectId != null ? Number(opts.objectId) || null : null,
    objectTitle: (opts.objectTitle || '').trim(),
    address,
    category,
    categoryLabel: CATEGORY_LABELS[category] || category || 'Объект',
    dealType,
    dealLabel,
    unit,
    unitLabel,
    estimate: result.estimate,
    estimateMin,
    estimateMax,
    perUnit: result.perUnit,
    referencePerUnit: reference.perUnit,
    pricePerUnit: result.pricePerUnit,
    baseSource,
    spreadPct: Math.round(spread * 1000) / 10,
    analoguesCount: analogueUnits.length,
    sameObjectCount: sameObjectListings.length,
    analogues: found.slice(0, MARKET_MAX_ANALOGUES),
    inputs,
    takenIntoAccount: result.used.map(paramLabel),
    missing: result.missing.map(paramLabel),
    notes,
    method,
    warning: MARKET_WARNING,
    systemEstimate: reference.estimate,
    systemEstimateMin: reference.estimateMin,
    systemEstimateMax: reference.estimateMax,
  }
}

/** Читает отчёт из JSON-поля valuation.marketRun (устойчиво к старым записям) */
export function marketReportFromJson(value: unknown): MarketValuationReport | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (r.engineVersion == null || r.checkedAt == null) return null
  return value as unknown as MarketValuationReport
}

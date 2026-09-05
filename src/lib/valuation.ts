/**
 * Движок ориентировочной рыночной оценки объекта — внутренний инструмент CRM.
 *
 * Метод: коэффициентный анализ. Для категории и местоположения объекта
 * определяется базовая ставка (₽/м², ₽/сотку или ₽/м² в месяц), затем она
 * умножается на поправочные коэффициенты по заполненным параметрам объекта
 * (комнаты, этаж/этажность, тип дома, год постройки, состояние, лифт,
 * балкон, газ/отопление/вода, двор, парковка и т.п.).
 *
 * Серверный хук коллекции может передать движку выборку «сопоставимых»
 * объектов из базы Н15 (те же категория + местоположение): если таких >=3,
 * базовая ставка берётся из медианы объявлений базы, а не из справочных
 * таблиц ниже (справочные ставки остаются только «страховкой» для малых
 * выборок). Клиентская часть CRM использует движок без компараблей —
 * справочный режим, помеченный как предварительный.
 *
 * ВАЖНО: все суммы — экспертные ориентиры агентства (правила, а не
 * статистика сделок). Это НЕ официальная независимая оценка: точную
 * стоимость определяют осмотр объекта и профессиональный оценщик.
 *
 * Файл самодостаточен (без импортов) — используется и на сервере, и в
 * браузере, и в быстрых проверках node --experimental-strip-types.
 */

export type ValuationUnit = 'sqm' | 'are' | 'sqmMonth'

/** Параметры объекта, участвующие в оценке (плоская копия документа) */
export interface ValuationParams {
  type?: string | null
  category?: string | null
  price?: number | null
  area?: number | null
  livingArea?: number | null
  kitchenArea?: number | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  buildingType?: string | null
  condition?: string | null
  builtYear?: number | null
  heating?: string | null
  balcony?: string | null
  water?: string | null
  sewerage?: string | null
  electricity?: string | null
  gas?: string | null
  internet?: string | null
  elevator?: string | null
  yard?: string | null
  parking?: string | null
  city?: string | null
  district?: string | null
  cityDistrict?: string | null
  locality?: string | null
  snt?: string | null
  street?: string | null
  house?: string | null
  apartment?: string | null
  features?: string[] | null
}

export type Confidence = 'high' | 'medium' | 'low'
export type Verdict = 'below' | 'match' | 'above'
export type RateSource = 'comparables' | 'rates'

export interface ValuationResult {
  /** Достаточно ли данных для оценки (площадь + местоположение + категория) */
  ok: boolean
  /** Действующая рыночная оценка, ₽ (или ₽/мес для аренды); null — данных нет */
  estimate: number | null
  /** Диапазон оценки, ₽ (вилка вокруг оценки; шире при низкой уверенности) */
  estimateMin: number | null
  estimateMax: number | null
  /** Оценка за единицу сравнения: м² / сотку / м² в месяц */
  perUnit: number | null
  /** Цена объекта за ту же единицу (для сравнения) */
  pricePerUnit: number | null
  /** Единица сравнения (см. ValuationUnit) */
  unit: ValuationUnit | null
  /** Отклонение цены объекта от оценки, ₽ (цена − оценка) */
  deviationRub: number | null
  /** Отклонение цены объекта от оценки, % */
  deviationPct: number | null
  /** Вывод: ниже рынка / соответствует / выше рынка */
  verdict: Verdict | null
  /** Уверенность оценки: чем больше значимых параметров заполнено, тем выше */
  confidence: Confidence | null
  /** Недостаточно данных — оценка не считается (см. missing) */
  insufficient: boolean
  /** Ключи важных параметров, которых не хватает (для подсказки «заполните») */
  missing: string[]
  /** Ключи параметров, учтённых в расчёте */
  used: string[]
  /** Откуда взята базовая ставка: компарабли базы Н15 или справочник */
  source: RateSource | null
  /** Сколько сопоставимых объектов использовано */
  comparablesCount: number
  /** Человекочитаемая подпись метода (хранится в документе) */
  method: string
  /** Служебные примечания расчёта (не для клиента) */
  notes: string[]
  /** ISO-дата расчёта */
  at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Справочные ставки (экспертные ориентиры Н15 по рынку Северной Осетии).
// Значения калибруются в одном месте — здесь; источник выбора — source.
// Категории: apartment (квартира), house (дом), townhouse, commercial,
// land (участок). Ставки продажи — за м², участки — за сотку; аренда — ₽/м²/мес.
// ─────────────────────────────────────────────────────────────────────────────

/** Квартиры во Владикавказе, продажа, ₽/м² — по району города */
const CITY_APARTMENT_RATES: Record<string, number> = {
  'Северо-Западный': 95000,
  Иристонский: 90000,
  Затеречный: 82000,
  Промышленный: 78000,
}
const CITY_APARTMENT_RATE_DEFAULT = 86000

/** Коммерческая недвижимость во Владикавказе, продажа, ₽/м² */
const CITY_COMMERCIAL_RATES: Record<string, number> = {
  'Северо-Западный': 62000,
  Иристонский: 64000,
  Затеречный: 48000,
  Промышленный: 38000,
}
const CITY_COMMERCIAL_RATE_DEFAULT = 52000

/** Таунхаусы / дома в черте Владикавказа, продажа, ₽/м² */
const CITY_HOUSE_RATE = 54000
const CITY_TOWNHOUSE_RATE = 62000

/**
 * Ближний пригород Владикавказа (посёлки и сёла 3–20 км от города) —
 * отдельный ценовой пояс между городом и районами республики.
 */
const NEAR_VIK = [
  'заводской', 'ногир', 'октябрьское', 'архонская', 'гизель', 'михайловское',
  'ир', 'дачное', 'камбилеевское', 'сунжа', 'чермен', 'тарское', 'донгарон',
  'майское', 'мичурино', 'редант', 'кобан', 'комгарон', 'новое',
]

/** Города и райцентры республики (кроме Владикавказа) — ставка дома, ₽/м² */
const DISTRICT_TOWNS: Record<string, number> = {
  Моздок: 38000,
  Беслан: 40000,
  Алагир: 34000,
  Ардон: 33000,
  Дигора: 29000,
  Эльхотово: 32000,
  Чикола: 28000,
}

/** Районы республики: загородные дома, продажа, ₽/м² (населённые пункты районов) */
const DISTRICT_HOUSE_RATES: Record<string, number> = {
  'Владикавказский городской округ': 40000, // посёлки в черте округа (Редант, Чми…)
  'Пригородный район': 33000,
  'Правобережный район': 32000,
  'Ардонский район': 30000,
  'Моздокский район': 30000,
  'Алагирский район': 28000,
  'Кировский район': 27000,
  'Дигорский район': 25000,
  'Ирафский район': 22000,
}

/** Дома в ближнем пригороде Владикавказа, продажа, ₽/м² */
const NEAR_HOUSE_RATE = 46000

/** Участки, продажа, ₽ за сотку — по зонам */
const CITY_LAND_RATES: Record<string, number> = {
  'Северо-Западный': 600000,
  Иристонский: 650000,
  Затеречный: 420000,
  Промышленный: 320000,
}
const CITY_LAND_RATE_DEFAULT = 450000
const NEAR_LAND_RATE = 220000
const DISTRICT_LAND_RATES: Record<string, number> = {
  'Владикавказский городской округ': 90000, // дальние посёлки округа
  'Пригородный район': 150000,
  'Правобережный район': 110000,
  'Ардонский район': 90000,
  'Кировский район': 80000,
  'Алагирский район': 80000,
  'Моздокский район': 75000,
  'Дигорский район': 65000,
  'Ирафский район': 55000,
}

/** СТ/СНТ: участки и дома в товариществах. Цена участка, ₽/сотка */
const SNT_LAND_RATES: Record<string, number> = {
  // Пригородный пояс Владикавказа — ближние товарищества
  'СТ Кобань': 180000, 'СНТ Кобан': 170000, 'СНТ Контактор': 190000,
  'СТ Горное': 160000, 'СТ Победит': 150000, 'СНТ Магнит': 170000,
  'СТ Майрамадаг': 140000, 'СНО Иристон': 170000, 'СНО Дружба': 160000,
  'СНО Горянка': 150000, 'СНО Рухс': 150000, 'СНО Надежда': 160000,
  'СТ Аэропорт': 170000, 'СНО Металлург': 150000, 'СНТ Баркад': 160000,
  'СНО Локомотив': 150000, 'СНО Южный': 150000, 'СНО Северное': 150000,
  'СНО Редант': 150000, 'СНО Ир': 150000, 'СНО Аграрник': 140000,
  'СНО Дачное': 160000, 'СНТ Мичурино': 150000,
  // Средний пояс
  'СНО Весна': 110000, 'СНО Наука': 110000, 'СНТ Геолог': 120000,
  'СНТ Алания': 120000, 'СНТ Кодахджин 2010': 110000,
  // Удалённые товарищества (ущелья, дальние сёла)
  'СТ Учитель': 90000, 'СНО Учитель': 90000, 'СНО Дарьял': 80000,
  'СНО Весна (удал.)': 80000,
}
// Товарищества, которых нет в карте выше, получают ставку по месту в тексте
const SNT_NEAR_HINT = ['аэропорт', 'редант', 'дачное', 'мичурино', 'северное', 'майрамадаг', 'кобань', 'кобан', 'заводской', 'архон', 'магнит', 'контактор', 'победит', 'горное']
const SNT_LAND_RATE_NEAR_DEFAULT = 150000
const SNT_LAND_RATE_RURAL_DEFAULT = 90000

/** Аренда, ₽/м²/мес */
const CITY_RENT_RATES: Record<string, number> = {
  'Северо-Западный': 720,
  Иристонский: 700,
  Затеречный: 600,
  Промышленный: 560,
}
const CITY_RENT_RATE_DEFAULT = 650
const NEAR_RENT_RATE = 420
const TOWN_RENT_RATES: Record<string, number> = {
  Беслан: 380, Моздок: 350, Алагир: 330, Ардон: 320, Дигора: 290,
  Эльхотово: 300,
}
const DISTRICT_RENT_RATES: Record<string, number> = {
  'Владикавказский городской округ': 330,
  'Пригородный район': 280,
  'Правобережный район': 300,
  'Ардонский район': 280,
  'Моздокский район': 280,
  'Алагирский район': 260,
  'Кировский район': 260,
  'Дигорский район': 240,
  'Ирафский район': 210,
}
const HOUSE_RENT_CITY = 360 // дома и таунхаусы в городе
const HOUSE_RENT_NEAR = 260
const COMMERCIAL_RENT_CITY = 400
const COMMERCIAL_RENT_RURAL = 240

/**
 * Престижные улицы Владикавказа (экспертно): чуть дороже среднего по району.
 * Совпадение — по подстроке нормализованного адреса.
 */
const PRESTIGE_STREETS = ['мира', 'коцоева', 'кирова', 'маркова', 'джанаева', 'шмулевича', 'набережная', 'тамбиева', 'маяковского']

const norm = (v?: string | null) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim()
const num = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ─────────────────────────────────────────────────────────────────────────────
// Поправочные коэффициенты по параметрам
// ─────────────────────────────────────────────────────────────────────────────

/** Состояние: хорошо/после ремонта — плюс, требует ремонта/без отделки — минус */
function conditionFactor(raw?: string | null): number {
  const c = norm(raw)
  if (!c) return 1
  // Сначала «плохие» маркеры: новостройка без отделки не должна получать плюс
  if (/(без отделки|без ремонта|чернов|требует ремонт|требуется ремонт|нужен ремонт|нужна ремонт|убит\w*|аварийн\w*|ветх\w*|плох\w*)/.test(c)) return 0.91
  // Хорошие варианты (точные формы «новое/новый», чтобы «новостройка» не матчилась)
  if (/^(нов|новое|новый|новая)$/.test(c)) return 1.05
  if (/(отличн\w*|качественн\w*|евроремонт|элитн\w*|люкс|идеальн\w*|после ремонт\w*|сделан хорош\w*)/.test(c)) return 1.05
  if (/^хорош\w*$|^нормальн\w*$|после косметич\w*/.test(c)) return 1
  return 1
}

/** Тип дома / материал стен */
function buildingTypeFactor(raw?: string | null): number {
  const b = norm(raw)
  if (!b) return 1
  if (b.includes('кирпич')) return 1.06
  if (b.includes('монолит')) return 1.05
  if (b.includes('панель')) return 0.94
  if (b.includes('блоч') || b.includes('шлакоблок') || b.includes('керамзит')) return 0.94
  if (b.includes('дерев') || b.includes('брус') || b.includes('каркас')) return 0.88
  if (b.includes('кирпично-монолит')) return 1.06
  return 1
}

/** Год постройки: новое жильё дороже, «хрущёвки» и старый фонд дешевле */
function yearFactor(year?: number | null): number {
  const y = num(year)
  if (!y) return 1
  if (y <= 1960) return 0.92
  if (y <= 1985) return 0.96
  if (y <= 2000) return 1
  if (y <= 2015) return 1.05
  return 1.09
}

/** Этаж: у квартир первый — минус, средние — плюс, последний без лифта — минус;
 *  у коммерции первый (витринный) — плюс, верхние этажи — минус */
function floorFactor(category: string, floor?: number | null, totalFloors?: number | null): number {
  const f = num(floor)
  const tf = num(totalFloors)
  if (!f || !tf || tf < 2 || f > tf) return 1
  if (category === 'commercial') {
    if (f === 1) return 1.05
    if (f === tf) return tf >= 5 ? 0.94 : 0.97
    return f === 2 ? 1.02 : 0.98
  }
  if (f === 1) return 0.93
  if (f === tf) return tf >= 9 ? 0.96 : 0.985 // последний этаж высоких домов
  if (f >= 2 && f <= tf - 1) return 1.015
  return 1
}

/** Наличие лифта влияет на квартиры верхних этажей в домах >=5 этажей */
function elevatorFactor(elevator?: string | null, floor?: number | null, totalFloors?: number | null): number {
  const e = norm(elevator)
  const f = num(floor)
  const tf = num(totalFloors)
  if (!tf || tf < 5) return 1
  const has = e && e !== 'нет' && e !== 'no'
  if (has && f && f >= 4) return 1.015
  if (!has && f && f >= 4) return 0.975
  return has ? 1.005 : 1
}

/** Балкон/лоджия */
function balconyFactor(raw?: string | null): number {
  const b = norm(raw)
  if (!b || b === 'нет' || b === 'no') return 1
  if (b.includes('несколько') || b.includes('лоджия')) return 1.02
  return 1.015
}

/** Комнаты квартиры: 1к дороже за м², многокомнатные дешевле */
function roomsFactor(category: string | null, rooms?: number | null): number {
  const r = num(rooms)
  if (!r) return 1
  if (category === 'apartment') {
    if (r <= 1) return 1.025
    if (r >= 4) return 0.96
    return 1.005
  }
  return 1
}

/** Площадь: мелкие лоты дороже за единицу, крупные — дешевле */
function areaFactor(category: string | null, area?: number | null): number {
  const a = num(area)
  if (!a) return 1
  const units = category === 'land' ? a / 100 : a
  if (category === 'apartment') {
    if (units < 35) return 1.02
    if (units < 50) return 1.005
    if (units > 150) return 0.96
    if (units >= 90) return 0.98
    return 1
  }
  if (category === 'townhouse') {
    if (units > 180) return 0.96
    return 1
  }
  if (category === 'commercial') {
    if (units < 60) return 1.15
    if (units > 150) return 0.9
    return 1
  }
  if (category === 'land') {
    if (units < 5) return 1.1
    if (units > 30) return 0.8
    if (units > 15) return 0.88
    return 1
  }
  // house
  if (units > 250) return 0.94
  if (units < 90) return 1.03
  return 1
}

/** Жилая площадь: доля жилой зоны в квартире */
function layoutFactor(category: string | null, area?: number | null, livingArea?: number | null): number {
  const a = num(area)
  const l = num(livingArea)
  if (category !== 'apartment' || !a || !l) return 1
  const share = l / a
  if (share >= 0.6) return 1.02
  if (share <= 0.45) return 0.98
  return 1
}

/** Инженерия для загородных домов: газ, вода, канализация, электричество */
function utilitiesFactor(category: string | null, p: ValuationParams): number {
  if (category !== 'house' && category !== 'townhouse') return 1
  let f = 1
  const heat = norm(p.heating)
  const gas = norm(p.gas)
  const water = norm(p.water)
  const sewer = norm(p.sewerage)
  const electric = norm(p.electricity)
  const hasGas = Boolean(gas && gas !== 'нет' && gas !== 'no')
  const hasHeat = heat && heat !== 'нет'
  if (hasGas) f *= 1.06
  else if (hasHeat && (heat.includes('автоном') || heat.includes('газ'))) f *= 1.03
  else if (hasHeat && heat.includes('электр')) f *= 0.97
  if (water && (water.includes('центральн') || water.includes('водопров'))) f *= 1.02
  if (sewer && sewer.includes('центральн')) f *= 1.015
  if (electric && (electric === 'нет' || electric === 'no')) f *= 0.85
  return f
}

/** Двор (город): закрытый/охраняемый двор — плюс; пусто — нейтрально */
function comfortFactor(raw?: string | null): number {
  const c = norm(raw)
  if (!c || c === 'нет' || c === 'no') return 1
  if (/(закрыт|охраняем|подземн|паркинг)/.test(c)) return 1.03
  if (/(благоустр|гостев|место|стоянка)/.test(c)) return 1.015
  return 1
}

/** Парковка: явное «нет» — небольшой минус, крытый паркинг — плюс; пусто — нейтрально */
function parkingFactor(raw?: string | null): number {
  const c = norm(raw)
  if (!c) return 1
  if (c === 'нет' || c === 'no') return 0.985
  if (c.includes('подземн') || c.includes('закрыт') || c.includes('охраняем') || c.includes('паркинг')) return 1.03
  if (/(гостев|стоянка|место|есть)/.test(c)) return 1.01
  return 1
}

/**
 * Признаки комфорта, спрятанные в свободных «Особенностях» объекта.
 * gasAlreadySet: газ учтён отдельным полем (поле gas) — повторно не усиливаем.
 */
function featuresBoost(
  category: string | null,
  features?: string[] | null,
  used: string[] = [],
  gasAlreadySet = false,
): number {
  if (!features?.length) return 1
  const text = norm(features.join(' '))
  let f = 1
  const track = (name: string, has: boolean) => {
    if (has && !used.includes(name)) used.push(name)
  }
  const hasParking = /(паркинг|парковк|стоянк|гараж)/.test(text)
  const hasClosed = /(закрытая территория|закрытый двор|охраняем|кпп|шлагбаум)/.test(text)
  const hasGas = /(магистральный газ|газовое отопление|газ)/.test(text)
  const hasView = /(панорамный вид|вид на горы|вид на город)/.test(text)
  const hasRenov = /(дизайнерский ремонт|евроремонт|качественный ремонт)/.test(text)
  const hasNew = /(новостройка|новый дом)/.test(text)
  if (hasParking) { track('features-parking', true); f *= category === 'apartment' || category === 'commercial' ? 1.01 : 1 }
  if (hasClosed) { track('features-closed', true); f *= 1.025 }
  if (hasGas && !gasAlreadySet && (category === 'house' || category === 'townhouse')) { track('features-gas', true); f *= 1.04 }
  if (hasView) { track('features-view', true); f *= 1.03 }
  if (hasRenov) { track('features-renov', true); f *= 1.02 }
  if (hasNew && category === 'apartment') { track('features-new', true); f *= 1.02 }
  return f
}

/** Престижная улица Владикавказа (+7% к квартирам/коммерции в городе) */
function streetFactor(p: ValuationParams, inCity: boolean): { factor: number; prestige: boolean } {
  const s = norm(p.street)
  if (!s || !inCity) return { factor: 1, prestige: false }
  const prestige = PRESTIGE_STREETS.some((st) => s.includes(st))
  return { factor: prestige ? 1.07 : 1, prestige }
}

// ─────────────────────────────────────────────────────────────────────────────
// Местоположение: ценовой пояс и справочная ставка
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneInfo {
  /** Ключ пояса: city / cityDistrict / near / town / rural / snt */
  zone: string
  /** Название для подсказок и группировки компараблей */
  bucket: string
  /** Заполнено ли местоположение достаточно для оценки */
  located: boolean
}

function zoneInfo(p: ValuationParams): ZoneInfo {
  const locality = norm(p.locality)
  const snt = norm(p.snt)
  const district = norm(p.district)
  const cityDistrict = norm(p.cityDistrict)
  const city = norm(p.city)

  // СНТ/СТ — свой ценовой пояс: записанное товарищество точнее населённого пункта
  if (snt && snt !== 'нет' && snt !== 'no') {
    return { zone: 'snt', bucket: p.snt as string, located: true }
  }
  // Владикавказ как населённый пункт — это сам город (с районом города — пояс района)
  if (locality === 'владикавказ') {
    if (cityDistrict) {
      return { zone: 'cityDistrict', bucket: `Владикавказ · ${p.cityDistrict}`, located: true }
    }
    return { zone: 'city', bucket: 'Владикавказ', located: true }
  }
  // Район города без явного населённого пункта (адрес «г. Владикавказ» не заполнен)
  if (cityDistrict && !locality && !district) {
    return { zone: 'cityDistrict', bucket: `Владикавказ · ${p.cityDistrict}`, located: true }
  }
  // Ближний пригород Владикавказа. Населённый пункт важнее поля city:
  // форма CRM по умолчанию подставляет город «Владикавказ», но дом в Ногире
  // от этого не становится городским.
  if (locality && NEAR_VIK.includes(locality)) {
    return { zone: 'near', bucket: `Пригород · ${p.locality}`, located: true }
  }
  // Города — центры районов. Ключи справочника DISTRICT_TOWNS — с большой
  // буквы, населённый пункт сравниваем с ними по норме (без регистра).
  if (locality && Object.keys(DISTRICT_TOWNS).some((k) => norm(k) === locality)) {
    return { zone: 'town', bucket: p.locality as string, located: true }
  }
  // Сельский населённый пункт (не ближний пригород и не райцентр) — ставка района
  if (locality && district) {
    return { zone: 'rural', bucket: p.district as string, located: true }
  }
  if (locality && !district) {
    // Пункт есть, район не указан — ищем район по справочнику
    return { zone: 'rural-unknown', bucket: locality, located: true }
  }
  // Район республики без населённого пункта (земельный массив и т.п.).
  // Район весомее поля city со значением «Владикавказ» — это дефолт формы CRM,
  // а не признак города: участок в Пригородном районе не должен получать
  // городскую ставку из-за подставленного формой города.
  if (district) {
    return { zone: 'rural', bucket: p.district as string, located: true }
  }
  // Владикавказ в поле city (дефолт формы CRM) — городской пояс
  if (city === 'владикавказ') {
    if (cityDistrict) {
      return { zone: 'cityDistrict', bucket: `Владикавказ · ${p.cityDistrict}`, located: true }
    }
    return { zone: 'city', bucket: 'Владикавказ', located: true }
  }
  return { zone: 'none', bucket: '', located: false }
}

/** Справочная ставка за единицу по поясу (без учёта категории внутри города) */
function referenceRatePerUnit(p: ValuationParams, z: ZoneInfo, category: string, sale: boolean): number | null {
  if (category === 'land') {
    // Участки
    if (z.zone === 'cityDistrict') {
      return CITY_LAND_RATES[z.bucket.split('· ')[1]?.trim() || ''] ?? CITY_LAND_RATE_DEFAULT
    }
    if (z.zone === 'city') return CITY_LAND_RATE_DEFAULT
    if (z.zone === 'near') return NEAR_LAND_RATE
    if (z.zone === 'snt') {
      const snt = norm(z.bucket)
      if (SNT_LAND_RATES[z.bucket]) return SNT_LAND_RATES[z.bucket]
      if (SNT_NEAR_HINT.some((h) => snt.includes(h))) return SNT_LAND_RATE_NEAR_DEFAULT
      return SNT_LAND_RATE_RURAL_DEFAULT
    }
    if (z.zone === 'town') {
      // Участки в райцентрах — по ставке своего района
      const town = norm(z.bucket)
      const key = Object.keys(DISTRICT_TOWNS).find((k) => norm(k) === town) || ''
      const d = districtName(districtOfTown(key) || z.bucket)
      return DISTRICT_LAND_RATES[d] ?? 100000
    }
    // rural
    const d = districtName(z.bucket)
    return DISTRICT_LAND_RATES[d] ?? DISTRICT_LAND_RATES['Пригородный район'] ?? 100000
  }
  // Аренда: базовая ставка ₽/м²/мес зависит от категории
  if (!sale) {
    let aptRate: number | null = null
    if (z.zone === 'cityDistrict') {
      aptRate = CITY_RENT_RATES[z.bucket.split('· ')[1]?.trim() || ''] ?? CITY_RENT_RATE_DEFAULT
    } else if (z.zone === 'city') {
      aptRate = CITY_RENT_RATE_DEFAULT
    } else if (z.zone === 'near') {
      aptRate = NEAR_RENT_RATE
    } else if (z.zone === 'town') {
      const t = norm(z.bucket)
      const town = Object.keys(DISTRICT_TOWNS).find((k) => norm(k) === t) || Object.keys(TOWN_RENT_RATES).find((k) => norm(k) === t)
      aptRate = (town && (TOWN_RENT_RATES[town] ?? DISTRICT_RENT_RATES[districtOfTown(town) || ''])) || 280
    } else if (z.zone === 'snt') {
      aptRate = 200 // аренда в товариществах — редкость, ориентир низкий
    } else {
      const d = districtName(z.bucket)
      aptRate = DISTRICT_RENT_RATES[d] ?? 280
    }
    if (aptRate == null) aptRate = 280
    if (category === 'apartment') return aptRate
    const inCity = z.zone === 'city' || z.zone === 'cityDistrict'
    if (category === 'commercial') return inCity ? COMMERCIAL_RENT_CITY : Math.max(COMMERCIAL_RENT_RURAL, aptRate * 0.55)
    if (category === 'townhouse') return inCity ? Math.round(HOUSE_RENT_CITY * 1.15) : Math.round(Math.max(180, aptRate * 0.8))
    return inCity ? HOUSE_RENT_CITY : Math.round(Math.max(HOUSE_RENT_NEAR * 0.8, aptRate * 0.7))
  }
  // Продажа, не земля
  if (category === 'apartment' || category === 'commercial') {
    if (z.zone === 'cityDistrict') {
      const rates = category === 'apartment' ? CITY_APARTMENT_RATES : CITY_COMMERCIAL_RATES
      return rates[z.bucket.split('· ')[1]?.trim() || ''] ?? (category === 'apartment' ? CITY_APARTMENT_RATE_DEFAULT : CITY_COMMERCIAL_RATE_DEFAULT)
    }
    if (z.zone === 'city') return category === 'apartment' ? CITY_APARTMENT_RATE_DEFAULT : CITY_COMMERCIAL_RATE_DEFAULT
    if (z.zone === 'near') return category === 'apartment' ? NEAR_HOUSE_RATE * 1.1 : 30000 // редкие квартиры в пригороде
    if (z.zone === 'town') {
      const t = norm(z.bucket)
      const town = Object.keys(DISTRICT_TOWNS).find((k) => norm(k) === t)
      return category === 'apartment' ? (town ? DISTRICT_TOWNS[town] * 1.1 : 36000) : 30000
    }
    if (z.zone === 'snt') return category === 'apartment' ? 30000 : 28000
    const d = districtName(z.bucket)
    const house = DISTRICT_HOUSE_RATES[d]
    if (category === 'apartment') return (house || 30000) * 1.1
    return (house || 30000) * 0.95
  }
  // house / townhouse
  if (z.zone === 'cityDistrict' || z.zone === 'city') {
    return category === 'townhouse' ? CITY_TOWNHOUSE_RATE : CITY_HOUSE_RATE
  }
  if (z.zone === 'near') return NEAR_HOUSE_RATE
  if (z.zone === 'snt') {
    // Дом в товариществе — дачный формат: заметно дешевле дома в селе
    const land = SNT_LAND_RATES[z.bucket]
    return land ? Math.max(15000, Math.round(land * 0.13)) : 22000
  }
  if (z.zone === 'town') {
    const t = norm(z.bucket)
    const town = Object.keys(DISTRICT_TOWNS).find((k) => norm(k) === t)
    return town ? DISTRICT_TOWNS[town] : 33000
  }
  const d = districtName(z.bucket)
  return DISTRICT_HOUSE_RATES[d] ?? 30000
}

/** Название района с большой буквы для карт ставок (ключи District_* — в именительном) */
function districtName(v: string): string {
  const found = Object.keys(DISTRICT_HOUSE_RATES).find((d) => norm(d) === norm(v))
  return found || v
}

function districtOfTown(town: string): string | undefined {
  const map: Record<string, string> = {
    Моздок: 'Моздокский район',
    Беслан: 'Правобережный район',
    Алагир: 'Алагирский район',
    Ардон: 'Ардонский район',
    Дигора: 'Дигорский район',
    Эльхотово: 'Кировский район',
    Чикола: 'Ирафский район',
  }
  return map[town]
}

// ─────────────────────────────────────────────────────────────────────────────
// Уверенность: сколько значимых параметров учтено
// ─────────────────────────────────────────────────────────────────────────────

const isSet = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') {
    const s = v.trim()
    return s.length > 0 && s !== 'нет' && s !== 'no'
  }
  return typeof v === 'number' && Number.isFinite(v)
}

const hasAny = (p: ValuationParams, keys: (keyof ValuationParams)[]): boolean => keys.some((k) => isSet(p[k]))

/** Порог уверенности в баллах по категории: [низкая <, средняя <, высокая >=] */
function confidenceThresholds(category: string): { low: number; mid: number; high: number } {
  switch (category) {
    case 'apartment':
      return { low: 5, mid: 7, high: 9 }
    case 'house':
    case 'townhouse':
      return { low: 4, mid: 6, high: 8 }
    case 'commercial':
      return { low: 4, mid: 5, high: 7 }
    case 'land':
      return { low: 3, mid: 4, high: 5 }
    default:
      return { low: 3, mid: 5, high: 7 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Сборка результата
// ─────────────────────────────────────────────────────────────────────────────

function unitsOf(category: string, sale: boolean): ValuationUnit | null {
  if (category === 'land') return 'are'
  if (!sale) return 'sqmMonth'
  return 'sqm'
}

/** Округление суммы: крупные суммы округляем к 100 тыс., мелкие к 1 тыс. */
function roundTo(v: number, unit: number): number {
  return Math.round(v / unit) * unit
}
function niceRound(v: number): number {
  const unit = v >= 1e7 ? 1e5 : v >= 1e6 ? 5e4 : v >= 2e5 ? 1e4 : v >= 5e4 ? 5e3 : 1e3
  return roundTo(v, unit)
}

const SPREAD: Record<Confidence, number> = { high: 0.08, medium: 0.14, low: 0.2 }

/** Основной расчёт: параметры + необязательная выборка компараблей (за единицу) */
export function evaluateValuation(
  raw: ValuationParams,
  comparablesPerUnit?: number[] | null,
): ValuationResult {
  const at = new Date().toISOString()
  const p: ValuationParams = { ...raw }
  const category = norm(p.category as string) || ''
  const type = norm(p.type as string) || 'sale'
  const sale = type !== 'rent'
  const used: string[] = []
  const missing: string[] = []
  const notes: string[] = []
  const area = num(p.area)

  const empty = (reason: string): ValuationResult => ({
    ok: false,
    estimate: null,
    estimateMin: null,
    estimateMax: null,
    perUnit: null,
    pricePerUnit: null,
    unit: null,
    deviationRub: null,
    deviationPct: null,
    verdict: null,
    confidence: null,
    insufficient: true,
    missing: ['area', 'location'],
    used: used.length ? used : ['category'],
    source: null,
    comparablesCount: 0,
    method: 'Оценка невозможна: недостаточно данных',
    notes: [reason],
    at,
  })

  // ── Проверка обязательных данных ──────────────────────────────────────
  const KNOWN: Record<string, string> = {
    apartment: 'Квартира',
    house: 'Дом',
    townhouse: 'Таунхаус',
    commercial: 'Коммерческая',
    land: 'Участок',
  }
  if (!KNOWN[category]) return empty('Неизвестная категория объекта')

  if (!area || area <= 0) {
    return {
      ...empty('Нет площади'),
      missing: ['area'],
      insufficient: true,
    }
  }
  const z = zoneInfo(p)
  if (!z.located) {
    return {
      ...empty('Нет местоположения'),
      missing: ['location'],
      insufficient: true,
    }
  }
  // Аренда земельных участков движком не оценивается
  if (category === 'land' && !sale) {
    return {
      ...empty('Аренда участков не оценивается'),
      missing: ['location'],
      insufficient: true,
    }
  }

  used.push('category', 'area', z.zone === 'snt' ? 'snt' : 'location')
  if (z.zone === 'cityDistrict' || z.zone === 'city') used.push('city')
  const street = streetFactor(p, z.zone === 'city' || z.zone === 'cityDistrict')
  if (street.prestige) used.push('street-prestige')

  // ── Базовая ставка: компарабли базы Н15, иначе справочник ────────────
  const list = comparablesPerUnit?.filter((v) => Number.isFinite(v) && v > 0) || []
  let baseRate: number
  let source: RateSource
  const reference = referenceRatePerUnit(p, z, category, sale)
  if (reference == null) return empty('Нет справочной ставки для местоположения')

  if (list.length >= 8) {
    baseRate = median(list)
    source = 'comparables'
  } else if (list.length >= 3) {
    // Малая выборка — смешиваем с справочником, чтобы не «прыгать» от 2-3 лотов
    baseRate = median(list) * 0.65 + reference * 0.35
    source = 'comparables'
  } else {
    baseRate = reference
    source = 'rates'
  }
  if (list.length) {
    used.push('comparables')
    notes.push(`Сопоставимых объектов в базе: ${list.length}`)
  } else if (source === 'rates') {
    notes.push('Сопоставимых объектов в базе нет — справочная ставка пояса')
  }

  // ── Поправочные коэффициенты по параметрам объекта ────────────────────
  let factor = 1
  const apply = (f: number, key: string) => {
    if (f === 1) return
    factor *= f
    if (!used.includes(key)) used.push(key)
  }

  apply(street.factor, 'street-prestige')

  if (category === 'apartment' || category === 'commercial') {
    apply(floorFactor(category, p.floor, p.totalFloors), 'floor')
    apply(elevatorFactor(p.elevator, p.floor, p.totalFloors), 'elevator')
  }
  apply(buildingTypeFactor(p.buildingType), 'buildingType')
  apply(yearFactor(p.builtYear), 'builtYear')
  apply(conditionFactor(p.condition), 'condition')
  apply(roomsFactor(category, p.rooms), 'rooms')
  apply(areaFactor(category, area), 'area-size')
  apply(layoutFactor(category, area, p.livingArea), 'livingArea')
  apply(utilitiesFactor(category, p), 'utilities')
  if (category === 'apartment' || category === 'commercial') {
    apply(balconyFactor(p.balcony), 'balcony')
    apply(comfortFactor(p.yard), 'yard')
    apply(parkingFactor(p.parking), 'parking')
  }
  const gasField = norm(p.gas)
  const gasAlreadySet = Boolean(gasField && gasField !== 'нет' && gasField !== 'no')
  apply(featuresBoost(category, p.features, used, gasAlreadySet), 'features')

  // ── Единицы и итоговая оценка ─────────────────────────────────────────
  const unit = unitsOf(category, sale)
  const units = unit === 'are' ? area / 100 : area
  // Ограничение суммарной корректировки: отдельные коэффициенты разумны,
  // но их произведение не должно уходить в крайности
  const totalFactor = Math.min(Math.max(factor, 0.68), 1.32)
  const estPerUnit = baseRate * totalFactor
  const estimate = estPerUnit * units

  // Уверенность
  let score = 0
  const locationScore = z.zone === 'snt' || z.zone === 'cityDistrict' || z.zone === 'town' || z.zone === 'near' ? 2 : 1
  score += 2 // площадь
  score += locationScore // местоположение
  if (isSet(p.rooms)) score += 1
  if (isSet(p.floor) && isSet(p.totalFloors)) score += 1
  if (isSet(p.buildingType)) score += 1
  if (isSet(p.builtYear)) score += 1
  if (isSet(p.condition)) score += 1
  if (hasAny(p, ['elevator', 'balcony', 'parking', 'yard', 'heating', 'gas', 'water', 'sewerage', 'livingArea'])) score += 1
  // Участок с коммуникациями (свет/вода/газ) — точнее по стоимости
  if (category === 'land' && hasAny(p, ['electricity', 'gas', 'water', 'features'])) score += 1
  const th = confidenceThresholds(category)
  let confidence: Confidence = score >= th.high ? 'high' : score >= th.mid ? 'medium' : 'low'
  // Справочный режим без компараблей не может быть «высокой точности»,
  // кроме точечных ставок конкретных СНТ/СТ (калиброванная карта товариществ Н15)
  if (source === 'rates' && confidence === 'high' && z.zone !== 'snt') confidence = 'medium'
  // Малые лоты по справочнику — всегда с широкой вилкой
  const spread = SPREAD[confidence]

  // Что стоит заполнить для более точной оценки (до 5 подсказок) — по категории
  const want: { key: string; set: boolean }[] = []
  const pushWant = (key: string, set: boolean) => want.push({ key, set })
  if (category === 'apartment') {
    pushWant('rooms', isSet(p.rooms))
    pushWant('floor', isSet(p.floor) || isSet(p.totalFloors))
    pushWant('buildingType', isSet(p.buildingType))
    pushWant('builtYear', isSet(p.builtYear))
    pushWant('condition', isSet(p.condition))
    pushWant('elevator', isSet(p.elevator) || isSet(p.balcony) || isSet(p.parking) || isSet(p.yard))
  } else if (category === 'house' || category === 'townhouse') {
    pushWant('buildingType', isSet(p.buildingType))
    pushWant('builtYear', isSet(p.builtYear))
    pushWant('condition', isSet(p.condition))
    pushWant('utilities', hasAny(p, ['heating', 'gas', 'water', 'sewerage', 'electricity']))
  } else if (category === 'commercial') {
    pushWant('floor', isSet(p.floor) || isSet(p.totalFloors))
    pushWant('buildingType', isSet(p.buildingType))
    pushWant('condition', isSet(p.condition))
    pushWant('parking', isSet(p.parking) || isSet(p.yard))
  }
  // Участок: главное — точное место (СТ или населённый пункт) и коммуникации.
  // В городе участок привязан к району — населённый пункт не нужен.
  if (category === 'land') {
    if ((z.zone === 'rural' || z.zone === 'rural-unknown') && !isSet(p.snt) && !isSet(p.locality)) {
      pushWant('locality', false)
    }
    pushWant('infrastructure', hasAny(p, ['electricity', 'gas', 'water', 'features']))
  }
  for (const w of want) {
    if (!w.set && !used.includes(w.key)) missing.push(w.key)
    if (missing.length >= 5) break
  }

  const price = num(p.price)
  let deviationRub: number | null = null
  let deviationPct: number | null = null
  let verdict: Verdict | null = null
  const pricePerUnit = price != null ? price / units : null
  if (price != null && price > 0) {
    deviationRub = price - estimate
    deviationPct = (deviationRub / estimate) * 100
    // Порог «соответствия рынку» — ±5%
    verdict = deviationPct <= -5 ? 'below' : deviationPct >= 5 ? 'above' : 'match'
  }

  const method =
    source === 'comparables'
      ? `Сопоставимые объекты базы Н15 (${list.length} шт.) + коэффициенты по параметрам`
      : 'Справочные ставки Н15 по ценовому поясу + коэффициенты по параметрам'

  return {
    ok: true,
    estimate: niceRound(estimate),
    estimateMin: niceRound(estimate * (1 - spread)),
    estimateMax: niceRound(estimate * (1 + spread)),
    perUnit: Math.round(estPerUnit),
    pricePerUnit: pricePerUnit != null ? Math.round(pricePerUnit) : null,
    unit,
    deviationRub: deviationRub != null ? Math.round(deviationRub) : null,
    deviationPct: deviationPct != null ? Math.round(deviationPct * 10) / 10 : null,
    verdict,
    confidence,
    insufficient: false,
    missing,
    used,
    source,
    comparablesCount: list.length,
    method,
    notes,
    at,
  }
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ─────────────────────────────────────────────────────────────────────────────
// Помощники для работы с документом Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface ValuationDocLike {
  type?: string | null
  category?: string | null
  price?: number | null
  area?: number | null
  livingArea?: number | null
  kitchenArea?: number | null
  rooms?: number | null
  floor?: number | null
  totalFloors?: number | null
  buildingType?: string | null
  condition?: string | null
  builtYear?: number | null
  heating?: string | null
  balcony?: string | null
  water?: string | null
  sewerage?: string | null
  electricity?: string | null
  gas?: string | null
  internet?: string | null
  elevator?: string | null
  yard?: string | null
  parking?: string | null
  address?: {
    city?: string | null
    district?: string | null
    cityDistrict?: string | null
    locality?: string | null
    snt?: string | null
    street?: string | null
    house?: string | null
    apartment?: string | null
  } | null
  features?: { feature?: string }[] | null
}

/** Достаёт параметры оценки из документа объекта (Payload REST/админка) */
export function paramsFromDoc(doc: ValuationDocLike): ValuationParams {
  const addr = doc.address || {}
  return {
    type: doc.type ?? null,
    category: doc.category ?? null,
    price: num(doc.price),
    area: num(doc.area),
    livingArea: num(doc.livingArea),
    kitchenArea: num(doc.kitchenArea),
    rooms: num(doc.rooms),
    floor: num(doc.floor),
    totalFloors: num(doc.totalFloors),
    buildingType: doc.buildingType ?? null,
    condition: doc.condition ?? null,
    builtYear: num(doc.builtYear),
    heating: doc.heating ?? null,
    balcony: doc.balcony ?? null,
    water: doc.water ?? null,
    sewerage: doc.sewerage ?? null,
    electricity: doc.electricity ?? null,
    gas: doc.gas ?? null,
    internet: doc.internet ?? null,
    elevator: doc.elevator ?? null,
    yard: doc.yard ?? null,
    parking: doc.parking ?? null,
    city: addr.city ?? null,
    district: addr.district ?? null,
    cityDistrict: addr.cityDistrict ?? null,
    locality: addr.locality ?? null,
    snt: addr.snt ?? null,
    street: addr.street ?? null,
    house: addr.house ?? null,
    apartment: addr.apartment ?? null,
    features: (doc.features || []).map((f) => f.feature || '').filter(Boolean),
  }
}

/** Отображение оценки в карточке-списке: «≈ 8 450 000 ₽» */
export function formatMoney(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(v))} ₽`
}

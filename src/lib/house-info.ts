// ---------------------------------------------------------------------------
// «Данные о доме» — характеристики дома из открытых источников для карточки
// объекта CRM.
//
// Источник не один, и это важно для правил: рабочий канал к раскрываемым
// сведениям ГИС ЖКХ — официальный портал АИС ППК «Фонд развития территорий»
// (постановление Правительства РФ № 731 и приказ Минстроя России № 536/пр).
// На нём у дома несколько разделов, и каждый считается отдельным источником:
//   — «Жилищный фонд» — паспорт дома (год постройки, стены, этажность,
//     серия, площадь, капремонт по конструктивным элементам);
//   — «Капитальный ремонт МКД» — карточка региональной программы (площадь,
//     этажность, год ввода, аварийность, средства фонда капремонта);
//   — «Управление» — управляющая организация, дата начала и основание.
// Кроме них система спрашивает официальные порталы (ГИС ЖКХ, НСПД,
// публичную кадастровую карту), муниципальные базы городов, сайт
// управляющей организации и открытые карточки домов на площадках
// недвижимости. Порталы и площадки автоматически не разбираются: сбор
// запрещён их правилами либо страницы отдаются клиентским скриптом, поэтому
// агенту даётся ссылка на ручную проверку — без обхода блокировок.
//
// Правила, заложенные здесь:
//   — адрес разбирается на части (город, улица, номер дома, корпус,
//     строение) и передаётся в каждый источник отдельно; в реестр уходит
//     поисковая строка, собранная из этих же частей;
//   — у каждого значения хранится источник, ссылка, дата проверки и степень
//     совпадения адреса карточки с адресом объекта;
//   — автоматически подставляется только значение источника с подтверждённым
//     совпадением адреса (см. ADDRESS_MATCH_CONFIRM); при неполном совпадении
//     значения показываются, но помечаются «Требует проверки» и клиенту не
//     уходят;
//   — если источники дают разные значения, показываются оба варианта с
//     источниками («Требует проверки»), а не одно «правильное»;
//   — если один источник дом не нашёл, это не значит «данных нет»: система
//     сообщает, где именно не нашлось, и продолжает поиск по другим
//     источникам (см. HOUSE_RESULT_LABEL.checkingOthers);
//   — для частного дома порядок отдельный: карточки частного дома в
//     ГИС ЖКХ обычно нет, поэтому ищут по кадастровым и муниципальным
//     источникам и открытым карточкам площадок.
//
// Модуль без ввода-вывода: разбор HTML, правила сопоставления и склейка
// значений — чистые функции (сеть и Payload — в src/lib/house-info-service.ts).
// ---------------------------------------------------------------------------

import { PLATFORM_SPECS } from './listing-check'

export type HouseFieldKey =
  | 'builtYear'
  | 'wallMaterial'
  | 'floors'
  | 'series'
  | 'majorRepairYear'
  | 'managementOrg'
  | 'houseArea'

/**
 * Статус значения: подтверждено / требует проверки / найдено, но совпадение
 * адреса не подтверждено / не найдено / проверка недоступна
 */
export type HouseFieldStatus = 'confirmed' | 'conflict' | 'needsCheck' | 'notFound' | 'unavailable'

export type HouseResultStatus =
  | 'found'
  | 'checkingOthers'
  | 'notFound'
  | 'ambiguous'
  | 'unavailable'
  | 'noAddress'

/** Итог проверки: дом найден, ищем в других источниках, не найден… */
export const HOUSE_RESULT_LABEL: Record<HouseResultStatus, string> = {
  found: 'Дом найден в открытых источниках',
  // Один источник дом не нашёл — это не «данных нет»: поиск идёт дальше
  checkingOthers: 'В источнике ГИС ЖКХ не найдено. Выполняется поиск по другим источникам',
  notFound: 'Дом не найден ни в одном открытом источнике',
  ambiguous: 'Найдено несколько домов — требует проверки',
  unavailable: 'Проверка недоступна',
  noAddress: 'Не указан адрес для поиска',
}

export const HOUSE_FIELD_STATUS_LABEL: Record<HouseFieldStatus, string> = {
  confirmed: 'Найдено',
  conflict: 'Требует проверки',
  needsCheck: 'Требует проверки: совпадение адреса не подтверждено',
  notFound: 'Не найдено',
  unavailable: 'Проверка недоступна',
}

export const HOUSE_FIELD_LABELS: Record<HouseFieldKey, string> = {
  builtYear: 'Год постройки',
  wallMaterial: 'Материал стен',
  floors: 'Количество этажей',
  series: 'Серия / тип дома',
  majorRepairYear: 'Капитальный ремонт',
  managementOrg: 'Управляющая организация',
  houseArea: 'Площадь дома, м²',
}

/** Порядок характеристик в карточке и в снимке */
export const HOUSE_FIELD_ORDER: HouseFieldKey[] = [
  'builtYear',
  'wallMaterial',
  'floors',
  'series',
  'houseArea',
  'majorRepairYear',
  'managementOrg',
]

// --- Источники ----------------------------------------------------------------

/**
 * Рабочий канал к открытым сведениям ГИС ЖКХ: официальный портал АИС ППК
 * «Фонд развития территорий». Значения в паспорте дома приходят от
 * уполномоченных органов субъекта РФ, органов местного самоуправления и
 * управляющих организаций — портал показывает, кто сообщил каждое значение.
 */
export const HOUSE_REGISTRY = {
  code: 'frt',
  /** Краткое имя для интерфейса и описания объекта */
  name: 'АИС ППК «ФРТ» (ГИС ЖКХ)',
  fullName:
    'АИС ППК «Фонд развития территорий» — раскрытие сведений о многоквартирных домах (постановление Правительства РФ № 731, приказ Минстроя России № 536/пр)',
  /** Технический адрес портала (punycode) — по нему идут запросы */
  origin: 'https://xn--80adsazqn.xn--p1aee.xn--p1ai',
  /** Человекочитаемый адрес того же портала — для ссылок в интерфейсе */
  displayOrigin: 'https://реформажкх.фрт.рф',
  /**
   * Честный User-Agent: официальный портал, несколько запросов на проверку.
   * Только латиница — Node fetch не принимает кириллицу в заголовках
   * (ByteString) и роняет запрос целиком.
   */
  userAgent: 'N15-Realty-HouseInfo/2.0 (+https://n15-realty.ru; FRT GIS ZhKH open data)',
} as const

export type HouseSourceKind = 'registry' | 'overhaul' | 'management' | 'municipal' | 'cadastral' | 'realty'

export const HOUSE_SOURCE_KIND_LABEL: Record<HouseSourceKind, string> = {
  registry: 'Реестр жилищного фонда',
  overhaul: 'Программа капитального ремонта',
  management: 'Управление домом',
  municipal: 'Муниципальная база',
  cadastral: 'Кадастровые сведения',
  realty: 'Карточки домов на площадках',
}

/** Порядок групп источников в интерфейсе */
export const HOUSE_SOURCE_KIND_ORDER: HouseSourceKind[] = [
  'registry',
  'overhaul',
  'management',
  'cadastral',
  'municipal',
  'realty',
]

export type HouseSourceStatus = 'found' | 'notFound' | 'unavailable' | 'manual' | 'notApplicable'

export const HOUSE_SOURCE_STATUS_LABEL: Record<HouseSourceStatus, string> = {
  found: 'Дом найден',
  notFound: 'Дом не найден',
  unavailable: 'Источник недоступен',
  manual: 'Проверка по ссылке',
  notApplicable: 'Не применим',
}

/** Что за источник и что он даёт по дому */
export interface HouseSourceDef {
  code: string
  name: string
  kind: HouseSourceKind
  /** Кто ведёт источник */
  operator: string
  /** Начальная страница источника (для справки) */
  site: string
  /** Что источник даёт по дому — человеческим языком */
  about: string
  /** Ищется ли по нему дом автоматически */
  auto: boolean
}

/** Источники, у которых есть собственный разбор страниц (без ввода-вывода) */
export const HOUSE_FRT_SOURCES: HouseSourceDef[] = [
  {
    code: 'frt-mkd',
    name: 'ГИС ЖКХ · паспорт дома (ФРТ, раздел «Жилищный фонд»)',
    kind: 'registry',
    operator: 'АИС ППК «Фонд развития территорий»',
    site: HOUSE_REGISTRY.displayOrigin,
    about: 'Год постройки, материал стен, этажность, серия, площадь дома, капремонт по конструктивным элементам',
    auto: true,
  },
  {
    code: 'frt-overhaul',
    name: 'ФРТ · капитальный ремонт дома (раздел «Капитальный ремонт МКД»)',
    kind: 'overhaul',
    operator: 'АИС ППК «Фонд развития территорий»',
    site: HOUSE_REGISTRY.displayOrigin,
    about: 'Площадь и этажность дома по программе капремонта, год ввода, аварийность, средства фонда капремонта',
    auto: true,
  },
  {
    code: 'frt-management',
    name: 'ФРТ · управление домом (раздел «Управление»)',
    kind: 'management',
    operator: 'АИС ППК «Фонд развития территорий»',
    site: HOUSE_REGISTRY.displayOrigin,
    about: 'Управляющая организация, дата начала управления и основание',
    auto: true,
  },
]

/** Официальные порталы и базы, которые система спрашивает, но не разбирает */
export const HOUSE_EXTERNAL_SOURCES: HouseSourceDef[] = [
  {
    code: 'giszkh',
    name: 'ГИС ЖКХ — официальный портал (dom.gosuslugi.ru)',
    kind: 'registry',
    operator: 'Минстрой России / Минцифры России',
    site: 'https://dom.gosuslugi.ru/',
    about: 'Первоисточник раскрытия сведений о домах; карточки отдаются клиентским приложением и с сервера не разбираются',
    auto: false,
  },
  {
    code: 'nspd',
    name: 'НСПД — открытые кадастровые сведения (nspd.gov.ru)',
    kind: 'cadastral',
    operator: 'Росреестр',
    site: 'https://nspd.gov.ru/map',
    about: 'Кадастровые сведения о доме и участке: площадь, год завершения строительства, кадастровые номера',
    auto: false,
  },
  {
    code: 'pkk',
    name: 'Публичная кадастровая карта Росреестра (pkk.rosreestr.ru)',
    kind: 'cadastral',
    operator: 'Росреестр',
    site: 'https://pkk.rosreestr.ru/',
    about: 'Кадастровые кварталы, номера и границы участков с домом',
    auto: false,
  },
  {
    code: 'municipal',
    name: 'Муниципальная база домов',
    kind: 'municipal',
    operator: 'Органы местного самоуправления',
    site: 'https://vladikavkaz-osetia.ru/',
    about: 'Адресные перечни и карточки домов муниципалитета; открытых машиночитаемых баз у городов региона нет',
    auto: false,
  },
  {
    code: 'uk',
    name: 'Сайт управляющей организации',
    kind: 'management',
    operator: 'Управляющая организация дома',
    site: '',
    about: 'Собственный сайт УК: тарифы, работы, паспорт дома; находится поиском по наименованию организации',
    auto: false,
  },
  ...PLATFORM_SPECS.map<HouseSourceDef>((p) => ({
    // Площадки недвижимости: автоматическая сверка запрещена их правилами
    // (см. src/lib/listing-check.ts) — агенту даётся ссылка на поиск
    code: `realty-${p.slug}`,
    name: `${p.name} — карточки домов и объявления по адресу`,
    kind: 'realty',
    operator: p.name,
    site: `https://${p.domains[0]}`,
    about: 'Открытые карточки домов и объявления площадки по адресу объекта',
    auto: false,
  })),
]

export const HOUSE_SOURCE_DEFS: HouseSourceDef[] = [...HOUSE_FRT_SOURCES, ...HOUSE_EXTERNAL_SOURCES]

export const houseSourceDef = (code: string): HouseSourceDef | undefined =>
  HOUSE_SOURCE_DEFS.find((s) => s.code === code)

/** Ссылка на поиск по адресу на площадке недвижимости */
export function realtySearchUrl(code: string, query: string): string | null {
  const slug = code.replace(/^realty-/, '')
  const spec = PLATFORM_SPECS.find((p) => p.slug === slug)
  return spec ? spec.searchUrl(query) : null
}

/** Степень совпадения адреса карточки источника с адресом объекта */
export type AddressMatchLevel = 'exact' | 'high' | 'partial' | 'none'

export const ADDRESS_MATCH_LABEL: Record<AddressMatchLevel, string> = {
  exact: 'Полное — улица, дом, корпус и строение совпали',
  high: 'Неполное — улица и дом совпали, корпус или строение отличаются',
  partial: 'Слабое — совпала улица, номер дома другой',
  none: 'Адреса не совпали',
}

export const ADDRESS_MATCH_SHORT: Record<AddressMatchLevel, string> = {
  exact: 'полное',
  high: 'неполное',
  partial: 'слабое',
  none: 'нет',
}

/**
 * Совпадение адреса считается подтверждённым только при полном совпадении
 * улицы, номера дома, корпуса и строения. Значения источников с неполным
 * совпадением показываются, но не подставляются автоматически.
 */
export const ADDRESS_MATCH_CONFIRM = 100

export interface AddressMatch {
  /** 0..100 — степень совпадения адреса */
  score: number
  level: AddressMatchLevel
  /** Чем совпадение подтверждено или почему неполное */
  note: string | null
}

/** Отчёт по одному источнику: что проверено, найдено, недоступно */
export interface HouseSourceReport {
  code: string
  name: string
  kind: HouseSourceKind
  operator: string
  status: HouseSourceStatus
  /** Ссылка: карточка дома, поиск по адресу или ручная проверка */
  url: string | null
  /** Что за ссылка: «карточка дома», «поиск по адресу», «проверить вручную» */
  urlLabel: string | null
  /** Адрес дома в источнике (для найденных карточек) */
  cardAddress: string | null
  /** Степень совпадения адреса карточки с адресом объекта */
  match: AddressMatch | null
  /** Когда источник проверен */
  checkedAt: string | null
  /** Что именно дал источник / почему недоступен / что проверять вручную */
  note: string | null
  /** Сколько значений характеристик источник дал в снимок */
  valuesCount: number
}

// --- Адрес: разбор на части и поисковые строки --------------------------------

export interface HouseQueryAddress {
  city?: string | null
  locality?: string | null
  street?: string | null
  house?: string | null
  /** Корпус — отдельная часть адреса */
  corpus?: string | null
  /** Строение (или сооружение) — отдельная часть адреса */
  building?: string | null
  snt?: string | null
}

/**
 * Сокращения типов адреса. Длинные варианты идут раньше коротких, а после
 * сокращения обязана стоять точка или пробел: без этого «пр-кт» режется как
 * «пр», «посёлок» — как «п», и адрес источника разбирается неверно.
 */
const ADDRESS_TYPE_RE =
  /^(республика|респ|область|обл|край|город|посёлок|поселок|пос|станица|ст|село|аул|улица|ул|проспект|пр-кт|пр|проезд|переулок|пер|набережная|наб|шоссе|строение|соор|сооружение|стр|корпус|корп|кор|квартира|кварт|кв|дом|д|г|п|с|к|ш)\.?(?=\s|$)\s*(.*)$/i

/** Нормализация адресной строки: регистр, «ё», пунктуация, сокращения */
export function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:()"'«»]/g, ' ')
    .replace(
      /\b(улица|проспект|проезд|переулок|набережная|шоссе|строение|сооружение|корпус|квартира|республика|область|город|поселок|посёлок|станица|ул|пр-кт|пер|наб|корп|респ|обл|стр|соор|кв|дом|д|г|п|с|к|ш)\b\.?/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Значимые токены строки (для сравнения улиц и адресов) */
const tokens = (s: string, minLength = 0): string[] =>
  normalizeAddress(s)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > minLength)

export interface ParsedHouseNumber {
  /** Номер дома без корпуса и строения: «15», «29А» */
  house: string
  /** Корпус: «2» (в адресах реестра — «к. 2») */
  corpus: string
  /** Строение: «1» (в адресах реестра — «стр. 1») */
  building: string
}

/** Вырезать часть адреса по регулярному выражению и вернуть остаток */
const cut = (s: string, re: RegExp): { rest: string; value: string } => {
  const m = re.exec(s)
  if (!m) return { rest: s, value: '' }
  return {
    rest: `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim(),
    value: (m[1] || '').toUpperCase(),
  }
}

/**
 * Разбор номера дома на номер, корпус и строение: «15 к2», «15 корп. 2»,
 * «15 стр 1», «15/2» (дробь в адресах читается как корпус: «д. 15, к. 2»).
 * Значения хранятся отдельно — так их и ждут источники.
 */
export function parseHouseNumber(raw: string | null | undefined): ParsedHouseNumber {
  let rest = (raw || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[.,;]/g, ' ')
  if (!rest) return { house: '', corpus: '', building: '' }

  // Тип части адреса может стоять и без пробела: «36к2», «89стр1»
  const building = cut(rest, /(?<=^|[\s\d])(?:строение|строен|стр|сооружение|соор)\.?\s*(\d+[а-я]?)(?=\s|$)/i)
  rest = building.rest
  const corpus = cut(rest, /(?<=^|[\s\d])(?:корпус|корп|кор|к)\.?\s*(\d+[а-я]?)(?=\s|$)/i)
  rest = corpus.rest

  const slash = /(?:^|\s)(\d+[а-я]?)\s*\/\s*(\d+[а-я]?)(?=\s|$)/i.exec(rest)
  let house = ''
  let corpusValue = corpus.value
  if (slash) {
    house = slash[1].toUpperCase()
    // «15/2» — в адресных базах это «д. 15, к. 2»; если корпус уже назван
    // явно, вторая часть дроби остаётся частью номера
    if (!corpusValue) corpusValue = slash[2].toUpperCase()
  } else {
    house = (/^\s*(\d+[а-я]?)/i.exec(rest)?.[1] || '').toUpperCase()
  }
  return { house, corpus: corpusValue, building: building.value }
}

/** Разбор адресной строки источника на части: «…, ул. Цоколаева, д. 36, к. 1» */
export function addressFromString(raw: string): HouseQueryAddress {
  const out: HouseQueryAddress = {}
  for (const segment of (raw || '').split(',')) {
    const s = segment.trim()
    if (!s) continue
    const m = ADDRESS_TYPE_RE.exec(s)
    if (!m) {
      // Сегмент без типа: чаще всего это продолжение предыдущего
      if (!out.street) out.street = s
      continue
    }
    const type = m[1].toLowerCase().replace(/\.$/, '')
    const value = m[2].trim()
    if (/^(респ|республика|обл|область|край)$/.test(type)) continue
    if (/^(г|город|п|пос|поселок|посёлок|с|село|ст|станица|аул)$/.test(type)) {
      out.locality = value
      continue
    }
    if (/^(кв|кварт|квартира)$/.test(type)) continue
    if (/^(к|кор|корп|корпус)$/.test(type)) {
      out.corpus = value
      continue
    }
    if (/^(стр|строение|соор|сооружение)$/.test(type)) {
      out.building = value
      continue
    }
    if (/^(д|дом)$/.test(type)) {
      const parsed = parseHouseNumber(value)
      out.house = parsed.house
      if (parsed.corpus) out.corpus = parsed.corpus
      if (parsed.building) out.building = parsed.building
      continue
    }
    // Всё остальное — улица (в том числе «пр-кт. Доватора»)
    out.street = value
  }
  return out
}

/** Адрес, разобранный на части и приведённый к виду для поиска */
export interface NormalizedAddress {
  city: string
  locality: string
  street: string
  house: string
  corpus: string
  building: string
  snt: string
  /** «г. Владикавказ, ул. Доватора, д. 89, корп. 2, стр. 1» */
  display: string
  /** Запрос к реестру: «Владикавказ Доватора 89 к. 2» */
  query: string
  /** Запрос без корпуса и строения — запасной, если точный ничего не нашёл */
  baseQuery: string
  /** Ключ сравнения адресов: «доватора|89|2|» */
  key: string
  /** Заполнены город (или населённый пункт), улица и номер дома */
  complete: boolean
}

const joinParts = (parts: (string | null | undefined)[], sep = ' '): string =>
  parts.map((p) => (p || '').trim()).filter(Boolean).join(sep)

// Слова-типы улиц: в адресном справочнике они остаются в названии («Проспект
// Коста», «Железнодорожный переулок», «7 линия») — так они и хранятся в адресе
// объекта. Перед таким названием «ул.» не пишем: «ул. проспект Коста» —
// неверная запись. Тип в названии ищем только у многословных названий, чтобы
// не тронуть улицы, которые сами называются Набережная или Линия.
const STREET_TYPE_WORDS = new Set([
  'ул', 'улица', 'проспект', 'пр', 'пр-т', 'переулок', 'пер', 'площадь', 'пл',
  'шоссе', 'проезд', 'бульвар', 'аллея', 'линия', 'тупик', 'тракт',
])
export const streetHasTypeWord = (street: string): boolean => {
  const words = street.toLowerCase().replace(/\./g, ' ').split(/\s+/).filter(Boolean)
  return words.length > 1 && words.some((w) => STREET_TYPE_WORDS.has(w))
}

/**
 * Адрес объекта в вид для поиска: части (город, улица, дом, корпус,
 * строение) хранятся отдельно, из них собираются человекочитаемый адрес,
 * поисковая строка реестра и ключ сравнения.
 */
export function normalizeHouseAddress(addr: HouseQueryAddress): NormalizedAddress {
  const houseRaw = (addr.house || '').trim()
  const parsed = parseHouseNumber(houseRaw)
  // Дом может быть записан и как «15», и как «15 к2» — части разбираем из
  // того же поля, а отдельные поля адреса имеют приоритет
  const house = (parsed.house || houseRaw).toUpperCase()
  const corpus = ((addr.corpus || '').trim() || parsed.corpus).toUpperCase()
  const building = ((addr.building || '').trim() || parsed.building).toUpperCase()

  const city = (addr.city || '').trim()
  const locality = (addr.locality || '').trim()
  const street = (addr.street || '').replace(/\s+/g, ' ').trim()
  const snt = (addr.snt || '').trim()
  const place = city || locality

  const display = joinParts(
    [
      city ? `г. ${city}` : '',
      locality && locality !== city ? `населённый пункт ${locality}` : '',
      snt ? `СНТ «${snt}»` : '',
      street ? (streetHasTypeWord(street) ? street : `ул. ${street}`) : '',
      house ? `д. ${house}` : '',
      corpus ? `корп. ${corpus}` : '',
      building ? `стр. ${building}` : '',
    ],
    ', ',
  )

  const baseQuery = joinParts([place, street, house])
  const query = joinParts([
    place,
    street,
    house,
    corpus ? `к. ${corpus.toLowerCase()}` : '',
    building ? `стр. ${building.toLowerCase()}` : '',
  ])
  const key = joinParts([locality || city, street, house, corpus, building], '|').toLowerCase().replace(/ё/g, 'е')

  return {
    city,
    locality,
    street,
    house,
    corpus,
    building,
    snt,
    display,
    query: query || snt,
    baseQuery: baseQuery || snt,
    key,
    complete: Boolean(street && house),
  }
}

/** Улица объекта встречается в адресе карточки */
const streetMatches = (candidate: string, street: string): boolean => {
  const parts = tokens(street, 2)
  if (!parts.length) return false
  const hay = ` ${normalizeAddress(candidate)} `
  return parts.every((t) => hay.includes(` ${t}`))
}

/**
 * Степень совпадения адреса карточки источника с адресом объекта. Полное
 * совпадение (улица, дом, корпус и строение) — единственное подтверждающее:
 * по нему значение можно подставлять. Неполное — данные показываются, но
 * требуют проверки агентом.
 */
export function matchAddress(
  candidate: HouseQueryAddress | string,
  target: NormalizedAddress,
  opts?: { cadastralConfirmed?: boolean },
): AddressMatch {
  const cap = typeof candidate === 'string' ? addressFromString(candidate) : candidate
  const candHouse = parseHouseNumber(
    joinParts([cap.house, cap.corpus ? `к. ${cap.corpus}` : '', cap.building ? `стр. ${cap.building}` : '']),
  )
  const sameStreet = streetMatches(joinParts([cap.street]), target.street)
  const sameHouse = Boolean(candHouse.house) && candHouse.house === target.house
  const sameCorpus = (candHouse.corpus || '') === (target.corpus || '')
  const sameBuilding = (candHouse.building || '') === (target.building || '')

  if (!target.street || !target.house) {
    return { score: 0, level: 'none', note: 'В карточке объекта не заполнены улица и номер дома' }
  }
  if (!cap.street || !candHouse.house) {
    return { score: 0, level: 'none', note: 'В карточке источника не разобран адрес' }
  }
  if (!sameStreet) {
    return { score: 0, level: 'none', note: 'Улица в адресе карточки другая' }
  }
  if (!sameHouse) {
    return {
      score: 55,
      level: 'partial',
      note: `Номер дома в карточке источника другой (у объекта ${target.house}, в источнике ${candHouse.house})`,
    }
  }
  if (!sameCorpus || !sameBuilding) {
    const diff = [
      !sameCorpus ? `корпус (у объекта ${target.corpus || '—'}, в источнике ${candHouse.corpus || '—'})` : '',
      !sameBuilding ? `строение (у объекта ${target.building || '—'}, в источнике ${candHouse.building || '—'})` : '',
    ]
      .filter(Boolean)
      .join(', ')
    return { score: 80, level: 'high', note: `Улица и дом совпали, отличается ${diff}` }
  }
  return {
    score: ADDRESS_MATCH_CONFIRM,
    level: 'exact',
    note: opts?.cadastralConfirmed
      ? 'Адрес совпал полностью и подтверждён кадастровым номером участка'
      : 'Адрес совпал полностью',
  }
}

/** Совпадение достаточно, чтобы подставить значение автоматически */
export const isConfirmedMatch = (match: AddressMatch | null | undefined): boolean =>
  Boolean(match && match.level === 'exact' && match.score >= ADDRESS_MATCH_CONFIRM)

// --- Разбор открытых страниц портала ----------------------------------------

/** Раскодирование HTML-сущностей, которые встречаются в текстах портала */
const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // &amp; — последним, чтобы не раскодировать дважды
    .replace(/&amp;/g, '&')

/** Текст без тегов, с нормализацией пробелов */
const cleanText = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Пара «поставщик данных → значение» из подсказки у подписи поля */
export interface RawVariant {
  provider: string
  value: string
}

/** Строка паспорта дома: подпись, итоговое значение, варианты поставщиков */
export interface RawRow {
  label: string
  value: string
  variants: RawVariant[]
  /** Раздел паспорта («Фундамент», «Стены и перекрытия»…) */
  section: string
}

/** Значение-заглушка портала: поставщик сведений поле не заполнял */
const isEmptyValue = (v: string): boolean => {
  const t = v.trim().toLowerCase()
  return !t || t === 'не заполнено' || t === 'нет данных' || t === '—' || t === '-'
}

/**
 * Пары «поставщик → значение» из подсказки рядом с подписью поля.
 * В разметке портала это контейнер grid-2-columns, в котором подряд идут
 * текстовые div'ы: подпись поставщика, затем его значение.
 */
export function parseVariants(cellHtml: string): RawVariant[] {
  const start = cellHtml.search(/grid-2-columns/i)
  if (start < 0) return []
  const tail = cellHtml.slice(start)
  const items: string[] = []
  for (const m of tail.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)) {
    items.push(cleanText(m[1]))
  }
  const filled = items.filter((t) => t.length > 0)
  const variants: RawVariant[] = []
  for (let i = 0; i + 1 < filled.length; i += 2) {
    variants.push({ provider: filled[i], value: filled[i + 1] })
  }
  return variants
}

/**
 * Все строки таблиц страницы: подпись + итоговое значение + вариант по
 * каждому поставщику. Строки-разделы (объединённая ячейка) задают section.
 */
export function parseRows(html: string): RawRow[] {
  const rows: RawRow[] = []
  let section = ''
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const inner = m[1]
    const cells = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1])
    if (cells.length === 1) {
      // Объединённая ячейка — заголовок раздела паспорта
      const title = cleanText(cells[0])
      if (title) section = title
      continue
    }
    if (cells.length < 2) continue
    // В первой ячейке лежит подсказка с поставщиками — из подписи её убираем
    const label = cleanText(cells[0].replace(/<i[\s\S]*?<\/i>/gi, ' ')).replace(/\s*:\s*$/, '')
    if (!label) continue
    rows.push({
      label,
      value: cleanText(cells[cells.length - 1]),
      variants: parseVariants(cells[0]),
      section,
    })
  }
  return rows
}

/** Сводка «шапки» страницы: пары «подпись → значение» */
export function parseSummary(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<div class="text-secondary">([\s\S]*?)<\/div>\s*<div class=['"]f-16 fw-500['"]>([\s\S]*?)<\/div>/gi
  for (const m of html.matchAll(re)) {
    const label = cleanText(m[1])
    const value = cleanText(m[2])
    if (label && !(label in out)) out[label] = value
  }
  return out
}

/** Строки-пары «подпись → значение» из таблиц (денежные таблицы капремонта) */
export function parseKeyValueRows(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cleanText(c[1]))
    if (cells.length !== 2) continue
    if (!/text-secondary/i.test(m[1])) continue
    if (cells[0] && !(cells[0] in out)) out[cells[0]] = cells[1]
  }
  return out
}

/** Раздел сайта реестра, в котором найдена карточка дома */
export type HouseSearchSection = 'mkd' | 'overhaul' | 'other'

export interface HouseSearchHit {
  id: string
  address: string
  url: string
  /** Раздел сайта: «Жилищный фонд», «Капитальный ремонт МКД»… */
  section: string
  sectionKind: HouseSearchSection
}

/**
 * Результаты поиска по адресу: карточки домов по разделам сайта. Один и тот
 * же дом может встретиться в нескольких разделах — это разные источники
 * сведений (жилищный фонд и программа капремонта).
 */
export function parseSearchResults(html: string): HouseSearchHit[] {
  const tableStart = html.search(/id="searched-houses"/i)
  const table = tableStart >= 0 ? html.slice(tableStart, html.indexOf('</table>', tableStart)) : html
  const hits: HouseSearchHit[] = []
  const seen = new Set<string>()
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const link = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row[1])
    if (!link) continue
    const href = link[1]
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cleanText(c[1]))
    const section = cells[1] || ''
    const id = /\/passport\/(\d+)/.exec(href)?.[1] || /\/view\/(\d+)/.exec(href)?.[1] || ''
    if (!id || seen.has(`${href}`)) continue
    seen.add(href)
    hits.push({
      id,
      address: cleanText(link[2]),
      url: `${HOUSE_REGISTRY.displayOrigin}${href}`,
      section,
      sectionKind: /passport/i.test(href) ? 'mkd' : /overhaul/i.test(href) ? 'overhaul' : 'other',
    })
  }
  return hits
}

export interface HousePassport {
  /** Адрес дома, как он записан в реестре */
  address: string
  summary: Record<string, string>
  rows: RawRow[]
  /** Дата последней актуализации сведений на портале */
  updatedAt: string | null
}

/** Паспорт дома: адрес, сводка, строки таблиц, дата актуализации */
export function parsePassport(html: string): HousePassport {
  const title = /<div class=['"]house-description-address__title['"]>([\s\S]*?)<\/div>/i.exec(html)
  const updated = /актуализировалась:\s*(\d{2}\.\d{2}\.\d{4})/i.exec(html)
  return {
    address: title ? cleanText(title[1]) : '',
    summary: parseSummary(html),
    rows: parseRows(html),
    updatedAt: updated ? toIsoDate(updated[1]) : null,
  }
}

/**
 * Карточка капитального ремонта дома (раздел «Капитальный ремонт МКД»):
 * сводка по дом, средства фонда капремонта, ссылки на списки работ. Это
 * отдельный источник — значения оттуда сверяются со значениями паспорта.
 */
export interface OverhaulCard {
  address: string
  /** «Общая площадь, кв.м», «Количество этажей, ед.», «Год ввода…» */
  summary: Record<string, string>
  /** Средства фонда капитального ремонта и дата актуализации */
  money: Record<string, string>
  updatedAt: string | null
  /** Список выполненных работ (услуг) на портале */
  worksUrl: string | null
  /** Список предстоящих работ (услуг) */
  plannedUrl: string | null
}

export function parseOverhaul(html: string): OverhaulCard {
  const title = /<div class=['"]house-description-address__title['"]>([\s\S]*?)<\/div>/i.exec(html)
  const money = parseKeyValueRows(html)
  const updated = money['Дата актуализации информации'] || null
  const services = /href="(\/overhaul\/overhaul\/services\/\d+\?finished=1[^"]*)"/i.exec(html)
  const planned = /href="(\/overhaul\/overhaul\/services\/\d+\?finished=0[^"]*)"/i.exec(html)
  const abs = (path: string | undefined): string | null =>
    path ? `${HOUSE_REGISTRY.displayOrigin}${path.replace(/&amp;/g, '&')}` : null
  return {
    address: title ? cleanText(title[1]) : '',
    summary: parseSummary(html),
    money,
    updatedAt: updated ? toIsoDate(updated) : null,
    worksUrl: abs(services?.[1]),
    plannedUrl: abs(planned?.[1]),
  }
}

export interface HouseManagement {
  organization: string | null
  since: string | null
  basis: string | null
}

/** Управление домом: кто управляет, с какой даты и на каком основании */
export function parseManagement(html: string): HouseManagement {
  const rows = parseRows(html)
  const pick = (re: RegExp): string | null => {
    const row = rows.find((r) => re.test(r.label))
    return row && !isEmptyValue(row.value) ? row.value : null
  }
  return {
    organization: pick(/^домом управляет/i),
    since: pick(/^дата начала управления/i),
    basis: pick(/^основание управления/i),
  }
}

/** Дата «ДД.ММ.ГГГГ» → ISO (для хранения в карточке) */
export function toIsoDate(ru: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ru.trim())
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : iso
}

// --- Значения полей по источникам --------------------------------------------

/** Значение характеристики от одного источника */
export interface SourceValue {
  value: string
  /** Поставщик данных (уполномоченный орган субъекта, управляющая организация) */
  provider?: string | null
  /** Где встретилось: раздел паспорта, карточки */
  where?: string | null
  /** Пояснение источника к значению */
  note?: string | null
}

/** Источник значений для характеристик дома */
export interface HouseFieldSource {
  code: string
  name: string
  /** Ссылка на карточку дома в этом источнике */
  url: string | null
  checkedAt: string
  match: AddressMatch
  values: Partial<Record<HouseFieldKey, SourceValue[]>>
}

/** Как поле собирается из одной строки (раздела) паспорта дома */
interface FieldRule {
  /** Подпись строки паспорта */
  row: RegExp
  /** Раздел паспорта — уточняет подпись, если она встречается несколько раз */
  section?: RegExp
  /** Пояснение к значению */
  note: string
}

/**
 * Правила разбора по полям. Перебираются по порядку: побеждает первое
 * правило, которое дало значения (год постройки важнее года ввода в
 * эксплуатацию; строка таблицы важнее сводки шапки паспорта).
 */
export const FIELD_RULES: Record<HouseFieldKey, FieldRule[]> = {
  builtYear: [
    { row: /^год постройки/i, note: 'Год постройки по паспорту дома' },
    { row: /^год ввода дома в эксплуатацию/i, note: 'Год постройки — год ввода дома в эксплуатацию по паспорту' },
  ],
  wallMaterial: [{ row: /^материал несущих стен/i, note: 'Материал несущих стен по паспорту дома' }],
  floors: [{ row: /^количество этажей/i, note: 'Этажность по паспорту дома' }],
  series: [{ row: /^серия, тип постройки здания/i, note: 'Серия и тип постройки по паспорту дома' }],
  majorRepairYear: [
    {
      row: /^год проведения последнего капитального ремонта/i,
      note: 'Капитальный ремонт раскрыт по конструктивным элементам дома',
    },
  ],
  // Управляющая организация — на отдельной странице «Управление», см. managementFieldSource
  managementOrg: [],
  houseArea: [
    {
      // В разделе «Общая площадь дома» подпись «общая площадь, кв.м» —
      // это площадь дома целиком (а не квартиры и не жилых помещений)
      row: /^общая площадь,?\s*кв\.?\s*м\.?$/i,
      section: /^общая площадь дома/i,
      note: 'Общая площадь дома по паспорту',
    },
    { row: /^общая площадь дома/i, note: 'Общая площадь дома по паспорту' },
  ],
}

/** Запасной источник — сводка в шапке паспорта (без разбивки по поставщикам) */
const SUMMARY_FALLBACK: Partial<Record<HouseFieldKey, string>> = {
  builtYear: 'Год ввода дома в эксплуатацию',
  floors: 'Количество этажей, ед.',
  houseArea: 'Общая площадь, кв.м',
}

/** Нормализация подписи для сравнения: регистр, «ё», служебные приписки */
const normLabel = (s: string): string => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

/** Значение реестра в вид, пригодный для карточки и описания */
const tidy = (v: string): string => {
  const s = v.trim().replace(/\s+/g, ' ').replace(/\.$/, '')
  // Числа портал пишет то «580.00», то «580,00» — приводим к одному виду
  if (/^\d+(?:[.,]\d+)$/.test(s)) {
    const n = Number(s.replace(',', '.'))
    if (Number.isFinite(n)) {
      return n.toLocaleString('ru-RU', { useGrouping: false, maximumFractionDigits: 2 })
    }
  }
  return s
}

/** Год из строки реестра: 1984, «1984 г.», 1984.0 */
export function parseYear(v: string): number | null {
  const m = /(1[6-9]\d{2}|20\d{2}|21\d{2})/.exec(v)
  if (!m) return null
  const year = Number(m[1])
  return year >= 1600 && year <= 2100 ? year : null
}

/** Этажность из строки реестра */
export function parseFloors(v: string): number | null {
  const m = /(\d{1,3})/.exec(v)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 && n <= 200 ? n : null
}

/** Площадь дома из строки реестра (запятая как разделитель) */
export function parseArea(v: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(v.replace(/\s/g, ''))
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return n > 0 && n <= 1_000_000 ? n : null
}

/**
 * Ключ значения для сравнения: у чисел (площади, годы, этажность) портал
 * пишет то «580.00», то «580,00» — такие записи считаются одним значением.
 */
const valueKey = (v: string): string => {
  const numeric = /^[\d\s.,]+$/.test(v)
  if (numeric) {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(n)) return `#${n}`
  }
  return normLabel(v)
}

/** Значения поля из паспорта дома по правилам разбора */
export function passportFieldValues(passport: HousePassport): Partial<Record<HouseFieldKey, SourceValue[]>> {
  const out: Partial<Record<HouseFieldKey, SourceValue[]>> = {}
  for (const key of HOUSE_FIELD_ORDER) {
    for (const rule of FIELD_RULES[key]) {
      const values: SourceValue[] = []
      const add = (value: string, provider: string | null, where: string | null) => {
        const v = tidy(value)
        if (isEmptyValue(v)) return
        values.push({ value: v, provider, where: where || null, note: rule.note })
      }
      const matched = passport.rows.filter(
        (r) => rule.row.test(r.label) && (!rule.section || rule.section.test(r.section)),
      )
      for (const row of matched) {
        const where = row.section ? normLabel(row.section) : ''
        for (const variant of row.variants) add(variant.value, variant.provider, where)
        // Итоговое значение строки портал выводит отдельно от поставщиков —
        // учитываем и его, чтобы не потерять согласованное значение
        if (row.value) add(row.value, null, where)
      }
      // Запасной источник — сводка шапки паспорта (без разбивки по поставщикам)
      const summaryLabel = SUMMARY_FALLBACK[key]
      if (!values.length && !matched.length && summaryLabel && passport.summary[summaryLabel]) {
        add(passport.summary[summaryLabel], null, null)
      }
      if (values.length) {
        out[key] = values
        break
      }
    }
  }
  return out
}

/**
 * Значения полей из карточки капитального ремонта: площадь дома, этажность и
 * год ввода — второй официальный источник тех же характеристик. Расхождение
 * с паспортом система покажет как «Требует проверки».
 */
export function overhaulFieldValues(card: OverhaulCard): Partial<Record<HouseFieldKey, SourceValue[]>> {
  const out: Partial<Record<HouseFieldKey, SourceValue[]>> = {}
  const pick = (key: HouseFieldKey, label: string, note: string) => {
    const value = card.summary[label]
    if (!value || isEmptyValue(value)) return
    out[key] = [{ value, where: 'раздел «Капитальный ремонт МКД»', note }]
  }
  pick('houseArea', 'Общая площадь, кв.м', 'Площадь дома по данным программы капитального ремонта')
  pick('floors', 'Количество этажей, ед.', 'Этажность дома по данным программы капитального ремонта')
  pick('builtYear', 'Год ввода дома в эксплуатацию', 'Год ввода дома в эксплуатацию по данным программы капремонта')
  return out
}

// --- Характеристики, склеенные из источников ----------------------------------

/** Одно значение поля: что именно, какой источник, ссылка, дата, совпадение */
export interface HouseValueVariant {
  value: string
  /** Поставщики данных внутри источника (уполномоченный орган, УК) */
  providers: string[]
  /** Где встретилось: конструктивный элемент дома, раздел паспорта */
  where: string[]
  /** Пояснения источника к значению (условия управления, оговорки) */
  notes: string[]
  /** Код источника: frt-mkd, frt-overhaul, frt-management… */
  sourceCode: string
  sourceName: string
  sourceUrl: string | null
  /** Когда источник проверен */
  checkedAt: string
  /** Степень совпадения адреса карточки источника с адресом объекта */
  match: AddressMatch
}

/** Характеристика дома с источником и датой проверки */
export interface HouseInfoField {
  key: HouseFieldKey
  label: string
  status: HouseFieldStatus
  /** Итоговое значение — только при status = confirmed */
  value: string | null
  /** Что показываем агенту: значение либо «Не найдено»/«Требует проверки» */
  display: string
  /** Все непустые варианты из источников (при расхождении — их несколько) */
  variants: HouseValueVariant[]
  /** Поставщик единственного значения (при confirmed) */
  provider: string | null
  /** Источник значения: сайт/раздел и, если есть, поставщик данных */
  source: string
  sourceUrl: string | null
  /** Когда система проверяла источники */
  checkedAt: string
  /** Пояснение: расхождение, отсутствие сведений, особая формулировка */
  note: string | null
}

/** Построить характеристику поля по значениям всех источников */
function buildField(
  key: HouseFieldKey,
  variants: HouseValueVariant[],
  opts: { checkedAt: string; note: string | null; forced?: HouseFieldStatus },
): HouseInfoField {
  const label = HOUSE_FIELD_LABELS[key]
  const base = {
    key,
    label,
    variants,
    checkedAt: opts.checkedAt,
    note: opts.note,
  }
  const forced = opts.forced
  const emptySource = 'Открытые источники'

  if (forced === 'unavailable' || forced === 'conflict') {
    return {
      ...base,
      status: forced,
      value: null,
      provider: null,
      source: emptySource,
      sourceUrl: null,
      display: HOUSE_FIELD_STATUS_LABEL[forced],
    }
  }
  if (!variants.length) {
    return {
      ...base,
      status: 'notFound',
      value: null,
      provider: null,
      source: emptySource,
      sourceUrl: null,
      display: HOUSE_FIELD_STATUS_LABEL.notFound,
    }
  }

  // Значения расходимся по числам/тексту, а не по источникам: одинаковая
  // запись из паспорта и из карточки капремонта — это одно значение
  const distinct: string[] = []
  for (const v of variants) if (!distinct.some((d) => valueKey(d) === valueKey(v.value))) distinct.push(v.value)

  if (distinct.length > 1) {
    return {
      ...base,
      status: 'conflict',
      value: null,
      provider: null,
      source: emptySource,
      sourceUrl: null,
      display: `${HOUSE_FIELD_STATUS_LABEL.conflict}: ${distinct.join(' / ')}`,
      note: opts.note || 'Источники дают разные значения — нужна проверка',
    }
  }

  const confirmed = variants.find((v) => isConfirmedMatch(v.match))
  if (!confirmed) {
    const first = variants[0]
    return {
      ...base,
      status: 'needsCheck',
      value: null,
      provider: null,
      source: first.sourceName,
      sourceUrl: first.sourceUrl,
      display: `${HOUSE_FIELD_STATUS_LABEL.needsCheck}: ${first.value}`,
      note:
        opts.note ||
        `${first.sourceName}: ${first.match.note || 'совпадение адреса не подтверждено'} — значение не подставляется автоматически`,
    }
  }

  return {
    ...base,
    status: 'confirmed',
    value: confirmed.value,
    provider: confirmed.providers[0] || null,
    source: confirmed.sourceName,
    sourceUrl: confirmed.sourceUrl,
    display: confirmed.value,
  }
}

/** Пояснение к полю: правило разбора + пояснения источников-поставщиков */
function fieldNote(key: HouseFieldKey, variants: HouseValueVariant[], sources: HouseFieldSource[]): string | null {
  const notes: string[] = []
  const rules = FIELD_RULES[key]
  if (rules.length && sources.some((s) => Object.keys(s.values).length)) notes.push(rules[0].note)
  for (const v of variants) if (v.match.note && !isConfirmedMatch(v.match)) notes.push(`${v.sourceName}: ${v.match.note}`)
  // Пояснения источников: условия управления, способ расчёта площади и т. п.
  for (const v of variants) for (const note of v.notes) notes.push(note)
  // Капремонт: по каким конструктивным элементам раскрыт год
  if (key === 'majorRepairYear' && variants.length) {
    const where = [...new Set(variants.flatMap((v) => v.where))]
    if (where.length) {
      const list = where.length <= 4 ? where.join(', ') : `${where.slice(0, 3).join(', ')} и др. (${where.length})`
      notes.push(`раскрыт по элементам: ${list}`)
    }
  }
  return notes.length ? [...new Set(notes)].join('; ') : null
}

/**
 * Характеристики дома, склеенные из значений всех источников. Все поля
 * карточки присутствуют всегда: агент видит и «Не найдено», и «Требует
 * проверки» — отсутствие сведений не маскируется.
 */
export function buildFields(input: {
  sources: HouseFieldSource[]
  checkedAt: string
  /** Значения с известным статусом (например, все источники недоступны) */
  forced?: HouseFieldStatus
  note?: string | null
}): HouseInfoField[] {
  const fields: HouseInfoField[] = []

  for (const key of HOUSE_FIELD_ORDER) {
    const variants: HouseValueVariant[] = []
    if (!input.forced) {
      for (const source of input.sources) {
        for (const value of source.values[key] || []) {
          const v = tidy(value.value)
          if (isEmptyValue(v)) continue
          // Один источник может дать одно и то же значение дважды (строка
          // паспорта и сводка шапки) — объединяем поставщиков и разделы
          const existing = variants.find(
            (x) => x.sourceCode === source.code && valueKey(x.value) === valueKey(v),
          )
          const target =
            existing || {
              value: v,
              providers: [],
              where: [],
              notes: [],
              sourceCode: source.code,
              sourceName: source.name,
              sourceUrl: source.url,
              checkedAt: source.checkedAt,
              match: source.match,
            }
          if (value.provider && !target.providers.includes(value.provider)) target.providers.push(value.provider)
          if (value.where && !target.where.includes(value.where)) target.where.push(value.where)
          if (value.note && !target.notes.includes(value.note)) target.notes.push(value.note)
          if (!existing) variants.push(target)
        }
      }
    }
    fields.push(
      buildField(key, variants, {
        checkedAt: input.checkedAt,
        note: input.note || (input.forced ? null : fieldNote(key, variants, input.sources)),
        forced: input.forced,
      }),
    )
  }

  return fields
}

/** Характеристики недоступны целиком: единый статус и пояснение */
export function stubFields(opts: {
  status: HouseFieldStatus
  checkedAt: string
  note: string | null
}): HouseInfoField[] {
  return buildFields({ sources: [], checkedAt: opts.checkedAt, forced: opts.status, note: opts.note })
}

// --- Снимок проверки -----------------------------------------------------------

/** Снимок проверки — то, что сохраняется в карточку объекта */
export interface HouseInfoResult {
  status: HouseResultStatus
  /** Пояснение к итогу (почему не найдено / недоступно / неоднозначно) */
  reason: string | null
  /** Поисковый запрос, отправленный в реестр */
  query: string
  /** Чем подтверждён дом: адресом или кадастровым номером */
  matchedBy: 'address' | 'cadastral' | null
  /** Данные найденного дома в реестре */
  house: {
    id: string
    address: string
    url: string
    /** Когда сведения о доме последний раз актуализировались на портале */
    updatedAt: string | null
    /** Кадастровый номер земельного участка дома (если раскрыт) */
    plotCadastral: string | null
  } | null
  fields: HouseInfoField[]
  checkedAt: string
  /** Адрес объекта, разобранный на части (город, улица, дом, корпус, строение) */
  address: NormalizedAddress
  /** Отчёт по источникам: где дом найден, где нет, что недоступно */
  sources: HouseSourceReport[]
  /** Частный дом или участок: карточки дома в ГИС ЖКХ обычно нет */
  privateHouse: boolean
}

// --- Подтверждение агентом и публикация клиенту ------------------------------

/** Подтверждённая характеристика — то, что показывается клиенту */
export interface HousePublicItem {
  key: HouseFieldKey
  label: string
  value: string
  source: string
  checkedAt: string
}

/**
 * Собрать публичный набор характеристик: только подтверждённые агентом поля
 * из последнего снимка. Неподтверждённое, «Требует проверки» и значения без
 * подтверждённого совпадения адреса клиенту не уходят.
 */
export function approvedItems(
  fields: HouseInfoField[],
  approved: Record<string, boolean> | null | undefined,
  approvedAt: string,
): HousePublicItem[] {
  if (!approved) return []
  const items: HousePublicItem[] = []
  for (const field of fields) {
    if (!approved[field.key]) continue
    if (field.status !== 'confirmed' || !field.value) continue
    items.push({
      key: field.key,
      label: field.label,
      value: field.value,
      source: field.provider ? `${field.source} — ${field.provider}` : field.source,
      checkedAt: approvedAt,
    })
  }
  return items
}

/** Поля карточки объекта, в которые переносятся характеристики дома */
export function cardPatchFromApproved(
  fields: HouseInfoField[],
  approved: Record<string, boolean> | null | undefined,
): { builtYear?: number; totalFloors?: number; buildingType?: string } {
  const patch: { builtYear?: number; totalFloors?: number; buildingType?: string } = {}
  if (!approved) return patch
  const field = (key: HouseFieldKey) => fields.find((f) => f.key === key)
  const ok = (key: HouseFieldKey): HouseInfoField | null => {
    const f = field(key)
    return f && approved[key] && f.status === 'confirmed' && f.value ? f : null
  }
  const year = ok('builtYear')
  const yearNum = year?.value ? parseYear(year.value) : null
  if (yearNum) patch.builtYear = yearNum

  const floors = ok('floors')
  const floorsNum = floors?.value ? parseFloors(floors.value) : null
  if (floorsNum) patch.totalFloors = floorsNum

  const wall = ok('wallMaterial')
  if (wall?.value) patch.buildingType = wall.value
  return patch
}

/**
 * Абзац описания объекта из подтверждённых характеристик: используется
 * только после подтверждения агентом (см. карточку объекта CRM).
 */
export function descriptionParagraph(items: HousePublicItem[], registry = HOUSE_REGISTRY.name): string {
  if (!items.length) return ''
  const parts = items.map((i) => `${i.label.toLowerCase()}: ${i.value}`)
  return `Характеристики дома по данным ${registry}: ${parts.join('; ')}.`
}

/** Лексикал-абзац Payload (richText описания объекта) */
export function paragraphNode(text: string): unknown {
  return {
    root: {
      children: [{ children: [{ text, type: 'text', version: 1 }], type: 'paragraph', version: 1 }],
      type: 'root',
      version: 1,
    },
  }
}

/** Человекочитаемая дата проверки */
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Строка источника значения для интерфейса: источник + поставщик данных */
export function sourceLine(field: HouseInfoField): string {
  return field.provider ? `${field.source} — ${field.provider}` : field.source
}

/** Человеческое название раздела источника для значения поля */
export function variantSourceLabel(variant: HouseValueVariant): string {
  return variant.providers.length ? `${variant.sourceName} — ${variant.providers.join(', ')}` : variant.sourceName
}

/** Итог по источникам: сколько нашло дом, сколько не нашло, сколько недоступно */
export function sourcesSummary(sources: HouseSourceReport[]): {
  found: number
  notFound: number
  unavailable: number
  manual: number
} {
  return {
    found: sources.filter((s) => s.status === 'found').length,
    notFound: sources.filter((s) => s.status === 'notFound').length,
    unavailable: sources.filter((s) => s.status === 'unavailable').length,
    manual: sources.filter((s) => s.status === 'manual').length,
  }
}

/** Краткая строка «ГИС ЖКХ не найдено, ищем дальше» для интерфейса и логов */
export const CHECKING_OTHERS_NOTE =
  'В источнике ГИС ЖКХ не найдено. Выполняется поиск по другим источникам'

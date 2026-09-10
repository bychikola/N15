// ---------------------------------------------------------------------------
// «Данные о доме» — характеристики многоквартирного дома из официального
// реестра для карточки объекта CRM.
//
// Источник — открытый портал АИС ППК «ФРТ» (ППК «Фонд развития территорий»,
// https://реформажкх.фрт.рф): раскрытие сведений о многоквартирных домах по
// постановлению Правительства РФ № 731 и приказу Минстроя России № 536/пр.
// Это тот же официальный жилищный фонд, что и ГИС ЖКХ; значения в паспорте
// дома приходят от уполномоченных органов субъекта РФ, органов местного
// самоуправления и управляющих организаций, и портал показывает источник
// каждого значения. Закрытые реестры, платные сервисы и обход блокировок
// не используются — читаются только открытые страницы портала.
//
// Правила, заложенные здесь:
//   — ничего не домысливается: если сведения в реестре нет, значение
//     помечается «Не найдено»; если реестр не ответил — «Проверка
//     недоступна»;
//   — если поставщики данных дают разные значения одного поля (например,
//     уполномоченный орган субъекта и управляющая организация расходятся),
//     поле помечается «Требует проверки» и агент видит все варианты с
//     источниками;
//   — у каждого значения хранится источник (реестр и поставщик) и дата
//     проверки, а также дата последней актуализации сведений на портале;
//   — клиенту уходят только значения, подтверждённые агентом (см.
//     approvedItems и house-info-service.ts).
//
// Модуль без ввода-вывода: разбор HTML портала и правила — чистые функции
// (сеть и Payload — в src/lib/house-info-service.ts).
// ---------------------------------------------------------------------------

export type HouseFieldKey =
  | 'builtYear'
  | 'wallMaterial'
  | 'floors'
  | 'series'
  | 'majorRepairYear'
  | 'managementOrg'
  | 'houseArea'

/** Статус значения: подтверждено / требует проверки / не найдено / недоступно */
export type HouseFieldStatus = 'confirmed' | 'conflict' | 'notFound' | 'unavailable'

export type HouseResultStatus = 'found' | 'notFound' | 'ambiguous' | 'unavailable' | 'noAddress'

/** Итог проверки: дом найден, не найден, найдено несколько, реестр недоступен, нет адреса */
export const HOUSE_RESULT_LABEL: Record<HouseResultStatus, string> = {
  found: 'Дом найден в реестре',
  notFound: 'Дом не найден в реестре',
  ambiguous: 'Найдено несколько домов — требует проверки',
  unavailable: 'Проверка недоступна',
  noAddress: 'Не указан адрес для поиска',
}

export const HOUSE_FIELD_STATUS_LABEL: Record<HouseFieldStatus, string> = {
  confirmed: 'Найдено',
  conflict: 'Требует проверки',
  notFound: 'Не найдено',
  unavailable: 'Проверка недоступна',
}

export const HOUSE_FIELD_LABELS: Record<HouseFieldKey, string> = {
  builtYear: 'Год постройки',
  wallMaterial: 'Материал стен',
  floors: 'Количество этажей',
  series: 'Серия / тип дома',
  majorRepairYear: 'Год капитального ремонта',
  managementOrg: 'Управляющая организация',
  houseArea: 'Площадь дома, м²',
}

/**
 * Официальный реестр-источник. Список закрыт: любое значение в карточке
 * снабжается ссылкой на карточку дома именно этого портала.
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
   * Честный User-Agent: официальный портал, один-два запроса на проверку.
   * Только латиница — Node fetch не принимает кириллицу в заголовках
   * (ByteString) и роняет запрос целиком.
   */
  userAgent: 'N15-Realty-HouseInfo/1.0 (+https://n15-realty.ru; FRT GIS ZhKH open data)',
} as const

/** Одно значение поля: что именно и кто из поставщиков данных его сообщил */
export interface HouseValueVariant {
  value: string
  /** Поставщики данных (уполномоченный орган, УК, ОМСУ) */
  providers: string[]
  /** Где встретилось: конструктивный элемент дома, раздел паспорта */
  where: string[]
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
  /** Все непустые варианты из реестра (при расхождении — их несколько) */
  variants: HouseValueVariant[]
  /** Поставщик единственного значения (при confirmed) */
  provider: string | null
  /** Источник значения: реестр и, если есть, поставщик данных */
  source: string
  sourceUrl: string | null
  /** Когда система проверяла реестр */
  checkedAt: string
  /** Пояснение: расхождение, отсутствие сведений, особая формулировка */
  note: string | null
}

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
}

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

/** Сводка «шапки» паспорта: пары «подпись → значение» */
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

export interface HouseSearchHit {
  id: string
  address: string
  url: string
}

/** Результаты поиска по адресу: карточки домов жилищного фонда */
export function parseSearchHits(html: string): HouseSearchHit[] {
  const hits: HouseSearchHit[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href="\/myhouse\/profile\/passport\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    hits.push({
      id,
      address: cleanText(m[2]),
      url: `${HOUSE_REGISTRY.displayOrigin}/myhouse/profile/passport/${id}`,
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

// --- Правила сопоставления полей --------------------------------------------

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
const FIELD_RULES: Record<HouseFieldKey, FieldRule[]> = {
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
  // Управляющая организация — на отдельной странице «Управление», см. buildFields
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

/** Варианты значений по одному правилу: строки паспорта + сводка шапки */
function variantsByRule(
  rows: RawRow[],
  summary: Record<string, string>,
  key: HouseFieldKey,
  rule: FieldRule,
): HouseValueVariant[] {
  const out: HouseValueVariant[] = []
  const add = (value: string, provider: string, where: string) => {
    const v = tidy(value)
    if (isEmptyValue(v)) return
    const existing = out.find((x) => valueKey(x.value) === valueKey(v))
    const target = existing || { value: v, providers: [], where: [] }
    if (provider && !target.providers.includes(provider)) target.providers.push(provider)
    if (where && !target.where.includes(where)) target.where.push(where)
    if (!existing) out.push(target)
  }

  const matched = rows.filter(
    (r) => rule.row.test(r.label) && (!rule.section || rule.section.test(r.section)),
  )
  for (const row of matched) {
    const where = row.section ? normLabel(row.section) : ''
    for (const variant of row.variants) add(variant.value, variant.provider, where)
    // Итоговое значение строки портал выводит отдельно от поставщиков —
    // учитываем и его, чтобы не потерять согласованное значение
    if (row.value) add(row.value, '', where)
  }

  // Запасной источник — сводка шапки паспорта (без разбивки по поставщикам)
  const summaryLabel = SUMMARY_FALLBACK[key]
  if (!out.length && !matched.length && summaryLabel && summary[summaryLabel]) {
    add(summary[summaryLabel], '', '')
  }
  return out
}

/** Варианты значения поля: правила перебираются, побеждает первое непустое */
function collectVariants(
  rows: RawRow[],
  summary: Record<string, string>,
  key: HouseFieldKey,
): { variants: HouseValueVariant[]; rule: FieldRule | null } {
  for (const rule of FIELD_RULES[key]) {
    const variants = variantsByRule(rows, summary, key, rule)
    if (variants.length) return { variants, rule }
  }
  return { variants: [], rule: FIELD_RULES[key][0] || null }
}

/** Построить характеристику поля: подтверждено / требует проверки / не найдено */
function buildField(
  key: HouseFieldKey,
  variants: HouseValueVariant[],
  opts: { source: string; sourceUrl: string | null; checkedAt: string; note: string | null; forced?: HouseFieldStatus },
): HouseInfoField {
  const label = HOUSE_FIELD_LABELS[key]
  const base = { key, label, source: opts.source, sourceUrl: opts.sourceUrl, checkedAt: opts.checkedAt, variants }
  const forced = opts.forced

  if (forced === 'unavailable' || forced === 'conflict') {
    return {
      ...base,
      status: forced,
      value: null,
      provider: null,
      display: HOUSE_FIELD_STATUS_LABEL[forced],
      note: opts.note,
    }
  }
  if (!variants.length) {
    return {
      ...base,
      status: 'notFound',
      value: null,
      provider: null,
      display: HOUSE_FIELD_STATUS_LABEL.notFound,
      note: opts.note,
    }
  }
  if (variants.length > 1) {
    const display = variants.map((v) => v.value).join(' / ')
    return {
      ...base,
      status: 'conflict',
      value: null,
      provider: null,
      display: `${HOUSE_FIELD_STATUS_LABEL.conflict}: ${display}`,
      note: opts.note || 'Поставщики сведений указывают разные значения — нужна проверка',
    }
  }
  const single = variants[0]
  return {
    ...base,
    status: 'confirmed',
    value: single.value,
    provider: single.providers[0] || null,
    display: single.value,
    note: opts.note,
  }
}

/**
 * Характеристики дома по паспорту и данным управления. Все поля карточки
 * присутствуют всегда: агент видит и «Не найдено», и «Требует проверки» —
 * отсутствие сведений не маскируется.
 */
export function buildFields(input: {
  passport: HousePassport
  management: HouseManagement | null
  sourceUrl: string | null
  checkedAt: string
  /** Значения с известным статусом (например, реестр недоступен) */
  forced?: HouseFieldStatus
  note?: string | null
}): HouseInfoField[] {
  const { passport, management, sourceUrl, checkedAt } = input
  const fields: HouseInfoField[] = []

  for (const key of Object.keys(HOUSE_FIELD_LABELS) as HouseFieldKey[]) {
    const collected = input.forced
      ? { variants: [] as HouseValueVariant[], rule: null as FieldRule | null }
      : collectVariants(passport.rows, passport.summary, key)
    let note = collected.rule?.note || input.note || null
    // Капремонт: поясняем, по каким конструктивным элементам раскрыт год
    if (key === 'majorRepairYear' && collected.variants.length) {
      const where = collected.variants.flatMap((v) => v.where)
      if (where.length) {
        const list = where.length <= 4 ? where.join(', ') : `${where.slice(0, 3).join(', ')} и др. (${where.length})`
        note = `${note}: ${list}`
      }
    }
    fields.push(
      buildField(key, collected.variants, {
        source: HOUSE_REGISTRY.name,
        sourceUrl,
        checkedAt,
        note,
        forced: input.forced,
      }),
    )
  }

  // Управляющая организация живёт на отдельной странице «Управление»
  if (!input.forced) {
    const org = fields.find((f) => f.key === 'managementOrg')
    if (org) {
      const value = management?.organization || null
      const index = fields.indexOf(org)
      fields[index] = value
        ? buildField('managementOrg', [{ value, providers: [], where: [] }], {
            source: HOUSE_REGISTRY.name,
            sourceUrl,
            checkedAt,
            note: management?.since
              ? `Управляет с ${management.since}${management.basis ? `, основание: ${management.basis}` : ''}`
              : 'Управляющая организация по данным реестра',
          })
        : buildField('managementOrg', [], {
            source: HOUSE_REGISTRY.name,
            sourceUrl,
            checkedAt,
            note: 'В реестре не раскрыта управляющая организация',
          })
    }
  }

  return fields
}

// --- Адрес: запрос к реестру и выбор дома ------------------------------------

export interface HouseQueryAddress {
  city?: string | null
  locality?: string | null
  street?: string | null
  house?: string | null
  snt?: string | null
}

/** Нормализация адресной строки: регистр, «ё», пунктуация, сокращения */
export function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:()"'«»]/g, ' ')
    .replace(/\b(ул|улица|пр|проспект|пер|переулок|ш|шоссе|д|дом|кв|квартира|корп|корпус|стр|строение|г|город|респ|республика|обл|область)\b\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Поисковый запрос для портала: «Владикавказ Ленина 15» */
export function searchQueryFor(addr: HouseQueryAddress): string {
  const parts = [addr.city || addr.locality || '', addr.street || '', addr.house || '']
    .map((p) => (p || '').trim())
    .filter(Boolean)
  if (!parts.length) return addr.snt ? addr.snt.trim() : ''
  return parts.join(' ')
}

/** Номер дома: «15», «15а», «15/2» → набор значимых токенов */
const houseTokens = (house: string): string[] =>
  normalizeAddress(house)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)

/** Улица объекта встречается в адресе кандидата */
const streetMatches = (candidate: string, street: string): boolean => {
  const tokens = normalizeAddress(street).split(' ').filter((t) => t.length > 2)
  if (!tokens.length) return false
  const hay = ` ${normalizeAddress(candidate)} `
  return tokens.every((t) => hay.includes(` ${t}`))
}

/** Номер дома объекта встречается в адресе кандидата */
const houseMatches = (candidate: string, house: string): boolean => {
  const tokens = houseTokens(house)
  if (!tokens.length) return false
  const cand = normalizeAddress(candidate).split(' ')
  return tokens.every((t) => cand.includes(t))
}

/**
 * Выбор дома из результатов поиска: сначала совпадение улицы и номера дома,
 * затем — только улицы. Если подходящих несколько, дом не выбирается:
 * агент видит список адресов и уточняет запрос (см. status = ambiguous).
 */
export function pickHouse(
  hits: HouseSearchHit[],
  addr: HouseQueryAddress,
): { hit: HouseSearchHit | null; ambiguous: HouseSearchHit[]; reason: string | null } {
  const street = addr.street || ''
  const house = addr.house || ''
  if (!street && !house) {
    return { hit: null, ambiguous: [], reason: 'В карточке не заполнены улица и дом' }
  }
  if (house) {
    // Номер дома указан — берём только точное совпадение: подставлять
    // характеристики соседнего дома нельзя
    const exact = hits.filter((h) => streetMatches(h.address, street) && houseMatches(h.address, house))
    if (exact.length === 1) return { hit: exact[0], ambiguous: [], reason: null }
    if (exact.length > 1) {
      return {
        hit: null,
        ambiguous: exact,
        reason: `По адресу найдено несколько домов (${exact.length}) — уточните улицу и номер дома`,
      }
    }
    return {
      hit: null,
      ambiguous: hits.filter((h) => streetMatches(h.address, street)),
      reason: 'Дом с таким номером в реестре не найден — проверьте адрес объекта',
    }
  }

  // Номер дома в карточке не заполнен: дом выбирается, только если он на
  // улице один — иначе агенту нужно уточнить адрес
  const byStreet = hits.filter((h) => street && streetMatches(h.address, street))
  if (byStreet.length === 1) {
    return {
      hit: byStreet[0],
      ambiguous: [],
      reason: 'В карточке не указан номер дома — выбран единственный дом на улице',
    }
  }
  if (byStreet.length > 1) {
    return {
      hit: null,
      ambiguous: byStreet,
      reason: `На улице найдено несколько домов (${byStreet.length}) — укажите номер дома`,
    }
  }
  return { hit: null, ambiguous: [], reason: 'В реестре нет дома по этому адресу' }
}

/** Строка источника значения для интерфейса: реестр + поставщик данных */
export function sourceLine(field: HouseInfoField): string {
  return field.provider ? `${field.source} — ${field.provider}` : field.source
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
 * из последнего снимка. Неподтверждённое и «Требует проверки» клиенту не
 * уходит.
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

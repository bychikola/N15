// ---------------------------------------------------------------------------
// «Юридическая проверка объекта» — серверный движок предварительного анализа.
//
// Модуль CRM Н15: по документам, загруженным в карточку объекта (закрытое
// хранилище, см. коллекцию legal-documents), и структурированным сведениям,
// которые юрист вносит из этих документов (facts), движок формирует отчёт
// по 12 пунктам проверки. Отчёт предварительный: он НЕ заменяет заключение
// юриста и официальные документы (эта оговорка выводится в шапке отчёта —
// и в CRM, и в PDF), а «юридически чисто» движок не ставит никогда: даже при
// всех зелёных пунктах итог — «Проверено», а не «чисто».
//
// Внешние официальные реестры (ФССП, суды, ЕФРСБ, ЕГРОКН и т.п.) движок
// автоматически не опрашивает — они не имеют публичного API без ключей.
// По пунктам, где нужны такие данные, отчёт указывает «Нужна ручная проверка
// юристом» и даёт ссылки на официальные источники (см. LEGAL_SOURCES).
//
// Движок — чистая функция без ввода-вывода (runLegalCheck), поэтому его
// легко тестировать; хранение и доступы — в legal-service.ts.
// ---------------------------------------------------------------------------

// Единственный аккаунт, которому открыт отчёт: Лана Козырева (см. память
// agent-accounts: users.id=2, svetkozyr@gmail.com). Совпадение по email —
// чтобы доступ не сломался при пересоздании пользователя в другой БД.
export const LEGAL_OFFICER_EMAIL = 'svetkozyr@gmail.com'

/** Статусы пунктов проверки и итога отчёта (единый словарь для всего модуля) */
export type LegalCheckStatus = 'ok' | 'issues' | 'risk' | 'manual'

export const LEGAL_STATUS_LABELS: Record<LegalCheckStatus, string> = {
  ok: 'Проверено',
  issues: 'Есть вопросы',
  risk: 'Высокий риск',
  manual: 'Нужна ручная проверка юристом',
}

/** Приоритет статусов: чем больше число, тем «хуже» — итог берёт максимум */
const STATUS_WEIGHT: Record<LegalCheckStatus, number> = { ok: 0, issues: 1, manual: 2, risk: 3 }

const worst = (list: LegalCheckStatus[]): LegalCheckStatus =>
  list.reduce<LegalCheckStatus>((acc, s) => (STATUS_WEIGHT[s] > STATUS_WEIGHT[acc] ? s : acc), 'ok')

/** Заголовок отчёта — обязательная оговорка (выводится крупно, см. отчёт и PDF) */
export const LEGAL_REPORT_DISCLAIMER =
  'Предварительная проверка. Не заменяет заключение юриста и официальные документы'

// --- Типы загружаемых документов ------------------------------------------

export const LEGAL_DOC_TYPES = [
  { value: 'egrn', label: 'Выписка из ЕГРН (характеристики и права)' },
  { value: 'title', label: 'Правоустанавливающий документ (ДКП, дарение и др.)' },
  { value: 'inheritance', label: 'Свидетельство о праве на наследство' },
  { value: 'privatization', label: 'Документы приватизации' },
  { value: 'tech', label: 'Технический паспорт / техплан' },
  // Паспорт загружается только для сверки личности при сделке. Серия, номер
  // и другие паспортные данные в системе не вводятся и в отчёт не попадают.
  { value: 'passport', label: 'Паспорт собственника (для сверки)' },
  { value: 'spouse', label: 'Согласие супруга / брачный договор' },
  { value: 'guardianship', label: 'Разрешение органов опеки и попечительства' },
  { value: 'court', label: 'Справки о судах и исполнительных производствах' },
  { value: 'bankruptcy', label: 'Справки о банкротстве' },
  { value: 'heritage', label: 'Справка об объекте культурного наследия' },
  { value: 'utility', label: 'Квитанции ЖКХ / справка о задолженности' },
  { value: 'kapremont', label: 'Справка фонда капитального ремонта' },
  { value: 'other', label: 'Иные документы' },
] as const

export type LegalDocType = (typeof LEGAL_DOC_TYPES)[number]['value']

const DOC_LABEL: Record<string, string> = Object.fromEntries(LEGAL_DOC_TYPES.map((d) => [d.value, d.label]))

// --- Сведения, которые юрист вносит из документов (facts) ------------------

/** Варианты ответов «да/нет/не указано» для пунктов 5–11 */
export const FACTS_TRIPLE: { value: string; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'yes', label: 'Да' },
]

/** Описание формы сведений — по нему строится интерфейс ввода (LegalCheckBlock) */
export const FACTS_FIELDS: {
  name: keyof LegalFacts
  label: string
  kind: 'text' | 'date' | 'area' | 'multiline' | 'select'
  options?: { value: string; label: string }[]
  /** Подпись-подсказка под полем */
  hint?: string
  /** Поле видно только при таком значении другого поля (для согласий и т.п.) */
  showWhen?: { field: keyof LegalFacts; value: string }
}[] = [
  // --- Выписка из ЕГРН ---
  {
    name: 'egrnDate', kind: 'date', label: 'Дата выписки из ЕГРН',
    hint: 'Свежая выписка (не старше 30 дней) — обязательна перед сделкой',
  },
  {
    name: 'egrnCadastral', kind: 'text', label: 'Кадастровый номер по выписке',
    hint: 'Например: 15:07:0030021:123',
  },
  { name: 'egrnAddress', kind: 'text', label: 'Адрес по выписке ЕГРН' },
  {
    name: 'egrnArea', kind: 'area', label: 'Площадь по выписке ЕГРН, м²',
    hint: 'Число с запятой: 67,5',
  },
  {
    name: 'egrnOwners', kind: 'text', label: 'Собственники по выписке (ФИО через запятую)',
    hint: 'Все правообладатели, включая доли',
  },
  { name: 'egrnRight', kind: 'text', label: 'Вид права', hint: 'Например: собственность (долевая, совместная), аренда…' },
  { name: 'egrnBasis', kind: 'text', label: 'Основание приобретения', hint: 'Например: договор купли-продажи от 01.02.2020, свидетельство о наследстве…' },
  {
    name: 'egrnRestrictions', kind: 'multiline', label: 'Ограничения и обременения по выписке',
    hint: 'Если в выписке их нет — напишите «нет». Укажите всё, что перечислено: залог, ипотека, арест, запрет, аренда, сервитут…',
  },
  // --- Внешние проверки (по справкам и открытым официальным реестрам) ---
  {
    name: 'courtStatus', kind: 'select', label: 'Судебные споры / исполнительные производства',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'none', label: 'Не выявлено (по справке)' },
      { value: 'found', label: 'Есть споры или взыскания' },
    ],
    hint: 'По справке суда/пристава или проверке юриста (ФССП, КАД, ГАС «Правосудие»)',
  },
  {
    name: 'bankruptcyStatus', kind: 'select', label: 'Банкротство собственника',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'none', label: 'Не выявлено (по справке)' },
      { value: 'found', label: 'Открыта процедура банкротства' },
    ],
    hint: 'По справке или проверке реестра ЕФРСБ / ФССП',
  },
  {
    name: 'kapremontStatus', kind: 'select', label: 'Взносы на капитальный ремонт',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'noDebt', label: 'Задолженности нет (по справке)' },
      { value: 'debt', label: 'Есть задолженность' },
      { value: 'na', label: 'Не применимо (не МКД / дом не платит)' },
    ],
    hint: 'Для квартир в многоквартирных домах; подтверждается справкой фонда или квитанциями',
  },
  // --- Семья и согласия ---
  {
    name: 'spouseOwner', kind: 'select', label: 'Собственник состоит в браке (общее имущество супругов)',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'none', label: 'Нет' },
      { value: 'yes', label: 'Да' },
    ],
  },
  {
    name: 'spouseConsent', kind: 'select', label: 'Нотариальное согласие супруга приложено',
    showWhen: { field: 'spouseOwner', value: 'yes' },
    options: [
      { value: '', label: 'Не приложено' },
      { value: 'provided', label: 'Приложено' },
    ],
  },
  {
    name: 'minorOwners', kind: 'select', label: 'Среди собственников есть несовершеннолетние',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'none', label: 'Нет' },
      { value: 'yes', label: 'Да' },
    ],
  },
  {
    name: 'guardianPermit', kind: 'select', label: 'Разрешение органов опеки приложено',
    showWhen: { field: 'minorOwners', value: 'yes' },
    options: [
      { value: '', label: 'Не приложено' },
      { value: 'provided', label: 'Приложено' },
    ],
  },
  // --- Техническое состояние ---
  {
    name: 'replan', kind: 'select', label: 'Перепланировка',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'none', label: 'Нет перепланировок' },
      { value: 'legalized', label: 'Есть, узаконена' },
      { value: 'illegal', label: 'Есть, не узаконена' },
    ],
  },
  {
    name: 'privatized', kind: 'select', label: 'Объект приватизирован',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'no', label: 'Нет' },
      { value: 'yes', label: 'Да' },
    ],
    hint: 'Для квартир и домов, ранее находившихся в государственной/муниципальной собственности',
  },
  {
    name: 'heritage', kind: 'select', label: 'Объект культурного наследия / охранная зона',
    options: [
      { value: '', label: 'Не указано' },
      { value: 'no', label: 'Не является (по справке)' },
      { value: 'yes', label: 'Является / в охранной зоне' },
    ],
  },
  // --- Прочее ---
  {
    name: 'notes', kind: 'multiline', label: 'Дополнительные сведения и риски',
    hint: 'Всё, что заметили по документам и что должно быть учтено юристом',
  },
]

export interface LegalFacts {
  egrnDate?: string
  egrnCadastral?: string
  egrnAddress?: string
  egrnArea?: string
  egrnOwners?: string
  egrnRight?: string
  egrnBasis?: string
  egrnRestrictions?: string
  courtStatus?: '' | 'none' | 'found'
  bankruptcyStatus?: '' | 'none' | 'found'
  kapremontStatus?: '' | 'noDebt' | 'debt' | 'na'
  spouseOwner?: '' | 'none' | 'yes'
  spouseConsent?: '' | 'provided'
  minorOwners?: '' | 'none' | 'yes'
  guardianPermit?: '' | 'provided'
  replan?: '' | 'none' | 'legalized' | 'illegal'
  privatized?: '' | 'no' | 'yes'
  heritage?: '' | 'no' | 'yes'
  notes?: string
}

/** Поля facts, которые реально понимает движок (лишнее из запроса отбрасываем) */
const FACT_KEYS = new Set<string>([
  'egrnDate', 'egrnCadastral', 'egrnAddress', 'egrnArea', 'egrnOwners', 'egrnRight',
  'egrnBasis', 'egrnRestrictions', 'courtStatus', 'bankruptcyStatus', 'kapremontStatus',
  'spouseOwner', 'spouseConsent', 'minorOwners', 'guardianPermit', 'replan',
  'privatized', 'heritage', 'notes',
])

/** Санитизация сведений, пришедших с клиента: только известные ключи и строки */
export function sanitizeFacts(input: unknown): LegalFacts {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out: LegalFacts = {}
  for (const key of FACT_KEYS) {
    const v = src[key]
    if (typeof v === 'string') {
      const s = v.trim().slice(0, 2000)
      if (s) (out as Record<string, unknown>)[key] = s
    }
  }
  return out
}

// --- Источники (официальные открытые данные) -------------------------------

export interface LegalSource { name: string; url: string; items: string[] }

/** Постоянные официальные источники. Ссылки отдаются в отчёте для ручной
 *  проверки юристом — у реестров нет публичного API, доступного из CRM. */
export const LEGAL_SOURCES: LegalSource[] = [
  { name: 'Публичная кадастровая карта (Росреестр)', url: 'https://pkk.rosreestr.ru/', items: ['1', '2', '3', '4'] },
  { name: 'Личный кабинет Росреестра — заказ выписок из ЕГРН', url: 'https://lk.rosreestr.ru/', items: ['1', '2', '3', '4', '12'] },
  { name: 'Банк данных исполнительных производств (ФССП)', url: 'https://fssp.gov.ru/iss/ip', items: ['5', '6'] },
  { name: 'Картотека арбитражных дел (КАД)', url: 'https://kad.arbitr.ru/', items: ['5', '6'] },
  { name: 'ГАС «Правосудие» — суды общей юрисдикции', url: 'https://sudrf.ru/', items: ['5'] },
  { name: 'Единый федеральный реестр сведений о банкротстве (ЕФРСБ)', url: 'https://bankrot.fedresurs.ru/', items: ['6'] },
  { name: 'ГИС ЖКХ', url: 'https://dom.gosuslugi.ru/', items: ['11'] },
  { name: 'ЕГРОКН — открытые данные об объектах культурного наследия', url: 'https://opendata.mkrf.ru/opendata/7705851331-egrkn', items: ['10'] },
]

// --- Формы отчёта -----------------------------------------------------------

export interface LegalCheckItem {
  /** Номер пункта: '1'…'12' — совпадает со списком проверок */
  key: string
  title: string
  status: LegalCheckStatus
  note?: string
}

export interface LegalFinding {
  level: 'info' | 'warn' | 'risk'
  itemKey: string
  text: string
}

export interface LegalDocInReport {
  id: number
  docType: string
  docTypeLabel: string
  docDate?: string | null
  fileName: string
  size: number
}

export interface LegalReportData {
  objectId: number
  objectTitle: string
  objectAddress: string
  category: string
  dealType: 'sale' | 'rent'
  /** Итоговый статус отчёта (один из четырёх) */
  status: LegalCheckStatus
  /** Даты проверки и актуальности документов (ISO) */
  checkedAt: string
  docsActualAt: string | null
  checkedBy: string
  items: LegalCheckItem[]
  findings: LegalFinding[]
  missingDocs: string[]
  recommendations: string[]
  sources: LegalSource[]
  docs: LegalDocInReport[]
  /** Сведения, на основе которых считался отчёт (для предзаполнения формы) */
  facts: LegalFacts
  engineVersion: number
}

/** Документ объекта для движка (только метаданные — содержимое движку не нужно) */
export interface LegalDocMeta {
  id: number
  docType: string
  docDate?: string | null
  createdAt: string
  fileName?: string
  size?: number
}

/** Карточка объекта для движка (что реально участвует в сверке) */
export interface LegalObjectLike {
  id: number
  title: string
  type?: string
  category?: string
  area?: number | null
  address?: { city?: string | null; locality?: string | null; street?: string | null; house?: string | null; apartment?: string | null } | null
  cadastralNumber?: string | null
  ownerName?: string | null
}

// --- Вспомогательные нормализации ------------------------------------------

const normStr = (v?: string | null): string =>
  (v || '').toLowerCase().replace(/[\s.,;:«»"'`()\[\]-]+/g, '')

const normCadastral = (v?: string | null): string => (v || '').toLowerCase().replace(/\s+/g, '')

const numOf = (v?: string | null): number | null => {
  if (v == null) return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Читаемый адрес объекта одной строкой */
function objectAddressLine(o: LegalObjectLike): string {
  const a = o.address || {}
  const parts: string[] = []
  const city = (a.city || '').trim()
  const locality = (a.locality || '').trim()
  if (locality && locality !== city) parts.push(locality)
  if (city) parts.push(city)
  if (a.street) parts.push(`ул. ${a.street.trim()}`)
  if (a.house) parts.push(`д. ${a.house.trim()}`)
  if (a.apartment) parts.push(`кв. ${a.apartment.trim()}`)
  return parts.filter(Boolean).join(', ') || 'адрес не заполнен'
}

const isoDaysAgo = (iso: string, now: Date): number => {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return Number.NaN
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/** Дата для показа в отчёте (ДД.ММ.ГГГГ или '—') */
export const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const hasDocType = (docs: LegalDocMeta[], type: string) => docs.some((d) => d.docType === type)

// --- Движок ----------------------------------------------------------------

const ITEM_TITLES: Record<string, string> = {
  '1': 'Адрес и площадь по данным ЕГРН',
  '2': 'Собственники и правообладатели',
  '3': 'Вид права и основание приобретения',
  '4': 'Залоги, аресты, запреты и обременения',
  '5': 'Судебные споры и исполнительные риски',
  '6': 'Банкротство собственника',
  '7': 'Несовершеннолетние, супруги и необходимые согласия',
  '8': 'Перепланировки и соответствие техническим документам',
  '9': 'Приватизация и риски перехода права',
  '10': 'Статус объекта культурного наследия',
  '11': 'Капитальный ремонт',
  '12': 'Полнота загруженных документов',
}

export function runLegalCheck(opts: {
  object: LegalObjectLike
  docs: LegalDocMeta[]
  facts: Partial<LegalFacts>
  now?: Date
}): LegalReportData {
  const now = opts.now || new Date()
  const o = opts.object
  const docs = opts.docs
  const f = sanitizeFacts(opts.facts)
  const findings: LegalFinding[] = []
  const missingDocs = new Set<string>()
  const recommendations: string[] = []

  const addFinding = (level: LegalFinding['level'], itemKey: string, text: string) => {
    findings.push({ level, itemKey, text })
  }
  const addMissing = (what: string) => missingDocs.add(what)
  const addRec = (text: string) => {
    if (!recommendations.includes(text)) recommendations.push(text)
  }

  const category = o.category || ''
  const isApartment = category === 'apartment'
  const isHouse = category === 'house'
  const isTownhouse = category === 'townhouse'
  // Пункты 8–11 технически применимы к зданиям и помещениям, но не к участкам
  const isBuilding = isApartment || isHouse || isTownhouse || category === 'commercial'
  const isSale = o.type === 'sale'

  // --- Общие заметки по документам ---
  const egrnDoc = docs.find((d) => d.docType === 'egrn')
  const egrnDateEntered = !!f.egrnDate
  const egrnDays = f.egrnDate ? isoDaysAgo(f.egrnDate, now) : Number.NaN
  if (egrnDoc && !egrnDateEntered) {
    addRec('Укажите дату выписки из ЕГРН — от неё считается актуальность документа')
  } else if (Number.isFinite(egrnDays) && egrnDays > 30) {
    addFinding('info', '1', 'Выписка из ЕГРН датируется ' + fmtDate(f.egrnDate) + ' — для сделки она актуальна не более 30 дней, закажите свежую выписку')
    addRec('Перед сделкой получите свежую выписку из ЕГРН (не старше 30 дней)')
  }

  const item = (key: string, status: LegalCheckStatus, note?: string): LegalCheckItem => ({
    key,
    title: ITEM_TITLES[key],
    status,
    note,
  })

  const items: LegalCheckItem[] = []

  // 1. Адрес и площадь по данным ЕГРН --------------------------------------
  {
    const hasEgrnInfo = !!f.egrnAddress || !!f.egrnArea || !!f.egrnCadastral
    if (!hasEgrnInfo && !egrnDoc) {
      items.push(item('1', 'manual', 'Выписка из ЕГРН не загружена и сведения по ней не внесены — сверку адреса и площади выполнит юрист по выписке'))
      addMissing('Выписка из ЕГРН об основных характеристиках и правах')
      addRec('Закажите выписку из ЕГРН (характеристики + права) и внесите сведения из неё')
    } else if (!hasEgrnInfo) {
      items.push(item('1', 'manual', 'Выписка загружена, но сведения из неё (адрес, площадь, кадастровый номер) не внесены'))
    } else {
      const notes: string[] = []
      const problems: string[] = []
      // Кадастровый номер
      const objCad = normCadastral(o.cadastralNumber)
      const docCad = normCadastral(f.egrnCadastral)
      if (objCad && docCad && objCad !== docCad) {
        addFinding('risk', '1', 'Кадастровый номер в карточке объекта (' + o.cadastralNumber + ') не совпадает с выпиской ЕГРН (' + f.egrnCadastral + ') — возможно, это разные объекты')
        problems.push('кадастровый номер не совпадает')
      } else if (objCad && !docCad) {
        notes.push('кадастровый номер в выписке не внесён — сверку выполнит юрист')
      } else if (!objCad && docCad) {
        addFinding('warn', '1', 'В карточке объекта не заполнен кадастровый номер — внесите ' + f.egrnCadastral)
        problems.push('в карточке нет кадастрового номера')
      }
      // Адрес
      if (f.egrnAddress && (o.address?.street || o.address?.house)) {
        const objTokens = [o.address?.street || '', o.address?.house || '', o.address?.apartment || '']
          .map((t) => normStr(t))
          .filter((t) => t.length >= 3)
        const docAddrNorm = normStr(f.egrnAddress)
        const mism = objTokens.filter((t) => !docAddrNorm.includes(t))
        if (mism.length) {
          addFinding('warn', '1', 'Адрес по выписке («' + f.egrnAddress + '») не сходится с карточкой объекта (' + objectAddressLine(o) + ')')
          problems.push('адрес не совпадает')
        }
      } else if (f.egrnAddress) {
        notes.push('в карточке объекта неполный адрес — полноту сверки подтвердите по документам')
      }
      // Площадь
      const docArea = numOf(f.egrnArea)
      const objArea = o.area && o.area > 0 ? o.area : null
      if (docArea != null && objArea != null) {
        // У участков карточка хранит м² (1 сотка = 100 м²) — допуск 1%
        const tolerance = category === 'land' ? Math.max(1, objArea * 0.01) : 0.5
        if (Math.abs(docArea - objArea) > tolerance) {
          addFinding('warn', '1', 'Площадь по выписке (' + String(docArea).replace('.', ',') + ' м²) не совпадает с карточкой объекта (' + String(objArea).replace('.', ',') + ' м²)')
          problems.push('площадь не совпадает')
        }
      } else if (docArea == null) {
        notes.push('площадь по выписке не внесена')
      } else {
        addFinding('warn', '1', 'В карточке объекта не указана площадь — сравнение с выпиской ЕГРН невозможно')
        problems.push('в карточке нет площади')
      }
      items.push(
        item('1', problems.length ? 'issues' : 'ok', problems.length ? 'Найдены расхождения — см. список несоответствий' : (notes.length ? 'Сведения совпадают с карточкой объекта' + (notes.length ? '. ' + notes.join('. ') : '') : 'Сведения совпадают с карточкой объекта')),
      )
    }
  }

  // 2. Собственники и правообладатели ---------------------------------------
  {
    const ownersRaw = (f.egrnOwners || '').trim()
    if (!ownersRaw) {
      items.push(item('2', 'manual', 'Список собственников не внесён — проверьте состав правообладателей по выписке'))
      if (!egrnDoc) addMissing('Выписка из ЕГРН с составом правообладателей')
    } else {
      const owners = ownersRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      const many = owners.length > 1
      const cardOwner = (o.ownerName || '').trim()
      const ownerMatches = owners.some((ow) => {
        const a = normStr(ow)
        const b = normStr(cardOwner)
        return !!a && !!b && (a.includes(b) || b.includes(a))
      })
      const notes: string[] = []
      const problems: string[] = []
      if (cardOwner && !ownerMatches) {
        addFinding('warn', '2', 'Собственник из карточки объекта («' + cardOwner + '») не найден среди правообладателей по выписке (' + owners.join(', ') + ')')
        problems.push('состав собственников не совпадает с карточкой')
      } else if (!cardOwner) {
        notes.push('в карточке объекта собственник не указан')
      }
      if (many) {
        notes.push('в ЕГРН несколько правообладателей — при сделке потребуется участие или согласие всех')
        addRec('Получите согласие/участие всех сособственников, указанных в выписке ЕГРН')
      }
      if (isSale && many) {
        addFinding('info', '2', 'Правообладателей несколько (' + owners.join(', ') + ') — проверьте полномочия каждого')
      }
      items.push(item('2', problems.length ? 'issues' : 'ok', problems.length ? 'Расхождения — см. список несоответствий' : ('По выписке: ' + owners.join(', ') + (notes.length ? '. ' + notes.join('. ') : ''))))
    }
  }

  // 3. Вид права и основание приобретения -----------------------------------
  {
    const right = (f.egrnRight || '').trim()
    const basis = (f.egrnBasis || '').trim()
    const notes: string[] = []
    const problems: string[] = []
    const hasTitleDoc = hasDocType(docs, 'title')
    if (!right && !basis) {
      items.push(item('3', 'manual', 'Вид права и основание не внесены — без этого сделку не подготовить'))
      addRec('Внесите вид права и основание приобретения из выписки ЕГРН / правоустанавливающего документа')
    } else {
      const rightNorm = normStr(right)
      if (!rightNorm) {
        problems.push('вид права не указан')
      } else if (isSale && !rightNorm.includes('собственн')) {
        addFinding('risk', '3', 'Вид права — «' + right + '»: продажа возможна только при праве собственности')
        problems.push('право не является собственностью')
      } else if (rightNorm.includes('долев')) {
        notes.push('долевая собственность — при сделке нужно согласие всех участников')
      } else if (rightNorm.includes('совместн')) {
        notes.push('совместная собственность супругов — потребуется нотариальное согласие супруга (см. пункт 7)')
      }
      const basisNorm = normStr(basis)
      if (basisNorm) {
        if (basisNorm.includes('наслед')) {
          if (hasDocType(docs, 'inheritance')) {
            notes.push('право по наследству — свидетельство приложено; проверьте полноту круга наследников')
            addRec('Убедитесь, что все наследники вступили в права, а сроки оспаривания прошли')
          } else {
            problems.push('основание — наследство, но свидетельство о праве на наследство не приложено')
            addMissing('Свидетельство о праве на наследство')
          }
        } else if (basisNorm.includes('купли') || basisNorm.includes('дарен') || basisNorm.includes('мен') || basisNorm.includes('рент')) {
          if (!hasTitleDoc) {
            problems.push('основание — ' + basis + ', но сам правоустанавливающий документ не загружен')
            addMissing('Правоустанавливающий документ (' + basis + ')')
          }
        } else if (basisNorm.includes('приватиз')) {
          if (!hasDocType(docs, 'privatization')) {
            problems.push('основание — приватизация, документы приватизации не приложены')
            addMissing('Договор/документы приватизации')
          }
        } else if (basisNorm.includes('суд')) {
          addFinding('info', '3', 'Основание — ' + basis + ': проверьте, что решение вступило в законную силу')
          notes.push('право по судебному акту — подтвердите вступление в силу')
        } else {
          notes.push('основание: ' + basis)
        }
      } else {
        problems.push('основание приобретения не указано')
      }
      items.push(item('3', problems.length ? 'issues' : 'ok', problems.length ? 'Есть замечания — см. список' : (notes.length ? notes.join('. ') : 'Вид права и основание соответствуют сделке')))
    }
  }

  // 4. Залоги, аресты, запреты и обременения --------------------------------
  {
    const raw = (f.egrnRestrictions || '').trim()
    const recText = (r: string) => 'Обременение «' + r + '» снимается только после погашения и внесения записи в ЕГРН — до этого сделка невозможна или рискованна'
    if (!raw) {
      items.push(item('4', 'manual', 'Сведения об обременениях не внесены. Если в выписке их нет — напишите «нет»: только так пункт подтверждается'))
      if (!egrnDoc) addMissing('Выписка из ЕГРН (проверка обременений)')
      addRec('Проверьте по свежей выписке ЕГРН отсутствие залогов, арестов, запретов и иных обременений')
    } else {
      const norm = normStr(raw)
      const hasNegation = norm.includes('нет') || norm.includes('незарегистр') || norm.includes('отсутств')
      const has = (w: string) => norm.includes(w)
      const serious: string[] = []
      const light: string[] = []
      if (has('арест') && !hasNegation) serious.push('арест')
      if (has('запрет') && !hasNegation) serious.push('запрет на регистрационные действия')
      if ((has('залог') || has('ипотек')) && !hasNegation) serious.push('залог/ипотека')
      if ((has('аренд') || has('сервит') || has('рент')) && !hasNegation) light.push('аренда/сервитут/рента')
      if (hasNegation && !serious.length && !light.length) {
        items.push(item('4', 'ok', 'По выписке ЕГРН зарегистрированных обременений нет'))
      } else if (serious.length || light.length) {
        for (const r of serious) {
          addFinding('risk', '4', 'В ЕГРН зарегистрировано обременение: ' + r + '. ' + recText(r))
        }
        for (const r of light) {
          addFinding('warn', '4', 'В ЕГРН указано: ' + r + ' — сделка возможна, но юрист должен учесть это условие')
          addRec('Учтите при подготовке сделки: ' + r)
        }
        items.push(item('4', serious.length ? 'risk' : 'issues', serious.length ? 'Зарегистрированы обременения, препятствующие сделке' : 'Есть обременения, требующие учёта в сделке'))
      } else {
        items.push(item('4', 'issues', 'Не удалось однозначно распознать сведения об обременениях («' + raw + '») — уточните формулировку или передайте юристу'))
      }
    }
  }

  // 5. Судебные споры и исполнительные риски --------------------------------
  {
    const st = f.courtStatus
    if (st === 'found') {
      addFinding('risk', '5', 'Есть сведения о судебных спорах или исполнительных производствах — сделка под риском')
      items.push(item('5', 'risk', 'Зафиксированы судебные споры / исполнительные производства — до их урегулирования сделку не проводить'))
      addRec('Выясните предмет и стадию спора/взыскания до любых действий по сделке')
    } else if (st === 'none') {
      if (hasDocType(docs, 'court')) {
        items.push(item('5', 'ok', 'По представленной справке судебных споров и исполнительных производств не выявлено'))
      } else {
        items.push(item('5', 'manual', 'Указано, что споров нет, но подтверждающая справка не загружена — приложите её или подтвердите проверкой юриста'))
      }
    } else {
      items.push(item('5', 'manual', 'Открытые реестры (ФССП, КАД, ГАС «Правосудие») в автоматическом режиме не опрашиваются — проверку выполняет юрист, ссылки на источники — в конце отчёта'))
      addRec('Юристу: проверьте собственника по банку исполнительных производств ФССП, КАД и ГАС «Правосудие»')
    }
  }

  // 6. Банкротство собственника ---------------------------------------------
  {
    const st = f.bankruptcyStatus
    if (st === 'found') {
      addFinding('risk', '6', 'В отношении собственника открыта процедура банкротства — реализация имущества вне конкурсной массы невозможна')
      items.push(item('6', 'risk', 'Открыто банкротство собственника — сделка с его имуществом требует согласования с финансовым управляющим'))
    } else if (st === 'none') {
      if (hasDocType(docs, 'bankruptcy')) {
        items.push(item('6', 'ok', 'По представленной справке сведений о банкротстве собственника нет'))
      } else {
        items.push(item('6', 'manual', 'Сведений о банкротстве нет по заявлению, но справка не загружена — подтвердите проверкой реестров'))
      }
    } else {
      items.push(item('6', 'manual', 'Проверка реестров банкротств (ЕФРСБ, ФССП) выполняется юристом вручную — ссылки в конце отчёта'))
      addRec('Юристу: проверьте собственника по ЕФРСБ и исполнительным производствам ФССП')
    }
  }

  // 7. Несовершеннолетние, супруги и согласия -------------------------------
  {
    const notes: string[] = []
    const problems: string[] = []
    const spouse = f.spouseOwner
    const minor = f.minorOwners
    if (spouse === 'yes') {
      const consentOk = f.spouseConsent === 'provided' || hasDocType(docs, 'spouse')
      if (consentOk) {
        notes.push('согласие супруга приложено (проверьте актуальность на дату сделки)')
      } else {
        addFinding('risk', '7', 'Имущество — общее имущество супругов, но нотариальное согласие супруга не приложено: сделка может быть оспорена')
        problems.push('нет согласия супруга')
        addMissing('Нотариальное согласие супруга на продажу')
      }
    } else if (spouse === 'none') {
      notes.push('сведений о супруге-сособственнике нет')
    }
    if (minor === 'yes') {
      const permitOk = f.guardianPermit === 'provided' || hasDocType(docs, 'guardianship')
      if (permitOk) {
        notes.push('разрешение органов опеки приложено (проверьте, что сделка соответствует условиям разрешения)')
      } else {
        addFinding('risk', '7', 'Среди собственников несовершеннолетний, а разрешения органа опеки и попечительства нет — сделка с долей несовершеннолетнего недопустима')
        problems.push('нет разрешения органов опеки')
        addMissing('Разрешение органа опеки и попечительства')
      }
    } else if (minor === 'none') {
      notes.push('несовершеннолетних собственников нет')
    }
    if (!spouse && !minor) {
      items.push(item('7', 'manual', 'Не внесены сведения о супругах и несовершеннолетних собственниках — заполните их по документам'))
    } else {
      const serious = problems.length
      items.push(item('7', serious ? 'risk' : 'ok', serious ? 'Отсутствуют обязательные согласия — см. список несоответствий' : (notes.length ? notes.join('. ') : 'Согласия в порядке')))
    }
  }

  // 8. Перепланировки --------------------------------------------------------
  {
    const replan = f.replan
    if (!isBuilding) {
      items.push(item('8', 'ok', 'Не применимо: земельный участок'))
    } else if (replan === 'illegal') {
      addFinding('risk', '8', 'Есть несогласованная перепланировка — продажа возможна только после узаконивания или по решению суда')
      items.push(item('8', 'risk', 'Перепланировка не узаконена — до сделки приведите помещение в соответствие с документами'))
      addRec('Узаконьте перепланировку (согласование + внесение изменений в техплан) до сделки')
    } else if (replan === 'legalized') {
      if (hasDocType(docs, 'tech')) {
        items.push(item('8', 'ok', 'Перепланировка узаконена, техническая документация приложена'))
      } else {
        items.push(item('8', 'issues', 'Перепланировка узаконена, но техплан/техпаспорт с внесёнными изменениями не загружен'))
        addMissing('Технический паспорт / техплан с изменениями')
      }
    } else if (replan === 'none') {
      if (hasDocType(docs, 'tech') || isSale === false) {
        items.push(item('8', 'ok', 'По технической документации перепланировок нет'))
      } else {
        items.push(item('8', 'manual', 'Заявлено об отсутствии перепланировок, но техпаспорт/техплан не загружен — подтвердите документально'))
        addMissing('Технический паспорт / техплан (подтверждение отсутствия перепланировок)')
      }
    } else {
      items.push(item('8', 'manual', 'Сведения о перепланировках не внесены — сравнение с техническими документами выполнит юрист'))
      addRec('Сравните фактическое состояние помещения с техпаспортом/техпланом')
    }
  }

  // 9. Приватизация ----------------------------------------------------------
  {
    const st = f.privatized
    if (!isApartment && !isHouse && !isTownhouse) {
      items.push(item('9', 'ok', 'Не применимо: объект не был в государственной/муниципальной собственности как жильё'))
    } else if (st === 'yes') {
      if (hasDocType(docs, 'privatization')) {
        items.push(item('9', 'ok', 'Объект приватизирован, документы приватизации приложены'))
        addRec('При приватизации проверьте участие всех зарегистрированных на тот момент лиц — пропущенный участник может оспорить сделку')
      } else {
        items.push(item('9', 'issues', 'Объект приватизирован, но документы приватизации не приложены'))
        addMissing('Договор (документы) приватизации')
      }
    } else if (st === 'no') {
      items.push(item('9', 'ok', 'Приватизация не проводилась — право возникло по иному основанию (см. пункт 3)'))
    } else {
      items.push(item('9', 'manual', 'Сведения о приватизации не внесены — риски перехода права (пропущенные участники, сроки) оценит юрист'))
    }
  }

  // 10. Объект культурного наследия ------------------------------------------
  {
    const st = f.heritage
    if (!isBuilding) {
      items.push(item('10', 'manual', 'Статус земельного участка в охранных зонах ОКН проверяется по публичной кадастровой карте и данным ЕГРОКН'))
    } else if (st === 'yes') {
      addFinding('warn', '10', 'Объект является памятником/находится в охранной зоне — на него распространяются ограничения по содержанию и ремонту')
      items.push(item('10', 'issues', 'Объект культурного наследия / в охранной зоне — запросите заключение органа охраны ОКН об ограничениях'))
      addRec('Получите в органе охраны ОКН сведения об ограничениях (запрет перепланировки, режим содержания)')
    } else if (st === 'no') {
      if (hasDocType(docs, 'heritage')) {
        items.push(item('10', 'ok', 'По справке объект не является объектом культурного наследия'))
      } else {
        items.push(item('10', 'manual', 'Указано, что объект не является ОКН, но справка не загружена — приложите её для подтверждения'))
      }
    } else {
      items.push(item('10', 'manual', 'Проверка статуса ОКН по открытым данным (ЕГРОКН) выполняется юристом — ссылка в конце отчёта'))
      addRec('Юристу: проверьте объект по реестру ЕГРОКН и охранным зонам')
    }
  }

  // 11. Капитальный ремонт ---------------------------------------------------
  {
    const st = f.kapremontStatus
    if (!isApartment && !isTownhouse) {
      items.push(item('11', 'ok', 'Не применимо: взносы на капремонт начисляются собственникам помещений в МКД'))
    } else if (st === 'noDebt') {
      if (hasDocType(docs, 'kapremont') || hasDocType(docs, 'utility')) {
        items.push(item('11', 'ok', 'Задолженности по взносам на капремонт нет (по справке/квитанциям)'))
      } else {
        items.push(item('11', 'manual', 'Задолженности нет по заявлению, но подтверждающий документ не загружен'))
      }
    } else if (st === 'debt') {
      addFinding('warn', '11', 'Есть задолженность по взносам на капремонт — при продаже долг остаётся на собственнике, но его лучше погасить до сделки')
      items.push(item('11', 'issues', 'Есть задолженность по взносам на капремонт — уточните сумму и погасите до сделки'))
      addRec('Запросите справку фонда капремонта о сумме задолженности')
    } else if (st === 'na') {
      items.push(item('11', 'ok', 'Взносы на капремонт по объекту не начисляются'))
    } else {
      items.push(item('11', 'manual', 'Сведения о взносах на капремонт не внесены (для МКД подтверждаются справкой фонда или квитанциями)'))
    }
  }

  // 12. Полнота загруженных документов ---------------------------------------
  {
    const need: { docType: string; name: string; required: boolean }[] = []
    if (isSale) {
      need.push({ docType: 'egrn', name: 'Выписка из ЕГРН (характеристики и права)', required: true })
      need.push({ docType: 'title', name: 'Правоустанавливающий документ', required: true })
    } else {
      need.push({ docType: 'egrn', name: 'Выписка из ЕГРН (подтверждение права сдавать)', required: true })
    }
    need.push({ docType: 'passport', name: 'Паспорт собственника (сверка личности)', required: true })
    if (f.spouseOwner === 'yes' && f.spouseConsent !== 'provided') {
      need.push({ docType: 'spouse', name: 'Согласие супруга', required: true })
    }
    if (f.minorOwners === 'yes' && f.guardianPermit !== 'provided') {
      need.push({ docType: 'guardianship', name: 'Разрешение органов опеки', required: true })
    }
    if (f.replan === 'legalized') {
      need.push({ docType: 'tech', name: 'Техплан/техпаспорт с изменениями', required: true })
    }
    if (f.privatized === 'yes') {
      need.push({ docType: 'privatization', name: 'Документы приватизации', required: true })
    }
    if (f.heritage === 'yes') {
      need.push({ docType: 'heritage', name: 'Заключение органа охраны ОКН', required: false })
    }
    // Уже собранные в пунктах 1–11 отсутствующие документы тоже учитываем
    const missing = need.filter((n) => !hasDocType(docs, n.docType))
    const totalMissing = new Set<string>()
    for (const m of missing) totalMissing.add(m.name)
    for (const m of missingDocs) totalMissing.add(m)

    if (!docs.length) {
      items.push(item('12', 'issues', 'Документы в карточку объекта не загружены'))
    } else if (missing.some((m) => m.required)) {
      items.push(item('12', 'issues', 'Загружены не все обязательные документы'))
    } else if (missing.length) {
      items.push(item('12', 'ok', 'Обязательные документы на месте' + (missing.length ? ' (рекомендуемые: ' + missing.map((m) => m.name.toLowerCase()).join(', ') + ')' : '')))
    } else {
      items.push(item('12', 'ok', 'Все ожидаемые документы загружены'))
    }
    if (totalMissing.size) {
      for (const m of totalMissing) addMissing(m)
    }
  }

  // --- Итог ------------------------------------------------------------------
  const status = worst(items.map((i) => i.status))
  if (status === 'risk') addRec('Приостановите оформление сделки до устранения или разъяснения обстоятельств, отмеченных как «Высокий риск»')
  if (status !== 'ok') addRec('Перед сделкой получите свежую выписку из ЕГРН (не старше 30 дней)')
  addRec('Оригиналы документов и подлинность подписей сверяет юрист при личной встрече с собственником')
  addRec('Отчёт предварительный: окончательное заключение готовит юрист по оригиналам документов и официальным ответам')

  // Дата актуальности документов: дата выписки ЕГРН (если внесена), иначе —
  // самая поздняя дата среди загруженных документов
  let docsActualAt: string | null = null
  if (f.egrnDate && Number.isFinite(new Date(f.egrnDate).getTime())) {
    docsActualAt = new Date(f.egrnDate + 'T00:00:00').toISOString()
  } else {
    const dates = docs
      .map((d) => (d.docDate && Number.isFinite(new Date(d.docDate).getTime()) ? new Date(d.docDate).getTime() : Number.NaN))
      .filter((t) => Number.isFinite(t))
    if (dates.length) docsActualAt = new Date(Math.max(...dates)).toISOString()
  }

  // Источники, релевантные пунктам с ручной проверкой
  const manualKeys = new Set(items.filter((i) => i.status === 'manual').map((i) => i.key))
  const sources = LEGAL_SOURCES.filter((s) => s.items.some((k) => manualKeys.has(k)))

  const sortedFindings = [...findings].sort((a, b) => Number(a.itemKey) - Number(b.itemKey))

  return {
    objectId: o.id,
    objectTitle: o.title || '',
    objectAddress: objectAddressLine(o),
    category,
    dealType: isSale ? 'sale' : 'rent',
    status,
    checkedAt: now.toISOString(),
    docsActualAt,
    checkedBy: '',
    items,
    findings: sortedFindings,
    missingDocs: [...missingDocs],
    recommendations,
    sources,
    docs: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      docTypeLabel: DOC_LABEL[d.docType] || d.docType,
      docDate: d.docDate || null,
      fileName: d.fileName || '',
      size: d.size || 0,
    })),
    facts: f,
    engineVersion: 1,
  }
}

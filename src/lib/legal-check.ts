// ---------------------------------------------------------------------------
// «Юридическая экспертиза объекта» — движок закрытого отчёта (модуль CRM Н15).
//
// Экспертиза отвечает на шесть вопросов: кому принадлежит объект; совпадает
// ли собственник с паспортом; каковы вид права и основание приобретения;
// какие обременения зарегистрированы; есть ли процедура банкротства
// собственника; есть ли судебные и исполнительные риски.
//
// Источники данных строго разделены:
//   • сведения об объекте и собственнике — карточка объекта в CRM;
//   • сведения о правах и обременениях — загруженная в карточку выписка ЕГРН
//     (XML Росреестра разбирается автоматически, см. legal-egrn.ts; PDF и
//     сканы система не распознаёт и прямо об этом сообщает);
//   • результаты ручных проверок и сверки с паспортом — отметки юриста
//     (LegalManualMarks), потому что паспорта и официальные реестры системе
//     недоступны.
//
// Чего движок НЕ делает: не опрашивает официальные реестры (у ЕГРН, ФССП,
// КАД, ГАС «Правосудие», ЕФРСБ нет открытого API, доступного CRM) и не
// имитирует их ответы. По таким пунктам отчёт прямо пишет, что проверка
// автоматически недоступна и выполняется юристом вручную со ссылками на
// источники. «Юридически чистым» объект не называется никогда: итог —
// «Риски не выявлены по проверенным данным» либо «Обнаружены риски».
//
// Движок — чистая функция без ввода-вывода (runLegalExpertise); хранение и
// доступы — в legal-service.ts.
// ---------------------------------------------------------------------------

import type { EgrnExtract } from './legal-egrn'

// Аккаунт юриста, ответственного за ручные проверки: Лана Козырева (см.
// память agent-accounts: users.id=2, svetkozyr@gmail.com). Сам отчёт и
// документы экспертизы открыты только администраторам (см. legal-service.ts);
// константа остаётся справочной для модуля — по ней доступ юриста
// возвращается одной строкой в canReadLegalReport/canManageObjectLegal, если
// владелец решит вернуть его.
export const LEGAL_OFFICER_EMAIL = 'svetkozyr@gmail.com'

/** Версия движка: 2 — экспертиза по шести проверкам вместо анкеты из 12 пунктов */
export const LEGAL_ENGINE_VERSION = 2

/** Статусы проверок и итога отчёта (единый словарь для всего модуля) */
export type LegalCheckStatus = 'ok' | 'issues' | 'risk' | 'manual'

/** Итоговые формулировки отчёта. «Юридически чистый» не используется никогда */
export const LEGAL_STATUS_LABELS: Record<LegalCheckStatus, string> = {
  ok: 'Риски не выявлены по проверенным данным',
  issues: 'Есть замечания — нужно решение юриста',
  risk: 'Обнаружены риски',
  manual: 'Часть проверок автоматически недоступна — нужна ручная проверка юриста',
}

/** Короткие формулировки для строки отдельной проверки */
export const LEGAL_ITEM_STATUS_LABELS: Record<LegalCheckStatus, string> = {
  ok: 'Рисков не выявлено',
  issues: 'Есть замечания',
  risk: 'Обнаружены риски',
  manual: 'Нужна ручная проверка',
}

/** Обязательная оговорка отчёта (выводится в шапке блока и в каждом PDF) */
export const LEGAL_REPORT_DISCLAIMER =
  'Предварительная юридическая экспертиза. Не заменяет заключение юриста и официальные документы. ' +
  'Официальные реестры (ЕГРН, ФССП, КАД, ЕФРСБ) автоматически не опрашиваются — эти сведения проверяет юрист вручную'

/** Приоритет статусов: чем больше число, тем «хуже» — итог берёт максимум */
const STATUS_WEIGHT: Record<LegalCheckStatus, number> = { ok: 0, issues: 1, manual: 2, risk: 3 }

const worst = (list: LegalCheckStatus[]): LegalCheckStatus =>
  list.reduce<LegalCheckStatus>((acc, s) => (STATUS_WEIGHT[s] > STATUS_WEIGHT[acc] ? s : acc), 'ok')

// --- Типы загружаемых документов ------------------------------------------

export const LEGAL_DOC_TYPES = [
  { value: 'egrn', label: 'Выписка из ЕГРН (XML Росреестра, PDF или скан)' },
  { value: 'title', label: 'Правоустанавливающий документ (ДКП, дарение и др.)' },
  { value: 'inheritance', label: 'Свидетельство о праве на наследство' },
  { value: 'privatization', label: 'Документы приватизации' },
  { value: 'tech', label: 'Технический паспорт / техплан' },
  // Паспорт загружается только для сверки личности при сделке. Серия, номер
  // и другие паспортные данные в систему не вводятся, не сохраняются и в
  // отчёт не попадают; сверку с паспортом юрист выполняет визуально.
  { value: 'passport', label: 'Паспорт собственника (только для сверки личности)' },
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

// --- Отметки юриста по результатам ручной проверки -------------------------

/**
 * Результаты проверок, которые система выполнить не может: сверка с
 * паспортом (только визуально по оригиналу), сверка выписки, когда файл не
 * распознан автоматически, и официальные реестры (ФССП/КАД/ГАС, ЕФРСБ).
 * Это не анкета по документу: данные выписки система разбирает сама, здесь
 * фиксируются только выводы ручной проверки.
 */
export interface LegalManualMarks {
  passportCheck?: '' | 'match' | 'mismatch'
  egrnCheck?: '' | 'clear' | 'encumbrance' | 'mismatch'
  courtCheck?: '' | 'clear' | 'found'
  bankruptcyCheck?: '' | 'clear' | 'found'
  /** Комментарий юриста к результатам ручных проверок */
  comment?: string
}

/** Описание отметок — по нему строится интерфейс (LegalCheckBlock) */
export const LEGAL_MANUAL_FIELDS: {
  name: keyof Omit<LegalManualMarks, 'comment'>
  label: string
  hint?: string
  options: { value: string; label: string }[]
}[] = [
  {
    name: 'passportCheck',
    label: 'Собственник сверен с паспортом',
    hint: 'Сверку по оригиналу паспорта выполняет юрист визуально: система не распознаёт паспорта и не хранит их данные',
    options: [
      { value: '', label: 'Не проверялось' },
      { value: 'match', label: 'Сверено — совпадает' },
      { value: 'mismatch', label: 'Есть расхождения' },
    ],
  },
  {
    name: 'egrnCheck',
    label: 'Выписка ЕГРН сверена юристом',
    hint: 'Нужна, когда файл выписки не XML и данные не распознаны автоматически',
    options: [
      { value: '', label: 'Не проверялось' },
      { value: 'clear', label: 'Сверено — обременений и расхождений нет' },
      { value: 'encumbrance', label: 'Выявлены обременения' },
      { value: 'mismatch', label: 'Выявлены расхождения в данных' },
    ],
  },
  {
    name: 'courtCheck',
    label: 'Суды и исполнительные производства (ФССП, КАД, ГАС «Правосудие»)',
    hint: 'Автоматический запрос недоступен — проверяется юристом вручную по ссылкам в отчёте',
    options: [
      { value: '', label: 'Не проверялось' },
      { value: 'clear', label: 'Проверено — сведений не найдено' },
      { value: 'found', label: 'Обнаружены сведения' },
    ],
  },
  {
    name: 'bankruptcyCheck',
    label: 'Банкротство собственника (ЕФРСБ)',
    hint: 'Автоматический запрос недоступен — проверяется юристом вручную',
    options: [
      { value: '', label: 'Не проверялось' },
      { value: 'clear', label: 'Проверено — сведений не найдено' },
      { value: 'found', label: 'Обнаружена процедура' },
    ],
  },
]

const MANUAL_VALUES: Record<string, string[]> = {
  passportCheck: ['', 'match', 'mismatch'],
  egrnCheck: ['', 'clear', 'encumbrance', 'mismatch'],
  courtCheck: ['', 'clear', 'found'],
  bankruptcyCheck: ['', 'clear', 'found'],
}

/** Санитизация отметок юриста: только известные ключи и значения */
export function sanitizeManualMarks(input: unknown): LegalManualMarks {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out: LegalManualMarks = {}
  for (const [key, allowed] of Object.entries(MANUAL_VALUES)) {
    const value = typeof src[key] === 'string' ? (src[key] as string).trim() : ''
    if (allowed.includes(value)) (out as Record<string, string>)[key] = value
  }
  const comment = typeof src.comment === 'string' ? src.comment.trim().slice(0, 2000) : ''
  if (comment) out.comment = comment
  return out
}

/** Кадастровый номер из ручного ввода: только цифры, двоеточия и пробелы */
export function sanitizeCadastral(input: unknown): string {
  if (typeof input !== 'string') return ''
  const s = input.trim().replace(/[^\d:]/g, '').slice(0, 40)
  return /^\d{2}:\d{2}:\d{6,7}:\d{1,10}$/.test(s) ? s : ''
}

const CADASTRAL_FORMAT = /^\d{2}:\d{2}:\d{6,7}:\d{1,10}$/

// --- Официальные источники --------------------------------------------------

export interface LegalSource {
  name: string
  url: string
}

/**
 * Источники отчёта. Автоматический опрос реестров из CRM невозможен —
 * у них нет открытого API, доступного серверу сайта, поэтому в названии
 * источника прямо указано, что проверка ручная.
 */
export const LEGAL_SOURCES: LegalSource[] = [
  { name: 'Загруженная в карточку выписка ЕГРН — источник сведений о правах и обременениях', url: 'https://lk.rosreestr.ru/' },
  { name: 'Росреестр / НСПД, публичная кадастровая карта — проверяется вручную, автоматический запрос из CRM недоступен', url: 'https://pkk.rosreestr.ru/' },
  { name: 'Банк данных исполнительных производств (ФССП) — проверяется юристом вручную', url: 'https://fssp.gov.ru/iss/ip' },
  { name: 'Картотека арбитражных дел (КАД) — проверяется юристом вручную', url: 'https://kad.arbitr.ru/' },
  { name: 'ГАС «Правосудие», суды общей юрисдикции — проверяется юристом вручную', url: 'https://sudrf.ru/' },
  { name: 'ЕФРСБ, реестр сведений о банкротстве — проверяется юристом вручную', url: 'https://bankrot.fedresurs.ru/' },
]

// --- Формы отчёта -----------------------------------------------------------

export interface LegalCheckItem {
  /** Номер проверки: '1'…'6' — совпадает со списком вопросов экспертизы */
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

/** Дополнительные сведения отчёта (хранятся в JSON-поле legal-reports.facts) */
export interface LegalReportExtras {
  /** Кадастровый номер, по которому шла проверка */
  cadastralNumber: string
  /** Откуда он взялся: карточка объекта, ручной ввод, распознанная выписка */
  cadastralSource: 'card' | 'input' | 'egrn' | 'none'
  /** Собственник по карточке объекта */
  ownerCard: string
  /** Правообладатели, распознанные из выписки ЕГРН */
  ownersEgrn: string[]
  rightType: string
  basis: string
  addressEgrn: string
  areaEgrn: string
  areaCard: number | null
  /** Зарегистрированные обременения строками («ипотека — …») */
  encumbrances: string[]
  /** Что показал разбор файла выписки */
  egrn: {
    status: 'parsed' | 'unrecognized' | 'missing'
    fileName: string
    format: string
    reason: string
    docDate: string | null
    notes: string[]
  }
  /** Отметки юриста о ручных проверках */
  manual: LegalManualMarks
  /** Что система проверила сама */
  autoChecks: string[]
  /** Что автоматически проверить нельзя и почему */
  autoUnavailable: string[]
}

export interface LegalReportData {
  objectId: number
  objectTitle: string
  objectAddress: string
  category: string
  dealType: 'sale' | 'rent'
  /** Итог экспертизы (один из четырёх) */
  status: LegalCheckStatus
  /** Дата проверки (ISO) */
  checkedAt: string
  docsActualAt: string | null
  checkedBy: string
  items: LegalCheckItem[]
  findings: LegalFinding[]
  missingDocs: string[]
  recommendations: string[]
  sources: LegalSource[]
  docs: LegalDocInReport[]
  extras: LegalReportExtras
  engineVersion: number
}

/** Документ объекта для движка (только метаданные — содержимое разбирается отдельно) */
export interface LegalDocMeta {
  id: number
  docType: string
  docDate?: string | null
  createdAt: string
  fileName?: string
  size?: number
}

/** Карточка объекта для движка */
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

/** Совпадают ли ФИО: сравнение по нормализованным строкам и вхождению */
const nameMatches = (a?: string | null, b?: string | null): boolean => {
  const x = normStr(a)
  const y = normStr(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
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

/** Обременения, из-за которых сделка невозможна или рискованна */
const SERIOUS_ENCUMBRANCE = /арест|запрет|залог|ипотек/i

// --- Движок ----------------------------------------------------------------

const ITEM_TITLES: Record<string, string> = {
  '1': 'Правообладатель объекта (кому принадлежит)',
  '2': 'Совпадение собственника с паспортом',
  '3': 'Вид права и основание приобретения',
  '4': 'Ипотека, залог, аресты, запреты, сервитуты и иные обременения',
  '5': 'Судебные споры и исполнительные производства',
  '6': 'Банкротство собственника',
}

/**
 * Юридическая экспертиза объекта. opts.egrn — результат разбора файла выписки
 * (legal-egrn.ts), null если файла нет; opts.manual — отметки юриста о ручных
 * проверках.
 */
export function runLegalExpertise(opts: {
  object: LegalObjectLike
  docs: LegalDocMeta[]
  egrn: EgrnExtract | null
  cadastralNumber?: string
  manual?: LegalManualMarks
  now?: Date
}): LegalReportData {
  const now = opts.now || new Date()
  const o = opts.object
  const docs = opts.docs
  const manual = sanitizeManualMarks(opts.manual)
  const parsed = opts.egrn && opts.egrn.recognized ? opts.egrn : null
  const egrnDoc = docs.find((d) => d.docType === 'egrn')
  const passportDoc = docs.find((d) => d.docType === 'passport')
  const isSale = o.type === 'sale'

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
  const items: LegalCheckItem[] = []
  const item = (key: string, status: LegalCheckStatus, note?: string): LegalCheckItem => ({
    key,
    title: ITEM_TITLES[key],
    status,
    note,
  })

  // Кадастровый номер: карточка объекта либо введённый вручную
  const cadastralCard = (o.cadastralNumber || '').trim()
  const cadastralInput = sanitizeCadastral(opts.cadastralNumber)
  const cadastralEgrn = parsed?.cadastralNumber || ''
  const cadastral = cadastralCard || cadastralInput || cadastralEgrn
  const cadastralSource: LegalReportExtras['cadastralSource'] = cadastralCard ? 'card' : cadastralInput ? 'input' : cadastralEgrn ? 'egrn' : 'none'

  // Пояснение о том, почему файл выписки не разобран (для пунктов 1, 3, 4)
  const egrnFileNote = (): string => {
    if (!egrnDoc) return 'выписка из ЕГРН не загружена'
    if (opts.egrn?.reason) return `файл выписки «${egrnDoc.fileName || 'без имени'}»: ${opts.egrn.reason}`
    return `файл выписки «${egrnDoc.fileName || 'без имени'}» автоматически не разобран`
  }
  /** Пункт, который система проверить не смогла: его закрывает отметка юриста */
  const manualEgrnItem = (key: string, what: string): LegalCheckItem => {
    if (manual.egrnCheck === 'clear' || manual.egrnCheck === 'encumbrance') {
      return item(key, 'ok', `${what} — юрист сверил выписку ЕГРН по документу, расхождений не заявлено`)
    }
    if (manual.egrnCheck === 'mismatch') {
      return item(key, 'issues', `${what} — юрист отметил расхождения в данных выписки (см. комментарий к проверке)`)
    }
    return item(
      key,
      'manual',
      `${what}: ${egrnFileNote()}. Автоматически система данные не выдумывает — их сверяет юрист по документу, отметки о сверке нет`,
    )
  }

  // --- 1. Правообладатель объекта ------------------------------------------
  {
    const notes: string[] = []
    const problems: string[] = []
    if (cadastral && !CADASTRAL_FORMAT.test(cadastral)) {
      addFinding('warn', '1', `Кадастровый номер «${cadastral}» не похож на формат ЕГРН — проверьте запись`)
      problems.push('кадастровый номер записан с ошибкой')
    }
    if (cadastralCard && cadastralEgrn && normCadastral(cadastralCard) !== normCadastral(cadastralEgrn)) {
      addFinding('risk', '1', `Кадастровый номер в карточке объекта (${cadastralCard}) не совпадает с распознанным из выписки (${cadastralEgrn}) — возможно, проверяется не тот объект`)
      problems.push('кадастровый номер не совпадает с выпиской')
    }
    if (cadastralInput && cadastralCard && normCadastral(cadastralInput) !== normCadastral(cadastralCard)) {
      addFinding('warn', '1', `Введённый для проверки кадастровый номер (${cadastralInput}) отличается от карточки объекта (${cadastralCard})`)
      problems.push('введённый номер отличается от карточки')
    }
    const owners = parsed?.owners || []
    const cardOwner = (o.ownerName || '').trim()
    if (owners.length) {
      notes.push(`по выписке правообладатель: ${owners.join(', ')} (распознано автоматически — сверьте с оригиналом)`)
      if (cardOwner) {
        if (!owners.some((owner) => nameMatches(owner, cardOwner))) {
          addFinding('warn', '1', `Собственник в карточке объекта («${cardOwner}») не найден среди правообладателей по выписке (${owners.join(', ')})`)
          problems.push('собственник карточки не совпадает с выпиской')
        }
      } else {
        notes.push('в карточке объекта собственник не указан — сверять не с чем')
      }
      if (owners.length > 1) {
        notes.push('правообладателей несколько — для сделки нужны все сособственники или их согласия')
        addRec('Получите участие или согласие всех сособственников, указанных в выписке ЕГРН')
      }
      items.push(item('1', problems.length ? 'issues' : 'ok', problems.length ? 'Расхождения — см. список рисков и замечаний' : notes.join('. ')))
    } else if (!egrnDoc) {
      addMissing('Выписка из ЕГРН (сведения о правах и правообладателях)')
      items.push(item('1', 'manual', 'Выписка из ЕГРН не загружена — правообладатель не проверен. Система не имеет доступа к ЕГРН в реальном времени'))
    } else {
      const base = manualEgrnItem('1', 'Правообладателя по выписке система не распознала')
      items.push({ ...base, note: cardOwner ? `${base.note}. В карточке объекта собственник: ${cardOwner}` : base.note })
    }
  }

  // --- 2. Сверка собственника с паспортом ----------------------------------
  {
    if (!passportDoc) {
      addMissing('Паспорт собственника (для сверки личности)')
      items.push(item('2', 'issues', 'Паспорт собственника не загружен — сверить личность и ФИО собственника не с чем'))
    } else if (manual.passportCheck === 'match') {
      items.push(item('2', 'ok', 'Сверено юристом с паспортом по оригиналу — расхождений нет'))
    } else if (manual.passportCheck === 'mismatch') {
      addFinding('risk', '2', 'ФИО собственника по документам не совпадает с паспортом — до выяснения обстоятельств сделку не проводить')
      items.push(item('2', 'risk', 'Есть расхождения между документами и паспортом — см. список рисков'))
    } else {
      items.push(item('2', 'manual', 'Паспорт загружен для сверки. Система не распознаёт паспорта и не хранит их данные: сверку собственника с паспортом выполняет юрист визуально по оригиналу, отметки о сверке нет'))
    }
  }

  // --- 3. Вид права и основание приобретения -------------------------------
  {
    const notes: string[] = []
    const problems: string[] = []
    const right = parsed?.rightType || ''
    const basis = parsed?.basis || ''
    if (right) {
      notes.push(`вид права по выписке: ${right}`)
      if (isSale && !/собственн/i.test(right)) {
        addFinding('risk', '3', `Вид права «${right}»: продажа возможна только при праве собственности`)
        problems.push('право не является собственностью')
      } else if (/долев/i.test(right)) {
        notes.push('долевая собственность — при сделке нужны все участники долевой собственности')
      }
    }
    if (basis) {
      notes.push(`основание: ${basis}`)
      if (/наслед/i.test(basis)) {
        if (!hasDocType(docs, 'inheritance')) {
          problems.push('основание — наследство, свидетельство о праве на наследство не загружено')
          addMissing('Свидетельство о праве на наследство')
        }
        addRec('Проверьте полноту круга наследников и истечение сроков оспаривания наследства')
      } else if (/приватизац/i.test(basis)) {
        if (!hasDocType(docs, 'privatization')) {
          problems.push('основание — приватизация, документы приватизации не загружены')
          addMissing('Договор (документы) приватизации')
        }
      } else if (/договор|купли|дарени|мены|ренты/i.test(basis)) {
        if (isSale && !hasDocType(docs, 'title')) {
          problems.push('основание — договор, но сам правоустанавливающий документ не загружен')
          addMissing('Правоустанавливающий документ (ДКП, дарение, мена и др.)')
        }
      } else if (/суд|решени/i.test(basis)) {
        notes.push('право по судебному акту — подтвердите вступление решения в законную силу')
      }
    }
    if (right || basis) {
      items.push(item('3', problems.length ? 'issues' : 'ok', problems.length ? 'Замечания по документам-основаниям — см. список' : notes.join('. ')))
    } else {
      items.push(manualEgrnItem('3', 'Вид права и основание приобретения автоматически не распознаны'))
    }
    if (isSale && !hasDocType(docs, 'title') && !missingDocs.has('Правоустанавливающий документ (ДКП, дарение, мена и др.)')) {
      addMissing('Правоустанавливающий документ (ДКП, дарение, мена и др.)')
    }
  }

  // --- 4. Обременения -------------------------------------------------------
  {
    const encumbrances = parsed?.encumbrances || []
    const serious = encumbrances.filter((e) => SERIOUS_ENCUMBRANCE.test(e.kind))
    const light = encumbrances.filter((e) => !SERIOUS_ENCUMBRANCE.test(e.kind))
    for (const e of serious) {
      addFinding('risk', '4', `В ЕГРН зарегистрировано обременение: ${e.kind}${e.text && e.text !== e.kind ? ` (${e.text})` : ''}. Снимается только после погашения и внесения записи в ЕГРН — до этого сделка невозможна или рискованна`)
    }
    for (const e of light) {
      addFinding('warn', '4', `В ЕГРН указано: ${e.kind}${e.text && e.text !== e.kind ? ` (${e.text})` : ''} — сделка возможна, но условие нужно учесть в договоре`)
      addRec(`Учтите при подготовке сделки: ${e.kind}`)
    }
    if (serious.length) {
      items.push(item('4', 'risk', 'Зарегистрированы обременения, препятствующие сделке — см. список рисков'))
    } else if (light.length) {
      items.push(item('4', 'issues', 'Есть обременения, требующие учёта в сделке'))
    } else if (parsed?.encumbrancesAbsent) {
      items.push(item('4', 'ok', 'По распознанному тексту выписки обременения не зарегистрированы (сверьте с оригиналом документа)'))
    } else if (manual.egrnCheck === 'clear') {
      items.push(item('4', 'ok', 'Юрист сверил выписку ЕГРН по документу — зарегистрированных обременений не выявлено'))
    } else if (manual.egrnCheck === 'encumbrance') {
      addFinding('risk', '4', 'Юрист выявил в выписке ЕГРН обременения (см. комментарий к проверке) — сделку готовить после их снятия')
      items.push(item('4', 'risk', 'Выявлены обременения — см. список рисков'))
    } else if (manual.egrnCheck === 'mismatch') {
      items.push(item('4', 'issues', 'Юрист отметил расхождения в данных выписки (см. комментарий к проверке)'))
    } else if (!egrnDoc) {
      addMissing('Выписка из ЕГРН (проверка обременений)')
      items.push(item('4', 'manual', 'Выписка из ЕГРН не загружена — обременения не проверены. Система не имеет доступа к ЕГРН в реальном времени и не имитирует его'))
    } else {
      items.push(item('4', 'manual', `Обременения по файлу не подтверждены: ${egrnFileNote()}. Их отсутствие подтверждает только текст выписки — проверяет юрист`))
    }
  }

  // --- 5. Судебные и исполнительные риски ----------------------------------
  {
    if (manual.courtCheck === 'found') {
      addFinding('risk', '5', 'Есть сведения о судебных спорах или исполнительных производствах — сделка под риском')
      items.push(item('5', 'risk', 'Зафиксированы судебные споры или взыскания — до урегулирования сделку не проводить'))
      addRec('Выясните предмет и стадию спора (взыскания) до любых действий по сделке')
    } else if (manual.courtCheck === 'clear') {
      items.push(item('5', 'ok', 'Проверено юристом по официальным источникам (ФССП, КАД, ГАС «Правосудие») — сведений не найдено'))
    } else {
      items.push(item('5', 'manual', 'Автоматическая проверка недоступна: у ФССП, КАД и ГАС «Правосудие» нет открытого API для CRM — система не имитирует результат. Проверку выполняет юрист по ссылкам в отчёте'))
      addRec('Юристу: проверьте собственника по банку исполнительных производств ФССП, КАД и ГАС «Правосудие»')
    }
  }

  // --- 6. Банкротство собственника -----------------------------------------
  {
    if (manual.bankruptcyCheck === 'found') {
      addFinding('risk', '6', 'В отношении собственника открыта процедура банкротства — реализация имущества возможна только через конкурсную массу')
      items.push(item('6', 'risk', 'Открыто банкротство собственника — сделка требует участия финансового управляющего'))
      addRec('Согласуйте сделку с финансовым управляющим либо откажитесь от неё до завершения процедуры')
    } else if (manual.bankruptcyCheck === 'clear') {
      items.push(item('6', 'ok', 'Проверено юристом по реестру ЕФРСБ — сведений о банкротстве нет'))
    } else {
      items.push(item('6', 'manual', 'Автоматическая проверка недоступна: у реестра ЕФРСБ нет открытого API для CRM — система не имитирует результат. Проверку выполняет юрист по ссылке в отчёте'))
      addRec('Юристу: проверьте собственника по реестру ЕФРСБ')
    }
  }

  // --- Общие замечания по документам ---------------------------------------
  const egrnDays = egrnDoc?.docDate ? isoDaysAgo(egrnDoc.docDate, now) : Number.NaN
  if (egrnDoc && !egrnDoc.docDate) {
    addRec('Укажите дату выписки из ЕГРН при загрузке — от неё считается актуальность документа')
  } else if (Number.isFinite(egrnDays) && egrnDays > 30) {
    addFinding('info', '1', `Выписка из ЕГРН датируется ${fmtDate(egrnDoc?.docDate)} — для сделки она актуальна не более 30 дней, закажите свежую`)
    addRec('Перед сделкой получите свежую выписку из ЕГРН (не старше 30 дней)')
  }
  if (!egrnDoc) addMissing('Выписка из ЕГРН (основной документ экспертизы)')

  // --- Итог -----------------------------------------------------------------
  const status = worst(items.map((i) => i.status))
  if (status === 'risk') addRec('Приостановите оформление сделки до устранения обстоятельств, отмеченных как риск')
  if (status === 'manual') addRec('Закройте пункты, отмеченные как «нужна ручная проверка»: официальные реестры автоматически не опрашиваются')
  addRec('Оригиналы документов и подлинность подписей сверяет юрист при личной встрече с собственником')
  addRec('Отчёт фиксирует результаты проверок и не заменяет заключение юриста по оригиналам документов')

  // Дата актуальности документов: дата выписки ЕГРН, иначе — самый поздний
  // датированный документ карточки
  let docsActualAt: string | null = null
  if (egrnDoc?.docDate && /^\d{4}-\d{2}-\d{2}$/.test(egrnDoc.docDate)) {
    docsActualAt = new Date(`${egrnDoc.docDate}T00:00:00`).toISOString()
  } else {
    const dates = docs
      .map((d) => (d.docDate && Number.isFinite(new Date(d.docDate).getTime()) ? new Date(d.docDate).getTime() : Number.NaN))
      .filter((t) => Number.isFinite(t))
    if (dates.length) docsActualAt = new Date(Math.max(...dates)).toISOString()
  }

  // --- Пояснения к отчёту: что проверено автоматически, а что нет ----------
  const autoChecks: string[] = []
  if (cadastral) autoChecks.push('Формат кадастрового номера и его совпадение с карточкой объекта')
  autoChecks.push('Комплектность документов карточки (выписка ЕГРН, паспорт, правоустанавливающий документ)')
  if (parsed) autoChecks.push('Разбор загруженной XML-выписки ЕГРН: правообладатели, вид права, основание, обременения')
  if (egrnDoc?.docDate) autoChecks.push('Актуальность выписки ЕГРН (не старше 30 дней)')

  const autoUnavailable: string[] = [
    'Запрос в ЕГРН в реальном времени: у CRM нет доступа к API Росреестра, используются только документы, загруженные в карточку',
    'ФССП, КАД, ГАС «Правосудие»: открытого API нет — проверяет юрист вручную',
    'ЕФРСБ: открытого API нет — проверяет юрист вручную',
  ]
  if (egrnDoc && !parsed) autoUnavailable.push('Распознавание PDF и сканов (OCR): в CRM не выполняется — выписку сверяет юрист по документу')
  autoUnavailable.push('Сверка с паспортом: система не распознаёт паспорта и не хранит их данные — сверку выполняет юрист по оригиналу')

  const sortedFindings = [...findings].sort((a, b) => Number(a.itemKey) - Number(b.itemKey))

  return {
    objectId: o.id,
    objectTitle: o.title || '',
    objectAddress: objectAddressLine(o),
    category: o.category || '',
    dealType: isSale ? 'sale' : 'rent',
    status,
    checkedAt: now.toISOString(),
    docsActualAt,
    checkedBy: '',
    items,
    findings: sortedFindings,
    missingDocs: [...missingDocs],
    recommendations,
    sources: LEGAL_SOURCES,
    docs: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      docTypeLabel: DOC_LABEL[d.docType] || d.docType,
      docDate: d.docDate || null,
      fileName: d.fileName || '',
      size: d.size || 0,
    })),
    extras: {
      cadastralNumber: cadastral,
      cadastralSource,
      ownerCard: (o.ownerName || '').trim(),
      ownersEgrn: parsed?.owners || [],
      rightType: parsed?.rightType || '',
      basis: parsed?.basis || '',
      addressEgrn: parsed?.address || '',
      areaEgrn: parsed?.area || '',
      areaCard: typeof o.area === 'number' && o.area > 0 ? o.area : null,
      encumbrances: (parsed?.encumbrances || []).map((e) => (e.text && e.text !== e.kind ? `${e.kind} — ${e.text}` : e.kind)),
      egrn: {
        status: opts.egrn?.recognized ? 'parsed' : opts.egrn ? 'unrecognized' : 'missing',
        fileName: egrnDoc?.fileName || '',
        format: opts.egrn?.format || '',
        reason: opts.egrn?.reason || '',
        docDate: egrnDoc?.docDate || null,
        notes: opts.egrn?.notes || [],
      },
      manual,
      autoChecks,
      autoUnavailable,
    },
    engineVersion: LEGAL_ENGINE_VERSION,
  }
}

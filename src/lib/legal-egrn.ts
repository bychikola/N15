// ---------------------------------------------------------------------------
// Разбор загруженной выписки ЕГРН — источник данных для «Юридической
// экспертизы объекта» (см. legal-check.ts).
//
// Модуль читает XML-выписку Росреестра («об основных характеристиках и
// зарегистрированных правах») и извлекает только те сведения, которые лежат
// в предсказуемых элементах: кадастровый номер, адрес, площадь,
// правообладателей, вид права, основание приобретения и зарегистрированные
// обременения. Всё извлечённое в отчёте помечается как распознанное
// автоматически из файла — юрист сверяет его с оригиналом.
//
// Если файл не XML (PDF, скан, фото, офисный документ) или структура
// незнакома, функция прямо сообщает, что распознавание невозможно
// (recognized: false), и ничего не домысливает. Отсутствие обременений
// подтверждается только явной формулировкой в документе («отсутствует») —
// при отсутствии раздела обременений они считаются непроверенными.
//
// Модуль без ввода-вывода и внешних зависимостей: разбор — чистая функция
// от байтов файла, поэтому проверяется на образцах выписок.
// ---------------------------------------------------------------------------

export type EgrnFormat = 'xml' | 'pdf' | 'image' | 'office' | 'text' | 'empty' | 'unknown'

export interface EgrnEncumbrance {
  /** Вид обременения, как он назван в выписке (ипотека, аренда, арест…) */
  kind: string
  /** Строка сведений из выписки (сокращённая) */
  text: string
}

export interface EgrnExtract {
  /** Удалось ли распознать данные выписки */
  recognized: boolean
  /** Какой это файл — для честной формулировки в отчёте */
  format: EgrnFormat
  /** Почему данные не распознаны (выводится в отчёте) */
  reason?: string
  cadastralNumber?: string
  address?: string
  area?: string
  rightType?: string
  basis?: string
  owners: string[]
  encumbrances: EgrnEncumbrance[]
  /** В документе прямо указано отсутствие обременений */
  encumbrancesAbsent: boolean
  /** Что не найдено в файле (из-за этого пункт проверит юрист) */
  notes: string[]
}

/** Понятная человеку причина, по которой файл не разбирается автоматически */
const FORMAT_REASON: Record<string, string> = {
  pdf: 'выписка загружена файлом PDF: OCR в CRM нет, PDF автоматически не разбирается — данные сверяет юрист по документу',
  image: 'выписка загружена сканом или фото: OCR в CRM нет, изображения автоматически не разбираются — данные сверяет юрист по документу',
  office: 'выписка загружена файлом Word/Excel: автоматический разбор не выполняется — данные сверяет юрист по документу',
  text: 'выписка загружена текстовым файлом без структуры XML — автоматический разбор не выполняется',
  empty: 'файл выписки пустой',
  unknown: 'формат файла выписки не распознан — автоматический разбор не выполняется',
}

// --- Границы форматов -------------------------------------------------------

const CADASTRAL_RE = /\d{2}:\d{2}:\d{6,7}:\d{1,10}/
/** Защита от «патологического» файла: больше не разбираем */
const MAX_XML_CHARS = 2_000_000
const MAX_XML_NODES = 200_000

const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

function detectFormat(data: Buffer, mimeType?: string | null, fileName?: string | null): EgrnFormat {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim()
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (/^(application\/(msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\..*))$/.test(mime)) return 'office'
  if (mime === 'application/xml' || mime === 'text/xml' || mime === 'application/x-xml') return 'xml'
  if (mime === 'text/plain') return 'text'
  const head = data.subarray(0, 5).toString('latin1')
  if (head.startsWith('%PDF-')) return 'pdf'
  if (head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8) return 'image' // JPEG
  if (head.charCodeAt(0) === 0x89 && head.slice(1, 4) === 'PNG') return 'image'
  if (/\.xml$/i.test(String(fileName || ''))) return 'xml'
  if (data.length === 0) return 'empty'
  return 'unknown'
}

// --- Разбор XML в дерево ----------------------------------------------------

interface XmlNode {
  name: string
  children: XmlNode[]
  text: string
}

/** Имя элемента без префикса пространства имён, в нижнем регистре */
const localName = (name: string): string => {
  const i = name.indexOf(':')
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase()
}

const cleanText = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Текст узла: собственный и всех вложенных элементов через запятую */
function nodeText(node: XmlNode): string {
  const parts: string[] = []
  const push = (n: XmlNode) => {
    const t = cleanText(n.text)
    if (t) parts.push(t)
    for (const c of n.children) push(c)
  }
  const own = cleanText(node.text)
  if (own) parts.push(own)
  for (const c of node.children) push(c)
  return cleanText(parts.join(', '))
}

function* walk(node: XmlNode): Generator<XmlNode> {
  yield node
  for (const child of node.children) yield* walk(child)
}

function parseXmlTree(xml: string): XmlNode | null {
  const clean = stripBom(xml)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  const root: XmlNode = { name: '#root', children: [], text: '' }
  const stack: XmlNode[] = [root]
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g
  let last = 0
  let nodes = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(clean)) !== null) {
    const [full, close, name, , selfClose] = match
    const between = clean.slice(last, match.index)
    if (between.trim()) stack[stack.length - 1].text += between
    last = match.index + full.length
    if (close) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const node: XmlNode = { name, children: [], text: '' }
    stack[stack.length - 1].children.push(node)
    if (!selfClose) stack.push(node)
    if (++nodes > MAX_XML_NODES) break
  }
  const tail = clean.slice(last)
  if (tail.trim()) stack[stack.length - 1].text += tail
  return root.children[0] || null
}

/** Первый непустой узел с одним из имён (без префикса), обход в глубину */
function pickByName(root: XmlNode, names: string[]): XmlNode | undefined {
  const set = new Set(names)
  for (const node of walk(root)) {
    if (set.has(localName(node.name)) && nodeText(node)) return node
  }
  return undefined
}

/** Обрезает подпись до разумной длины, убирая переводы строк */
const excerpt = (s: string, max = 300): string => cleanText(s).slice(0, max)

/** СНИЛС и подобные идентификаторы в отчёт не переносятся */
const maskIds = (s: string): string => s.replace(/\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, '…')

// --- Извлечение полей -------------------------------------------------------

const CADASTRAL_NAMES = [
  'cadastralnumber', 'cadastralnum', 'cadastralno', 'cadastral_code',
  'kadastrnumber', 'kadastrovyynomer', 'kadastrovyinomer', 'cadnumber',
]
const ADDRESS_NAMES = ['address', 'readableaddress', 'addressreadable', 'objectaddress', 'location', 'addressline']
const AREA_NAMES = ['area', 'square', 'totalarea', 'objectarea']
const RIGHT_NAMES = ['righttype', 'rightkind', 'kindright', 'vidprava', 'rightname', 'right']
const BASIS_NAMES = [
  'basis', 'registrationbasis', 'rightbasis', 'documentbasis', 'basisdocument',
  'documentname', 'osnovanie', 'document',
]
const OWNER_NAMES = new Set(['name', 'fio', 'personname', 'fullname', 'rightowner', 'owner'])
/** Контекст, в котором элемент Name — это правообладатель, а не название документа */
const OWNER_CONTEXT_RE = /(holder|owner|person|pravooblad|subject|right)/

const RIGHT_WORDS = /собственн|аренд|хозяйственн|оперативн|пожизненн|наследуем|безвозмездн|сервитут|ипотек|залог|доверительн|концесс|пользован/i
const BASIS_WORDS = /договор|свидетельств|постановлен|решени|акт|приказ|закон|наследств|приватизац|дарени|купли|мены|ренты|контракт/i
const ENCUMBRANCE_STEM = /(encumbrance|obremen|restriction|ogranich|restrict)/
const ENCUMBRANCE_KIND_WORDS = /ипотек|залог|арест|запрет|сервитут|аренд|рент|доверительн|концесс|безвозмездн|хозяйственн|ограничени|обременени/i
const ABSENCE_WORDS = /отсутств|не зарегистр|нет сведений|не числится/i

const PERSON_RE = /^[А-ЯЁ][а-яё'-]+(\s+([А-ЯЁ][а-яё'-]+|[А-ЯЁ]\.\s?[А-ЯЁ]?\.?)){1,2}$/
const ORG_RE = /^(ООО|ОАО|ЗАО|ПАО|АО|ИП|МУП|ГУП|ФГБУ|ФГУП|СНТ|ТСЖ)\s/
const NOT_A_PERSON_RE = /российск(ая|ой) федерац|муниципальн|субъект российской|публично-правов/i

function extractCadastral(root: XmlNode, allText: string): { value?: string; note?: string } {
  const node = pickByName(root, CADASTRAL_NAMES)
  const fromNode = node ? nodeText(node).match(CADASTRAL_RE)?.[0] : undefined
  if (fromNode) return { value: fromNode }
  const fromText = allText.match(CADASTRAL_RE)?.[0]
  if (fromText) return { value: fromText, note: 'кадастровый номер найден в тексте файла по формату — сверьте с оригиналом выписки' }
  return {}
}

function extractAddress(root: XmlNode): string | undefined {
  const node = pickByName(root, ADDRESS_NAMES)
  if (!node) return undefined
  const text = excerpt(nodeText(node), 300)
  return text.length >= 3 ? text : undefined
}

function extractArea(root: XmlNode): string | undefined {
  const node = pickByName(root, AREA_NAMES)
  if (!node) return undefined
  const num = nodeText(node).match(/\d+(?:[.,]\d+)?/)?.[0]
  return num ? num.replace(',', '.') : undefined
}

/**
 * Значение по словарю: среди элементов с такими именами берём самый короткий,
 * текст которого похож на значение (а не на контейнер со всем разделом).
 */
function extractByVocabulary(root: XmlNode, names: string[], words: RegExp, max: number): string | undefined {
  const set = new Set(names)
  const candidates: string[] = []
  for (const node of walk(root)) {
    if (!set.has(localName(node.name))) continue
    const text = excerpt(nodeText(node), max)
    if (text && words.test(text)) candidates.push(text)
  }
  candidates.sort((a, b) => a.length - b.length)
  return candidates[0]
}

function collectOwners(root: XmlNode): string[] {
  const found = new Set<string>()
  const visit = (node: XmlNode, context: string[]) => {
    const name = localName(node.name)
    if (OWNER_NAMES.has(name) && context.some((c) => OWNER_CONTEXT_RE.test(c))) {
      const text = cleanText(nodeText(node))
      if (text.length <= 150 && !NOT_A_PERSON_RE.test(text) && (PERSON_RE.test(text) || ORG_RE.test(text))) {
        found.add(text)
      }
    }
    for (const child of node.children) visit(child, [...context, name])
  }
  visit(root, [])
  return [...found]
}

/** Обременения: только структурные разделы выписки, без поиска слов по всему тексту */
function collectEncumbrances(root: XmlNode): {
  items: EgrnEncumbrance[]
  absent: boolean
  sectionFound: boolean
} {
  const items = new Map<string, EgrnEncumbrance>()
  let absent = false
  let sectionFound = false
  for (const node of walk(root)) {
    if (!ENCUMBRANCE_STEM.test(localName(node.name))) continue
    const text = nodeText(node)
    if (!text) continue
    sectionFound = true
    const typed = node.children.find((c) => /(type|kind|vid|name)/.test(localName(c.name)) && ENCUMBRANCE_KIND_WORDS.test(nodeText(c)))
    const kindMatch = text.match(ENCUMBRANCE_KIND_WORDS)
    if (typed || kindMatch) {
      const kind = (typed ? nodeText(typed) : kindMatch?.[0] || '').trim()
      const key = kind.toLowerCase()
      if (kind && !items.has(key)) items.set(key, { kind: excerpt(kind, 80), text: maskIds(excerpt(text, 240)) })
    } else if (ABSENCE_WORDS.test(text)) {
      absent = true
    }
  }
  return { items: [...items.values()], absent, sectionFound }
}

// --- Точка входа ------------------------------------------------------------

export function parseEgrnExtract(input: {
  data: Buffer
  mimeType?: string | null
  fileName?: string | null
}): EgrnExtract {
  const base: EgrnExtract = { recognized: false, format: 'unknown', owners: [], encumbrances: [], encumbrancesAbsent: false, notes: [] }
  const data = input.data
  if (!data || !data.length) return { ...base, format: 'empty', reason: FORMAT_REASON.empty }

  const format = detectFormat(data, input.mimeType, input.fileName)
  if (format === 'pdf' || format === 'image' || format === 'office') {
    return { ...base, format, reason: FORMAT_REASON[format] }
  }

  const text = stripBom(data.subarray(0, MAX_XML_CHARS).toString('utf8'))
  const looksXml = /^\s*(<\?xml|<!--|<[A-Za-z_][\w.:-]*[\s>/])/.test(text.slice(0, 500))
  if (!looksXml) {
    return { ...base, format, reason: FORMAT_REASON[format === 'empty' ? 'empty' : format === 'unknown' ? 'unknown' : 'text'] }
  }

  const root = parseXmlTree(text)
  if (!root) return { ...base, format, reason: 'структуру XML разобрать не удалось' }

  const notes: string[] = []
  const allText = cleanText(text)
  const cadastral = extractCadastral(root, allText)
  const address = extractAddress(root)
  const area = extractArea(root)
  const rightType = extractByVocabulary(root, RIGHT_NAMES, RIGHT_WORDS, 120)
  const basis = extractByVocabulary(root, BASIS_NAMES, BASIS_WORDS, 300)
  const owners = collectOwners(root)
  const enc = collectEncumbrances(root)

  if (!cadastral.value) notes.push('кадастровый номер в файле не найден')
  if (!owners.length) notes.push('правообладатели в файле не найдены')
  if (!rightType) notes.push('вид права в файле не найден')
  if (!basis) notes.push('основание приобретения в файле не найдено')
  if (!enc.sectionFound) notes.push('раздел обременений в файле не найден — их отсутствие по файлу не подтверждается')

  const foundFields = [cadastral.value, address, area, rightType, basis, owners.length ? 'owners' : ''].filter(Boolean).length
  const recognized = foundFields >= 2

  if (!recognized) {
    return {
      ...base,
      format,
      owners,
      encumbrances: enc.items,
      encumbrancesAbsent: false,
      notes,
      reason: 'структура файла не распознана как выписка ЕГРН (незнакомая схема) — данные сверяет юрист по документу',
    }
  }

  return {
    recognized: true,
    format,
    cadastralNumber: cadastral.value,
    address,
    area,
    rightType,
    basis,
    owners,
    encumbrances: enc.items,
    encumbrancesAbsent: enc.absent && !enc.items.length,
    notes: [...notes, ...(cadastral.note ? [cadastral.note] : [])],
  }
}

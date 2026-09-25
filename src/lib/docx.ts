// ---------------------------------------------------------------------------
// Минимальный сборщик DOCX без внешних зависимостей (в проекте нет библиотек
// для офисных форматов, ставить их запрещено). DOCX — это ZIP с XML внутри,
// поэтому файл собирается вручную: свой CRC32, свой ZIP на node:zlib и четыре
// части OOXML ([Content_Types].xml, _rels/.rels, word/document.xml,
// word/styles.xml). Ничего лишнего: абзацы с двумя-тремя видами оформления —
// этого достаточно для печатной формы правового документа.
//
// Формат страницы — A4 (11906 × 16838 twips) с полями как у документа Word по
// умолчанию, поэтому файл открывается и печатается без правок. В подвале —
// название документа и номер страницы (поле PAGE), подвал собирается в footer1.xml
// и подключается через word/_rels/document.xml.rels.
//
// Шрифт — Times New Roman: DOCX, в отличие от PDF (см. pdf.ts), несёт только
// имя шрифта, а не сам шрифт, поэтому кириллица отображается на любом
// устройстве без встраивания файла.
// ---------------------------------------------------------------------------

import { deflateRawSync } from 'node:zlib'

/** Абзац — всё, что умеет сборщик: текст плюс оформление одного вида */
export interface DocxParagraphOptions {
  /** Кегль в полупунктах Word: 24 = 12 pt */
  size?: number
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right' | 'justify'
  /** Отступ первой строки в twips (567 = 1 см) */
  indent?: number
  /** Интервал после абзаца в twips (240 = 12 pt) */
  after?: number
  /** Межстрочный интервал: 240 = одинарный */
  line?: number
}

// --- ZIP -------------------------------------------------------------------

/** Таблица CRC32 (полином 0xEDB88320) — считается один раз на процесс */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (buf: Buffer): number => {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
}

/**
 * Сборка ZIP (deflate). Имена частей латинские и короткие, поэтому флаг UTF-8
 * не нужен, а дата и время файлов фиксированные — одинаковый документ даёт
 * побайтово одинаковый файл.
 */
function zip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'latin1')
    const deflated = deflateRawSync(entry.data, { level: 9 })
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // сигнатура локального заголовка
    local.writeUInt16LE(20, 4) // версия для распаковки (2.0)
    local.writeUInt16LE(0, 6) // флаги
    local.writeUInt16LE(8, 8) // сжатие — deflate
    local.writeUInt16LE(0, 10) // время (фиксированное)
    local.writeUInt16LE(0x21, 12) // дата: 1 января 1980
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(deflated.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // длина extra-поля

    chunks.push(local, name, deflated)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0) // сигнатура записи центрального каталога
    dir.writeUInt16LE(20, 4) // версия сборщика
    dir.writeUInt16LE(20, 6) // версия для распаковки
    dir.writeUInt16LE(0, 8) // флаги
    dir.writeUInt16LE(8, 10) // сжатие — deflate
    dir.writeUInt16LE(0, 12) // время
    dir.writeUInt16LE(0x21, 14) // дата
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(deflated.length, 20)
    dir.writeUInt32LE(entry.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt16LE(0, 30) // extra
    dir.writeUInt16LE(0, 32) // комментарий
    dir.writeUInt16LE(0, 34) // номер диска
    dir.writeUInt16LE(0, 36) // внутренние атрибуты
    dir.writeUInt32LE(0, 38) // внешние атрибуты
    dir.writeUInt32LE(offset, 42) // смещение локального заголовка
    central.push(dir, name)

    offset += local.length + name.length + deflated.length
  }

  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // сигнатура конца центрального каталога
  end.writeUInt16LE(0, 4) // номер диска
  end.writeUInt16LE(0, 6) // диск с каталогом
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // комментарий

  return Buffer.concat([...chunks, centralBuf, end])
}

// --- XML -------------------------------------------------------------------

/** Экранирование текста для XML: без него амперсанд и угловые скобки ломают файл */
const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Разрыв строки внутри абзаца (текст документа приходит с переводами строк) */
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/**
 * Сборщик документа. Порядок вызовов = порядок абзацев в файле; страницы
 * размечает сам Word, поэтому «разложить по страницам» здесь нечего.
 */
export class DocxBuilder {
  private readonly parts: string[] = []
  private readonly footer: string
  private readonly defaultSize: number

  constructor(footer = '', opts: { size?: number } = {}) {
    this.footer = footer
    this.defaultSize = opts.size ?? 24
  }

  /** Заголовок документа: крупно и по центру — шапка печатной формы */
  title(text: string): this {
    return this.paragraph(text, { size: 32, bold: true, align: 'center', after: 120 })
  }

  /** Подзаголовок под названием документа */
  subtitle(text: string): this {
    return this.paragraph(text, { size: 24, italic: true, align: 'center', after: 240 })
  }

  /** Заголовок раздела */
  heading(text: string): this {
    return this.paragraph(text, { size: 26, bold: true, after: 120, line: 276 })
  }

  /** Абзац текста. Переводы строк внутри текста сохраняются как разрывы */
  paragraph(text: string, opts: DocxParagraphOptions = {}): this {
    const size = opts.size ?? this.defaultSize
    const props = [
      `<w:spacing w:before="0" w:after="${opts.after ?? 120}" w:line="${opts.line ?? 276}" w:lineRule="auto"/>`,
      opts.indent ? `<w:ind w:firstLine="${opts.indent}"/>` : '',
      opts.align ? `<w:jc w:val="${opts.align}"/>` : '<w:jc w:val="both"/>',
    ].join('')

    // Первый кусок идёт сразу после свойств абзаца, остальные — через <w:br/>
    const runs = text
      .split('\n')
      .map((line, index) => {
        const br = index > 0 ? '<w:br/>' : ''
        return `<w:r>${this.runProps(opts, size)}${br}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`
      })
      .join('')

    this.parts.push(`<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`)
    return this
  }

  /** Пустая строка-разделитель */
  gap(): this {
    return this.paragraph('', { after: 0 })
  }

  private runProps(opts: DocxParagraphOptions, size: number): string {
    const props = [
      `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`,
      opts.bold ? '<w:b/>' : '',
      opts.italic ? '<w:i/>' : '',
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    ].join('')
    return `<w:rPr>${props}</w:rPr>`
  }

  /** Собрать файл. Возвращает Buffer — его отдаёт маршрут скачивания */
  build(): Buffer {
    const document =
      `${XML_DECL}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>` +
      this.parts.join('') +
      '<w:sectPr>' +
      (this.footer ? '<w:footerReference w:type="default" r:id="rId2"/>' : '') +
      '<w:pgSz w:w="11906" w:h="16838"/>' + // A4: 210 × 297 мм в twips
      '<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>'

    const entries: ZipEntry[] = [
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes(), 'utf8') },
      { name: '_rels/.rels', data: Buffer.from(rootRels(), 'utf8') },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(documentRels(), 'utf8') },
      { name: 'word/styles.xml', data: Buffer.from(styles(), 'utf8') },
      { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
    ]
    if (this.footer) {
      entries.push({ name: 'word/footer1.xml', data: Buffer.from(this.footerXml(), 'utf8') })
    }

    return zip(entries)
  }

  /** Подвал: название документа слева, «стр. N» справа — поле PAGE */
  private footerXml(): string {
    const pageField =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>1</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    const tabs = '<w:pPr><w:tabs><w:tab w:val="right" w:pos="9639"/></w:tabs>' +
      '<w:rPr><w:sz w:val="18"/><w:color w:val="6B6B6B"/></w:rPr></w:pPr>'
    return (
      `${XML_DECL}<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p>${tabs}` +
      `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6B6B6B"/></w:rPr><w:t xml:space="preserve">${esc(this.footer)}</w:t></w:r>` +
      `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6B6B6B"/></w:rPr><w:tab/></w:r>` +
      `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6B6B6B"/></w:rPr><w:t xml:space="preserve">стр. </w:t></w:r>` +
      pageField +
      '</w:p></w:ftr>'
    )
  }
}

// --- Части пакета OOXML -----------------------------------------------------

const contentTypes = (): string =>
  `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '</Types>'

const rootRels = (): string =>
  `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>'

const documentRels = (): string =>
  `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
  '</Relationships>'

/**
 * Стили документа: обычный текст и заголовки. Word откроет файл и без них, но
 * со стилями работает навигация по заголовкам и «Структура документа».
 */
const styles = (): string =>
  `${XML_DECL}<w:styles xmlns:w="${W_NS}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
  '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
  '<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr>' +
  '<w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>' +
  '</w:styles>'

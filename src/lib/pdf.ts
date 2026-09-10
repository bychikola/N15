// ---------------------------------------------------------------------------
// Минимальный генератор PDF без внешних зависимостей (в проекте нет pdf-либ,
// ставить их запрещено). Для кириллицы в PDF встраивается TTF-шрифт сайта
// public/fonts/NewStandard-Regular.ttf целиком (CIDFontType2 + Identity-H,
// коды символов = gid из cmap шрифта). Используется только для отчёта
// «Юридической проверки объекта» (см. legal-report-pdf.ts).
//
// Отрисовка идёт «сверху вниз»: y уменьшается от верхнего поля к нижнему.
// Страницы создаются лениво — когда текст не влезает, открывается следующая;
// итоговое число страниц известно только в build(), поэтому колонтитулы
// добавляются там же, в конце потока каждой страницы.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'

// --- Разбор TTF (только таблицы, нужные для текста) ------------------------

interface ParsedFont {
  upem: number
  ascent: number
  descent: number
  capHeight: number
  bbox: [number, number, number, number]
  /** gid → ширина (в font units) */
  widthOf: (gid: number) => number
  /** charCode → gid (0 — нет глифа) */
  gidOf: (code: number) => number
  data: Buffer
}

let cachedFont: ParsedFont | null = null
let fontLoadError: string | null = null

/** Чтение и разбор шрифта (лениво, с кэшем на время жизни процесса) */
function loadFont(): ParsedFont {
  if (cachedFont) return cachedFont
  if (fontLoadError) throw new Error(fontLoadError)
  try {
    const file = path.join(process.cwd(), 'public', 'fonts', 'NewStandard-Regular.ttf')
    const b = fs.readFileSync(file)
    const table = (tag: string) => {
      const num = b.readUInt16BE(4)
      for (let i = 0; i < num; i++) {
        const o = 12 + i * 16
        if (b.toString('latin1', o, o + 4) === tag) {
          return { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) }
        }
      }
      throw new Error(`В шрифте нет таблицы ${tag}`)
    }

    // head: unitsPerEm и bbox
    const head = table('head')
    const upem = b.readUInt16BE(head.off + 18)
    const bbox: [number, number, number, number] = [
      b.readInt16BE(head.off + 36),
      b.readInt16BE(head.off + 38),
      b.readInt16BE(head.off + 40),
      b.readInt16BE(head.off + 42),
    ]
    const hhea = table('hhea')
    const ascent = b.readInt16BE(hhea.off + 4)
    const descent = b.readInt16BE(hhea.off + 6)

    // maxp: число глифов; hmtx: метрики ширин (для /W и расчёта переносов)
    const maxp = table('maxp')
    const numberOfHMetrics = b.readUInt16BE(maxp.off + 34)
    const hmtx = table('hmtx')
    const advances: number[] = []
    for (let i = 0; i < numberOfHMetrics; i++) {
      advances.push(b.readUInt16BE(hmtx.off + i * 4))
    }
    const lastAdvance = advances[advances.length - 1] || 0
    const widthOf = (gid: number): number =>
      gid < numberOfHMetrics ? advances[gid] : lastAdvance

    // cmap: поддерживаем формат 12 (Unicode-группы) и 4 (сегменты)
    const cmap = table('cmap')
    const nTables = b.readUInt16BE(cmap.off + 2)
    let cmap12: { off: number; groups: number } | null = null
    let cmap4: { off: number } | null = null
    for (let i = 0; i < nTables; i++) {
      const e = cmap.off + 4 + i * 8
      const platform = b.readUInt16BE(e)
      if (platform !== 3 && platform !== 0) continue
      const sub = cmap.off + b.readUInt32BE(e + 4)
      const fmt = b.readUInt16BE(sub)
      if (fmt === 12) cmap12 = { off: sub, groups: b.readUInt32BE(sub + 12) }
      if (fmt === 4) cmap4 = { off: sub }
    }
    const gidOf = (code: number): number => {
      if (cmap12) {
        const o = cmap12.off
        for (let i = 0; i < cmap12.groups; i++) {
          const g = o + 16 + i * 12
          const s = b.readUInt32BE(g)
          const e = b.readUInt32BE(g + 4)
          if (code >= s && code <= e) return b.readUInt32BE(g + 8) + (code - s)
        }
        return 0
      }
      if (cmap4) {
        const o = cmap4.off
        const segX2 = b.readUInt16BE(o + 6)
        for (let s = 0; s < segX2 / 2; s++) {
          const seg = o + 14 + s * 8
          const end = b.readUInt16BE(seg)
          const start = b.readUInt16BE(seg + 4)
          if (code >= start && code <= end) {
            const idDelta = b.readInt16BE(seg + 6)
            const ro = b.readUInt16BE(seg + 2)
            if (ro === 0) return (code + idDelta) % 65536
            const gi = o + 16 + segX2 + ro + (code - start) * 2
            const g = b.readUInt16BE(gi)
            return g ? (g + idDelta) % 65536 : 0
          }
        }
      }
      return 0
    }

    cachedFont = {
      upem, ascent, descent,
      capHeight: Math.round(ascent * 0.72),
      bbox, widthOf, gidOf, data: b,
    }
    return cachedFont
  } catch (e) {
    fontLoadError = `Не удалось загрузить шрифт для PDF: ${String(e)}`
    throw new Error(fontLoadError)
  }
}

// --- Текст в глифы ----------------------------------------------------------

/** hex-последовательность gid строки (Identity-H: код символа = gid) */
function textToHex(font: ParsedFont, text: string, used: Set<number>): string {
  let hex = ''
  for (const ch of text) {
    const gid = font.gidOf(ch.codePointAt(0)!)
    if (!gid) continue // нет глифа в шрифте — символ пропускаем
    used.add(gid)
    hex += gid.toString(16).padStart(4, '0')
  }
  return hex
}

/** Ширина строки в pt при заданном кегле */
function textWidth(font: ParsedFont, text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    const gid = font.gidOf(ch.codePointAt(0)!)
    if (gid) w += font.widthOf(gid)
  }
  return (w / font.upem) * size
}

/** Разбивка текста на строки по ширине (длинные слова переносятся посимвольно) */
function wrapText(font: ParsedFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  const tokens = text.split(/(\s+)/)
  let line = ''
  let lineW = 0
  const spaceW = textWidth(font, ' ', size)
  for (const token of tokens) {
    if (!token) continue
    if (/^\s+$/.test(token)) {
      line += ' '
      lineW += spaceW
      continue
    }
    let word = token
    let w = textWidth(font, word, size)
    while (w > maxWidth && word.length > 1) {
      // Слово не влезает целиком: отрезаем от него самую длинную часть-строку
      let cut = 1
      while (cut < word.length && textWidth(font, word.slice(0, cut + 1), size) <= maxWidth) cut++
      const part = word.slice(0, cut)
      if (line) {
        lines.push(line.trimEnd())
        line = ''
        lineW = 0
      }
      lines.push(part.trimEnd())
      word = word.slice(cut)
      w = textWidth(font, word, size)
    }
    if (lineW + w > maxWidth && line) {
      lines.push(line.trimEnd())
      line = word
      lineW = w
    } else {
      line += word
      lineW += w
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd())
  return lines
}

// --- Сборка PDF -------------------------------------------------------------

const PAGE_W = 595.28 // A4 в pt
const PAGE_H = 841.89
/** hex-цифр в одном <...> Tj — очень длинные строки режутся на операторы */
const HEX_CHUNK = 512

interface PageSpec {
  stream: string[]
}

/**
 * Построитель документа. Использование:
 *   const pdf = new PdfBuilder(size, margin)
 *   pdf.hr() / pdf.heading(...) / pdf.paragraph(...) / pdf.box(...) / pdf.gap(...)
 *   const buffer = pdf.build('подпись в колонтитуле')
 */
export class PdfBuilder {
  private font = loadFont()
  private size: number
  private margin: number
  private pages: PageSpec[] = []
  private cur: PageSpec
  private x: number
  private y: number
  /** gid, реально использованные в документе (для /W в дескрипторе шрифта) */
  private usedGids = new Set<number>()

  constructor(size = 9.5, margin = 42) {
    this.size = size
    this.margin = margin
    this.x = margin
    this.y = PAGE_H - margin
    this.cur = { stream: [] }
    this.pages.push(this.cur)
  }

  /** Нижняя граница текста (над колонтитулом) */
  private get bottomLimit(): number {
    return this.margin + 22
  }

  private newPage() {
    this.cur = { stream: [] }
    this.pages.push(this.cur)
    this.x = this.margin
    this.y = PAGE_H - this.margin
  }

  /** Если высота h не влезает до нижней границы — переворачиваем страницу */
  private ensure(h: number) {
    if (this.y - h < this.bottomLimit) this.newPage()
  }

  /** Вертикальный отступ (с переходом на новую страницу при необходимости) */
  gap(h = 8) {
    if (this.y - h < this.bottomLimit) this.newPage()
    else this.y -= h
  }

  /** Линия-разделитель на всю ширину текста */
  hr() {
    this.gap(5)
    const w = PAGE_W - this.margin * 2
    this.push(`q 0.55 w 0.62 0.58 0.5 RG ${this.x.toFixed(2)} ${this.y.toFixed(2)} m ${(this.x + w).toFixed(2)} ${this.y.toFixed(2)} l S Q`)
    this.y -= 6
  }

  private push(op: string) {
    this.cur.stream.push(op)
  }

  /** Набор строки текста в текущей позиции (x сдвинут на indent) */
  private pushTextLine(text: string, size: number, indent: number) {
    const hex = textToHex(this.font, text, this.usedGids)
    if (!hex) return
    const ops: string[] = [`BT /F1 ${size.toFixed(2)} Tf ${(this.x + indent).toFixed(2)} ${this.y.toFixed(2)} Td`]
    for (let i = 0; i < hex.length; i += HEX_CHUNK) {
      ops.push(`<${hex.slice(i, i + HEX_CHUNK)}> Tj`)
    }
    this.push(`${ops.join(' ')} ET`)
  }

  /**
   * Абзац с переносами.
   * opts.size — кегль; opts.indent — отступ ВСЕХ строк (для списков с номером);
   * opts.gapAfter — отступ после абзаца.
   */
  paragraph(text: string, opts: { size?: number; indent?: number; gapAfter?: number } = {}) {
    const size = opts.size || this.size
    const indent = opts.indent || 0
    const lineH = size * 1.42
    const maxW = PAGE_W - this.margin * 2 - indent
    for (const line of wrapText(this.font, text, size, maxW)) {
      this.ensure(lineH)
      this.pushTextLine(line, size, indent)
      this.y -= lineH
    }
    if (opts.gapAfter) this.y -= opts.gapAfter
  }

  /** Заголовок секции с тонким подчёркиванием */
  heading(text: string, size = 11.5) {
    const lineH = size * 1.5
    this.ensure(lineH + 8)
    this.pushTextLine(text, size, 0)
    const w = textWidth(this.font, text, size)
    this.y -= 3
    this.push(`q 0.9 w 0.35 0.3 0.28 RG ${this.x.toFixed(2)} ${this.y.toFixed(2)} m ${(this.x + w).toFixed(2)} ${this.y.toFixed(2)} l S Q`)
    this.y -= lineH - 3 + 3
  }

  /**
   * Рамка с текстом внутри (дисклеймер в шапке отчёта). Текст переносится по
   * ширине рамки, высота рамки вычисляется по числу строк.
   */
  box(text: string, opts: { size?: number; pad?: number } = {}) {
    const size = opts.size || 9
    const pad = opts.pad || 7
    const lineH = size * 1.4
    const maxW = PAGE_W - this.margin * 2 - pad * 2
    const lines = wrapText(this.font, text, size, maxW)
    const blockH = lines.length * lineH + pad * 2
    this.ensure(blockH + 6)
    const yTop = this.y
    this.push(`q 1 w 0.62 0.42 0.28 RG ${this.x.toFixed(2)} ${(yTop - blockH).toFixed(2)} ${(PAGE_W - this.margin * 2).toFixed(2)} ${blockH.toFixed(2)} re S Q`)
    let yy = yTop - pad - lineH
    for (const line of lines) {
      this.y = yy + size * 0.9
      this.pushTextLine(line, size, pad)
      yy -= lineH
    }
    this.y = yTop - blockH - 6
  }

  /**
   * Колонтитулы всех страниц: внизу слева обязательная оговорка, справа —
   * подпись и номер страницы. Вызывается в build() — тогда известно число
   * страниц. Операции дописываются в конец потока каждой страницы (текст
   * документа никогда не доходит до этой зоны).
   */
  private applyFooters(caption: string) {
    const total = this.pages.length
    for (let i = 0; i < total; i++) {
      const page = this.pages[i]
      const size = 6.8
      const y = this.margin - 16
      const left = 'Предварительная проверка. Не заменяет заключение юриста и официальные документы'
      const right = `${caption} · стр. ${i + 1} из ${total}`
      page.stream.push(`q 0.4 w 0.62 0.58 0.5 RG ${this.margin} ${(y + 5.5).toFixed(2)} m ${(PAGE_W - this.margin).toFixed(2)} ${(y + 5.5).toFixed(2)} l S Q`)
      const leftHex = textToHex(this.font, left, this.usedGids)
      page.stream.push(`BT /F1 ${size.toFixed(2)} Tf ${this.margin} ${y} Td <${leftHex}> Tj ET`)
      const wR = textWidth(this.font, right, size)
      const rightHex = textToHex(this.font, right, this.usedGids)
      page.stream.push(`BT /F1 ${size.toFixed(2)} Tf ${(PAGE_W - this.margin - wR).toFixed(2)} ${y} Td <${rightHex}> Tj ET`)
    }
  }

  /** Итоговая сборка файла. caption — подпись в правом нижнем углу страниц */
  build(caption = ''): Buffer {
    this.applyFooters(caption)
    const font = this.font
    const usedGidsSorted = [...this.usedGids].sort((a, b) => a - b)

    // /W: сегменты подряд идущих gid с ширинами в 1/1000 em
    const widthSegments: string[] = []
    let i = 0
    while (i < usedGidsSorted.length) {
      let j = i
      while (j + 1 < usedGidsSorted.length && usedGidsSorted[j + 1] === usedGidsSorted[j] + 1) j++
      const widths = usedGidsSorted.slice(i, j + 1).map((g) => Math.round((font.widthOf(g) / font.upem) * 1000)).join(' ')
      widthSegments.push(`[${usedGidsSorted[i]} [${widths}]]`)
      i = j + 1
    }
    const wArray = widthSegments.length ? widthSegments.join(' ') : '[0 [0]]'
    const scale1000 = (v: number) => Math.round((v / font.upem) * 1000)

    // Объекты: 1 Catalog, 2 Pages, 3 Type0, 4 CIDFont, 5 FontDescriptor,
    // 6 FontFile2, дальше на каждую страницу: N+1 Page, N+2 Contents
    const objCount = 6 + this.pages.length * 2
    const pageObjIds = this.pages.map((_, idx) => 7 + idx * 2)
    const contentObjIds = this.pages.map((_, idx) => 8 + idx * 2)

    const parts: Buffer[] = []
    const offsets = new Array<number>(objCount).fill(0)
    let total = 0
    const pushRaw = (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk
      parts.push(buf)
      total += buf.length
    }
    const pushObj = (n: number, body: string) => {
      offsets[n] = total
      pushRaw(`${n} 0 obj\n${body}\nendobj\n`)
    }

    pushRaw('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n') // двоичный маркер — «это PDF»
    pushObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    pushObj(2, `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`)
    const fontName = 'NewStandard'
    pushObj(
      3,
      `<< /Type /Font /Subtype /Type0 /BaseFont /${fontName} /Encoding /Identity-H /DescendantFonts [4 0 R] >>`,
    )
    pushObj(
      4,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${fontName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 /W ${wArray} /CIDToGIDMap /Identity >>`,
    )
    pushObj(
      5,
      `<< /Type /FontDescriptor /FontName /${fontName} /Flags 4 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${scale1000(font.ascent)} /Descent ${scale1000(font.descent)} /CapHeight ${scale1000(font.capHeight)} /StemV 80 /FontFile2 6 0 R >>`,
    )
    // Встроенный TTF целиком (без сабсеттинга — Identity-H допускает)
    offsets[6] = total
    pushRaw(`6 0 obj\n<< /Length1 ${font.data.length} /Length ${font.data.length} >>\nstream\n`)
    pushRaw(font.data)
    pushRaw('\nendstream\nendobj\n')

    for (let idx = 0; idx < this.pages.length; idx++) {
      const stream = this.pages[idx].stream.join('')
      pushObj(
        pageObjIds[idx],
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjIds[idx]} 0 R >>`,
      )
      pushObj(contentObjIds[idx], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    }

    // xref и trailer
    const xrefPos = total
    let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`
    for (let n = 1; n < objCount; n++) {
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
    }
    pushRaw(xref)
    pushRaw(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
    return Buffer.concat(parts)
  }
}

/** Проверка собранного файла: xref-смещения сходятся и есть %%EOF */
export function checkPdfStructure(buf: Buffer): boolean {
  const s = buf.toString('latin1')
  const eof = s.lastIndexOf('%%EOF')
  const startxref = s.lastIndexOf('startxref')
  if (eof < 0 || startxref < 0 || eof < startxref) return false
  const pos = Number(s.slice(startxref + 9, eof).trim())
  if (!Number.isInteger(pos) || pos <= 0) return false
  const xref = s.slice(pos, s.indexOf('trailer', pos))
  const m = /^xref\n0 (\d+)\n0000000000 65535 f \n/.exec(xref)
  if (!m) return false
  const count = Number(m[1])
  const body = xref.split('\n').slice(2, 2 + count)
  for (let n = 1; n < count; n++) {
    const row = body[n]
    if (!row) return false
    const off = Number(row.slice(0, 10))
    if (!s.startsWith(`${n} 0 obj`, off)) return false
  }
  return true
}

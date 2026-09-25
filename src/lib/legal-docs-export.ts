// ---------------------------------------------------------------------------
// Выгрузка правовых документов раздела «Документы» в файл: PDF (кнопка
// «Скачать PDF») и DOCX (кнопка «Скачать DOCX»). Обе раскладки — из одного
// описания документа (см. legal-docs.ts), поэтому страница, PDF и DOCX не
// расходятся по тексту: заголовок, редакция, версия, вводный абзац, разделы,
// оговорка и реквизиты берутся из одного места.
//
// Библиотек для офисных форматов в проекте нет и ставить их запрещено:
// PDF собирает свой генератор с встроенным кириллическим шрифтом (см. pdf.ts),
// DOCX — свой сборщик ZIP+OOXML (см. docx.ts). А4 получается сам собой: в PDF
// страница задана как 595.28 × 841.89 pt, в DOCX — как 11906 × 16838 twips.
//
// Текст политики обработки персональных данных в этом модуле не дублируется:
// разделы приходят из legalDocSections() — для политики это её страница /privacy
// на языке открытой страницы (ru или os).
// ---------------------------------------------------------------------------

import { DocxBuilder } from './docx'
import { PdfBuilder, checkPdfStructure } from './pdf'
import { legalDocSections } from './legal-docs-content'
import { LEGAL_OPERATOR, legalDocFileBase, operatorRequisites, type LegalDoc } from './legal-docs'

/** Что получилось: файл, его имя для скачивания и тип содержимого */
export interface LegalDocFile {
  data: Buffer
  filename: string
  contentType: string
}

/** Дата выгрузки словами: «26 сентября 2026 года» — как на страницах сайта */
const todayText = (): string =>
  new Date()
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    // toLocaleDateString обрывает дату на «г.»: в предложении это давало
    // двойную точку («выгружен 26 сентября 2026 г..»), поэтому год пишем словом
    .replace(/\s*г\.$/, ' года')

/** Строка «Редакция … версия …» — одинаковая на странице, в PDF и в DOCX */
export const legalDocRevisionText = (doc: LegalDoc): string =>
  `Редакция документа: ${doc.updated}. Версия: ${doc.version}.`

/**
 * Оговорки о редакции: у составного документа вместо собственной версии
 * показываются версии источников — иначе составные правила выглядели бы как
 * отдельная редакция того же текста.
 */
const revisionLines = (doc: LegalDoc): string[] =>
  doc.sources && doc.sources.length ? [legalDocRevisionText(doc), ...doc.sources] : [legalDocRevisionText(doc)]

/** Подпись в подвале каждой страницы / название документа в колонтитуле */
const footerNote = (doc: LegalDoc): string =>
  `${doc.title} · ${LEGAL_OPERATOR.site} · ${doc.updated}`

/**
 * PDF документа. Шрифт встраивается в файл (см. pdf.ts), поэтому кириллица
 * отображается на любом устройстве и при печати с телефона.
 */
export function renderLegalDocPdf(doc: LegalDoc, lang = 'ru'): Buffer {
  const pdf = new PdfBuilder(9.8, 46)

  // --- Шапка ---------------------------------------------------------------
  pdf.heading(doc.title, 13)
  pdf.paragraph(doc.subtitle, { size: 9, gapAfter: 2 })
  for (const line of revisionLines(doc)) {
    pdf.paragraph(line, { size: 8.6, gapAfter: 0.8 })
  }
  pdf.gap(3)

  // --- Вводный абзац в рамке ----------------------------------------------
  pdf.box(doc.intro)
  pdf.gap(4)

  // --- Разделы -------------------------------------------------------------
  const sections = legalDocSections(doc, lang)
  sections.forEach((section, index) => {
    pdf.heading(section.title, 10.5)
    for (const line of section.text.split('\n')) {
      if (line.trim()) pdf.paragraph(line, { size: 9.2, gapAfter: 1.4 })
    }
    // Между разделами — чуть больше воздуха, после последнего отступ не нужен
    if (index < sections.length - 1) pdf.gap(3)
  })

  // --- Оговорка и выходные данные -----------------------------------------
  if (doc.note) {
    pdf.gap(3)
    pdf.box(doc.note, { size: 8.6 })
  }
  pdf.gap(4)
  pdf.hr()
  pdf.paragraph(operatorRequisites(), { size: 8.6, gapAfter: 1 })
  pdf.paragraph(
    `Документ опубликован на сайте ${LEGAL_OPERATOR.site} и выгружен ${todayText()}. ` +
      'Актуальная редакция — на странице документа: печатная форма повторяет текст страницы на дату выгрузки.',
    { size: 8.2, gapAfter: 0 },
  )

  return pdf.build(doc.title, footerNote(doc))
}

/**
 * DOCX документа. Word откроет файл на телефоне и на компьютере: страница A4,
 * поля и подвал с номером страницы заданы в docx.ts.
 */
export function renderLegalDocDocx(doc: LegalDoc, lang = 'ru'): Buffer {
  const docx = new DocxBuilder(footerNote(doc))

  docx.title(doc.title)
  docx.subtitle(doc.subtitle)
  for (const line of revisionLines(doc)) {
    docx.paragraph(line, { size: 20, align: 'center', after: 40 })
  }
  docx.gap()
  docx.paragraph(doc.intro, { size: 22, italic: true, after: 240 })

  for (const section of legalDocSections(doc, lang)) {
    docx.heading(section.title)
    for (const line of section.text.split('\n')) {
      if (line.trim()) docx.paragraph(line, { indent: 567 })
    }
    docx.gap()
  }

  if (doc.note) docx.paragraph(doc.note, { size: 20, italic: true, after: 200 })
  docx.paragraph(operatorRequisites(), { size: 20, after: 60 })
  docx.paragraph(
    `Документ опубликован на сайте ${LEGAL_OPERATOR.site} и выгружен ${todayText()}. ` +
      'Актуальная редакция — на странице документа: печатная форма повторяет текст страницы на дату выгрузки.',
    { size: 18, after: 0 },
  )

  return docx.build()
}

/** Формат выгрузки: адрес кнопки на странице документа */
export type LegalDocFormat = 'pdf' | 'docx'

export const LEGAL_DOC_FORMATS: readonly LegalDocFormat[] = ['pdf', 'docx']

export const isLegalDocFormat = (value: string): value is LegalDocFormat =>
  (LEGAL_DOC_FORMATS as readonly string[]).includes(value)

/**
 * Файл документа в запрошенном формате. PDF проверяется на целостность
 * структуры (как отчёт экспертизы в /api/objects/legal/pdf): если генератор
 * собрал битый файл, об этом лучше узнать на сервере, чем у посетителя.
 * Возвращает null, если собрать файл не удалось.
 */
export function buildLegalDocFile(doc: LegalDoc, format: LegalDocFormat, lang = 'ru'): LegalDocFile | null {
  const base = legalDocFileBase(doc)
  if (format === 'pdf') {
    const data = renderLegalDocPdf(doc, lang)
    if (!checkPdfStructure(data)) return null
    return { data, filename: `${base}.pdf`, contentType: 'application/pdf' }
  }
  return {
    data: renderLegalDocDocx(doc, lang),
    filename: `${base}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
}

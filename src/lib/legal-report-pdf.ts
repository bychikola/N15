// ---------------------------------------------------------------------------
// Отчёт «Юридической проверки объекта» в PDF. Раскладка данных LegalReportData
// (см. legal-check.ts) в документ через PdfBuilder (см. pdf.ts). Скачивается
// только аккаунтом Ланы Козыревой (см. маршрут /api/objects/legal/pdf).
//
// Структура отчёта:
//   • шапка: название, объект, дата проверки, дата актуальности документов;
//   • рамка с обязательной оговоркой «Предварительная проверка…»;
//   • итоговый статус (один из четырёх, текстом — знаков ✓/✕ в шрифте нет);
//   • 12 пунктов проверки со статусами и комментариями;
//   • найденные несоответствия (риски и замечания);
//   • отсутствующие документы; рекомендации; перечень загруженных документов;
//   • ссылки на официальные источники.
// В отчёте нет содержимого документов и персональных данных собственников.
// ---------------------------------------------------------------------------

import { PdfBuilder } from './pdf'
import { LEGAL_REPORT_DISCLAIMER, LEGAL_STATUS_LABELS, fmtDate, type LegalReportData } from './legal-check'

/** Метка статуса с префиксом для строки в списке */
const statusTag = (s: LegalReportData['status']): string => {
  switch (s) {
    case 'ok':
      return 'Проверено'
    case 'issues':
      return 'ЕСТЬ ВОПРОСЫ'
    case 'risk':
      return 'ВЫСОКИЙ РИСК'
    case 'manual':
      return 'НУЖНА РУЧНАЯ ПРОВЕРКА ЮРИСТОМ'
  }
}

const findingPrefix: Record<LegalReportData['findings'][number]['level'], string> = {
  risk: 'РИСК: ',
  warn: 'Замечание: ',
  info: 'Информация: ',
}

const fmtSize = (bytes: number): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/**
 * Формирует PDF-документ отчёта. Возвращает Buffer файла.
 * caption — подпись в колонтитуле (например, «Юридическая проверка объекта»).
 */
export function renderLegalReportPdf(report: LegalReportData): Buffer {
  const pdf = new PdfBuilder(9.5, 44)

  // --- Шапка ---------------------------------------------------------------
  pdf.heading('ЮРИДИЧЕСКАЯ ПРОВЕРКА ОБЪЕКТА', 14)
  pdf.paragraph(`Объект: ${report.objectTitle || 'без названия'}`, { gapAfter: 1 })
  if (report.objectAddress) pdf.paragraph(`Адрес: ${report.objectAddress}`, { gapAfter: 1 })
  pdf.paragraph(
    `Категория: ${report.category || 'не указана'} · Тип сделки: ${report.dealType === 'sale' ? 'продажа' : 'аренда'} · №${report.objectId} в CRM`,
    { gapAfter: 1 },
  )
  pdf.paragraph(`Дата проверки: ${fmtDate(report.checkedAt) || report.checkedAt}`, { gapAfter: 1 })
  pdf.paragraph(
    report.docsActualAt
      ? `Дата актуальности документов: ${fmtDate(report.docsActualAt)}`
      : 'Дата актуальности документов: не определена (нет датированных документов)',
    { gapAfter: 3 },
  )

  // Обязательная оговорка — рамка сразу под шапкой
  pdf.box(LEGAL_REPORT_DISCLAIMER, { size: 9.5 })
  pdf.gap(4)

  // --- Итоговый статус ------------------------------------------------------
  pdf.paragraph(`ИТОГ ПРОВЕРКИ: ${statusTag(report.status)}`, { size: 12, gapAfter: 2 })

  // --- Пункты проверки -------------------------------------------------------
  pdf.heading('Пункты проверки', 11)
  for (const item of report.items) {
    const statusLine = `${item.key}. ${item.title} — ${LEGAL_STATUS_LABELS[item.status]}`
    pdf.paragraph(statusLine, { indent: 0, gapAfter: 0.5 })
    if (item.note) {
      pdf.paragraph(item.note, { size: 8.8, indent: 16, gapAfter: 0.5 })
    }
  }

  // --- Несоответствия --------------------------------------------------------
  if (report.findings.length) {
    pdf.heading('Найденные несоответствия и риски', 11)
    for (const f of report.findings) {
      pdf.paragraph(`${findingPrefix[f.level]}${f.text} (пункт ${f.itemKey})`, { gapAfter: 1.5 })
    }
  }

  // --- Отсутствующие документы ----------------------------------------------
  if (report.missingDocs.length) {
    pdf.heading('Отсутствующие документы', 11)
    for (const d of report.missingDocs) pdf.paragraph(`— ${d}`, { gapAfter: 1 })
  }

  // --- Рекомендации ----------------------------------------------------------
  if (report.recommendations.length) {
    pdf.heading('Рекомендации', 11)
    report.recommendations.forEach((r, i) => pdf.paragraph(`${i + 1}. ${r}`, { gapAfter: 1.5 }))
  }

  // --- Перечень загруженных документов --------------------------------------
  pdf.heading('Загруженные документы (перечень)', 11)
  if (!report.docs.length) {
    pdf.paragraph('Документы не загружены.', { gapAfter: 1 })
  }
  for (const d of report.docs) {
    const date = d.docDate ? fmtDate(d.docDate) : 'без даты'
    pdf.paragraph(`— ${d.docTypeLabel}${date ? `, от ${date}` : ''}, файл «${d.fileName}»${fmtSize(d.size) ? ` (${fmtSize(d.size)})` : ''}`, {
      size: 8.8,
      gapAfter: 1,
    })
  }

  // --- Источники --------------------------------------------------------------
  if (report.sources.length) {
    pdf.heading('Официальные источники для ручной проверки', 11)
    for (const s of report.sources) {
      pdf.paragraph(`— ${s.name}`, { gapAfter: 0.5 })
      if (s.url) pdf.paragraph(s.url, { size: 8.8, indent: 16, gapAfter: 1 })
    }
  }

  pdf.paragraph(
    `Отчёт сформирован системой (движок проверки, версия ${report.engineVersion || 1})${report.checkedBy ? `, сотрудник: ${report.checkedBy}` : ''}.` +
      ' Результаты автоматической сверки должны быть подтверждены юристом.',
    { size: 8.2, gapAfter: 0 },
  )

  return pdf.build(`Юр. проверка №${report.objectId}`)
}

// ---------------------------------------------------------------------------
// Отчёт «Юридической экспертизы объекта» в PDF. Раскладка данных LegalReportData
// (см. legal-check.ts) в документ через PdfBuilder (см. pdf.ts). Скачивают
// только юрист и администраторы (см. маршрут /api/objects/legal/pdf).
//
// Структура отчёта:
//   • шапка: название, объект, даты проверки и актуальности документов;
//   • рамка с обязательной оговоркой (автоматический опрос реестров
//     недоступен — проверяет юрист);
//   • итоговый статус — формулировками «риски не выявлены по проверенным
//     данным» / «обнаружены риски» / «есть замечания» / «нужна ручная
//     проверка» (знаков ✓/✕ в шрифте нет, статус пишется текстом);
//   • сведения об объекте и о собственнике (включая источник данных);
//   • шесть проверок экспертизы со статусами и комментариями;
//   • что проверено автоматически и что автоматически недоступно;
//   • найденные риски и замечания; отсутствующие документы; рекомендации;
//   • источники и дата проверки; перечень загруженных документов.
// В отчёте нет паспортных данных, подписей и содержимого закрытых документов.
// ---------------------------------------------------------------------------

import { PdfBuilder } from './pdf'
import {
  LEGAL_REPORT_DISCLAIMER,
  LEGAL_STATUS_LABELS,
  fmtDate,
  type LegalReportData,
} from './legal-check'

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

/** Откуда взят кадастровый номер — это важно для доверия к проверке */
const CADASTRAL_SOURCE: Record<string, string> = {
  card: 'из карточки объекта',
  input: 'введён для проверки вручную',
  egrn: 'распознан из загруженной выписки ЕГРН',
  none: 'кадастровый номер не указан',
}

const MANUAL_LABELS: Record<string, string> = {
  'passportCheck:match': 'сверено с паспортом — совпадает',
  'passportCheck:mismatch': 'расхождения с паспортом',
  'egrnCheck:clear': 'выписка сверена — обременений и расхождений нет',
  'egrnCheck:encumbrance': 'в выписке выявлены обременения',
  'egrnCheck:mismatch': 'в выписке выявлены расхождения',
  'courtCheck:clear': 'суды и ФССП проверены — сведений не найдено',
  'courtCheck:found': 'по судам или ФССП есть сведения',
  'bankruptcyCheck:clear': 'ЕФРСБ проверен — сведений нет',
  'bankruptcyCheck:found': 'по ЕФРСБ есть процедура',
}

/**
 * Формирует PDF-документ отчёта. Возвращает Buffer файла.
 */
export function renderLegalReportPdf(report: LegalReportData): Buffer {
  const pdf = new PdfBuilder(9.5, 44)
  const extras = report.extras

  // --- Шапка ---------------------------------------------------------------
  pdf.heading('ЮРИДИЧЕСКАЯ ЭКСПЕРТИЗА ОБЪЕКТА', 14)
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
    { gapAfter: 1 },
  )
  if (report.checkedBy) pdf.paragraph(`Отчёт сформировал: ${report.checkedBy}`, { gapAfter: 3 })

  // Обязательная оговорка — рамка сразу под шапкой
  pdf.box(LEGAL_REPORT_DISCLAIMER, { size: 9.5 })
  pdf.gap(4)

  // --- Итог ----------------------------------------------------------------
  pdf.paragraph(`ИТОГ ЭКСПЕРТИЗЫ: ${LEGAL_STATUS_LABELS[report.status]}`, { size: 12, gapAfter: 3 })

  // --- Сведения об объекте --------------------------------------------------
  pdf.heading('Сведения об объекте', 11)
  pdf.paragraph(`Кадастровый номер: ${extras.cadastralNumber || '—'} (${CADASTRAL_SOURCE[extras.cadastralSource] || 'источник неизвестен'})`, { gapAfter: 1 })
  if (extras.addressEgrn) pdf.paragraph(`Адрес по выписке ЕГРН: ${extras.addressEgrn}`, { gapAfter: 1 })
  const areaLine = [
    extras.areaEgrn ? `по выписке — ${extras.areaEgrn} м²` : '',
    extras.areaCard != null ? `по карточке — ${String(extras.areaCard).replace('.', ',')} м²` : '',
  ].filter(Boolean)
  pdf.paragraph(`Площадь: ${areaLine.length ? areaLine.join(', ') : 'не указана'}`, { gapAfter: 1 })
  pdf.paragraph(`Выписка ЕГРН: ${extras.egrn.status === 'parsed' ? 'файл распознан автоматически' : extras.egrn.status === 'unrecognized' ? 'файл загружен, но автоматически не распознан' : 'файл не загружен'}`, { gapAfter: 1 })
  if (extras.egrn.fileName) pdf.paragraph(`Файл выписки: «${extras.egrn.fileName}»${extras.egrn.docDate ? `, от ${fmtDate(extras.egrn.docDate)}` : ', дата не указана'}`, { indent: 16, size: 8.8, gapAfter: 1 })
  if (extras.egrn.reason) pdf.paragraph(extras.egrn.reason, { indent: 16, size: 8.8, gapAfter: 2 })

  // --- Сведения о собственнике ---------------------------------------------
  pdf.heading('Сведения о собственнике', 11)
  pdf.paragraph(`По карточке объекта: ${extras.ownerCard || '—'}`, { gapAfter: 1 })
  pdf.paragraph(
    `По выписке ЕГРН: ${extras.ownersEgrn.length ? extras.ownersEgrn.join(', ') : '—'}`,
    { gapAfter: 1 },
  )
  pdf.paragraph(`Вид права: ${extras.rightType || '—'}`, { gapAfter: 1 })
  pdf.paragraph(`Основание приобретения: ${extras.basis || '—'}`, { gapAfter: 1 })
  pdf.paragraph(
    `Зарегистрированные обременения: ${extras.encumbrances.length ? extras.encumbrances.join('; ') : '—'}`,
    { gapAfter: 1 },
  )
  pdf.paragraph(
    extras.manual.passportCheck === 'match'
      ? 'Сверка с паспортом: выполнена юристом, расхождений нет'
      : extras.manual.passportCheck === 'mismatch'
        ? 'Сверка с паспортом: выявлены расхождения'
        : 'Сверка с паспортом: не выполнена (паспорт читает юрист визуально, система паспортные данные не хранит)',
    { gapAfter: 2 },
  )

  // --- Результаты проверок ---------------------------------------------------
  pdf.heading('Результаты проверок', 11)
  for (const item of report.items) {
    pdf.paragraph(`${item.key}. ${item.title} — ${LEGAL_STATUS_LABELS[item.status]}`, { gapAfter: 0.5 })
    if (item.note) pdf.paragraph(item.note, { size: 8.8, indent: 16, gapAfter: 1.5 })
  }

  // --- Что проверено автоматически и что нет --------------------------------
  if (extras.autoChecks.length) {
    pdf.heading('Проверено автоматически', 11)
    for (const line of extras.autoChecks) pdf.paragraph(`— ${line}`, { gapAfter: 1 })
  }
  if (extras.autoUnavailable.length) {
    pdf.heading('Автоматическая проверка недоступна', 11)
    for (const line of extras.autoUnavailable) pdf.paragraph(`— ${line}`, { gapAfter: 1 })
  }
  const manualLines = Object.entries(extras.manual)
    .filter(([key, value]) => key !== 'comment' && typeof value === 'string' && value)
    .map(([key, value]) => MANUAL_LABELS[`${key}:${String(value)}`] || `${key}: ${String(value)}`)
  if (manualLines.length || extras.manual.comment) {
    pdf.heading('Отметки юриста о ручных проверках', 11)
    for (const line of manualLines) pdf.paragraph(`— ${line}`, { gapAfter: 1 })
    if (extras.manual.comment) pdf.paragraph(`Комментарий: ${extras.manual.comment}`, { size: 8.8, indent: 16, gapAfter: 1 })
  }

  // --- Риски и замечания -----------------------------------------------------
  if (report.findings.length) {
    pdf.heading('Найденные риски и замечания', 11)
    for (const f of report.findings) {
      pdf.paragraph(`${findingPrefix[f.level]}${f.text} (проверка ${f.itemKey})`, { gapAfter: 1.5 })
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

  // --- Источники и дата проверки ---------------------------------------------
  pdf.heading('Источники и дата проверки', 11)
  pdf.paragraph(`Проверка выполнена ${fmtDate(report.checkedAt) || report.checkedAt}${report.checkedBy ? `, сотрудник: ${report.checkedBy}` : ''}`, { gapAfter: 1 })
  for (const s of report.sources) {
    pdf.paragraph(`— ${s.name}`, { gapAfter: 0.5 })
    if (s.url) pdf.paragraph(s.url, { size: 8.8, indent: 16, gapAfter: 1 })
  }

  // --- Перечень загруженных документов --------------------------------------
  pdf.heading('Загруженные документы (перечень)', 11)
  if (!report.docs.length) {
    pdf.paragraph('Документы не загружены.', { gapAfter: 1 })
  }
  for (const d of report.docs) {
    const date = d.docDate ? `, от ${fmtDate(d.docDate)}` : ''
    pdf.paragraph(`— ${d.docTypeLabel}${date}, файл «${d.fileName}»${fmtSize(d.size) ? ` (${fmtSize(d.size)})` : ''}`, {
      size: 8.8,
      gapAfter: 1,
    })
  }

  pdf.paragraph(
    `Отчёт сформирован системой (движок экспертизы, версия ${report.engineVersion || 1}).` +
      ' В отчёте нет паспортных данных, содержимого закрытых документов и подписей.' +
      ' Результаты проверок должны быть подтверждены заключением юриста по оригиналам документов.',
    { size: 8.2, gapAfter: 0 },
  )

  return pdf.build(`Юр. экспертиза №${report.objectId}`)
}

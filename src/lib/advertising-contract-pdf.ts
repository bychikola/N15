// ---------------------------------------------------------------------------
// Договор на размещение рекламного материала в PDF (кнопка «Сформировать
// договор» в CRM, см. /api/advertising/request-manage). Раскладка данных
// заявки в документ через PdfBuilder (см. pdf.ts).
//
// Зачем отдельный договор, если есть оферта: обычное объявление размещается
// по оферте — она принимается галочкой в форме (см. advertising-legal.ts).
// Крупным компаниям нужен договор на бумаге со своим номером, реквизитами
// и подписями — его и собирает этот модуль. Условия берутся из карточки
// заявки, поэтому менеджер должен заполнить стоимость, срок и формат до
// формирования документа.
//
// В шрифте отчёта нет знака рубля (₽) и галочек — суммы пишутся словами
// и цифрами с «руб.», отметки — текстом (см. textToHex в pdf.ts: символы
// без глифа молча пропускаются, поэтому проверяем набор заранее).
// ---------------------------------------------------------------------------

import { PdfBuilder } from './pdf'
import { AD_LEGAL_UPDATED, AD_OFFER_VERSION, AD_OPERATOR, AD_RULES } from './advertising-legal'
import { adDateText } from './advertising'

/** Всё, что нужно договору, — из карточки заявки */
export interface AdContractData {
  /** Номер заявки: из него собирается номер договора */
  requestId: number
  /** Дата договора (ISO) */
  date: string
  /** Сторона-рекламодатель: как в договоре и как связаться */
  advertiser: {
    company?: string | null
    name?: string | null
    phone?: string | null
    email?: string | null
  }
  object: {
    typeLabel: string
    location?: string | null
    price?: string | null
    listingUrl?: string | null
  }
  placement: {
    formatLabel: string
    termDays?: number | null
    startDate?: string | null
    endDate?: string | null
  }
  money: {
    cost?: number | null
    discount?: number | null
    total?: number | null
    paymentStatus?: string | null
    paymentWaived?: boolean | null
  }
  erid?: string | null
  /** Что согласовано с рекламодателем: срок словами из формы */
  desiredTerm?: string | null
  /** Когда даны согласия и какую редакцию оферты человек принял */
  consentAt?: string | null
  offerVersion?: string | null
  /** Кто сформировал договор (сотрудник Н15) */
  manager?: string | null
}

/** Сумма цифрами с разделителем разрядов: 30000 → «30 000 руб.» */
export const rubText = (value: number): string => {
  const digits = String(Math.max(0, Math.round(value)))
  // Разряды разделяем сами: у toLocaleString разделитель — неразрывный пробел,
  // а его глифа в шрифте отчёта нет — он молча пропал бы в PDF
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${grouped} руб.`
}

const UNITS = [
  'ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
]
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

/** Словами разряд до 999; feminine — для тысяч («одна тысяча», «две тысячи») */
const triadWords = (n: number, feminine = false): string => {
  const words: string[] = []
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const u = n % 10
  if (h) words.push(HUNDREDS[h])
  if (t === 1) {
    words.push(UNITS[10 + u])
  } else {
    if (t) words.push(TENS[t])
    if (u) words.push(feminine && u === 1 ? 'одна' : feminine && u === 2 ? 'две' : UNITS[u])
  }
  return words.join(' ')
}

/** Форма слова при числе: 1 рубль, 2 рубля, 5 рублей */
const plural = (n: number, one: string, few: string, many: string): string => {
  const m100 = n % 100
  const m10 = n % 10
  if (m100 >= 11 && m100 <= 14) return many
  if (m10 === 1) return one
  if (m10 >= 2 && m10 <= 4) return few
  return many
}

/**
 * Сумма прописью для договора: «Тридцать тысяч рублей 00 копеек».
 * Копейки всегда нулевые — в карточке заявки суммы целые.
 */
export const rublesWords = (value: number): string => {
  const n = Math.max(0, Math.round(value))
  if (n === 0) return 'Ноль рублей 00 копеек'
  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (millions) parts.push(`${triadWords(millions)} ${plural(millions, 'миллион', 'миллиона', 'миллионов')}`)
  if (thousands) parts.push(`${triadWords(thousands, true)} ${plural(thousands, 'тысяча', 'тысячи', 'тысяч')}`)
  if (rest) parts.push(`${triadWords(rest)} ${plural(rest, 'рубль', 'рубля', 'рублей')}`)
  else parts.push('рублей')
  const text = parts.join(' ').replace(/\s+/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1) + ' 00 копеек'
}

/** Номер договора по заявке: АР-12/2026 (АР — рекламная заявка, затем номер заявки и год) */
export const contractNumber = (requestId: number, date: string): string => {
  const year = new Date(date).getFullYear() || new Date().getFullYear()
  return `АР-${requestId}/${year}`
}

/** Строка рекламодателя для шапки договора */
const advertiserLine = (a: AdContractData['advertiser']): string => {
  const company = (a.company || '').trim()
  const name = (a.name || '').trim()
  if (company && name) return `${company}, в лице ${name}`
  return company || name || 'физическое лицо'
}

const STATUS_TEXT: Record<string, string> = {
  unpaid: 'не оплачено',
  partial: 'оплачено частично',
  paid: 'оплачено',
  refunded: 'оплата возвращена',
}

/**
 * Формирует PDF-договор. Возвращает Buffer файла; имя файла собирает
 * вызывающая сторона (см. sendAdRequestContract в advertising-service.ts).
 */
export function renderAdContractPdf(data: AdContractData): Buffer {
  const pdf = new PdfBuilder(9.5, 46)
  const number = contractNumber(data.requestId, data.date)
  const total = typeof data.money.total === 'number' ? data.money.total : 0
  const cost = typeof data.money.cost === 'number' ? data.money.cost : null
  const discount = typeof data.money.discount === 'number' && data.money.discount > 0 ? data.money.discount : null
  const days = typeof data.placement.termDays === 'number' && data.placement.termDays > 0 ? data.placement.termDays : null

  // --- Шапка ---------------------------------------------------------------
  pdf.heading(`ДОГОВОР № ${number}`, 13)
  pdf.paragraph('возмездного оказания услуг по размещению рекламного материала', { gapAfter: 1 })
  pdf.paragraph(`${AD_OPERATOR.city} · ${adDateText(data.date)}`, { gapAfter: 3 })

  pdf.paragraph(
    `Исполнитель: ${AD_OPERATOR.name}, ${AD_OPERATOR.city}. Телефон: ${AD_OPERATOR.phone}. Почта: ${AD_OPERATOR.email}. Сайт: ${AD_OPERATOR.site}.`,
    { gapAfter: 1.5 },
  )
  pdf.paragraph(`Заказчик: ${advertiserLine(data.advertiser)}.`, { gapAfter: 1 })
  const contacts = [
    data.advertiser.phone ? `телефон ${data.advertiser.phone}` : '',
    data.advertiser.email ? `почта ${data.advertiser.email}` : '',
  ].filter(Boolean)
  if (contacts.length) pdf.paragraph(`Контакты Заказчика: ${contacts.join(', ')}.`, { gapAfter: 1 })

  pdf.box(
    `Договор сформирован по заявке № ${data.requestId} с формы «Ваша реклама» на сайте ${AD_OPERATOR.site}.` +
      ' Размещение выполняется на условиях договора-оферты и правил размещения рекламы,' +
      ' которые Заказчик принял при отправке заявки.' +
      (data.consentAt
        ? ` Согласия даны ${adDateText(data.consentAt)} (редакция оферты ${data.offerVersion || AD_OFFER_VERSION}).`
        : ` Редакция оферты: ${data.offerVersion || AD_OFFER_VERSION}.`),
    { size: 8.8 },
  )
  pdf.gap(4)

  // --- 1. Предмет ----------------------------------------------------------
  pdf.heading('1. Предмет договора', 11)
  const objectLine = [
    `тип объекта — ${data.object.typeLabel}`,
    data.object.location ? `адрес или локация — ${data.object.location}` : '',
    data.object.price ? `цена по данным Заказчика — ${data.object.price}` : '',
  ].filter(Boolean)
  pdf.paragraph(
    `1.1. Исполнитель размещает рекламный материал Заказчика об объекте недвижимости (${objectLine.join('; ')}) на площадке ${AD_OPERATOR.site}, а Заказчик принимает и оплачивает размещение.`,
    { gapAfter: 1.5 },
  )
  if (data.object.listingUrl) {
    pdf.paragraph(`1.2. Ссылка на объявление, предоставленная Заказчиком: ${data.object.listingUrl}`, { gapAfter: 1.5 })
  }
  const termLine = [
    `формат размещения — ${data.placement.formatLabel}`,
    days ? `срок — ${days} дн.` : '',
    data.placement.startDate ? `начало — ${adDateText(data.placement.startDate)}` : '',
    data.placement.endDate ? `окончание — ${adDateText(data.placement.endDate)}` : '',
  ].filter(Boolean)
  pdf.paragraph(`1.3. Условия размещения: ${termLine.join('; ')}.`, { gapAfter: 1.5 })
  if (data.desiredTerm) {
    pdf.paragraph(`1.4. Срок, запрошенный Заказчиком при отправке заявки: «${data.desiredTerm}». Итоговый срок — в пункте 1.3.`, {
      gapAfter: 1.5,
    })
  }
  pdf.paragraph(
    '1.5. Формат, сроки и стоимость согласованы сторонами при проверке заявки и зафиксированы в карточке заявки в системе Исполнителя.',
    { gapAfter: 2 },
  )

  // --- 2. Порядок работы ---------------------------------------------------
  pdf.heading('2. Порядок размещения, модерация и отказ', 11)
  pdf.paragraph(
    '2.1. Заявка проходит проверку: сведения об объекте, содержание материала, права на фотографии и текст. Проверка занимает до двух рабочих дней.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '2.2. Если сведений не хватает, Исполнитель запрашивает уточнения — размещение не начинается до ответа Заказчика.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '2.3. Исполнитель вправе отказать в размещении или снять материал с публикации, если сведения недостоверны, поступила жалоба или обнаружено нарушение законодательства Российской Федерации.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    `2.4. Материал снимается с публикации по окончании срока (пункт 1.3), по просьбе Заказчика, а также по решению Исполнителя — при нарушении правил размещения (${AD_RULES.title}).`,
    { gapAfter: 2 },
  )

  // --- 3. Стоимость --------------------------------------------------------
  pdf.heading('3. Стоимость и порядок расчётов', 11)
  const moneyLines = [
    cost !== null ? `стоимость размещения — ${rubText(cost)}` : '',
    discount !== null ? `скидка — ${rubText(discount)}` : '',
  ].filter(Boolean)
  if (moneyLines.length) {
    pdf.paragraph(`3.1. ${moneyLines.join('; ')}.`, { gapAfter: 1.5 })
  }
  pdf.paragraph(
    `3.${moneyLines.length ? 2 : 1}. Итоговая сумма к оплате — ${rubText(total)} (${rublesWords(total)}).`,
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    `3.${moneyLines.length ? 3 : 2}. Оплата производится после проверки заявки и до публикации. Состояние оплаты по карточке заявки: ${STATUS_TEXT[String(data.money.paymentStatus || 'unpaid')] || 'не оплачено'}.`,
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    data.money.paymentWaived
      ? `3.${moneyLines.length ? 4 : 3}. Стороны отдельно согласовали размещение без оплаты: публикация выполняется без платежа, итоговая сумма указана для сведения.`
      : `3.${moneyLines.length ? 4 : 3}. До оплаты объект не публикуется. Если размещение без оплаты согласовано сторонами отдельно, это отмечается в карточке заявки.`,
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    `3.${moneyLines.length ? 5 : 4}. При технической невозможности показа материала в оплаченный срок Исполнитель продлевает срок размещения на время простоя либо возвращает оплату за непоказанный период.`,
    { gapAfter: 2 },
  )

  // --- 4. Обязанности Заказчика -------------------------------------------
  pdf.heading('4. Ответственность Заказчика', 11)
  pdf.paragraph(
    '4.1. Заказчик отвечает за достоверность сведений об объекте, его цене, состоянии, правах и условиях сделки.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.2. Заказчик подтверждает, что имеет право размещать объект, фотографии, видео и описание: является собственником, представителем собственника или действует по доверенности (договору).',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.3. Заказчик не размещает материалы, запрещённые законодательством Российской Федерации, в том числе сведения, вводящие в заблуждение.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.4. Заказчик самостоятельно отвечает за юридические документы объекта. Исполнитель такие документы не проверяет и не подтверждает.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.5. Заказчик не вправе указывать неподтверждённые гарантии, скидки, акции и условия, в том числе «гарантированную» доходность и «лучшую цену».',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.6. Заказчик возмещает Исполнителю убытки и расходы, возникшие из-за недостоверных сведений, отсутствия прав на объект и материалы, а также из-за претензий третьих лиц и государственных органов.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '4.7. Садоводческие, дачные и иные товарищества, а также собственники, размещающие сведения о себе, отвечают за наличие полномочий на публикацию таких сведений.',
    { gapAfter: 2 },
  )

  // --- 5. Юридическая проверка --------------------------------------------
  pdf.heading('5. Юридическая проверка объекта', 11)
  pdf.paragraph(
    '5.1. Исполнитель не гарантирует юридическую чистоту объекта: в рамках размещения права, обременения и история объекта не проверяются.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '5.2. Юридическая проверка — отдельная услуга. Если она не заказана отдельно, размещение материала не является подтверждением чистоты объекта.',
    { gapAfter: 2 },
  )

  // --- 6. Маркировка -------------------------------------------------------
  pdf.heading('6. Маркировка рекламы', 11)
  pdf.paragraph(
    '6.1. Платная публикация помечается словом «Реклама» и содержит сведения о рекламодателе — требование статьи 3 Федерального закона «О рекламе».',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    data.erid
      ? `6.2. Идентификатор интернет-рекламы (erid): ${data.erid}. Он отображается в маркировке материала.`
      : '6.2. Если по законодательству требуется идентификатор интернет-рекламы (erid), он указывается до публикации и отображается в маркировке.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph('6.3. Маркировку проставляет Исполнитель автоматически. Заказчик не вправе её убирать или изменять.', {
    gapAfter: 2,
  })

  // --- 7. Персональные данные ---------------------------------------------
  pdf.heading('7. Персональные данные', 11)
  pdf.paragraph(
    '7.1. Заказчик даёт согласие на обработку персональных данных в объёме, указанном в заявке, на условиях Политики обработки персональных данных.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '7.2. Согласие можно отозвать письмом на адрес Исполнителя. Отзыв не влияет на обработку, выполненную до него.',
    { gapAfter: 2 },
  )

  // --- 8. Срок действия и прочее ------------------------------------------
  pdf.heading('8. Срок действия и заключительные положения', 11)
  pdf.paragraph(
    '8.1. Договор вступает в силу с момента подтверждения заявки Исполнителем и действует до окончания срока размещения и полных расчётов сторон.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '8.2. Во всём остальном стороны руководствуются договором-офертой и правилами размещения рекламы, принятыми Заказчиком при отправке заявки.',
    { gapAfter: 1.5 },
  )
  pdf.paragraph(
    '8.3. Договор может быть подписан сторонами на бумаге или обменом сканами; юридическая сила у таких подписей одинаковая.',
    { gapAfter: 2 },
  )

  // --- Подписи -------------------------------------------------------------
  pdf.heading('9. Реквизиты и подписи сторон', 11)
  pdf.paragraph(`Исполнитель: ${AD_OPERATOR.name}`, { gapAfter: 1 })
  pdf.paragraph(`${AD_OPERATOR.city}`, { gapAfter: 1 })
  pdf.paragraph(`Телефон: ${AD_OPERATOR.phone} · Почта: ${AD_OPERATOR.email}`, { gapAfter: 1 })
  pdf.paragraph(`Сайт: ${AD_OPERATOR.site}`, { gapAfter: 3 })
  pdf.paragraph(`Заказчик: ${advertiserLine(data.advertiser)}`, { gapAfter: 1 })
  if (contacts.length) pdf.paragraph(`Контакты: ${contacts.join(', ')}`, { gapAfter: 3 })
  else pdf.paragraph('Контакты: не указаны в заявке', { gapAfter: 3 })

  pdf.paragraph('Подписи сторон:', { gapAfter: 2 })
  pdf.paragraph('Исполнитель ______________________ / ______________________', { gapAfter: 3 })
  pdf.paragraph('Заказчик    ______________________ / ______________________', { gapAfter: 3 })

  pdf.paragraph(
    `Договор сформирован системой по заявке № ${data.requestId}` +
      (data.manager ? `, сотрудник: ${data.manager}` : '') +
      `. Редакция оферты: ${AD_OFFER_VERSION} (${AD_LEGAL_UPDATED}). Документ подготовлен по данным заявки и вступает в силу после согласования сторонами.`,
    { size: 8.2, gapAfter: 0 },
  )

  return pdf.build(`Договор № ${number}`)
}

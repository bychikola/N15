/**
 * Расчёт аннуитетного платежа по ипотеке — общая арифметика калькуляторов:
 * страницы «Ипотека и выгодные условия» (/mortgage), блока «Расчёт ипотечных
 * программ» на странице услуги (/services/mortgage) и модального калькулятора
 * в шапке (components/layout/MortgageCalculator.tsx).
 *
 * Здесь только счёт и работа с числами в полях ввода; поля, состояние и
 * разметка живут в компонентах. Ставку нигде не подставляем по умолчанию:
 * её называет банк, поэтому калькулятор считает по той, что ввёл человек.
 */

/** Что получается из введённых суммы, взноса, срока и ставки */
export interface MortgagePayment {
  /** Сумма кредита: стоимость минус первоначальный взнос */
  principal: number
  /** Ежемесячный платёж по аннуитетной схеме */
  payment: number
  /** Общая сумма выплат банку за весь срок */
  total: number
  /** Переплата: выплаты минус сумма кредита */
  overpayment: number
}

/**
 * Аннуитетный платёж: P = S · i · (1+i)^n / ((1+i)^n − 1), где S — сумма
 * кредита, i — месячная ставка, n — срок в месяцах. При нулевой ставке
 * формула вырождается в деление суммы на срок. Отрицательные значения
 * (взнос больше стоимости) считаем нулём: платить нечего.
 */
export function mortgagePayment(
  price: number,
  downPayment: number,
  years: number,
  rate: number,
): MortgagePayment {
  const principal = Math.max(0, price - downPayment)
  const months = Math.max(1, Math.round(years * 12))
  const monthlyRate = Math.max(0, rate) / 100 / 12
  const factor = Math.pow(1 + monthlyRate, months)
  const payment =
    principal === 0
      ? 0
      : monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * factor) / (factor - 1)
  const total = payment * months
  return { principal, payment, total, overpayment: total - principal }
}

/** Сумма для показа: без копеек, отрицательные значения — нулём */
export const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? Math.max(0, value) : 0,
  )

/** Число из поля ввода: пробелы-разделители и любые нецифровые символы прочь */
export const parseMoney = (value: string) => Number(value.replace(/\s/g, '').replace(/[^\d]/g, '')) || 0

/** Сумма с пробелами между тысячами — как печатают деньги в поле ввода */
export const formatMoneyInput = (value: string | number) => {
  const digits = String(value).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Дробное число из поля ввода: запятая как разделитель, не больше двух знаков */
export const cleanDecimal = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [whole, ...fraction] = normalized.split('.')
  return fraction.length ? `${whole}.${fraction.join('').slice(0, 2)}` : whole
}

/** Процент для поля ввода: без хвостовых нулей и лишних знаков */
export const displayPercent = (value: number) => {
  if (!Number.isFinite(value)) return ''
  return Math.round(value * 10) / 10 + ''
}

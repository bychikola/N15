'use client'

import { useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
// Арифметика аннуитета и разбор чисел в полях — общие с калькулятором
// в шапке (см. src/lib/mortgage-calc.ts)
import {
  cleanDecimal,
  displayPercent,
  formatMoney,
  formatMoneyInput,
  mortgagePayment,
  parseMoney,
} from '@/lib/mortgage-calc'

const inputCls =
  'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'
const labelCls = 'block text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-2'

/**
 * Ипотечный калькулятор на странице «Ипотека и выгодные условия»: стоимость
 * объекта, первоначальный взнос (в рублях и процентах, синхронно), срок
 * кредита и процентная ставка. Считает ежемесячный платёж, сумму кредита,
 * общую сумму выплат и переплату — всё в браузере клиента, данные никуда
 * не отправляются, поэтому галочки согласия здесь нет (она есть у формы
 * заявки ниже, см. PurchaseLeadForm).
 *
 * Ставку не подставляем по умолчанию: её называет банк в индивидуальном
 * предложении. Пока ставка не введена, вместо платежа и итогов показываем
 * прочерк — так расчёт не выглядит обещанием конкретной ставки. Сумма
 * кредита видна сразу: она от ставки не зависит.
 */
export const PurchaseCalculator: FC = () => {
  const { t } = useI18n()
  const c = t.purchase.common.calc
  const [priceText, setPriceText] = useState('9 000 000')
  const [downText, setDownText] = useState('1 800 000')
  const [downPercentText, setDownPercentText] = useState('20')
  const [yearsText, setYearsText] = useState('20')
  const [rateText, setRateText] = useState('')

  const price = parseMoney(priceText)
  const downPayment = Math.min(parseMoney(downText), price)
  const years = Number(yearsText) || 0
  const rate = Number(rateText.replace(',', '.')) || 0
  // Ставка введена — расчёт полный; иначе итоги показываем прочерком
  const rateSet = rateText.trim() !== ''
  const ready = price > 0 && years > 0 && rateSet
  const result = mortgagePayment(price, downPayment, years, rate)

  // Взнос в рублях и процентах — одно и то же число в двух полях: правку
  // в любом из них переносим во второе, чтобы поля не расходились
  const changePrice = (raw: string) => {
    const formatted = formatMoneyInput(raw)
    const nextPrice = parseMoney(formatted)
    const currentDown = parseMoney(downText)
    const nextDown = Math.min(currentDown, nextPrice)
    setPriceText(formatted)
    if (currentDown > nextPrice) setDownText(formatMoneyInput(nextDown))
    setDownPercentText(nextPrice > 0 ? displayPercent((nextDown / nextPrice) * 100) : '')
  }

  const changeDown = (raw: string) => {
    const next = Math.min(parseMoney(raw), price)
    const isEmpty = raw.replace(/\D/g, '') === ''
    setDownText(isEmpty ? '' : formatMoneyInput(next))
    setDownPercentText(isEmpty || price === 0 ? '' : displayPercent((next / price) * 100))
  }

  const changeDownPercent = (raw: string) => {
    const cleaned = cleanDecimal(raw)
    if (!cleaned) {
      setDownPercentText('')
      setDownText('')
      return
    }
    const percent = Math.min(Number(cleaned) || 0, 100)
    setDownPercentText(percent === 100 && Number(cleaned) > 100 ? '100' : cleaned)
    setDownText(formatMoneyInput(Math.round((price * percent) / 100)))
  }

  const changeYears = (raw: string) => setYearsText(raw.replace(/\D/g, '').slice(0, 2))

  // Прочерк вместо числа: значение зависит от ставки, которой ещё нет
  const money = (value: number) => (ready ? `${formatMoney(value)} ₽` : '—')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <p className="text-sm leading-relaxed text-[var(--n15-muted)]">{c.hint}</p>
        <label>
          <span className={labelCls}>{c.price}</span>
          <div className="relative">
            <input
              inputMode="numeric"
              type="text"
              value={priceText}
              onChange={(e) => changePrice(e.target.value)}
              placeholder="0"
              className={`${inputCls} pr-9`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--n15-muted)]">
              {c.priceUnit}
            </span>
          </div>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className={labelCls}>{c.down}</span>
            <div className="relative">
              <input
                inputMode="numeric"
                type="text"
                value={downText}
                onChange={(e) => changeDown(e.target.value)}
                placeholder="0"
                className={`${inputCls} pr-9`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--n15-muted)]">
                {c.priceUnit}
              </span>
            </div>
          </label>
          <label>
            <span className={labelCls}>
              {c.downPercent}, {c.downPercentUnit}
            </span>
            <input
              inputMode="decimal"
              type="text"
              value={downPercentText}
              onChange={(e) => changeDownPercent(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className={labelCls}>
              {c.term}, {c.termUnit}
            </span>
            <input
              inputMode="numeric"
              type="text"
              value={yearsText}
              onChange={(e) => changeYears(e.target.value)}
              onBlur={() => {
                if (years > 40) setYearsText('40')
              }}
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label>
            <span className={labelCls}>
              {c.rate}, {c.rateUnit}
            </span>
            <input
              inputMode="decimal"
              type="text"
              value={rateText}
              onChange={(e) => setRateText(cleanDecimal(e.target.value))}
              placeholder="0"
              className={inputCls}
            />
          </label>
        </div>
      </form>

      <div className="flex flex-col gap-5 p-6 md:p-7 bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/15">
        <div>
          <p className={labelCls}>{c.monthly}</p>
          <p className="text-3xl md:text-4xl leading-tight font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
            {money(result.payment)}
          </p>
        </div>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--n15-gold)]/10 pb-3">
            <dt className="text-[var(--n15-muted)]">{c.credit}</dt>
            <dd className="text-[var(--n15-silver)]">{formatMoney(result.principal)} ₽</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--n15-gold)]/10 pb-3">
            <dt className="text-[var(--n15-muted)]">{c.total}</dt>
            <dd className="text-[var(--n15-silver)]">{money(result.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--n15-muted)]">{c.overpay}</dt>
            <dd className="text-[var(--n15-silver)]">{money(result.overpayment)}</dd>
          </div>
        </dl>
        {/* Обязательное предупреждение: расчёт предварительный, условия и
            решение — за банком. Стоит прямо под цифрами, а не в сноске */}
        <p className="mt-auto pt-4 border-t border-[var(--n15-gold)]/15 text-xs leading-relaxed text-[var(--n15-muted)]">
          {c.warning}
        </p>
      </div>
    </div>
  )
}

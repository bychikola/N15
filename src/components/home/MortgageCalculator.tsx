'use client'

import { useMemo, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'

const formatResult = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? Math.max(0, value) : 0,
  )

const parseMoney = (value: string) => Number(value.replace(/\s/g, '').replace(/[^\d]/g, '')) || 0

const formatMoneyInput = (value: string | number) => {
  const digits = String(value).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const cleanDecimal = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [whole, ...fraction] = normalized.split('.')
  return fraction.length ? `${whole}.${fraction.join('').slice(0, 2)}` : whole
}

const displayPercent = (value: number) => {
  if (!Number.isFinite(value)) return ''
  return Math.round(value * 10) / 10 + ''
}

export default function MortgageCalculator({ t }: { t: Dict }) {
  const [priceText, setPriceText] = useState('9 000 000')
  const [downPaymentText, setDownPaymentText] = useState('1 800 000')
  const [downPercentText, setDownPercentText] = useState('20')
  const [yearsText, setYearsText] = useState('20')
  const [rateText, setRateText] = useState('18')

  const price = parseMoney(priceText)
  const downPayment = Math.min(parseMoney(downPaymentText), price)
  const years = Number(yearsText) || 0
  const rate = Number(rateText.replace(',', '.')) || 0

  const changePrice = (raw: string) => {
    const formatted = formatMoneyInput(raw)
    const nextPrice = parseMoney(formatted)
    const currentDownPayment = parseMoney(downPaymentText)
    const nextDownPayment = Math.min(currentDownPayment, nextPrice)
    setPriceText(formatted)
    if (currentDownPayment > nextPrice) setDownPaymentText(formatMoneyInput(nextDownPayment))
    setDownPercentText(nextPrice > 0 ? displayPercent((nextDownPayment / nextPrice) * 100) : '')
  }

  const changeDownPayment = (raw: string) => {
    const entered = parseMoney(raw)
    const next = Math.min(entered, price)
    const isEmpty = raw.replace(/\D/g, '') === ''
    setDownPaymentText(isEmpty ? '' : formatMoneyInput(next))
    setDownPercentText(isEmpty || price === 0 ? '' : displayPercent((next / price) * 100))
  }

  const changeDownPercent = (raw: string) => {
    const cleaned = cleanDecimal(raw)
    if (!cleaned) {
      setDownPercentText('')
      setDownPaymentText('')
      return
    }
    const percent = Math.min(Number(cleaned) || 0, 100)
    setDownPercentText(percent === 100 && Number(cleaned) > 100 ? '100' : cleaned)
    setDownPaymentText(formatMoneyInput(Math.round((price * percent) / 100)))
  }

  const result = useMemo(() => {
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
  }, [price, downPayment, years, rate])

  return (
    <section className="lp-mortgage" id="mortgage">
      <details className="lp-mortgage-disclosure">
        <summary>
          <div>
            <p className="lp-eyebrow lp-eyebrow-light">{t.landing.calcEyebrow}</p>
            <h2>{t.landing.calcTitle}</h2>
            <p>{t.landing.calcOpenHint}</p>
          </div>
          <i>+</i>
        </summary>
        <div className="lp-mortgage-content">
          <h3>{t.landing.calcContentTitle}</h3>
          <p>{t.landing.calcNote}</p>
          <div className="lp-mortgage-panel">
            <div className="lp-mortgage-fields">
              <label>
                <span>{t.landing.calcPrice}</span>
                <input aria-label={t.landing.calcPrice} inputMode="numeric" type="text" value={priceText} placeholder="0" onChange={(e) => changePrice(e.target.value)} />
                <small>₽</small>
              </label>
              <label>
                <span>{t.landing.calcDown}</span>
                <input aria-label={t.landing.calcDown} inputMode="numeric" type="text" value={downPaymentText} placeholder="0" onChange={(e) => changeDownPayment(e.target.value)} />
                <small>₽</small>
              </label>
              <label>
                <span>{t.landing.calcDownPercent}</span>
                <input aria-label={t.landing.calcDownPercent} inputMode="decimal" type="text" value={downPercentText} placeholder="0" onChange={(e) => changeDownPercent(e.target.value)} />
                <small>%</small>
              </label>
              <label>
                <span>{t.landing.calcYears}</span>
                <input aria-label={t.landing.calcYears} inputMode="numeric" type="text" value={yearsText} placeholder="0" onChange={(e) => setYearsText(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => { if (years > 40) setYearsText('40') }} />
                <small>{t.landing.calcYearsUnit}</small>
              </label>
              <label>
                <span>{t.landing.calcRate}</span>
                <input aria-label={t.landing.calcRate} inputMode="decimal" type="text" value={rateText} placeholder="0" onChange={(e) => setRateText(cleanDecimal(e.target.value))} />
                <small>%</small>
              </label>
            </div>
            <div className="lp-mortgage-results">
              <div><span>{t.landing.calcMonthly}</span><strong>{formatResult(result.payment)} ₽</strong></div>
              <div><span>{t.landing.calcDownSum}</span><b>{formatResult(downPayment)} ₽ · {downPercentText || '0'}%</b></div>
              <div><span>{t.landing.calcCredit}</span><b>{formatResult(result.principal)} ₽</b></div>
              <div><span>{t.landing.calcTotal}</span><b>{formatResult(result.total)} ₽</b></div>
              <div><span>{t.landing.calcOverpay}</span><b>{formatResult(result.overpayment)} ₽</b></div>
              <a href="#contact">{t.landing.calcConsult} <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n/i18n-provider'
// Счёт аннуитета и разбор чисел в полях — общие со страницами ипотеки
// (см. src/lib/mortgage-calc.ts): раньше здесь лежала своя копия
import {
  cleanDecimal,
  displayPercent,
  formatMoney as formatResult,
  formatMoneyInput,
  mortgagePayment,
  parseMoney,
} from '@/lib/mortgage-calc'

// Ипотечный калькулятор. Большой блок на главной убран — калькулятор
// открывается компактным модальным окном по кнопке «Ипотечный калькулятор»
// в шапке (десктоп и мобильное меню). Поля те же, что были в блоке:
// стоимость, первоначальный взнос (в рублях и процентах, синхронно),
// ставка, срок, ежемесячный платёж, общая выплата и переплата.
//
// Ставка не подставлена: её называет банк в индивидуальном предложении,
// поэтому поле пустое, а пока ставку не ввели, вместо платежа и итогов
// стоит прочерк — расчёт не выглядит обещанием конкретной ставки.
// Прежнее значение по умолчанию (18%) убрано 27.09.2026.

export default function MortgageCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const [priceText, setPriceText] = useState('9 000 000')
  const [downPaymentText, setDownPaymentText] = useState('1 800 000')
  const [downPercentText, setDownPercentText] = useState('20')
  const [yearsText, setYearsText] = useState('20')
  const [rateText, setRateText] = useState('')

  const price = parseMoney(priceText)
  const downPayment = Math.min(parseMoney(downPaymentText), price)
  const years = Number(yearsText) || 0
  const rate = Number(rateText.replace(',', '.')) || 0
  // Ставка введена — итоги считаем; иначе показываем прочерк: значения,
  // зависящие от ставки, без неё были бы выдуманными
  const rateSet = rateText.trim() !== ''
  const money = (value: number) => (rateSet ? `${formatResult(value)} ₽` : '—')

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

  const result = useMemo(
    () => mortgagePayment(price, downPayment, years, rate),
    [price, downPayment, years, rate],
  )

  // Пока окно открыто: Esc закрывает его, фон страницы не прокручивается
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // Окно не открывается при загрузке страницы — только по клику на кнопку
  // в шапке. Рендерится в портале у <body>, чтобы оверлей не был вложен
  // в шапку с backdrop-blur (та создаёт containing block для fixed).
  if (!open) return null

  return createPortal(
    <div className="lp-calc-overlay" onClick={onClose}>
      <div
        className="lp-calc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.landing.calcTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lp-calc-head">
          <h2>{t.landing.calcTitle}</h2>
          <button
            type="button"
            className="lp-calc-close"
            onClick={onClose}
            aria-label={t.landing.calcClose}
            title={t.landing.calcClose}
            autoFocus
          >
            ✕
          </button>
        </div>
        <div className="lp-mortgage-content">
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
              <div><span>{t.landing.calcMonthly}</span><strong>{money(result.payment)}</strong></div>
              <div><span>{t.landing.calcDownSum}</span><b>{formatResult(downPayment)} ₽ · {downPercentText || '0'}%</b></div>
              <div><span>{t.landing.calcCredit}</span><b>{formatResult(result.principal)} ₽</b></div>
              <div><span>{t.landing.calcTotal}</span><b>{money(result.total)}</b></div>
              <div><span>{t.landing.calcOverpay}</span><b>{money(result.overpayment)}</b></div>
              {/* «Получить консультацию» — якорь контактов главной страницы:
                  окно закрывается, страница прокручивается к форме заявки */}
              <Link href={`/${lang}#contact`} onClick={onClose}>{t.landing.calcConsult} <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

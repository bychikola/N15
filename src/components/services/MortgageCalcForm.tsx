'use client'

import { useState, type FC } from 'react'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { useI18n } from '@/i18n/i18n-provider'
// Арифметика аннуитета — общая с калькулятором страницы /mortgage
import { formatMoney, mortgagePayment, parseMoney, type MortgagePayment } from '@/lib/mortgage-calc'

const inputCls =
  'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'
const labelCls = 'block text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-1.5'

/**
 * Калькулятор в блоке «Расчёт ипотечных программ» (страница
 * /services/mortgage): считает по кнопке — сумма кредита, ежемесячный платёж
 * и общая сумма выплат. Расчёт идёт в браузере клиента, данные никуда
 * не отправляются. Перед кнопкой «Рассчитать» — та же обязательная галочка
 * согласия на обработку персональных данных, что и в остальных публичных
 * формах сайта (см. src/components/ui/ConsentCheckbox.tsx): без отметки
 * кнопка неактивна.
 *
 * Ставку не подставляем по умолчанию: её называет банк в индивидуальном
 * предложении, поэтому поле пустое, а без ставки расчёт не выводится — так
 * страница не выглядит обещанием конкретной ставки. Под итогами стоит то же
 * предупреждение, что и на /mortgage: расчёт предварительный, условия
 * и решение принимает банк.
 */
export const MortgageCalcForm: FC = () => {
  const { t } = useI18n()
  const m = t.services.mortgage
  const c = t.purchase.common.calc
  const [priceText, setPriceText] = useState('')
  const [downText, setDownText] = useState('')
  const [yearsText, setYearsText] = useState('')
  const [rateText, setRateText] = useState('')
  const [agreed, setAgreed] = useState(false)
  // Итоги показываем только после нажатия «Рассчитать»: до него на экране
  // нет чисел, которые можно принять за предложение банка
  const [result, setResult] = useState<MortgagePayment | null>(null)

  const calculate = () => {
    const price = parseMoney(priceText)
    const downPayment = Math.min(parseMoney(downText), price)
    const years = Number(yearsText) || 0
    const rate = Number(rateText.replace(',', '.')) || 0
    if (price <= 0 || years <= 0 || rateText.trim() === '') {
      // Считать нечего (нет ставки, суммы или срока): прежний расчёт убираем,
      // чтобы старые числа не выглядели ответом на новые данные
      setResult(null)
      return
    }
    setResult(mortgagePayment(price, downPayment, years, rate))
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        calculate()
      }}
    >
      <label>
        <span className={labelCls}>{c.price}</span>
        <input
          type="number"
          min={0}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder={m.pricePlaceholder}
          className={`${inputCls} w-full`}
        />
      </label>
      <label>
        <span className={labelCls}>{c.down}</span>
        <input
          type="number"
          min={0}
          value={downText}
          onChange={(e) => setDownText(e.target.value)}
          placeholder={m.downPlaceholder}
          className={`${inputCls} w-full`}
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={labelCls}>
            {c.term}, {c.termUnit}
          </span>
          <input
            type="number"
            min={0}
            max={40}
            value={yearsText}
            onChange={(e) => setYearsText(e.target.value)}
            placeholder={m.termPlaceholder}
            className={`${inputCls} w-full`}
          />
        </label>
        <label>
          <span className={labelCls}>
            {c.rate}, {c.rateUnit}
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={rateText}
            onChange={(e) => setRateText(e.target.value)}
            placeholder="0"
            className={`${inputCls} w-full`}
          />
        </label>
      </div>
      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      <Button variant="primary" size="md" disabled={!agreed}>
        {m.calculate}
      </Button>

      {result && (
        <div className="mt-2 p-4 border border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--n15-muted)]">{c.credit}</dt>
              <dd className="text-[var(--n15-silver)]">{formatMoney(result.principal)} ₽</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--n15-muted)]">{c.monthly}</dt>
              <dd className="font-[family-name:var(--font-display)] text-lg text-[var(--n15-gold)]">
                {formatMoney(result.payment)} ₽
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-[var(--n15-gold)]/10 pt-2">
              <dt className="text-[var(--n15-muted)]">{c.total}</dt>
              <dd className="text-[var(--n15-silver)]">{formatMoney(result.total)} ₽</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--n15-muted)]">{c.warning}</p>
        </div>
      )}
    </form>
  )
}

'use client'

import { useState, type FC } from 'react'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { useI18n } from '@/i18n/i18n-provider'

const inputCls =
  'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

/**
 * Форма калькулятора в блоке «Расчёт ипотечных программ» (страница
 * /services/mortgage): расчёт идёт в браузере клиента, данные никуда
 * не отправляются. Перед кнопкой «Рассчитать» — та же обязательная галочка
 * согласия на обработку персональных данных, что и в остальных публичных
 * формах сайта (см. src/components/ui/ConsentCheckbox.tsx): без отметки
 * кнопка неактивна.
 */
export const MortgageCalcForm: FC = () => {
  const { t } = useI18n()
  const m = t.services.mortgage
  const [agreed, setAgreed] = useState(false)

  return (
    <form className="flex flex-col gap-3">
      <input type="number" placeholder={m.pricePlaceholder} className={inputCls} />
      <input type="number" placeholder={m.downPlaceholder} className={inputCls} />
      <input type="number" placeholder={m.termPlaceholder} className={inputCls} />
      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      <Button variant="primary" size="md" disabled={!agreed}>
        {m.calculate}
      </Button>
    </form>
  )
}

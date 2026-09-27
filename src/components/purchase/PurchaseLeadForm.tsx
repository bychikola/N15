'use client'

import { useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox, MarketingConsent } from '@/components/ui/ConsentCheckbox'
import { reachGoal } from '@/lib/metrika'

const inputCls =
  'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

/** Страницы, с которых приходит форма: у каждой свой тип и источник заявки */
export type PurchaseFormKind = 'mortgage' | 'installment'

interface Props {
  kind: PurchaseFormKind
  className?: string
}

/**
 * Единственная форма страниц «Ипотека и выгодные условия» и «Рассрочка»:
 * имя, телефон, программа, сообщение и обязательная галочка согласия
 * (со ссылками на согласие и политику — см. ConsentCheckbox).
 *
 * Отправка — POST /api/applications (Payload REST, коллекция applications),
 * заявка сразу появляется в CRM в разделе «Заявки», в «Неразобранном».
 * От страницы зависит тип заявки (mortgage / installment) и источник
 * («Ипотека» или «Рассрочка»): по ним в CRM видно, с какой страницы пришёл
 * человек, а в списке заявок такая заявка подписана «Ипотека» / «Рассрочка».
 *
 * Выбранная программа уходит первым абзацем сообщения — в CRM агент видит
 * её в тексте заявки вместе с комментарием клиента. Условия и решение по
 * заявке принимает банк, поэтому в форме нет ни ставок, ни сроков одобрения.
 */
export const PurchaseLeadForm: FC<Props> = ({ kind, className = '' }) => {
  const { t } = useI18n()
  const f = t.purchase.common.form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [program, setProgram] = useState('')
  const [comment, setComment] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const programs = kind === 'installment' ? f.programs.installment : f.programs.mortgage

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    // Та же проверка, что и у неактивной кнопки: отправка по Enter без отметки
    if (!agreed) {
      setError(t.consent.required)
      return
    }
    setSending(true)
    setError('')
    try {
      // Программа и комментарий — одной заметкой: в CRM заявка читается
      // как есть, а программа не теряется среди текста
      const message = [
        program ? `${t.purchase.common.form.programLabel}: ${program}` : '',
        comment.trim(),
      ]
        .filter(Boolean)
        .join('\n')
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: kind === 'installment' ? 'installment' : 'mortgage',
          clientName: name,
          clientPhone: phone,
          message,
          // Отметки согласий сохраняются в заявке вместе с датой и версией
          // документов — их проставляет сервер (см. коллекцию applications)
          consent: agreed,
          marketingConsent: marketing,
          status: 'unsorted',
          // Источник в CRM — раздел сайта, с которого пришла заявка
          source: kind === 'installment' ? 'Рассрочка' : 'Ипотека',
        }),
      })
      if (!res.ok) {
        setError(f.error)
        return
      }
      // Цель Метрики «заявка отправлена» — без персональных данных из формы
      reachGoal('lead_form')
      setSent(true)
    } catch {
      setError(f.error)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className={`p-6 border border-[var(--n15-green)]/25 bg-[var(--n15-black)] ${className}`}>
        <p className="text-base text-[var(--n15-white)] mb-2">{f.sentTitle}</p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{f.sentText}</p>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={`flex flex-col gap-4 ${className}`}>
      <div>
        <h3 className="text-lg md:text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1">
          {f.title}
        </h3>
        <p className="text-sm leading-relaxed text-[var(--n15-muted)]">
          {kind === 'installment' ? t.purchase.installment.formText : t.purchase.mortgage.formText}
        </p>
      </div>
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={f.namePlaceholder}
        aria-label={f.namePlaceholder}
        className={inputCls}
      />
      <input
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={f.phonePlaceholder}
        aria-label={f.phonePlaceholder}
        className={inputCls}
      />
      {/* Программа — необязательный выбор: если человек её не выбрал,
          заявка всё равно уходит, а разбирается она по типу страницы */}
      <select
        value={program}
        onChange={(e) => setProgram(e.target.value)}
        aria-label={f.programLabel}
        className={`${inputCls} cursor-pointer`}
      >
        <option value="">{f.programLabel}</option>
        {programs.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={f.messagePlaceholder}
        aria-label={f.messagePlaceholder}
        rows={3}
        className={`${inputCls} resize-none`}
      />
      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      <MarketingConsent checked={marketing} onChange={setMarketing} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}
      {/* Ссылки на согласие и политику — в тексте галочки выше: здесь только
          кнопка, чтобы документы не дублировались в двух местах формы */}
      <Button variant="primary" size="md" disabled={sending || !agreed} aria-busy={sending}>
        {sending ? f.sending : f.submit}
      </Button>
    </form>
  )
}

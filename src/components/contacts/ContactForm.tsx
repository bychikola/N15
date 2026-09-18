'use client'

import { useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox, MarketingConsent } from '@/components/ui/ConsentCheckbox'
import { reachGoal } from '@/lib/metrika'

const inputCls =
  'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

/**
 * Форма «Напишите нам» на странице контактов. Отправка — заявка в CRM
 * (/api/applications, тип «Обратный звонок», источник «site»): она попадает
 * в «Неразобранное», агент видит её в разделе заявок. Туда же уходят заявки
 * с форм «Ваша реклама» и просмотра объекта.
 *
 * Перед кнопкой — обязательная галочка согласия на обработку персональных
 * данных: без отметки кнопка «Отправить» неактивна и форма не отправляется.
 * Согласие на рекламные сообщения — отдельная необязательная галочка,
 * на отправку не влияет.
 */
export const ContactForm: FC = () => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'callback',
          clientName: name,
          clientPhone: phone,
          message,
          marketingConsent: marketing,
          status: 'unsorted',
          source: 'site',
        }),
      })
      if (!res.ok) {
        setError(t.contacts.sendError)
        return
      }
      // Цели Метрики: заявка отправлена (lead_form) и, отдельно, что это
      // именно «Обратный звонок» (callback) — в Метрику уходит только факт
      // события, без имени, телефона и текста сообщения
      reachGoal('lead_form')
      reachGoal('callback')
      setSent(true)
    } catch {
      setError(t.contacts.sendError)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="p-6 border border-[var(--n15-green)]/25 bg-[var(--n15-black)]">
        <p className="text-base text-[var(--n15-white)] mb-2">{t.contacts.sentTitle}</p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.contacts.sentText}</p>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.contacts.namePlaceholder}
        className={inputCls}
      />
      <input
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t.contacts.phonePlaceholder}
        className={inputCls}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.contacts.messagePlaceholder}
        rows={4}
        className={`${inputCls} resize-none`}
      />
      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      <MarketingConsent checked={marketing} onChange={setMarketing} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}
      <Button variant="primary" size="md" disabled={sending || !agreed}>
        {sending ? t.contacts.sending : t.contacts.send}
      </Button>
    </form>
  )
}

'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'

/**
 * Форма «Обсудить размещение рекламы» (страница /advertising): имя, компания,
 * телефон, почта, сообщение и обязательное согласие на обработку персональных
 * данных со ссылкой на политику конфиденциальности.
 *
 * Заявка уходит на /api/advertising/request — маршрут проверяет поля и
 * согласие ещё раз и пишет заявку в коллекцию advertising-requests.
 */
export const AdRequestForm: FC<{ lang: string }> = ({ lang }) => {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', message: '' })
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    // Согласие обязательно: без него заявка не принимается (та же проверка
    // на сервере и в коллекции)
    if (!consent) {
      setError(t.advertising.consentRequired)
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/advertising/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent: true }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.advertising.errorSend)
        return
      }
      setSent(true)
    } catch {
      setError(t.advertising.errorSend)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="py-6">
        <p className="text-base text-[var(--n15-white)] mb-3">{t.advertising.sentTitle}</p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.advertising.sentText}</p>
      </div>
    )
  }

  const labelCls = 'text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-1 block'
  const inputCls =
    'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <label>
        <span className={labelCls}>{t.advertising.name}</span>
        <input
          type="text"
          required
          value={form.name}
          onChange={set('name')}
          placeholder={t.advertising.namePlaceholder}
          className={inputCls}
        />
      </label>
      <label>
        <span className={labelCls}>{t.advertising.company}</span>
        <input
          type="text"
          value={form.company}
          onChange={set('company')}
          placeholder={t.advertising.companyPlaceholder}
          className={inputCls}
        />
      </label>
      <label>
        <span className={labelCls}>{t.advertising.phone}</span>
        <input
          type="tel"
          required
          value={form.phone}
          onChange={set('phone')}
          placeholder={t.advertising.phonePlaceholder}
          className={inputCls}
        />
      </label>
      <label>
        <span className={labelCls}>{t.advertising.email}</span>
        <input
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder={t.advertising.emailPlaceholder}
          className={inputCls}
        />
      </label>
      <label>
        <span className={labelCls}>{t.advertising.message}</span>
        <textarea
          rows={4}
          value={form.message}
          onChange={set('message')}
          placeholder={t.advertising.messagePlaceholder}
          className={`${inputCls} resize-none`}
        />
      </label>

      {/* Согласие на обработку персональных данных — обязательная отметка */}
      <label className="flex items-start gap-3 text-xs leading-relaxed text-[var(--n15-muted)]">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked)
            if (e.target.checked) setError('')
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--n15-gold)]"
        />
        <span>
          {t.advertising.consent}{' '}
          <Link
            href={`/${lang}/privacy`}
            target="_blank"
            className="text-[var(--n15-gold)] underline underline-offset-4 hover:text-[var(--n15-gold-light)]"
          >
            {t.advertising.consentLink}
          </Link>
          .
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button variant="primary" size="md" className="w-full" disabled={sending} style={{ color: 'var(--card-price-fg)' }}>
        {sending ? t.advertising.sending : t.advertising.submit}
      </Button>
    </form>
  )
}

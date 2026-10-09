'use client'

import { useId, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { HoneypotField, readServerError, useSpamGuard } from '@/components/ui/SpamGuard'
import { reachGoal } from '@/lib/metrika'

interface Props {
  /** Название комплекса — уходит в заявку, чтобы агент видел, о каком ЖК речь */
  complexName: string
  /** Заголовок карточки: из админки (группа feedback) или текст словаря */
  title: string
  /** Пояснение под заголовком — необязательно */
  text?: string
  /** Подпись кнопки: «Получить консультацию» или «Узнать подробнее» */
  buttonLabel: string
}

/**
 * Карточка обратной связи на публичной странице жилого комплекса: имя,
 * телефон и комментарий. Заявка уходит тем же путём, что и остальные формы
 * сайта, — в REST Payload (/api/applications, тип «consultation», источник
 * «site»): попадает в «Неразобранное» CRM и адресуется агенту. Название ЖК
 * ставится первой строкой сообщения — в карточке заявки сразу видно, с какой
 * страницы пришёл клиент.
 *
 * Обязательное поле одно — телефон: по нему перезванивают (та же логика, что
 * у LeadForm). Перед кнопкой — обязательная галочка согласия на обработку
 * персональных данных; без неё кнопка неактивна и форма не отправляется.
 * От спама защищает невидимая ловушка с временем заполнения (см. SpamGuard).
 */
export const ComplexFeedbackForm: FC<Props> = ({ complexName, title, text, buttonLabel }) => {
  const { t } = useI18n()
  const { honeypot, setHoneypot, spamFields } = useSpamGuard()
  const nameId = useId()
  const phoneId = useId()
  const commentId = useId()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [agreed, setAgreed] = useState(false)
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
      // Комплекс и комментарий — одной заметкой: в CRM заявка читается как есть
      const message = [`ЖК «${complexName}»`, comment.trim()].filter(Boolean).join('\n')
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'consultation',
          clientName: name.trim() || undefined,
          clientPhone: phone,
          message,
          consent: agreed,
          status: 'unsorted',
          source: 'site',
          // Невидимая защита от спама: ловушка и время заполнения формы
          ...spamFields(),
        }),
      })
      if (!res.ok) {
        // Причину отказа объясняет сервер: «Проверьте номер телефона…» и др.
        setError(await readServerError(res, t.complex.feedbackError))
        return
      }
      // Цель Метрики «заявка отправлена» — без персональных данных из формы
      reachGoal('lead_form')
      setSent(true)
    } catch {
      setError(t.complex.feedbackError)
    } finally {
      setSending(false)
    }
  }

  // Инпуты 16 px: на мобиле iOS иначе увеличивает страницу при фокусе (§5)
  const inputCls =
    'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-base text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'
  const labelCls = 'flex flex-col gap-2 text-[11px] tracking-wider uppercase text-[var(--n15-muted)]'

  if (sent) {
    return (
      <div className="border border-[var(--n15-green)]/25 bg-[var(--n15-black)] p-6 md:p-8">
        <p className="mb-2 text-base text-[var(--n15-white)]">{t.complex.feedbackSentTitle}</p>
        <p className="text-sm leading-relaxed text-[var(--n15-muted)]">{t.complex.feedbackSentText}</p>
      </div>
    )
  }

  return (
    <div className="border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 p-6 md:p-8">
      <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{title}</h2>
      {text && <p className="mt-2 mb-5 max-w-2xl text-sm leading-relaxed text-[var(--n15-muted)]">{text}</p>}

      <form onSubmit={(e) => void submit(e)} className="mt-5 flex flex-col gap-4">
        <label className={labelCls} htmlFor={nameId}>
          {t.complex.feedbackName}
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.complex.feedbackNamePlaceholder}
            autoComplete="name"
            className={inputCls}
          />
        </label>

        <label className={labelCls} htmlFor={phoneId}>
          {t.complex.feedbackPhone}
          <input
            id={phoneId}
            type="tel"
            required
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.complex.feedbackPhonePlaceholder}
            autoComplete="tel"
            className={inputCls}
          />
        </label>

        <label className={labelCls} htmlFor={commentId}>
          {t.complex.feedbackComment}
          <textarea
            id={commentId}
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t.complex.feedbackCommentPlaceholder}
            className={`${inputCls} resize-none`}
          />
        </label>

        <ConsentCheckbox checked={agreed} onChange={setAgreed} />
        {/* Невидимая защита от спама: поле-ловушка, человек его не видит */}
        <HoneypotField value={honeypot} onChange={setHoneypot} />

        {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
        {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}

        <Button type="submit" variant="primary" size="lg" disabled={sending || !agreed}>
          {sending ? t.complex.feedbackSending : buttonLabel}
        </Button>
      </form>
    </div>
  )
}

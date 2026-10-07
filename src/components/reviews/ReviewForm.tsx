'use client'

import { useEffect, useState, type FC } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { HoneypotField, readServerError, useSpamGuard } from '@/components/ui/SpamGuard'
import { REVIEW_MAX_RATING, REVIEW_TEXT_LIMITS } from '@/lib/reviews'

/**
 * Форма «Оставить отзыв» — модальное окно со страницы /reviews и из блока
 * «Отзывы клиентов» на главной.
 *
 * Собираем минимум: имя, оценку, текст и необязательную услугу. Телефон,
 * адрес и другие персональные данные не спрашиваем намеренно (ст. 5 152-ФЗ) —
 * для целей отзыва они не нужны. Перед отправкой — обязательная галочка
 * согласия на обработку персональных данных; без неё кнопка неактивна и форма
 * не уходит.
 *
 * Отзыв уходит маршрутом /api/reviews/submit со статусом «Ждут проверки»: на сайте
 * он появится после проверки модератором. От спама — невидимая защита
 * (ловушка и время заполнения, см. components/ui/SpamGuard).
 *
 * Окно закрывается крестиком, Esc и кликом по подложке; фон под ним не
 * прокручивается, а фокус встаёт в первое поле — имя. Пока окно закрыто,
 * разметки нет вовсе (компонент возвращает null).
 */
export const ReviewForm: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n()
  const { honeypot, setHoneypot, spamFields } = useSpamGuard()
  const [name, setName] = useState('')
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [service, setService] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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

  if (!open) return null

  const canSend = name.trim().length > 0 && rating >= 1 && text.trim().length > 0 && agreed

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    if (!canSend) {
      setError(t.reviews.required)
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rating,
          text: text.trim(),
          service: service.trim(),
          consent: agreed,
          // Невидимая защита от спама: ловушка и время заполнения формы
          ...spamFields(),
        }),
      })
      if (!res.ok) {
        // Причину отказа объясняет сервер — показываем её как есть
        setError(await readServerError(res, t.reviews.error))
        return
      }
      setSent(true)
    } catch {
      setError(t.reviews.error)
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="lp-calc-overlay" onClick={onClose}>
      <div
        className="lp-calc-modal review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.reviews.formTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lp-calc-head">
          <h2>{t.reviews.formTitle}</h2>
          <button
            type="button"
            className="lp-calc-close"
            onClick={onClose}
            aria-label={t.reviews.close}
            title={t.reviews.close}
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="review-form__done">
            <strong>{t.reviews.sentTitle}</strong>
            <p>{t.reviews.sentText}</p>
          </div>
        ) : (
          <form className="review-form" onSubmit={(e) => void submit(e)} style={{ marginTop: 16 }}>
            <p className="review-form__hint" style={{ marginTop: 0 }}>{t.reviews.formNote}</p>

            <label>
              <span className="review-form__label">{t.reviews.ratingLabel}</span>
              <span className="review-form__stars" role="radiogroup" aria-label={t.reviews.ratingLabel}>
                {Array.from({ length: REVIEW_MAX_RATING }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={t.reviews.starAria.replace('%d', String(n))}
                    className={n <= rating ? 'review-form__star review-form__star--on' : 'review-form__star'}
                    onClick={() => setRating(n)}
                  >
                    ★
                  </button>
                ))}
              </span>
              {rating === 0 ? <p className="review-form__hint">{t.reviews.ratingHint}</p> : null}
            </label>

            <label>
              <span className="review-form__label">{t.reviews.nameLabel}</span>
              <input
                className="review-form__input"
                type="text"
                required
                maxLength={REVIEW_TEXT_LIMITS.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.reviews.namePlaceholder}
                autoComplete="name"
                autoFocus
              />
            </label>

            <label>
              <span className="review-form__label">{t.reviews.textLabel}</span>
              <textarea
                className="review-form__input"
                required
                rows={5}
                maxLength={REVIEW_TEXT_LIMITS.text}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.reviews.textPlaceholder}
              />
            </label>

            <label>
              <span className="review-form__label">{t.reviews.serviceLabel}</span>
              <input
                className="review-form__input"
                type="text"
                maxLength={REVIEW_TEXT_LIMITS.service}
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder={t.reviews.servicePlaceholder}
              />
            </label>

            <ConsentCheckbox checked={agreed} onChange={setAgreed} />
            {/* Невидимая защита от спама: поле-ловушка, человек его не видит */}
            <HoneypotField value={honeypot} onChange={setHoneypot} />

            {error ? <p className="review-form__error">{error}</p> : null}

            <Button variant="primary" size="md" disabled={sending || !canSend}>
              {sending ? t.reviews.sending : t.reviews.submit}
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

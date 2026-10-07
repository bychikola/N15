'use client'

import { useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { ReviewQueueRow } from '@/lib/review-service'
import { REVIEW_STATUS_LABELS, reviewPublishIssue, type ReviewStatus } from '@/lib/reviews'

/**
 * Раздел CRM «Отзывы» — очередь модерации отзывов с сайта.
 *
 * Отзывы приходят из формы «Оставить отзыв» (маршрут /api/reviews/submit) со статусом
 * «Ждут проверки»: на сайте они появятся только после проверки модератором.
 * Решение принимает команда Н15, действие идёт маршрутом /api/reviews/manage —
 * он повторяет проверку полноты отзыва (reviewPublishIssue), поэтому
 * опубликовать отзыв без имени, оценки или текста не получится и отсюда.
 *
 * Вкладки — четыре статуса: без «Скрытых» вернуть в оборот скрытый отзыв
 * было бы неоткуда, а кнопка «Скрыть» — требование раздела. Свежие сверху:
 * очередь отсортирована по дате получения (loadReviewQueue).
 */

interface Props {
  t: Dict
  rows: ReviewQueueRow[]
  /** Выбранный фильтр статуса ('' — все) */
  status: string
}

/** Цвет плашки статуса — как у остальных статусов CRM */
const statusStyle = (status: string): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    whiteSpace: 'nowrap',
  }
  if (status === 'published') return { ...base, background: '#e6efe4', color: '#3f6b34' }
  if (status === 'pending') return { ...base, background: '#fbf3e6', color: '#8d6b40' }
  if (status === 'rejected') return { ...base, background: '#f6e7e4', color: '#9b4e43' }
  return { ...base, background: '#efeadf', color: '#817b70' }
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const btnStyle: React.CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '9px 14px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  cursor: 'pointer',
}

const btnGold: React.CSSProperties = {
  ...btnStyle,
  border: 0,
  background: '#a7814e',
  color: '#fff',
}

const dateText = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

export const ReviewsModeration: FC<Props> = ({ t, rows, status }) => {
  const router = useRouter()
  // Заметка модератора пишется в карточке и уходит вместе с действием
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  const act = async (id: number, action: string, note?: string) => {
    if (busy) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch('/api/reviews/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action, note }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.crm.reviewsActionFailed)
        return
      }
      router.refresh()
    } catch {
      setError(t.crm.reviewsActionFailed)
    } finally {
      setBusy(null)
    }
  }

  const filters = [
    ...(Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]).map((value) => ({
      value,
      label: REVIEW_STATUS_LABELS[value],
    })),
    { value: '', label: t.crm.filterAll },
  ]

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {filters.map((f) => {
          const active = status === f.value
          return (
            <a
              key={f.value || 'all'}
              href={`/crm/reviews${f.value ? `?status=${f.value}` : ''}`}
              style={{
                border: `1px solid ${active ? '#a7814e' : '#e1d8ca'}`,
                borderRadius: 999,
                background: active ? '#a7814e' : '#fff',
                color: active ? '#fff' : '#716b62',
                padding: '7px 14px',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                textDecoration: 'none',
              }}
            >
              {f.label}
            </a>
          )
        })}
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', alignSelf: 'center', marginLeft: 'auto' }}>
          {t.crm.reviewsFound.replace('%d', String(rows.length))}
        </span>
      </div>

      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {!rows.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.reviewsEmpty}</p>
        </div>
      ) : (
        rows.map((row) => {
          const published = row.status === 'published'
          // Ту же причину назовёт сервер, если нажать «Опубликовать»
          const issue = reviewPublishIssue(row)
          return (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
                <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
                  {row.name || `Отзыв #${row.id}`}
                </strong>
                {/* Оценка звёздами: смысл не в одном цвете — рядом число */}
                <span style={{ color: '#a7814e', fontSize: 14, letterSpacing: 2 }} aria-hidden="true">
                  {'★'.repeat(row.rating)}
                  <span style={{ color: '#ded6c8' }}>{'★'.repeat(Math.max(0, 5 - row.rating))}</span>
                </span>
                <span aria-label={`${t.crm.reviewsRating}: ${row.rating} / 5`} style={{ fontSize: 11, color: '#817b70' }}>
                  {row.rating} / 5
                </span>
                <span style={statusStyle(row.status)}>{REVIEW_STATUS_LABELS[row.status] || row.status}</span>
                <span style={{ fontSize: 11, color: '#817b70' }}>
                  {t.crm.reviewsReceived}: {dateText(row.createdAt)}
                </span>
              </div>

              {row.service ? (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#927046' }}>
                  {t.crm.reviewsService}: {row.service}
                </p>
              ) : null}

              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#454340', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {row.text}
              </p>

              {/* След согласия: без него отзыв не публикуется (ст. 9 152-ФЗ) —
                  по записи видно, что человек согласие дал и когда */}
              <p style={{ margin: '0 0 10px', fontSize: 11, color: row.consent ? '#3f6b34' : '#9b4e43' }}>
                {t.crm.reviewsConsent}: {row.consent ? '✓' : '—'}
                {row.consentAt ? ` · ${dateText(row.consentAt)}` : ''}
              </p>

              {issue && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#9b4e43' }}>
                  {t.crm.reviewsIssue}: {issue}
                </p>
              )}
              {row.moderationNote && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7a5a2e' }}>
                  {t.crm.reviewsNoteWas}: {row.moderationNote}
                </p>
              )}
              {row.moderatedBy && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#817b70' }}>
                  {t.crm.reviewsModerated}: {row.moderatedBy} · {dateText(row.moderatedAt)}
                </p>
              )}

              <textarea
                value={notes[row.id] || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder={t.crm.reviewsNotePh}
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, padding: '9px 11px', fontSize: 12, font: '12px Arial, Helvetica, sans-serif', marginBottom: 10, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {!published && (
                  <button
                    type="button"
                    onClick={() => void act(row.id, 'publish', notes[row.id])}
                    disabled={!!issue || busy === row.id}
                    title={issue || ''}
                    style={{ ...btnGold, opacity: issue || busy === row.id ? 0.45 : 1, cursor: issue ? 'not-allowed' : 'pointer' }}
                  >
                    {t.crm.reviewsPublish}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void act(row.id, 'reject', notes[row.id])}
                  disabled={busy === row.id || row.status === 'rejected'}
                  style={{ ...btnStyle, color: '#9b4e43' }}
                >
                  {t.crm.reviewsReject}
                </button>
                {published && (
                  <button type="button" onClick={() => void act(row.id, 'hide', notes[row.id])} disabled={busy === row.id} style={btnStyle}>
                    {t.crm.reviewsHide}
                  </button>
                )}
                {(row.status === 'rejected' || row.status === 'hidden') && (
                  <button type="button" onClick={() => void act(row.id, 'pending')} disabled={busy === row.id} style={btnStyle}>
                    {t.crm.reviewsRestore}
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

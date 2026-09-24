'use client'

import { useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { BoardQueueRow } from '@/lib/board-service'
import { BOARD_STATUS_LABELS, type BoardStatus } from '@/lib/board'

/**
 * Раздел CRM «Доска» — очередь модерации объявлений.
 *
 * Объявления приходят с сайта (/board/new) со статусом «На модерации»; здесь
 * модератор их читает и решает: опубликовать, вернуть с уточнениями или
 * отклонить. Публикация идёт маршрутом /api/board/manage — он копирует
 * фотографии из закрытого хранилища в media и повторяет проверку
 * boardPublishIssue, поэтому «опубликовать» без фото или без согласий
 * не получится и отсюда.
 *
 * Уточнения и отказ требуют пояснения: без текста автор не поймёт, что
 * исправить, а объявление вернётся к нему молча.
 */

interface Props {
  t: Dict
  rows: BoardQueueRow[]
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
  if (status === 'clarification') return { ...base, background: '#f3ece0', color: '#7a5a2e' }
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

const money = (v: number | null): string => (v == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(v)} ₽`)

export const BoardModeration: FC<Props> = ({ t, rows, status }) => {
  const router = useRouter()
  // Пояснение пишется в карточке и используется кнопками «уточнения» и «отклонить»
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  const act = async (id: number, action: string, note?: string) => {
    if (busy) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch('/api/board/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action, note }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.crm.boardActionFailed)
        return
      }
      router.refresh()
    } catch {
      setError(t.crm.boardActionFailed)
    } finally {
      setBusy(null)
    }
  }

  const filters = [
    { value: 'pending', label: BOARD_STATUS_LABELS.pending },
    { value: 'clarification', label: BOARD_STATUS_LABELS.clarification },
    { value: 'published', label: BOARD_STATUS_LABELS.published },
    { value: 'rejected', label: BOARD_STATUS_LABELS.rejected },
    { value: 'archived', label: BOARD_STATUS_LABELS.archived },
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
              href={`/crm/board${f.value ? `?status=${f.value}` : ''}`}
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
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', alignSelf: 'center' }}>
          {t.crm.boardFound.replace('%d', String(rows.length))}
        </span>
      </div>

      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {!rows.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.boardEmpty}</p>
        </div>
      ) : (
        rows.map((row) => {
          const canPublish = !row.issue
          const published = row.status === 'published'
          return (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
                <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
                  {row.title || `Объявление #${row.id}`}
                </strong>
                <span style={statusStyle(row.status)}>{BOARD_STATUS_LABELS[row.status as BoardStatus] || row.status}</span>
                <span style={{ fontSize: 11, color: '#817b70' }}>
                  {row.dealType === 'rent' ? 'Аренда' : 'Продажа'} · {money(row.price)}
                </span>
                <a
                  href={`/ru/board/${row.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 10, color: '#927046', textTransform: 'uppercase', letterSpacing: '.06em' }}
                >
                  {published ? t.crm.boardOpen : t.crm.boardPreview} →
                </a>
              </div>

              {/* Фотографии: до публикации — из закрытого хранилища (модератор
                  их видит), после — копии, которые уже на сайте */}
              {row.photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {row.photos.map((p, i) => (
                    <img
                      key={`${p.url}-${i}`}
                      src={p.sizes?.thumbnail?.url || p.sizes?.card?.url || p.url}
                      alt=""
                      style={{ width: 92, height: 69, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                    />
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, color: '#25241f', lineHeight: 1.6, marginBottom: 8 }}>
                <div>{row.address || '—'}</div>
                <div style={{ color: '#716b62' }}>
                  {[
                    row.area ? `${row.area} м²` : '',
                    row.plotArea ? `участок ${row.plotArea} м²` : '',
                    row.rooms ? `${row.rooms} комн.` : '',
                    row.floor ? `этаж ${row.floor}${row.totalFloors ? `/${row.totalFloors}` : ''}` : '',
                  ].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>

              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#454340', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {row.description}
              </p>

              {row.videoLinks && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#716b62', whiteSpace: 'pre-line' }}>
                  {t.crm.boardVideo}: {row.videoLinks}
                </p>
              )}

              {/* Контакты автора: модератору нужен телефон, чтобы уточнить детали */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: '#25241f', marginBottom: 10 }}>
                <span>
                  {row.authorKind === 'agency' ? t.board.authorAgency : t.board.authorPrivate}: <strong>{row.authorName}</strong>
                </span>
                <a href={`tel:${row.authorPhone.replace(/[^\d+]/g, '')}`} style={{ color: '#25241f' }}>{row.authorPhone}</a>
                {row.authorEmail && <a href={`mailto:${row.authorEmail}`} style={{ color: '#927046' }}>{row.authorEmail}</a>}
                <span style={{ color: '#817b70' }}>{t.crm.boardCreated}: {dateText(row.createdAt)}</span>
                {row.expiresAt && <span style={{ color: '#817b70' }}>{t.board.expiresAt}: {dateText(row.expiresAt)}</span>}
              </div>

              {/* Почему нельзя опубликовать — тот же текст, что проверяет сервер */}
              {row.issue && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#9b4e43' }}>{t.crm.boardIssue}: {row.issue}</p>
              )}
              {row.moderationNote && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7a5a2e' }}>{t.crm.boardNoteWas}: {row.moderationNote}</p>
              )}

              {row.log.length > 0 && (
                <details style={{ marginBottom: 10 }}>
                  <summary style={{ fontSize: 10, color: '#817b70', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t.crm.boardLog}
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#716b62', lineHeight: 1.6 }}>
                    {row.log.map((e, i) => (
                      <div key={i}>— {e.event} · {dateText(e.at)} · {e.by}</div>
                    ))}
                  </div>
                </details>
              )}

              <textarea
                value={notes[row.id] || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder={t.crm.boardNotePh}
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, padding: '9px 11px', fontSize: 12, font: '12px Arial, Helvetica, sans-serif', marginBottom: 10, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void act(row.id, 'publish')}
                  disabled={!canPublish || busy === row.id}
                  title={row.issue || ''}
                  style={{ ...btnGold, opacity: !canPublish || busy === row.id ? 0.45 : 1, cursor: canPublish ? 'pointer' : 'not-allowed' }}
                >
                  {published ? t.crm.boardRepublish : t.crm.boardPublish}
                </button>
                <button type="button" onClick={() => void act(row.id, 'clarify', notes[row.id])} disabled={busy === row.id} style={btnStyle}>
                  {t.crm.boardClarify}
                </button>
                <button type="button" onClick={() => void act(row.id, 'reject', notes[row.id])} disabled={busy === row.id} style={{ ...btnStyle, color: '#9b4e43' }}>
                  {t.crm.boardReject}
                </button>
                {published && (
                  <>
                    <button type="button" onClick={() => void act(row.id, 'renew')} disabled={busy === row.id} style={btnStyle}>
                      {t.crm.boardRenew}
                    </button>
                    <button type="button" onClick={() => void act(row.id, 'unpublish', notes[row.id])} disabled={busy === row.id} style={btnStyle}>
                      {t.crm.boardUnpublish}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

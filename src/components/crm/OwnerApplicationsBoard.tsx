'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardRow } from '@/lib/owner-service'
import { OWNER_APPLICATION_STATUSES } from '@/lib/owner-applications'

/**
 * Раздел CRM «Заявки собственников» — очередь приёмки объектов от владельцев.
 *
 * Заявка приходит с формы /sell, по телефону или из офиса; до подтверждения
 * телефона и проверки администратором объекта в каталоге нет. Здесь
 * администратор видит телефон и адрес собственника, источник, дату
 * поступления, фотографии, найденные совпадения с базой и историю — и ведёт
 * заявку по статусам: подтверждает телефон вручную (если SMS не ушла),
 * ставит «На проверке», «Подтверждён собственник», создаёт объект (черновик)
 * или связывает заявку с найденным дублем.
 *
 * Все действия идут маршрутом /api/crm/owner-applications/action: он ещё раз
 * проверяет, что вошедший — администратор, и только потом меняет данные
 * (см. applyOwnerAction в src/lib/owner-service.ts). Второй объект по дублю
 * не создаётся: связь с существующей карточкой ставит кнопка «Дубль».
 */

interface Props {
  t: Dict
  rows: OwnerBoardRow[]
  /** Выбранный фильтр статуса ('' — все) */
  status: string
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

const inputStyle: React.CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 12,
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
}

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
  if (status === 'approved' || status === 'owner_confirmed') return { ...base, background: '#eef3e6', color: '#4e7a3a' }
  if (status === 'rejected') return { ...base, background: '#f6e7e4', color: '#9b4e43' }
  if (status === 'duplicate') return { ...base, background: '#f3ece0', color: '#7a5a2e' }
  if (status === 'phone_confirmed' || status === 'checking') return { ...base, background: '#fbf3e6', color: '#8d6b40' }
  return { ...base, background: '#efeadf', color: '#817b70' }
}

const dateText = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const money = (v: number | null): string => (v == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(v)} ₽`)

const confirmLabel = (t: Dict, method: string | null): string =>
  method === 'code'
    ? t.crm.ownVerifiedCode
    : method === 'admin'
      ? t.crm.ownVerifiedAdmin
      : t.crm.ownNotVerified

export const OwnerApplicationsBoard: FC<Props> = ({ t, rows, status }) => {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  // Комментарии и выбранные статусы живут по заявкам: ключ — id заявки
  const [comments, setComments] = useState<Record<number, string>>({})
  const [statuses, setStatuses] = useState<Record<number, string>>({})

  const act = async (id: number, action: string, extra: { note?: string; objectId?: number; status?: string } = {}) => {
    if (busy) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch('/api/crm/owner-applications/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action, ...extra }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.crm.ownActionFailed)
        return
      }
      router.refresh()
    } catch {
      setError(t.crm.ownActionFailed)
    } finally {
      setBusy(null)
    }
  }

  const filters = [
    ...OWNER_APPLICATION_STATUSES.map((s) => ({ value: s.value as string, label: s.label })),
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
              href={`/crm/owner-applications${f.value ? `?status=${f.value}` : ''}`}
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
          {t.crm.ownFound.replace('%d', String(rows.length))}
        </span>
      </div>

      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {!rows.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.ownEmpty}</p>
        </div>
      ) : (
        rows.map((row) => {
          const confirmed = Boolean(row.phoneConfirmedAt)
          const deal = row.type === 'rent' ? t.crm.ownDealRent : t.crm.ownDealSale
          const areaLine = [
            row.area ? `${row.area} м²` : '',
            row.plotArea ? `участок ${row.plotArea} м²` : '',
            row.rooms ? `${row.rooms} комн.` : '',
            row.floor ? `этаж ${row.floor}${row.totalFloors ? `/${row.totalFloors}` : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
                <Link
                  href={`/crm/owner-applications/${row.id}`}
                  style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#25241f', textDecoration: 'none' }}
                >
                  {row.ownerName || `Заявка #${row.id}`}
                </Link>
                <span style={statusStyle(row.status)}>{row.statusLabel}</span>
                <span style={{ fontSize: 11, color: '#817b70' }}>
                  {row.sourceLabel} · {deal} · {row.categoryTitle} · {money(row.price)}
                </span>
                {/* Полная карточка заявки: открывается целиком ещё до создания объекта */}
                <Link
                  href={`/crm/owner-applications/${row.id}`}
                  style={{ ...btnStyle, marginLeft: 'auto', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  {t.crm.ownOpenFull}
                </Link>
              </div>

              {/* Телефон собственника — с подтверждением: без него объект
                  заводить нельзя, поэтому здесь же кнопка ручного подтверждения */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#25241f', marginBottom: 8, alignItems: 'center' }}>
                <a href={`tel:${row.ownerPhone.replace(/[^\d+]/g, '')}`} style={{ color: '#25241f', fontWeight: 600 }}>
                  {row.ownerPhone || '—'}
                </a>
                <span style={{ fontSize: 10, color: confirmed ? '#3f6b34' : '#9b4e43', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {confirmLabel(t, row.phoneConfirmMethod)}
                  {confirmed && row.phoneConfirmedAt ? ` · ${dateText(row.phoneConfirmedAt)}` : ''}
                </span>
                {!confirmed && (
                  <button type="button" onClick={() => void act(row.id, 'confirm_phone')} disabled={busy === row.id} style={btnStyle}>
                    {t.crm.ownConfirmPhone}
                  </button>
                )}
                <span style={{ color: '#817b70', marginLeft: 'auto' }}>
                  {t.crm.ownReceived}: {dateText(row.receivedAt)}
                </span>
              </div>

              {row.verifyCodeSentAt && !confirmed && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#817b70' }}>
                  {t.crm.ownCodeSent}: {dateText(row.verifyCodeSentAt)}
                </p>
              )}

              {row.photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {row.photos.map((p) => (
                    <img
                      key={p.id}
                      src={p.thumb || p.url || ''}
                      alt=""
                      style={{ width: 92, height: 69, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                    />
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, color: '#25241f', lineHeight: 1.6, marginBottom: 8 }}>
                <div>
                  <strong>{t.crm.ownAddress}:</strong> {row.address || '—'}
                  {row.cadastralNumber ? ` · ${t.crm.ownCadastral}: ${row.cadastralNumber}` : ''}
                </div>
                {areaLine && <div style={{ color: '#716b62' }}>{areaLine}</div>}
                <div style={{ color: '#716b62' }}>
                  {t.crm.ownConsent}: {row.consent ? `${t.crm.ownConsentYes}${row.consentAt ? ` · ${dateText(row.consentAt)}` : ''}` : '—'}
                </div>
              </div>

              {row.description && (
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#454340', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {row.description}
                </p>
              )}

              {/* Объект в базе: созданный из заявки или найденный дубль */}
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#25241f' }}>
                {row.objectId ? (
                  <>
                    {t.crm.ownLinkedObject}:{' '}
                    <a href={`/crm/objects?edit=${row.objectId}`} style={{ color: '#927046' }}>
                      {row.objectTitle || `Объект №${row.objectId}`}
                    </a>{' '}
                    {row.objectStatus ? `(${row.objectStatus === 'published' ? t.crm.ownObjectPublished : row.objectStatus === 'draft' ? t.crm.ownObjectDraft : row.objectStatus})` : ''}
                  </>
                ) : (
                  <span style={{ color: '#817b70' }}>{t.crm.ownNoObject}</span>
                )}
                {row.matchedObjectId && row.matchedObjectTitle && (
                  <>
                    {' · '}
                    {t.crm.ownMatchedObject}:{' '}
                    <a href={`/crm/objects?edit=${row.matchedObjectId}`} style={{ color: '#927046' }}>
                      {row.matchedObjectTitle}
                    </a>
                  </>
                )}
              </p>

              {/* Совпадения с объектами базы: телефон, кадастровый номер, адрес,
                  характеристики и фотографии. Второй объект не создаётся —
                  администратор связывает заявку с найденной карточкой */}
              <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: '#fdfbf7' }}>
                <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  {t.crm.ownMatchesTitle}
                </div>
                {!row.duplicates.length ? (
                  <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>{t.crm.ownMatchesNone}</p>
                ) : (
                  row.duplicates.map((d) => (
                    <div key={d.objectId} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', fontSize: 11, color: '#25241f', padding: '5px 0' }}>
                      <a href={`/crm/objects?edit=${d.objectId}`} style={{ color: '#25241f', fontWeight: 600 }}>
                        {d.title}
                      </a>
                      <span style={{ color: '#817b70' }}>
                        {d.address || '—'} · {money(d.price)} · {d.status === 'published' ? t.crm.ownObjectPublished : d.status === 'draft' ? t.crm.ownObjectDraft : d.status || '—'}
                      </span>
                      <span style={{ color: d.strength === 'strong' ? '#9b4e43' : '#8d6b40', fontWeight: 600 }}>
                        {t.crm.ownMatchScore.replace('%d', String(d.score))}
                        {d.signals.length ? ` · ${t.crm.ownMatchSignals} ${d.signals.join(', ')}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => void act(row.id, 'duplicate', { objectId: d.objectId })}
                        disabled={busy === row.id}
                        style={{ ...btnStyle, marginLeft: 'auto', color: '#9b4e43' }}
                      >
                        {t.crm.ownMatchLink}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Внутренний комментарий — только для CRM */}
              <textarea
                value={comments[row.id] ?? row.internalComment ?? ''}
                onChange={(e) => setComments((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder={t.crm.ownCommentPh}
                rows={2}
                style={{ ...inputStyle, width: '100%', marginBottom: 8, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => void act(row.id, 'comment', { note: comments[row.id] ?? row.internalComment ?? '' })}
                  disabled={busy === row.id}
                  style={btnStyle}
                >
                  {t.crm.ownCommentSave}
                </button>
                {/* Смена статуса вручную: любое значение из пути заявки */}
                <select
                  value={statuses[row.id] ?? row.status}
                  onChange={(e) => setStatuses((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  aria-label={t.crm.ownStatusLabel}
                >
                  {OWNER_APPLICATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void act(row.id, 'status', { status: statuses[row.id] ?? row.status })}
                  disabled={busy === row.id}
                  style={btnStyle}
                >
                  {t.crm.ownSetStatus}
                </button>
                {/* Объект создаётся только вручную и только после подтверждения
                    телефона — до этого кнопка недоступна */}
                {!row.objectId && (
                  <button
                    type="button"
                    onClick={() => void act(row.id, 'create_object')}
                    disabled={busy === row.id || !confirmed}
                    title={!confirmed ? t.crm.ownNeedPhone : ''}
                    style={{ ...btnGold, marginLeft: 'auto', opacity: busy === row.id || !confirmed ? 0.45 : 1, cursor: confirmed ? 'pointer' : 'not-allowed' }}
                  >
                    {t.crm.ownCreateObject}
                  </button>
                )}
              </div>

              {row.history.length > 0 && (
                <details>
                  <summary style={{ fontSize: 10, color: '#817b70', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t.crm.ownHistory}
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#716b62', lineHeight: 1.6 }}>
                    {row.history.map((h, i) => (
                      <div key={i}>
                        — {h.action} · {dateText(h.at)}
                        {h.by ? ` · ${h.by}` : ''}
                        {h.note ? ` · ${h.note}` : ''}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

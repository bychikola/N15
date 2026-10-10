'use client'

import { useState, type FC, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardRow } from '@/lib/owner-service'
import { OWNER_APPLICATION_STATUSES } from '@/lib/owner-applications'

/**
 * Полная карточка одной заявки собственника (страница
 * /crm/owner-applications/[id]). Здесь администратор видит всё, что отправил
 * владелец: фотографии, адрес, площадь, комнаты, этаж и этажность, стоимость,
 * описание, имя и телефон, дату поступления, согласие, историю статусов и
 * внутренний комментарий.
 *
 * Заявка — отдельная сущность и открывается целиком ещё до создания объекта.
 * Кнопка «Создать объект» остаётся здесь же; как только объект заведён,
 * рядом появляется ссылка «Открыть объект» — она ведёт в карточку объекта
 * (черновика) в разделе «Объекты».
 *
 * Действия идут тем же маршрутом /api/crm/owner-applications/action, что и в
 * списке: он ещё раз проверяет роль администратора и меняет данные
 * (см. applyOwnerAction в src/lib/owner-service.ts).
 */

interface Props {
  t: Dict
  row: OwnerBoardRow
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  padding: 20,
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

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  color: '#817b70',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 8,
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

/** Строка «подпись — значение» в сетке характеристик заявки */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.09em' }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 13, color: '#25241f' }}>{value}</div>
    </div>
  )
}

export const OwnerApplicationCard: FC<Props> = ({ t, row }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState(row.internalComment ?? '')
  const [status, setStatus] = useState(row.status)
  // Объект, созданный прямо сейчас: ссылку «Открыть объект» показываем сразу,
  // не дожидаясь обновления страницы
  const [createdObjectId, setCreatedObjectId] = useState<number | null>(null)

  const confirmed = Boolean(row.phoneConfirmedAt)
  const deal = row.type === 'rent' ? t.crm.ownDealRent : t.crm.ownDealSale
  const objectId = row.objectId ?? createdObjectId
  const objectTitle = row.objectTitle || (objectId ? `Объект №${objectId}` : '')

  const act = async (
    action: string,
    extra: { note?: string; objectId?: number; status?: string } = {},
  ): Promise<{ objectId?: number } | null> => {
    if (busy) return null
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/crm/owner-applications/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: row.id, action, ...extra }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; objectId?: number } | null
      if (!res.ok) {
        setError(data?.error || t.crm.ownActionFailed)
        return null
      }
      router.refresh()
      return data
    } catch {
      setError(t.crm.ownActionFailed)
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
          {row.ownerName || `${t.crm.ownApplication} #${row.id}`}
        </strong>
        <span style={statusStyle(row.status)}>{row.statusLabel}</span>
        <span style={{ fontSize: 11, color: '#817b70' }}>
          {row.sourceLabel} · {deal} · {row.categoryTitle} · {money(row.price)}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#817b70', marginBottom: 16 }}>
        {t.crm.ownReceived}: {dateText(row.receivedAt)}
      </div>

      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, marginBottom: 18 }}>
        <Field label={t.crm.ownPrice} value={money(row.price)} />
        <Field
          label={t.crm.ownArea}
          value={row.area != null ? `${row.area} м²` : '—'}
        />
        {row.plotArea != null && <Field label={t.crm.ownPlotArea} value={`${row.plotArea} м²`} />}
        <Field label={t.crm.ownRooms} value={row.rooms != null ? String(row.rooms) : '—'} />
        <Field
          label={t.crm.ownFloor}
          value={
            row.floor != null
              ? `${row.floor}${row.totalFloors != null ? ` / ${row.totalFloors}` : ''}`
              : '—'
          }
        />
        <Field label={t.crm.ownCategory} value={row.categoryTitle || '—'} />
        <Field label={t.crm.ownDeal} value={deal} />
      </div>

      {row.photos.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>{t.crm.ownPhotos}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {row.photos.map((p) => (
              <a key={p.id} href={p.url || p.thumb || '#'} target="_blank" rel="noopener">
                <img
                  src={p.thumb || p.url || ''}
                  alt=""
                  style={{ width: 150, height: 112, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={sectionTitle}>{t.crm.ownAddress}</div>
        <div style={{ fontSize: 13, color: '#25241f', lineHeight: 1.6 }}>
          {row.address || '—'}
          {row.cadastralNumber ? <span style={{ color: '#716b62' }}> · {t.crm.ownCadastral}: {row.cadastralNumber}</span> : null}
        </div>
      </div>

      {row.description && (
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>{t.crm.ownDescription}</div>
          <p style={{ margin: 0, fontSize: 13, color: '#454340', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {row.description}
          </p>
        </div>
      )}

      {/* Имя и телефон собственника: без подтверждённого телефона объект
          заводить нельзя, поэтому кнопка ручного подтверждения — здесь же */}
      <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '12px 14px', marginBottom: 18, background: '#fdfbf7' }}>
        <div style={sectionTitle}>{t.crm.ownContact}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 13, color: '#25241f' }}>
          <span style={{ fontWeight: 600 }}>{row.ownerName || '—'}</span>
          <a href={`tel:${row.ownerPhone.replace(/[^\d+]/g, '')}`} style={{ color: '#25241f', fontWeight: 600 }}>
            {row.ownerPhone || '—'}
          </a>
          <span style={{ fontSize: 10, color: confirmed ? '#3f6b34' : '#9b4e43', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {confirmLabel(t, row.phoneConfirmMethod)}
            {confirmed && row.phoneConfirmedAt ? ` · ${dateText(row.phoneConfirmedAt)}` : ''}
          </span>
          {!confirmed && (
            <button type="button" onClick={() => void act('confirm_phone')} disabled={busy} style={btnStyle}>
              {t.crm.ownConfirmPhone}
            </button>
          )}
        </div>
        {row.verifyCodeSentAt && !confirmed && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#817b70' }}>
            {t.crm.ownCodeSent}: {dateText(row.verifyCodeSentAt)}
          </p>
        )}
      </div>

      {/* Согласие на обработку данных — фиксируем получение и его дату */}
      <div style={{ marginBottom: 18 }}>
        <div style={sectionTitle}>{t.crm.ownConsent}</div>
        <div style={{ fontSize: 13, color: row.consent ? '#3f6b34' : '#817b70' }}>
          {row.consent
            ? `${t.crm.ownConsentYes}${row.consentAt ? ` · ${dateText(row.consentAt)}` : ''}`
            : t.crm.ownConsentNo}
        </div>
      </div>

      {/* Объект в базе: созданный из заявки или найденный дубль */}
      <div style={{ marginBottom: 18 }}>
        <div style={sectionTitle}>{t.crm.ownLinkedObject}</div>
        {objectId ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: '#25241f' }}>
              {objectTitle}{' '}
              {row.objectStatus ? (
                <span style={{ color: '#817b70' }}>
                  ({row.objectStatus === 'published' ? t.crm.ownObjectPublished : row.objectStatus === 'draft' ? t.crm.ownObjectDraft : row.objectStatus})
                </span>
              ) : null}
            </span>
            <a
              href={`/crm/objects?edit=${objectId}`}
              style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              {t.crm.ownOpenObject}
            </a>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: '#817b70' }}>{t.crm.ownNoObject}</span>
        )}
        {row.matchedObjectId && row.matchedObjectTitle && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#716b62' }}>
            {t.crm.ownMatchedObject}:{' '}
            <a href={`/crm/objects?edit=${row.matchedObjectId}`} style={{ color: '#927046' }}>
              {row.matchedObjectTitle}
            </a>
          </div>
        )}
      </div>

      {/* Возможные совпадения с объектами базы: второй объект не создаётся —
          администратор связывает заявку с найденной карточкой */}
      <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '10px 12px', marginBottom: 18, background: '#fdfbf7' }}>
        <div style={sectionTitle}>{t.crm.ownMatchesTitle}</div>
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
                onClick={() => void act('duplicate', { objectId: d.objectId })}
                disabled={busy}
                style={{ ...btnStyle, marginLeft: 'auto', color: '#9b4e43' }}
              >
                {t.crm.ownMatchLink}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Внутренний комментарий — только для CRM */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>{t.crm.ownInternalComment}</div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t.crm.ownCommentPh}
          rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <button type="button" onClick={() => void act('comment', { note: comment })} disabled={busy} style={btnStyle}>
          {t.crm.ownCommentSave}
        </button>
        {/* Смена статуса вручную: любое значение из пути заявки */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
          aria-label={t.crm.ownStatusLabel}
        >
          {OWNER_APPLICATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void act('status', { status })} disabled={busy} style={btnStyle}>
          {t.crm.ownSetStatus}
        </button>
        {/* Объект заводится только вручную и только после подтверждения
            телефона — до этого кнопка недоступна */}
        {!objectId && (
          <button
            type="button"
            onClick={() => {
              void act('create_object').then((res) => {
                if (res?.objectId) setCreatedObjectId(res.objectId)
              })
            }}
            disabled={busy || !confirmed}
            title={!confirmed ? t.crm.ownNeedPhone : ''}
            style={{ ...btnGold, marginLeft: 'auto', opacity: busy || !confirmed ? 0.45 : 1, cursor: confirmed ? 'pointer' : 'not-allowed' }}
          >
            {t.crm.ownCreateObject}
          </button>
        )}
      </div>

      <div>
        <div style={sectionTitle}>{t.crm.ownHistory}</div>
        {!row.history.length ? (
          <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>{t.crm.ownHistoryEmpty}</p>
        ) : (
          <div style={{ fontSize: 11, color: '#716b62', lineHeight: 1.8 }}>
            {row.history.map((h, i) => (
              <div key={i}>
                — {h.action} · {dateText(h.at)}
                {h.by ? ` · ${h.by}` : ''}
                {h.note ? ` · ${h.note}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

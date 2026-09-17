'use client'

import { useState, type FC, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import {
  AD_CONTACT_KIND_LABELS,
  AD_FORMAT_LABELS,
  AD_PAYMENT_LABELS,
  AD_OBJECT_TYPE_LABELS,
  AD_REQUEST_STATUS_LABELS,
  adRequestTotal,
  type AdContactKind,
  type AdFormat,
  type AdObjectType,
  type AdPaymentStatus,
  type AdRequestStatus,
} from '@/lib/advertising'
import type { AdRequestRow } from '@/lib/advertising-service'

/**
 * Карточки заявок «Ваша реклама» в разделе CRM «Реклама»: рекламодатель,
 * объект, ссылка, фотографии и видео, срок, стоимость и статус — и кнопки
 * «Взять в проверку», «Одобрить», «Запросить уточнения», «Отклонить»,
 * «Сформировать договор», «Опубликовать», «Снять с публикации».
 *
 * Всё, что нужно для публикации, заполняется здесь же: стоимость, скидка,
 * формат, срок и оплата (блок «Стоимость и оплата»), проверка содержания
 * и erid (блок «Проверка содержания»). Кнопка «Опубликовать» заблокирована,
 * пока условия не выполнены, — причину показывает сервер и движок правил
 * (adRequestPublishIssue в src/lib/advertising.ts).
 *
 * Фотографии заявки лежат в закрытом хранилище: до публикации их видит
 * только команда Н15 (ссылки в карточке), на сайт они попадают копиями
 * в media в момент публикации.
 */

interface Props {
  t: Dict
  requests: AdRequestRow[]
}

/** Подстановка %s/%d в строку словаря (как в CrmObjects) */
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out.replace(/%%/g, '%')
}

const rub = (v: number): string => new Intl.NumberFormat('ru-RU').format(v)

const fmtMoment = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const reqStatusStyle = (status: string): { bg: string; color: string } => {
  if (status === 'published') return { bg: '#e6efe1', color: '#3f6b34' }
  if (status === 'approved') return { bg: '#e9f0e2', color: '#48663a' }
  if (status === 'awaitingPayment') return { bg: '#f4e6d3', color: '#8d5a20' }
  if (status === 'checking' || status === 'clarification') return { bg: '#f2eadf', color: '#8d6b40' }
  if (status === 'rejected') return { bg: '#f0e2de', color: '#9b4e43' }
  return { bg: '#ece8e0', color: '#716b62' }
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  background: '#fff',
  padding: 20,
  display: 'grid',
  gap: 14,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.09em',
  color: '#a49d91',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 12,
  background: '#fdfbf8',
  color: '#4a453e',
}

const linkStyle: React.CSSProperties = { color: '#8d6b40', fontSize: 12, wordBreak: 'break-all' }

/** Кнопка действия: основная — заливка, второстепенная — рамка */
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  border: primary ? 0 : '1px solid #e1d8ca',
  borderRadius: 7,
  background: disabled ? '#e8e3da' : primary ? '#a7814e' : '#faf7f2',
  color: disabled ? '#a49d91' : primary ? '#fff' : '#716b62',
  padding: '11px 16px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

/** Одно поле карточки: подпись сверху, значение под ней */
const Field: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div>
    <dt style={fieldLabel}>{label}</dt>
    <dd style={{ margin: '6px 0 0', fontSize: 12, color: '#4a453e' }}>{children}</dd>
  </div>
)

export const AdRequestsBoard: FC<Props> = ({ t, requests }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(0)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  /** Открытый договор заявки: id или 0 */
  const [contractFor, setContractFor] = useState(0)

  /** Общий вызов действий раздела: { action, id, ... } */
  const act = async (
    id: number,
    action: string,
    payload: Record<string, unknown> = {},
    okText = '',
  ): Promise<boolean> => {
    setBusy(id)
    setNotice(null)
    try {
      const res = await fetch('/api/advertising/request-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, id, ...payload }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; email?: string } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || t.crm.adActionError })
        return false
      }
      setNotice({ tone: 'ok', text: okText || t.crm.adReqStatusSaved })
      // Данные раздела — серверные: после действия перечитываем страницу
      router.refresh()
      return true
    } catch {
      setNotice({ tone: 'err', text: t.crm.adActionError })
      return false
    } finally {
      setBusy(0)
    }
  }

  if (requests.length === 0) {
    return (
      <div className="crm-empty">
        <strong>{t.crm.adBoardRequestsEmpty}</strong>
      </div>
    )
  }

  return (
    <>
      {notice && (
        <p className={notice.tone === 'ok' ? 'crm-team-ok' : 'crm-team-error'} style={{ marginBottom: 16 }}>
          {notice.text}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {requests.map((r) => {
          const published = r.status === 'published'
          const closed = r.status === 'done' || r.status === 'rejected'
          const advertiser = [r.company, r.name].filter(Boolean).join(' · ') || r.name
          return (
            <article key={r.id} style={cardStyle}>
              <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 7px', font: "400 18px 'New Standard', Georgia, serif" }}>
                    № {r.id} · {advertiser}
                  </h3>
                  <p style={{ margin: 0, color: '#817b70', fontSize: 11 }}>
                    {AD_CONTACT_KIND_LABELS[r.contactKind as AdContactKind] || r.contactKind}
                    {r.createdAt ? ` · ${fmt(t.crm.adCreated, fmtMoment(r.createdAt))}` : ''}
                    {r.visible ? ` · ${t.crm.adOnSite}` : ''}
                  </p>
                </div>
                <span className="crm-status" style={reqStatusStyle(r.status)}>
                  {AD_REQUEST_STATUS_LABELS[r.status as AdRequestStatus] || r.status}
                </span>
              </header>

              {/* Связь с рекламодателем */}
              <p style={{ margin: 0, fontSize: 12, color: '#4a453e' }}>
                {r.phone && (
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} style={{ ...linkStyle, marginRight: 12 }}>
                    {r.phone}
                  </a>
                )}
                {r.email && (
                  <a href={`mailto:${r.email}`} style={linkStyle}>
                    {r.email}
                  </a>
                )}
              </p>

              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 12,
                  margin: 0,
                }}
              >
                <Field label={t.crm.adReqObjectType}>
                  {AD_OBJECT_TYPE_LABELS[r.objectType as AdObjectType] || '—'}
                </Field>
                <Field label={t.crm.adReqLocation}>{r.location || '—'}</Field>
                <Field label={t.crm.adReqPrice}>{r.price || '—'}</Field>
                <Field label={t.crm.adReqDesiredTerm}>{r.desiredTerm || '—'}</Field>
                <Field label={t.crm.adReqTerm}>
                  {r.termDays ? `${r.termDays} дн.` : '—'}
                  {r.startDate ? ` · ${fmtMoment(r.startDate)}` : ''}
                </Field>
                <Field label={t.crm.adReqEndDate}>
                  {r.endDateText || '—'}
                  {r.expired && <span style={{ color: '#9b4e43' }}> · {t.crm.adExpired}</span>}
                </Field>
              </dl>

              {r.description && (
                <p style={{ margin: 0, fontSize: 12, color: '#4a453e', whiteSpace: 'pre-wrap' }}>{r.description}</p>
              )}

              {r.message && (
                <p style={{ margin: 0, fontSize: 11, color: '#817b70', whiteSpace: 'pre-wrap' }}>
                  {t.crm.adReqMessage}: {r.message}
                </p>
              )}

              {r.listingUrl && (
                <p style={{ margin: 0, fontSize: 11 }}>
                  {t.crm.adReqListing}:{' '}
                  <a href={r.listingUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    {r.listingUrl}
                  </a>
                </p>
              )}

              {r.videoLinks.length > 0 && (
                <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>
                  {t.crm.adReqVideos}:{' '}
                  {r.videoLinks.map((link, index) => (
                    <span key={link}>
                      {index > 0 && ' · '}
                      <a href={link} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        {link}
                      </a>
                    </span>
                  ))}
                </p>
              )}

              {/* Фотографии заявки — закрытое хранилище, до публикации только для команды */}
              <div>
                <p style={{ margin: '0 0 8px', ...fieldLabel }}>
                  {t.crm.adReqPhotos}: {r.photos.length || t.crm.adReqNoPhotos}
                  {r.publicPhotos.length ? ` · на сайте: ${r.publicPhotos.length}` : ''}
                </p>
                {r.photos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {r.photos.map((photo) => (
                      <a
                        key={photo.id || photo.url}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={photo.filename}
                        style={{ display: 'block', lineHeight: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- закрытое хранилище Payload, next/image не нужен */}
                        <img
                          src={photo.thumbUrl}
                          alt={photo.filename}
                          style={{ width: 92, height: 69, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5dfd3' }}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Согласия формы: три отдельные отметки — показываем поимённо */}
              <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>
                {t.crm.adReqConsents}:{' '}
                <span style={{ color: r.consents.offer ? '#3f6b34' : '#9b4e43' }}>
                  оферта {r.consents.offer ? '✓' : '—'}
                </span>{' '}
                ·{' '}
                <span style={{ color: r.consents.rights ? '#3f6b34' : '#9b4e43' }}>
                  права на материалы {r.consents.rights ? '✓' : '—'}
                </span>{' '}
                ·{' '}
                <span style={{ color: r.consents.data ? '#3f6b34' : '#9b4e43' }}>
                  персональные данные {r.consents.data ? '✓' : '—'}
                </span>{' '}
                {r.consentAt ? `· ${fmtMoment(r.consentAt)}` : ''}
                {r.offerVersion ? ` · ${t.crm.adReqOfferVersion}: ${r.offerVersion}` : ''}
                {r.ip ? ` · ${t.crm.adReqIp}: ${r.ip}` : ''}
              </p>

              {/* Проверка содержания и erid — без них публикация невозможна */}
              <CheckForm r={r} t={t} busy={busy} onSave={act} />
              {/* Стоимость, скидка, формат, срок и оплата */}
              <PaymentForm r={r} t={t} busy={busy} onSave={act} />

              {r.markingText && (
                <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>
                  {t.crm.adMarking}: {r.markingText}
                </p>
              )}

              {r.contractFileUrl && (
                <p style={{ margin: 0, fontSize: 11, color: '#817b70' }}>
                  {t.crm.adReqContract}:{' '}
                  <a href={r.contractFileUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    PDF
                  </a>
                  {r.contractSentAt ? ` · ${fmtMoment(r.contractSentAt)}` : ''}
                  {r.contractEmail ? ` · ${r.contractEmail}` : ''}
                </p>
              )}

              {r.log.length > 0 && (
                <p style={{ margin: 0, fontSize: 10, lineHeight: 1.7, color: '#a49d91' }}>
                  {t.crm.adLog}:{' '}
                  {r.log
                    .slice(-4)
                    .map((e) => `${fmtMoment(e.at)} — ${e.event || '—'} (${e.by || '—'})`)
                    .join(' · ')}
                </p>
              )}

              {!published && r.issue && (
                <p style={{ margin: 0, color: '#9b4e43', fontSize: 11 }}>{fmt(t.crm.adIssue, r.issue)}</p>
              )}

              {/* Кнопки действий по заявке */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {r.status === 'new' && (
                  <button
                    type="button"
                    style={btn(false)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'check')}
                  >
                    {t.crm.adReqTakeCheck}
                  </button>
                )}
                {(r.status === 'new' || r.status === 'checking' || r.status === 'clarification') && (
                  <button
                    type="button"
                    style={btn(true)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'approve')}
                  >
                    {t.crm.adReqApprove}
                  </button>
                )}
                {!closed && !published && r.status !== 'new' && (
                  <button
                    type="button"
                    style={btn(false)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'clarify')}
                  >
                    {t.crm.adReqClarify}
                  </button>
                )}
                {!closed && !published && (
                  <button
                    type="button"
                    style={btn(false)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'reject')}
                  >
                    {t.crm.adReqReject}
                  </button>
                )}
                <button
                  type="button"
                  style={btn(false)}
                  disabled={busy === r.id}
                  onClick={() => setContractFor(contractFor === r.id ? 0 : r.id)}
                >
                  {t.crm.adReqContract}
                </button>
                {!published && !closed && (
                  <button
                    type="button"
                    style={btn(true, !!r.issue || busy === r.id)}
                    disabled={busy === r.id || !!r.issue}
                    onClick={() => void act(r.id, 'publish')}
                    title={r.issue || undefined}
                  >
                    {busy === r.id ? t.crm.adPublishing : t.crm.adPublish}
                  </button>
                )}
                {published && (
                  <button
                    type="button"
                    style={btn(false)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'unpublish')}
                  >
                    {busy === r.id ? t.crm.adUnpublishing : t.crm.adUnpublish}
                  </button>
                )}
                {!closed && !published && r.status !== 'new' && (
                  <button
                    type="button"
                    style={btn(false)}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, 'done')}
                  >
                    {t.crm.adReqDone}
                  </button>
                )}
              </div>

              {/* Договор: почта и заметка, затем формирование PDF и отправка */}
              {contractFor === r.id && (
                <ContractForm
                  r={r}
                  t={t}
                  busy={busy}
                  onSend={async (email, note) => {
                    const ok = await act(r.id, 'contract', { email, note })
                    if (ok) setContractFor(0)
                    return ok
                  }}
                  onCancel={() => setContractFor(0)}
                />
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}

/** Блок «Проверка содержания»: отметка, erid и замечания */
const CheckForm: FC<{
  r: AdRequestRow
  t: Dict
  busy: number
  onSave: (id: number, action: string, payload?: Record<string, unknown>, okText?: string) => Promise<boolean>
}> = ({ r, t, busy, onSave }) => {
  const [checked, setChecked] = useState(r.contentChecked)
  const [erid, setErid] = useState(r.erid)
  const [note, setNote] = useState(r.contentNote)

  return (
    <div style={{ border: '1px solid #ece7dd', borderRadius: 9, padding: 14, display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, ...fieldLabel }}>{t.crm.adReqContent}</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4a453e' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ accentColor: '#a7814e' }}
        />
        {checked ? t.crm.adReqContentYes : t.crm.adReqContentNo}
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ ...fieldLabel }}>{t.crm.adReqErid}</span>
        <input
          type="text"
          value={erid}
          onChange={(e) => setErid(e.target.value)}
          placeholder="2Vfnxx…"
          style={inputStyle}
        />
        <span style={{ fontSize: 10, color: '#a49d91' }}>{t.crm.adReqEridHint}</span>
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ ...fieldLabel }}>{t.crm.adReqContentNote}</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <div>
        <button
          type="button"
          style={btn(false, busy === r.id)}
          disabled={busy === r.id}
          onClick={() => void onSave(r.id, 'saveCheck', { contentChecked: checked, erid, contentNote: note }, t.crm.adReqContentSaved)}
        >
          {t.crm.adReqSave}
        </button>
      </div>
    </div>
  )
}

/** Блок «Стоимость и оплата»: условия размещения, которые видит рекламодатель */
const PaymentForm: FC<{
  r: AdRequestRow
  t: Dict
  busy: number
  onSave: (id: number, action: string, payload?: Record<string, unknown>, okText?: string) => Promise<boolean>
}> = ({ r, t, busy, onSave }) => {
  const [cost, setCost] = useState(r.cost !== null ? String(r.cost) : '')
  const [discount, setDiscount] = useState(r.discount !== null ? String(r.discount) : '')
  const [format, setFormat] = useState(r.format)
  const [termDays, setTermDays] = useState(r.termDays !== null ? String(r.termDays) : '')
  const [paymentStatus, setPaymentStatus] = useState(r.paymentStatus)
  const [waived, setWaived] = useState(r.paymentWaived)
  const [note, setNote] = useState(r.paymentNote)

  /** Итог считаем на месте: он должен быть виден до сохранения */
  const liveTotal = adRequestTotal(
    cost.trim() ? Number(cost) : null,
    discount.trim() ? Number(discount) : null,
  )

  return (
    <div style={{ border: '1px solid #ece7dd', borderRadius: 9, padding: 14, display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, ...fieldLabel }}>{t.crm.adReqPayment}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...fieldLabel }}>{t.crm.adReqCost}</span>
          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...fieldLabel }}>{t.crm.adReqDiscount}</span>
          <input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...fieldLabel }}>{t.crm.adReqFormat}</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={inputStyle}>
            {(Object.keys(AD_FORMAT_LABELS) as AdFormat[]).map((key) => (
              <option key={key} value={key}>
                {AD_FORMAT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...fieldLabel }}>{t.crm.adReqTermDays}</span>
          <input
            type="number"
            min={1}
            value={termDays}
            onChange={(e) => setTermDays(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...fieldLabel }}>{t.crm.adReqPaymentStatus}</span>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} style={inputStyle}>
            {(Object.keys(AD_PAYMENT_LABELS) as AdPaymentStatus[]).map((key) => (
              <option key={key} value={key}>
                {AD_PAYMENT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: '#4a453e' }}>
        {t.crm.adReqTotal}: <strong>{rub(liveTotal)} ₽</strong>
        {waived && <span style={{ color: '#8d6b40' }}> · {t.crm.adReqWaived}</span>}
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4a453e' }}>
        <input
          type="checkbox"
          checked={waived}
          onChange={(e) => setWaived(e.target.checked)}
          style={{ accentColor: '#a7814e' }}
        />
        {t.crm.adReqWaived}
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ ...fieldLabel }}>{t.crm.adReqPaymentNote}</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </label>

      <div>
        <button
          type="button"
          style={btn(true, busy === r.id)}
          disabled={busy === r.id}
          onClick={() =>
            void onSave(
              r.id,
              'savePayment',
              {
                cost: cost.trim() ? Number(cost) : null,
                discount: discount.trim() ? Number(discount) : null,
                format,
                termDays: termDays.trim() ? Number(termDays) : null,
                paymentStatus,
                paymentWaived: waived,
                paymentNote: note,
              },
              t.crm.adReqPaymentSaved,
            )
          }
        >
          {t.crm.adReqSave}
        </button>
      </div>
    </div>
  )
}

/** Договор: почта получателя и заметка, затем PDF и отправка письма */
const ContractForm: FC<{
  r: AdRequestRow
  t: Dict
  busy: number
  onSend: (email: string, note: string) => Promise<boolean>
  onCancel: () => void
}> = ({ r, t, busy, onSend, onCancel }) => {
  const [email, setEmail] = useState(r.contractEmail || r.email)
  const [note, setNote] = useState('')

  return (
    <div style={{ border: '1px solid #ece7dd', borderRadius: 9, padding: 14, display: 'grid', gap: 12, background: '#fdfbf8' }}>
      <p style={{ margin: 0, ...fieldLabel }}>{t.crm.adReqContract}</p>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ ...fieldLabel }}>{t.crm.adReqContractEmail}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ ...fieldLabel }}>{t.crm.adReqPaymentNote}</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          style={btn(true, busy === r.id)}
          disabled={busy === r.id}
          onClick={() => void onSend(email, note)}
        >
          {t.crm.adReqContractSend}
        </button>
        <button type="button" style={btn(false)} onClick={onCancel}>
          {t.crm.adReqContractCancel}
        </button>
      </div>
    </div>
  )
}

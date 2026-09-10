'use client'

import { useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import {
  AD_PAYMENT_LABELS,
  AD_STATUS_LABELS,
  ADVERTISER_STATUS_LABELS,
  type AdPaymentStatus,
  type AdStatus,
  type AdvertiserStatus,
} from '@/lib/advertising'
import type { AdBoardRow, AdRequestRow } from '@/lib/advertising-service'

/**
 * Раздел CRM «Реклама»: рекламные материалы со сроком, стоимостью, статусом
 * оплаты и датами — и кнопки «Опубликовать» / «Снять с публикации»
 * (маршрут /api/advertising/publish-manage, правила — src/lib/advertising.ts).
 * Ниже — заявки с формы страницы /advertising с отметкой согласия.
 *
 * Кнопка публикации заблокирована, пока не выполнены условия размещения:
 * подтверждение рекламодателя, проверка содержания, оплата, срок и erid.
 * Причина показывается рядом с материалом — её же вернёт и сервер.
 */

interface Props {
  t: Dict
  ads: AdBoardRow[]
  requests: AdRequestRow[]
}

// Подстановка %s в строку словаря (как в CrmObjects)
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

const statusStyle = (status: string): { bg: string; color: string } => {
  if (status === 'published') return { bg: '#e6efe1', color: '#3f6b34' }
  if (status === 'ready') return { bg: '#f2eadf', color: '#8d6b40' }
  if (status === 'removed') return { bg: '#ece8e0', color: '#716b62' }
  return { bg: '#f2eee5', color: '#817b70' }
}

const advertiserStyle = (status: string): { bg: string; color: string } => {
  if (status === 'confirmed') return { bg: '#e6efe1', color: '#3f6b34' }
  if (status === 'rejected') return { bg: '#f0e2de', color: '#9b4e43' }
  return { bg: '#f2eee5', color: '#817b70' }
}

export const AdvertisingBoard: FC<Props> = ({ t, ads, requests }) => {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const act = async (id: number, action: 'publish' | 'unpublish') => {
    if (busy !== null) return
    setBusy(id)
    setNotice(null)
    try {
      const res = await fetch('/api/advertising/publish-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, id }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || t.crm.adActionError })
        return
      }
      setNotice({ tone: 'ok', text: action === 'publish' ? t.crm.adPublished : t.crm.adUnpublished })
      // Данные раздела — серверные: после действия перечитываем страницу
      router.refresh()
    } catch {
      setNotice({ tone: 'err', text: t.crm.adActionError })
    } finally {
      setBusy(null)
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    border: primary ? 0 : '1px solid #e1d8ca',
    borderRadius: 7,
    background: primary ? '#a7814e' : '#faf7f2',
    color: primary ? '#fff' : '#716b62',
    padding: '11px 16px',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    cursor: 'pointer',
  })

  return (
    <>
      <div className="crm-card wide">
        <div className="crm-card-header">
          <h2>{t.crm.adBoardTitle}</h2>
          <span>{ads.length}</span>
        </div>
        <p className="crm-team-note" style={{ marginBottom: 18 }}>
          {t.crm.adBoardSubtitle}
        </p>

        {notice && (
          <p
            className={notice.tone === 'ok' ? 'crm-team-ok' : 'crm-team-error'}
            style={{ marginBottom: 16 }}
          >
            {notice.text}
          </p>
        )}

        {ads.length === 0 ? (
          <div className="crm-empty">
            <strong>{t.crm.adBoardEmpty}</strong>
            <p>{t.crm.adBoardEmptyText}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ads.map((ad) => {
              const paid = ad.paymentStatus === 'paid'
              const published = ad.status === 'published'
              return (
                <article
                  key={ad.id}
                  style={{ border: '1px solid #e5dfd3', borderRadius: 12, background: '#fff', padding: 20, display: 'grid', gap: 14 }}
                >
                  <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 7px', font: "400 18px 'New Standard', Georgia, serif" }}>
                        {ad.title}
                      </h3>
                      <p style={{ margin: 0, color: '#817b70', fontSize: 11 }}>
                        {t.crm.adTableAdvertiser}: {ad.advertiserName}{' '}
                        <span
                          className="crm-status"
                          style={{ marginLeft: 6, ...advertiserStyle(ad.advertiserStatus) }}
                        >
                          {ADVERTISER_STATUS_LABELS[ad.advertiserStatus as AdvertiserStatus] ||
                            t.crm.adAdvertiserPending}
                        </span>
                      </p>
                    </div>
                    <span className="crm-status" style={statusStyle(ad.status)}>
                      {AD_STATUS_LABELS[ad.status as AdStatus] || ad.status}
                    </span>
                  </header>

                  <dl
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 12,
                      margin: 0,
                    }}
                  >
                    <div>
                      <dt className="crm-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.09em' }}>
                        {t.crm.adTableTerm}
                      </dt>
                      <dd style={{ margin: '6px 0 0', fontSize: 12 }}>
                        {ad.termText || '—'}
                        {ad.expired && (
                          <span style={{ color: '#9b4e43' }}> · {t.crm.adExpired}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="crm-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.09em' }}>
                        {t.crm.adTablePayment}
                      </dt>
                      <dd style={{ margin: '6px 0 0', fontSize: 12 }}>
                        {AD_PAYMENT_LABELS[ad.paymentStatus as AdPaymentStatus] || ad.paymentStatus}
                        {' · '}
                        {ad.cost !== null ? fmt(t.crm.adCost, rub(ad.cost)) : t.crm.adCostNone}
                      </dd>
                    </div>
                    <div>
                      <dt className="crm-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.09em' }}>
                        {t.crm.adOnSite}
                      </dt>
                      <dd style={{ margin: '6px 0 0', fontSize: 12, color: ad.visible ? '#3f6b34' : '#817b70' }}>
                        {ad.visible ? t.crm.adOnSite : t.crm.adOffSite}
                      </dd>
                    </div>
                  </dl>

                  {/* Маркировка собирается автоматически при публикации */}
                  <p className="crm-muted" style={{ margin: 0, fontSize: 11 }}>
                    {t.crm.adMarking}: {ad.markingText}
                  </p>

                  {ad.log.length > 0 && (
                    <p className="crm-muted" style={{ margin: 0, fontSize: 10, lineHeight: 1.7 }}>
                      {t.crm.adLog}:{' '}
                      {ad.log
                        .slice(-3)
                        .map((e) => `${fmtMoment(e.at)} — ${e.by || '—'}`)
                        .join(' · ')}
                    </p>
                  )}

                  {!published && ad.issue && (
                    <p style={{ margin: 0, color: '#9b4e43', fontSize: 11 }}>{fmt(t.crm.adIssue, ad.issue)}</p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {!published && (
                      <button
                        type="button"
                        style={btn(true)}
                        disabled={busy === ad.id || !!ad.issue}
                        onClick={() => void act(ad.id, 'publish')}
                        title={ad.issue || undefined}
                      >
                        {busy === ad.id ? t.crm.adPublishing : t.crm.adPublish}
                      </button>
                    )}
                    {published && (
                      <button
                        type="button"
                        style={btn(false)}
                        disabled={busy === ad.id}
                        onClick={() => void act(ad.id, 'unpublish')}
                      >
                        {busy === ad.id ? t.crm.adUnpublishing : t.crm.adUnpublish}
                      </button>
                    )}
                    {!paid && <span className="crm-muted" style={{ fontSize: 10, alignSelf: 'center' }}>{t.crm.adTablePayment}: {AD_PAYMENT_LABELS[ad.paymentStatus as AdPaymentStatus] || ad.paymentStatus}</span>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <div className="crm-card wide" style={{ marginTop: 18 }}>
        <div className="crm-card-header">
          <h2>{t.crm.adBoardRequests}</h2>
          <span>{requests.length}</span>
        </div>

        {requests.length === 0 ? (
          <div className="crm-empty">
            <strong>{t.crm.adBoardRequestsEmpty}</strong>
          </div>
        ) : (
          <div className="crm-list">
            {requests.map((r) => (
              <div className="crm-row" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <h3>
                    {r.name}
                    {r.company ? ` · ${r.company}` : ''}
                  </h3>
                  <p>
                    {[r.phone, r.email].filter(Boolean).join(' · ')}
                  </p>
                  {r.message && <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.message}</p>}
                  <p className="crm-muted" style={{ marginTop: 6 }}>
                    {r.consentAt
                      ? fmt(t.crm.adConsent, fmtMoment(r.consentAt))
                      : t.crm.adConsentNone}
                    {r.createdAt ? ` · ${fmt(t.crm.adCreated, fmtMoment(r.createdAt))}` : ''}
                  </p>
                </div>
                <span className="crm-status">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

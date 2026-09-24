'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { LkShell } from '@/components/lk/LkShell'
import { BOARD_STATUS_LABELS, type BoardStatus } from '@/lib/board'
import type { BoardMyAdRow } from '@/lib/board-service'

/**
 * «Мои объявления» в личном кабинете (/lk/board).
 *
 * Автор видит свои объявления в любом статусе и что с каждым происходит:
 * ждёт проверки, опубликовано, вернулось с уточнениями, отклонено, снято или
 * срок вышел. Строки с замечанием модератора показывают его текст — это то,
 * что нужно исправить, чтобы объявление вернулось на сайт.
 *
 * Действия (снять, подать снова, продлить) идут через
 * POST /api/board/ads/manage: сервер проверяет, что объявление принадлежит
 * текущему пользователю. Здесь же — кнопки правки и перехода на страницу
 * объявления.
 */

interface Props {
  row: BoardMyAdRow
  no: string
  onAction: (id: number, action: string) => void
  busy: boolean
  t: ReturnType<typeof useI18n>['t']
  lang: string
}

/** Плашка статуса: цвет — как у статусов в CRM */
const statusStyle = (status: string): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    whiteSpace: 'nowrap',
  }
  if (status === 'published') return { ...base, background: 'rgba(63,107,52,.15)', color: '#4e7a3a' }
  if (status === 'pending') return { ...base, background: 'rgba(167,129,78,.15)', color: '#8d6b40' }
  if (status === 'clarification') return { ...base, background: 'rgba(122,90,46,.15)', color: '#7a5a2e' }
  if (status === 'rejected') return { ...base, background: 'rgba(155,78,67,.15)', color: '#9b4e43' }
  return { ...base, background: 'rgba(129,123,112,.14)', color: '#817b70' }
}

const btn: React.CSSProperties = {
  border: '1px solid var(--n15-gold)',
  borderRadius: 7,
  background: 'transparent',
  color: 'var(--n15-gold)',
  padding: '9px 13px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

const btnQuiet: React.CSSProperties = {
  ...btn,
  border: '1px solid rgba(167,129,78,.35)',
  color: 'var(--n15-muted)',
}

function dateText(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU')
}

function AdRow({ row, no, onAction, busy, t, lang }: Props) {
  const published = row.status === 'published'
  const expired = row.status === 'expired'
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        border: '1px solid rgba(167,129,78,.25)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ width: 140, height: 105, borderRadius: 8, overflow: 'hidden', background: 'rgba(167,129,78,.08)', flex: 'none' }}>
        {row.photo?.sizes?.thumbnail?.url || row.photo?.url ? (
          <img src={row.photo.sizes?.thumbnail?.url || row.photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 17 }}>{row.title}</strong>
          <span style={statusStyle(row.status)}>{BOARD_STATUS_LABELS[row.status as BoardStatus] || row.status}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--n15-muted)', marginBottom: 6 }}>
          {row.dealType === 'rent' ? t.object.rent : t.object.sale} ·{' '}
          {row.price != null ? `${row.price.toLocaleString(t.locale)} ₽` : '—'} ·{' '}
          {t.board.myViews.replace('%d', String(row.views))}
          {row.expiresAt ? ` · ${t.board.myExpires}: ${dateText(row.expiresAt)}` : ''}
        </div>

        {/* Замечание модератора — главное, что нужно автору: что исправить */}
        {row.moderationNote && (
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#8d6b40', lineHeight: 1.55 }}>{row.moderationNote}</p>
        )}
        {/* Почему объявление не на сайте: требования публикации или срок */}
        {row.issue && !published && (
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--n15-muted)', lineHeight: 1.55 }}>{row.issue}</p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Link href={`/${lang}/lk/board/${row.id}`} style={{ ...btn, textDecoration: 'none' }}>
            {t.board.myEdit}
          </Link>
          {published ? (
            <>
              <button type="button" onClick={() => onAction(row.id, 'renew')} disabled={busy} style={btnQuiet}>
                {t.board.myRenew}
              </button>
              <button type="button" onClick={() => onAction(row.id, 'archive')} disabled={busy} style={btnQuiet}>
                {t.board.myArchive}
              </button>
              <Link href={`/${lang}/board/${row.id}`} style={{ ...btnQuiet, textDecoration: 'none' }}>
                {t.board.myOpen}
              </Link>
            </>
          ) : expired || row.status === 'rejected' || row.status === 'archived' || row.status === 'clarification' ? (
            // У истёкшего объявления кнопка «подать снова»: срок продлится,
            // но объявление вернётся через проверку — вернуть его на сайт
            // сам автор не может (см. resubmitBoardAdByAuthor)
            <button type="button" onClick={() => onAction(row.id, 'resubmit')} disabled={busy} style={btn}>
              {t.board.myResubmit}
            </button>
          ) : null}
          {busy && <span style={{ fontSize: 10, color: 'var(--n15-muted)', alignSelf: 'center' }}>{t.board.myBusy}</span>}
        </div>
      </div>
    </div>
  )
}

export default function LkBoardPage() {
  const { lang, t } = useI18n()
  const [rows, setRows] = useState<BoardMyAdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [dialogs, setDialogs] = useState<{ adId: number; adTitle: string; otherId: number; lastText: string; unread: number }[]>([])

  const load = useCallback(() => {
    fetch('/api/board/ads/manage', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data?.ads) ? data.ads : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    fetch('/api/board/messages/dialogs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setDialogs(Array.isArray(d?.dialogs) ? d.dialogs : []))
      .catch(() => setDialogs([]))
  }, [load])

  const act = async (id: number, action: string) => {
    if (busyId) return
    setBusyId(id)
    setError('')
    try {
      const body = new FormData()
      body.append('id', String(id))
      body.append('action', action)
      const res = await fetch('/api/board/ads/manage', { method: 'POST', body, credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.board.myFailed)
        return
      }
      load()
    } catch {
      setError(t.board.myFailed)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <LkShell active="board">
      <h1 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>
        {t.board.myTitle}
      </h1>
      <p style={{ margin: '0 0 18px', color: 'var(--n15-muted)', fontSize: 12, lineHeight: 1.6, maxWidth: 620 }}>
        {t.board.mySubtitle}
      </p>

      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {loading ? (
        <p style={{ color: 'var(--n15-muted)', fontSize: 13 }}>{t.common.loading}</p>
      ) : !rows.length ? (
        <div style={{ border: '1px solid rgba(167,129,78,.25)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14 }}>{t.board.myEmpty}</p>
          <p style={{ margin: '8px 0 16px', fontSize: 12, color: 'var(--n15-muted)', lineHeight: 1.6 }}>{t.board.myEmptyText}</p>
          <Link href={`/${lang}/board/new`} style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
            {t.board.myPlace}
          </Link>
        </div>
      ) : (
        rows.map((row) => (
          <AdRow key={row.id} row={row} no={String(row.id)} onAction={act} busy={busyId === row.id} t={t} lang={lang} />
        ))
      )}

      {/* Переписка по объявлениям: у покупателя — с авторами, у автора —
          с покупателями. Строка на диалог, открывается отдельной страницей */}
      <h2 style={{ margin: '26px 0 10px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 19 }}>
        {t.board.dialogsTitle}
      </h2>
      {dialogs.length === 0 ? (
        <p style={{ color: 'var(--n15-muted)', fontSize: 12 }}>{t.board.dialogsEmpty}</p>
      ) : (
        dialogs.map((d) => (
          <Link
            key={`${d.adId}-${d.otherId}`}
            href={`/${lang}/lk/board/messages/${d.adId}?with=${d.otherId}`}
            style={{
              display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
              border: '1px solid rgba(167,129,78,.25)', borderRadius: 10, padding: '12px 14px',
              marginBottom: 10, textDecoration: 'none', color: 'inherit',
            }}
          >
            <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 15 }}>
              {d.adTitle || `Объявление #${d.adId}`}
            </strong>
            <span style={{ fontSize: 11, color: 'var(--n15-muted)' }}>{d.lastText.slice(0, 80)}</span>
            {d.unread > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--n15-gold)', color: '#1c1c1a', borderRadius: 999, padding: '2px 9px', fontSize: 10 }}>
                {d.unread}
              </span>
            )}
          </Link>
        ))
      )}
    </LkShell>
  )
}

'use client'

import { useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import { NEWS_TOPICS } from '@/lib/news'
import type { NewsBoard, NewsRow } from '@/lib/news-service'

/**
 * Раздел CRM «Новости на проверку»: очередь официальных новостей о
 * недвижимости (сбор — src/lib/news.ts, запись в блог — news-service.ts).
 *
 * Ничего не публикуется автоматически: у каждой новости три кнопки —
 * «Одобрить и опубликовать» (создаст статью блога со строкой «Источник: …»),
 * «Отклонить» и «Отложить» (вернётся в очередь позже). Перед публикацией
 * можно поправить заголовок, тему и краткое содержание — резюме собирается
 * автоматически из лида официального сообщения, поэтому его стоит прочитать.
 */

interface Props {
  t: Dict
  board: NewsBoard
}

// Подстановка %s/%d в строку словаря (как в AdvertisingBoard)
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out.replace(/%%/g, '%')
}

const fmtMoment = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Плашки статусов: .crm-status задаёт форму, здесь — цвет по состоянию
const statusStyle = (status: string): { background: string; color: string } => {
  if (status === 'published') return { background: '#e6efe1', color: '#3f6b34' }
  if (status === 'rejected') return { background: '#f0e2de', color: '#9b4e43' }
  if (status === 'postponed') return { background: '#f7e6cf', color: '#a1661f' }
  return { background: '#f2eee5', color: '#817b70' }
}

/** Канал источника: читаем RSS или добавляем только ссылкой */
const channelStyle = (channel: string): { background: string; color: string } =>
  channel === 'feed' ? { background: '#e6efe1', color: '#3f6b34' } : { background: '#f2eee5', color: '#817b70' }

/** Темы новостей — из реестра движка (src/lib/news.ts), чтобы не дублировать список */
const TOPIC_OPTIONS = NEWS_TOPICS.map((topic) => ({ value: topic.slug, label: topic.label }))

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

const field: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5dfd3',
  borderRadius: 8,
  background: '#fffdf9',
  padding: '10px 12px',
  fontSize: 13,
  color: '#3f3a33',
}

export const NewsReview: FC<Props> = ({ t, board }) => {
  const router = useRouter()
  const [busy, setBusy] = useState<number | 'fetch' | 'add' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  // Правки заголовка/резюме/темы до публикации: ключ — id новости
  const [drafts, setDrafts] = useState<Record<number, { title: string; summary: string; topic: string }>>({})
  const [linkForm, setLinkForm] = useState({ url: '', title: '', summary: '', open: false })

  const draftOf = (row: NewsRow) =>
    drafts[row.id] || { title: row.title, summary: row.summary, topic: row.topic }

  const setDraft = (id: number, patch: Partial<{ title: string; summary: string; topic: string }>, row: NewsRow) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || { title: row.title, summary: row.summary, topic: row.topic }), ...patch } }))
  }

  const act = async (row: NewsRow, action: 'approve' | 'reject' | 'postpone') => {
    if (busy !== null) return
    setBusy(row.id)
    setNotice(null)
    try {
      const draft = draftOf(row)
      const res = await fetch('/api/news/review-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, id: row.id, ...draft }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || t.crm.newsActionError })
        return
      }
      setNotice({
        tone: 'ok',
        text: action === 'approve' ? t.crm.newsApproved : action === 'reject' ? t.crm.newsRejected : t.crm.newsPostponed,
      })
      // Данные раздела серверные — после действия перечитываем страницу
      router.refresh()
    } catch {
      setNotice({ tone: 'err', text: t.crm.newsActionError })
    } finally {
      setBusy(null)
    }
  }

  const fetchNow = async () => {
    if (busy !== null) return
    setBusy('fetch')
    setNotice(null)
    try {
      const res = await fetch('/api/news/fetch', { method: 'POST', credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { error?: string; added?: number; skipped?: number } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || t.crm.newsFetchError })
        return
      }
      setNotice({ tone: 'ok', text: fmt(t.crm.newsFetched, data?.added || 0, data?.skipped || 0) })
      router.refresh()
    } catch {
      setNotice({ tone: 'err', text: t.crm.newsFetchError })
    } finally {
      setBusy(null)
    }
  }

  const addLink = async () => {
    if (busy !== null || !linkForm.url.trim()) return
    setBusy('add')
    setNotice(null)
    try {
      const res = await fetch('/api/news/add-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(linkForm),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || t.crm.newsActionError })
        return
      }
      setNotice({ tone: 'ok', text: t.crm.newsAdded })
      setLinkForm({ url: '', title: '', summary: '', open: false })
      router.refresh()
    } catch {
      setNotice({ tone: 'err', text: t.crm.newsActionError })
    } finally {
      setBusy(null)
    }
  }

  const pending = board.rows.filter((r) => r.status === 'new')
  const postponed = board.rows.filter((r) => r.status === 'postponed')
  const published = board.rows.filter((r) => r.status === 'published')
  const rejected = board.rows.filter((r) => r.status === 'rejected')

  const renderCard = (row: NewsRow) => {
    const draft = draftOf(row)
    const editable = row.status === 'new' || row.status === 'postponed'
    return (
      <article
        key={row.id}
        style={{ border: '1px solid #e5dfd3', borderRadius: 12, background: '#fff', padding: 20, display: 'grid', gap: 12 }}
      >
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {editable ? (
              <input
                style={{ ...field, font: "400 18px 'New Standard', Georgia, serif" }}
                value={draft.title}
                onChange={(e) => setDraft(row.id, { title: e.target.value }, row)}
                aria-label={t.crm.newsTitleField}
              />
            ) : (
              <h3 style={{ margin: '0 0 7px', font: "400 18px 'New Standard', Georgia, serif" }}>{row.title}</h3>
            )}
          </div>
          <span className="crm-status" style={statusStyle(row.status)}>
            {row.statusLabel}
          </span>
        </header>

        <p className="crm-muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.8 }}>
          {t.crm.newsSourceLabel}: <strong style={{ fontWeight: 500 }}>{row.sourceName}</strong>
          {' · '}
          {t.crm.newsDateLabel}: {fmtMoment(row.publishedAt)}
          {' · '}
          {t.crm.newsRegion}: {row.region}
          {row.postponeUntil && row.status === 'postponed' ? ` · ${fmt(t.crm.newsPostponedUntil, fmtMoment(row.postponeUntil))}` : ''}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {editable ? (
            <select
              style={{ ...field, maxWidth: 320 }}
              value={draft.topic}
              onChange={(e) => setDraft(row.id, { topic: e.target.value }, row)}
              aria-label={t.crm.newsTopic}
            >
              {TOPIC_OPTIONS.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="crm-muted" style={{ fontSize: 11 }}>{row.topicLabel}</span>
          )}
          {row.url && (
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#a7814e', textDecoration: 'none' }}
            >
              {t.crm.newsOpenSource} ↗
            </a>
          )}
        </div>

        {editable ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="crm-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {t.crm.newsSummaryLabel}
            </span>
            <textarea
              style={{ ...field, minHeight: 84, resize: 'vertical', fontFamily: 'inherit' }}
              value={draft.summary}
              onChange={(e) => setDraft(row.id, { summary: e.target.value }, row)}
              placeholder={t.crm.newsSummaryPlaceholder}
            />
          </label>
        ) : (
          row.summary && <p style={{ margin: 0, fontSize: 13, color: '#5c564d', lineHeight: 1.7 }}>{row.summary}</p>
        )}

        {row.reviewNote && (
          <p className="crm-muted" style={{ margin: 0, fontSize: 11 }}>{t.crm.newsNote}: {row.reviewNote}</p>
        )}

        {row.issue && row.status === 'new' && (
          <p style={{ margin: 0, color: '#9b4e43', fontSize: 11 }}>{fmt(t.crm.newsIssue, row.issue)}</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {editable ? (
            <>
              <button
                type="button"
                style={btn(true)}
                disabled={busy !== null || (row.status === 'new' && !!row.issue) || (row.status === 'postponed' && draft.summary.trim().length < 20)}
                onClick={() => void act(row, 'approve')}
                title={row.issue || undefined}
              >
                {busy === row.id ? t.crm.newsApproving : t.crm.newsApprove}
              </button>
              <button type="button" style={btn(false)} disabled={busy !== null} onClick={() => void act(row, 'reject')}>
                {t.crm.newsReject}
              </button>
              <button type="button" style={btn(false)} disabled={busy !== null} onClick={() => void act(row, 'postpone')}>
                {fmt(t.crm.newsPostpone, 7)}
              </button>
            </>
          ) : (
            row.status === 'published' &&
            row.blogPostId && (
              <a
                href={`/ru/blog/${row.blogPostId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: '#a7814e', textDecoration: 'none' }}
              >
                {t.crm.newsBlogLink} ↗
              </a>
            )
          )}
        </div>
      </article>
    )
  }

  return (
    <>
      <div className="crm-card wide">
        <div className="crm-card-header">
          <h2>{t.crm.newsTitle}</h2>
          <span>{pending.length + postponed.length}</span>
        </div>
        <p className="crm-team-note" style={{ marginBottom: 16 }}>
          {t.crm.newsSubtitle}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <button type="button" style={btn(true)} disabled={busy !== null} onClick={() => void fetchNow()}>
            {busy === 'fetch' ? t.crm.newsFetching : t.crm.newsFetchNow}
          </button>
          <button type="button" style={btn(false)} onClick={() => setLinkForm((f) => ({ ...f, open: !f.open }))}>
            {t.crm.newsAddToggle}
          </button>
          <span className="crm-muted" style={{ fontSize: 11 }}>
            {board.lastSweepAt
              ? `${fmt(t.crm.newsLastSweep, fmtMoment(board.lastSweepAt))}${board.nextSweepAt ? ` · ${fmt(t.crm.newsNextSweep, fmtMoment(board.nextSweepAt))}` : ''}`
              : t.crm.newsNever}
          </span>
        </div>

        {linkForm.open && (
          <div style={{ border: '1px solid #e5dfd3', borderRadius: 12, background: '#fdfbf7', padding: 16, display: 'grid', gap: 10, marginBottom: 16 }}>
            <p className="crm-muted" style={{ margin: 0, fontSize: 11 }}>{t.crm.newsAddHint}</p>
            <input
              style={field}
              placeholder={t.crm.newsAddUrl}
              value={linkForm.url}
              onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
            />
            <input
              style={field}
              placeholder={t.crm.newsAddTitle}
              value={linkForm.title}
              onChange={(e) => setLinkForm((f) => ({ ...f, title: e.target.value }))}
            />
            <textarea
              style={{ ...field, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder={t.crm.newsAddSummary}
              value={linkForm.summary}
              onChange={(e) => setLinkForm((f) => ({ ...f, summary: e.target.value }))}
            />
            <div>
              <button type="button" style={btn(true)} disabled={busy !== null || !linkForm.url.trim()} onClick={() => void addLink()}>
                {busy === 'add' ? t.crm.newsAdding : t.crm.newsAddSubmit}
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className={notice.tone === 'ok' ? 'crm-team-ok' : 'crm-team-error'} style={{ marginBottom: 16 }}>
            {notice.text}
          </p>
        )}

        {pending.length + postponed.length === 0 ? (
          <div className="crm-empty">
            <strong>{t.crm.newsEmpty}</strong>
            <p>{t.crm.newsEmptyText}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pending.length > 0 && (
              <h3 className="crm-muted" style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.09em' }}>
                {t.crm.newsPendingSection}
              </h3>
            )}
            {pending.map(renderCard)}
            {postponed.length > 0 && (
              <h3 className="crm-muted" style={{ margin: '6px 0 0', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.09em' }}>
                {t.crm.newsPostponedSection}
              </h3>
            )}
            {postponed.map(renderCard)}
          </div>
        )}
      </div>

      <div className="crm-card wide" style={{ marginTop: 18 }}>
        <div className="crm-card-header">
          <h2>{t.crm.newsSourcesTitle}</h2>
          <span>{board.sources.length}</span>
        </div>
        <p className="crm-team-note" style={{ marginBottom: 14 }}>{t.crm.newsSourcesSubtitle}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {board.sources.map((s) => (
            <div key={s.slug} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f0ebe1', paddingBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</strong>
                <p className="crm-muted" style={{ margin: '4px 0 0', fontSize: 10 }}>
                  {s.region}
                  {s.note ? ` · ${s.note}` : ''}
                </p>
              </div>
              <span className="crm-status" style={channelStyle(s.channel)}>
                {s.channel === 'feed' ? t.crm.newsSourceFeed : t.crm.newsSourceManual}
              </span>
            </div>
          ))}
        </div>
        {board.lastReport && (
          <p className="crm-muted" style={{ marginTop: 14, fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {t.crm.newsReport}: {'\n'}
            {board.lastReport}
          </p>
        )}
      </div>

      {published.length + rejected.length > 0 && (
        <div className="crm-card wide" style={{ marginTop: 18 }}>
          <div className="crm-card-header">
            <h2>{t.crm.newsArchiveTitle}</h2>
            <span>{published.length + rejected.length}</span>
          </div>
          <div className="crm-list">
            {[...published, ...rejected].map((row) => (
              <div className="crm-row" key={row.id}>
                <div style={{ minWidth: 0 }}>
                  <h3>{row.title}</h3>
                  <p className="crm-muted">
                    {row.sourceName} · {fmtMoment(row.publishedAt)} · {t.crm.newsDateChecked}: {fmtMoment(row.fetchedAt)}
                  </p>
                  {row.reviewNote && <p className="crm-muted">{row.reviewNote}</p>}
                </div>
                <span className="crm-status" style={statusStyle(row.status)}>
                  {row.statusLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

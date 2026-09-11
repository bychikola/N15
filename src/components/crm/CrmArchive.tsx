'use client'

import { useMemo, useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { ArchiveRow } from '@/lib/archive-service'
import { ARCHIVE_REASONS, archiveReasonLabel } from '@/lib/archive'

/**
 * Раздел CRM «Архив объектов»: объекты, снятые с продажи, остаются в базе
 * и живут только здесь — с сайта, из каталога, поиска и с площадок публикации
 * они скрыты (см. src/lib/archive.ts и archive-service.ts).
 *
 * В карточке архива видно объект, ответственного агента, причину переноса,
 * дату, комментарий и историю изменений; есть поиск и фильтры по причине,
 * агенту и дате. Кнопки: «Восстановить объект» (возвращает прежний статус —
 * объект снова доступен для публикации) и «Удалить окончательно» — только
 * администратору.
 */

interface Props {
  t: Dict
  rows: ArchiveRow[]
  isAdmin: boolean
  /** id «своих» объектов агента — их он может восстановить (как в Objects) */
  ownObjectIds: number[]
}

// Подстановка %d/%s в строку словаря; '%%' в конце — литеральный процент
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out.replace(/%%/g, '%')
}

const rub = (v: number) => new Intl.NumberFormat('ru-RU').format(v)

/** Дата переноса «11.09.2026» / момент истории «11.09.2026, 14:30» */
const dateText = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const momentText = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Дата без времени (YYYY-MM-DD) — для фильтра по дате переноса */
const dayKey = (iso?: string | null): string => (iso || '').slice(0, 10)

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '10px 12px',
  font: '12px Arial, Helvetica, sans-serif',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  color: '#6f6a61',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  minWidth: 0,
}

const btnPrimary: React.CSSProperties = {
  border: 0,
  borderRadius: 7,
  background: '#a7814e',
  color: '#fff',
  padding: '11px 16px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  background: '#faf7f2',
  color: '#716b62',
  padding: '11px 16px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  border: '1px solid #e3cfc7',
  borderRadius: 7,
  background: 'transparent',
  color: '#9b4e43',
  padding: '11px 16px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

export const CrmArchive: FC<Props> = ({ t, rows, isAdmin, ownObjectIds }) => {
  const router = useRouter()
  const [list, setList] = useState<ArchiveRow[]>(rows)
  const [q, setQ] = useState('')
  const [reason, setReason] = useState('')
  const [agent, setAgent] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  // Открытая история изменений (по id объекта)
  const [openLog, setOpenLog] = useState<number | null>(null)

  // Агенты для фильтра — из самих архивных объектов (кто их вёл)
  const agentOptions = useMemo(() => {
    const map = new Map<number | string, string>()
    for (const row of list) {
      const key = row.agentId ?? ''
      if (row.agentName || key !== '') map.set(key, row.agentName || t.crm.archNoAgent)
    }
    return [...map.entries()].map(([value, label]) => ({ value: String(value), label }))
  }, [list, t.crm.archNoAgent])

  // Поиск и фильтры: причина, агент, дата переноса (с/по)
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return list.filter((row) => {
      if (reason && (row.archive.reason || 'other') !== reason) return false
      if (agent !== '' && String(row.agentId ?? '') !== agent) return false
      const day = dayKey(row.at)
      if (from && day && day < from) return false
      if (to && day && day > to) return false
      if (!needle) return true
      const haystack = [
        row.title,
        row.address,
        row.agentName,
        archiveReasonLabel(row.archive.reason),
        row.archive.comment ?? '',
        row.archive.archivedBy ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [list, q, reason, agent, from, to])

  const canRestore = (row: ArchiveRow) => isAdmin || ownObjectIds.includes(row.id)

  const filtersActive = Boolean(q.trim() || reason || agent || from || to)

  const resetFilters = () => {
    setQ('')
    setReason('')
    setAgent('')
    setFrom('')
    setTo('')
  }

  const act = async (row: ArchiveRow, action: 'restore' | 'delete') => {
    if (busy !== null) return
    const confirmText = action === 'restore' ? t.crm.archRestoreConfirm : t.crm.archDeleteConfirm
    if (!window.confirm(confirmText)) return
    setBusy(row.id)
    setNotice(null)
    try {
      const res = await fetch('/api/objects/archive-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, objectId: row.id }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || (action === 'restore' ? t.crm.archErr : t.crm.archDeleteErr) })
        return
      }
      setList((prev) => prev.filter((r) => r.id !== row.id))
      setNotice({
        tone: 'ok',
        text: action === 'restore'
          ? `${t.crm.archRestoreDone}: ${row.title}`
          : `${t.crm.archDeleted}: ${row.title}`,
      })
      // Данные раздела серверные — перечитываем страницу
      router.refresh()
    } catch {
      setNotice({ tone: 'err', text: action === 'restore' ? t.crm.archErr : t.crm.archDeleteErr })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
          {t.crm.archTitle}
        </h2>
        <p style={{ margin: '6px 0 0', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
          {t.crm.archSubtitle}
        </p>
      </div>

      {/* Поиск и фильтры: причина, агент, дата переноса */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5dfd3',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <label style={{ ...labelStyle, flex: '2 1 240px' }}>
          {t.crm.archSearchLabel}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.crm.archSearchPh}
            style={inputStyle}
          />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 190px' }}>
          {t.crm.archFilterReason}
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {ARCHIVE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 170px' }}>
          {t.crm.archFilterAgent}
          <select value={agent} onChange={(e) => setAgent(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {agentOptions.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 140px' }}>
          {t.crm.archFilterFrom}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 120px' }}>
          {t.crm.archFilterTo}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </label>
        {filtersActive && (
          <button type="button" onClick={resetFilters} style={btnGhost}>
            {t.crm.archFilterReset}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {fmt(t.crm.archFound, visible.length, list.length)}
        </span>
        {notice && (
          <span style={{ fontSize: 11, color: notice.tone === 'ok' ? '#3f6b34' : '#9b4e43' }}>{notice.text}</span>
        )}
      </div>

      {!list.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#817b70', fontSize: 13 }}>{t.crm.archEmpty}</p>
          <p style={{ margin: '8px 0 0', color: '#9b958a', fontSize: 11 }}>{t.crm.archEmptyText}</p>
        </div>
      ) : !visible.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#817b70', fontSize: 13 }}>{t.crm.archNothingFound}</p>
        </div>
      ) : (
        // min(330px, 100%) — карточки не вылезают за экран телефона
        // (у .crm-main на мобильных 16px отступов с каждой стороны)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(330px, 100%), 1fr))', gap: 14 }}>
          {visible.map((row) => {
            const log = row.archive.log || []
            return (
              <div key={row.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 84, height: 63, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: row.thumb ? undefined : '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {row.thumb
                      ? <img src={row.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#b99a6a', fontSize: 22 }}>⌂</span>}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.title}
                    </div>
                    {row.address && (
                      <div style={{ marginTop: 3, fontSize: 10, color: '#8a857b', lineHeight: 1.45 }}>{row.address}</div>
                    )}
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        {t.categoryLabels[row.category as keyof typeof t.categoryLabels] ?? row.category}
                      </span>
                      <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 15, color: '#25241f' }}>
                        {row.price != null ? `${rub(row.price)} ₽` : '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Причина, дата, агент, комментарий — то, что видно в архиве */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={labelStyle}>{t.crm.archReason}</div>
                    <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>{archiveReasonLabel(row.archive.reason)}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>{t.crm.archDate}</div>
                    <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>{dateText(row.at)}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>{t.crm.archFilterAgent}</div>
                    <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>{row.agentName || t.crm.archNoAgent}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>{t.crm.archBy}</div>
                    <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>{row.archive.archivedBy || '—'}</div>
                  </div>
                </div>

                {/* Комментарий к переносу — внутренний, строка есть только у админа */}
                {isAdmin && (
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>{t.crm.archComment}</div>
                    <div style={{ fontSize: 11.5, color: row.archive.comment ? '#3f3a33' : '#9b958a', marginTop: 3, lineHeight: 1.5 }}>
                      {row.archive.comment || t.crm.archNoComment}
                    </div>
                  </div>
                )}

                {/* История изменений архива: перенос, восстановление, повторный перенос… */}
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setOpenLog(openLog === row.id ? null : row.id)}
                    style={{ ...btnGhost, padding: '8px 12px', width: '100%' }}
                    aria-expanded={openLog === row.id}
                  >
                    {t.crm.archHistory} ({log.length})
                  </button>
                  {openLog === row.id && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 9 }}>
                      {log.length ? (
                        [...log].reverse().map((e, i) => (
                          <div key={`${e.at || ''}-${i}`} style={{ padding: '7px 0', borderBottom: i === log.length - 1 ? 0 : '1px solid #eee9e1' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <b style={{ fontSize: 11, color: e.event === 'restore' ? '#3f6b34' : '#8d6b40' }}>
                                {e.event === 'restore' ? t.crm.archLogRestore : t.crm.archLogArchive}
                              </b>
                              <span style={{ fontSize: 10, color: '#8a857b' }}>{momentText(e.at)}</span>
                              {e.by && <span style={{ fontSize: 10, color: '#8a857b' }}>· {e.by}</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#716b62', marginTop: 3, lineHeight: 1.5 }}>
                              {archiveReasonLabel(e.reason)}
                              {/* Комментарии истории — внутренние, только админу */}
                              {isAdmin && e.comment ? ` — ${e.comment}` : ''}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p style={{ margin: 0, fontSize: 10.5, color: '#9b958a' }}>{t.crm.archHistoryEmpty}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Действия: вернуть в работу или удалить навсегда (админ) */}
                <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canRestore(row) ? (
                    <button
                      type="button"
                      onClick={() => void act(row, 'restore')}
                      disabled={busy === row.id}
                      style={{ ...btnPrimary, flex: '1 1 150px', opacity: busy === row.id ? 0.7 : 1 }}
                    >
                      {busy === row.id ? t.crm.archBusy : t.crm.archRestore}
                    </button>
                  ) : (
                    <span style={{ flex: '1 1 150px', fontSize: 10, color: '#9b958a', lineHeight: 1.45 }}>
                      {t.crm.archOnlyOwn}
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void act(row, 'delete')}
                      disabled={busy === row.id}
                      style={{ ...btnDanger, opacity: busy === row.id ? 0.7 : 1 }}
                    >
                      {t.crm.archDelete}
                    </button>
                  )}
                </div>
                {row.archive.previousStatus && (
                  <div style={{ marginTop: 8, fontSize: 10, color: '#8a857b' }}>
                    {fmt(t.crm.archRestorePrev, row.archive.previousStatus === 'published' ? t.crm.statusPublished : t.crm.statusDraft)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

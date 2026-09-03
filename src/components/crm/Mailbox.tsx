'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

const POLL_MS = 30_000

interface MailItem {
  id: number
  folder: string
  fromName?: string
  fromEmail?: string
  toEmail?: string
  subject?: string
  text?: string
  receivedAt?: string
  read: boolean
}

// Поиск писем на сервере (Payload where, contains по полям):
// отправитель (имя/email), тема, текст. Поиск идёт в БД, а не по загруженным 100.
async function fetchMail(query: string, folder: string): Promise<MailItem[]> {
  try {
    const q = query.trim()
    let url = '/api/emails?limit=100&sort=-receivedAt&depth=0'
    if (q || folder !== 'all') {
      const parts: string[] = []
      if (folder !== 'all') parts.push(`where[and][0][folder][equals]=${folder}`)
      if (q) {
        const orIdx = folder !== 'all' ? 1 : 0
        ;['subject', 'fromName', 'fromEmail', 'text'].forEach((f, i) => {
          parts.push(`where[and][${orIdx}][or][${i}][${f}][contains]=${encodeURIComponent(q)}`)
        })
      }
      url += '&' + parts.join('&')
    }
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]
    return docs.map((m) => ({
      id: m.id as number,
      folder: m.folder as string,
      fromName: (m.fromName as string) || undefined,
      fromEmail: (m.fromEmail as string) || undefined,
      toEmail: (m.toEmail as string) || undefined,
      subject: (m.subject as string) || undefined,
      text: (m.text as string) || undefined,
      receivedAt: (m.receivedAt as string) || undefined,
      read: m.read as boolean,
    }))
  } catch {
    return []
  }
}

export default function Mailbox() {
  const { t } = useI18n()
  const [emails, setEmails] = useState<MailItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [folder, setFolder] = useState<'inbox' | 'sent' | 'all'>('inbox')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Форма ответа
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [attachments, setAttachments] = useState<{ id: number; filename: string; mimeType?: string; size?: number }[]>([])
  const selectedIdRef = useRef<number | null>(null)

  // Вложения выбранного письма (без синхронного setState в эффекте —
  // иначе react-hooks ругается на каскадные рендеры)
  useEffect(() => {
    selectedIdRef.current = selectedId
    if (!selectedId) return
    let cancelled = false
    fetch(`/api/mail/attachments?emailId=${selectedId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const docs = (d.docs || []).map((x: Record<string, unknown>) => ({
          id: x.id as number,
          filename: String(x.filename || ''),
          mimeType: x.mimeType ? String(x.mimeType) : undefined,
          size: x.size as number | undefined,
        }))
        // Переключили письмо, пока шёл запрос — старые вложения не показываем
        if (selectedIdRef.current === selectedId) setAttachments(docs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const searchRef = useRef('')
  const folderRef = useRef<'inbox' | 'sent' | 'all'>('inbox')
  const [search, setSearch] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  const refresh = async () => {
    const list = await fetchMail(searchRef.current, folderRef.current)
    setEmails(list)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled || document.visibilityState !== 'visible') return
      const list = await fetchMail(searchRef.current, folderRef.current)
      if (!cancelled) {
        setEmails(list)
        setLoading(false)
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const setFolderBoth = (f: 'inbox' | 'sent' | 'all') => {
    folderRef.current = f
    setFolder(f)
    void refresh()
  }

  const doSearch = () => {
    searchRef.current = search.trim()
    setActiveQuery(search.trim())
    void refresh()
  }

  const clearSearch = () => {
    setSearch('')
    searchRef.current = ''
    setActiveQuery('')
    void refresh()
  }

  // Кнопка «Обновить»: перезагрузка списка из БД. Сам забор писем с ящика
  // (IMAP) делает воркер на сервере раз в минуту — он же подтянет новые.
  const doRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
    } catch {
      // сеть недоступна — оставляем текущий список (как в авто-опросе)
    } finally {
      setRefreshing(false)
    }
  }

  const visible = folder === 'all' ? emails : emails.filter((m) => m.folder === folder)
  const selected = emails.find((m) => m.id === selectedId) || null

  const markRead = async (id: number) => {
    if (emails.find((m) => m.id === id)?.read) return
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
    await fetch(`/api/emails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    })
  }

  const openReply = () => {
    if (!selected) return
    setReplyTo(selected.fromEmail || '')
    setReplySubject(selected.subject ? `Re: ${selected.subject}` : '')
    setReplyText('')
    setSendError('')
    setReplyOpen(true)
  }

  const sendReply = async () => {
    if (sending || !replyTo.trim() || !replyText.trim()) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          toEmail: replyTo.trim(),
          subject: replySubject.trim() || '(без темы)',
          text: replyText,
        }),
      })
      if (!res.ok) {
        setSendError(t.crm.mailSendError)
        return
      }
      setReplyOpen(false)
      await refresh()
    } catch {
      setSendError(t.crm.mailSendError)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    border: '1px solid #d9d1c4', borderRadius: 7, background: active ? '#a7814e' : '#fff',
    color: active ? '#fff' : '#716b62', padding: '8px 14px', fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer',
  })

  const fmtDate = (iso?: string) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const fmtSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={() => setFolderBoth('inbox')} style={btnStyle(folder === 'inbox')}>{t.crm.mailFolderInbox}</button>
        <button type="button" onClick={() => setFolderBoth('sent')} style={btnStyle(folder === 'sent')}>{t.crm.mailFolderSent}</button>
        <button type="button" onClick={() => setFolderBoth('all')} style={btnStyle(folder === 'all')}>{t.crm.filterAll}</button>
        <button type="button" onClick={() => void doRefresh()} disabled={refreshing}
          title={refreshing ? t.crm.mailUpdating : t.crm.mailRefresh}
          aria-label={refreshing ? t.crm.mailUpdating : t.crm.mailRefresh}
          style={{ ...btnStyle(false), padding: '6px 10px', lineHeight: 1, opacity: refreshing ? 0.55 : 1 }}>
          <span aria-hidden="true" className={refreshing ? 'material-symbols-outlined mail-sync-spin' : 'material-symbols-outlined'}
            style={{ fontSize: 16, lineHeight: 1 }}>sync</span>
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
          placeholder={t.crm.mailSearchPlaceholder}
          aria-label={t.crm.mailSearchPlaceholder}
          style={{ marginLeft: 'auto', width: 'min(260px, 32vw)', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: '#fff', color: '#25241f', padding: '8px 12px', font: '12px Arial, Helvetica, sans-serif', outline: 'none' }}
        />
        {search && (
          <button type="button" onClick={clearSearch} title={t.crm.mailSearchClear} aria-label={t.crm.mailSearchClear}
            style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '7px 10px', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>✕</button>
        )}
        {selected && (
          <button type="button" onClick={openReply}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '10px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
            {t.crm.mailReply}
          </button>
        )}
      </div>

      {emails.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          {activeQuery ? (
            <p style={{ margin: 0, fontSize: 13, color: '#817b70' }}>{t.crm.mailNoResults}</p>
          ) : (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 14, color: '#25241f', fontWeight: 600 }}>{t.crm.mailUnconnected}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#817b70', lineHeight: 1.7 }}>
                {t.crm.mailUnconnectedHint}
              </p>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 14, alignItems: 'start' }}>
          {/* Список */}
          <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {visible.length === 0 && (
              <p style={{ padding: 20, margin: 0, color: '#9b958a', fontSize: 12, textAlign: 'center' }}>{t.crm.mailEmpty}</p>
            )}
            {visible.map((m) => (
              <div
                key={m.id}
                onClick={() => { setSelectedId(m.id); void markRead(m.id) }}
                style={{
                  padding: '12px 14px', borderBottom: '1px solid #eee9e1', cursor: 'pointer',
                  background: selectedId === m.id ? '#f2eadf' : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 13, fontWeight: m.read ? 400 : 700, color: '#25241f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.fromName || m.fromEmail || m.toEmail || '—'}
                  </strong>
                  <span style={{ fontSize: 10, color: '#9b958a', whiteSpace: 'nowrap' }}>{fmtDate(m.receivedAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: m.read ? '#8a857b' : '#25241f', fontWeight: m.read ? 400 : 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.subject || t.crm.mailNoSubject}
                </div>
              </div>
            ))}
          </div>
          {/* Просмотр */}
          <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 20, minHeight: 320 }}>
            {!selected ? (
              <p style={{ margin: 0, color: '#9b958a', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>{t.crm.mailNoSelection}</p>
            ) : (
              <div>
                <h2 style={{ margin: '0 0 4px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
                  {selected.subject || t.crm.mailNoSubject}
                </h2>
                <div style={{ fontSize: 12, color: '#817b70', marginBottom: 4 }}>
                  {t.crm.mailFrom}: {selected.fromName ? `${selected.fromName} <${selected.fromEmail || ''}>` : selected.fromEmail || '—'}
                </div>
                {selected.toEmail && (
                  <div style={{ fontSize: 12, color: '#817b70', marginBottom: 4 }}>
                    {t.crm.mailTo}: {selected.toEmail}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9b958a', marginBottom: 16 }}>{fmtDate(selected.receivedAt)}</div>
                <div style={{ fontSize: 13, color: '#25241f', lineHeight: 1.7, whiteSpace: 'pre-wrap', borderTop: '1px solid #eee9e1', paddingTop: 14 }}>
                  {selected.text || t.crm.mailNoText}
                </div>
                {attachments.length > 0 && (
                  <div style={{ borderTop: '1px solid #eee9e1', marginTop: 14, paddingTop: 12 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {t.crm.mailAttachments} ({attachments.length})
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {attachments.map((a) => {
                        const href = `/api/mail/attachment/${a.id}`
                        const isImg = (a.mimeType || '').startsWith('image/')
                        return isImg ? (
                          // Фото — одинаковые квадратные миниатюры в ряд, без подписей
                          <a key={a.id} href={href} target="_blank" rel="noreferrer" title={a.filename}
                            style={{ width: 104, height: 104, flexShrink: 0, display: 'block', overflow: 'hidden', borderRadius: 10, border: '1px solid #e5dfd3', background: '#f5f2eb' }}>
                            <img src={href} alt={a.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          </a>
                        ) : (
                          // Остальные файлы — компактная карточка с именем и размером
                          <a key={a.id} href={href} target="_blank" rel="noreferrer" title={a.filename}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', padding: '8px 12px', fontSize: 11, color: '#716b62', textDecoration: 'none', maxWidth: 280 }}>
                            <span aria-hidden="true">📎</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                            <span style={{ color: '#9b958a' }}>{fmtSize(a.size)}</span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Форма ответа */}
      {replyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setReplyOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 560px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>{t.crm.mailReply}</h2>
              <button type="button" onClick={() => setReplyOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.mailTo}
                <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} style={{ boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: '#fff', color: '#25241f', padding: 12, font: '12px Arial, Helvetica, sans-serif' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.mailSubject}
                <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} style={{ boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: '#fff', color: '#25241f', padding: 12, font: '12px Arial, Helvetica, sans-serif' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.mailText}
                <textarea rows={7} value={replyText} onChange={(e) => setReplyText(e.target.value)} style={{ boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: '#fff', color: '#25241f', padding: 12, font: '12px Arial, Helvetica, sans-serif', resize: 'none' }} />
              </label>
            </div>
            {sendError && <p style={{ margin: '12px 0 0', color: '#9b4e43', fontSize: 11 }}>{sendError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => void sendReply()} disabled={sending || !replyTo.trim() || !replyText.trim()}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: sending || !replyTo.trim() || !replyText.trim() ? 0.5 : 1 }}>
                {sending ? t.crm.mailSending : t.crm.mailSend}
              </button>
              <button type="button" onClick={() => setReplyOpen(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.dupCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
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

  const load = useCallback(async () => {
    const res = await fetch('/api/emails?limit=100&sort=-receivedAt&depth=0', { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]
    setEmails(docs.map((m) => ({
      id: m.id as number,
      folder: m.folder as string,
      fromName: (m.fromName as string) || undefined,
      fromEmail: (m.fromEmail as string) || undefined,
      toEmail: (m.toEmail as string) || undefined,
      subject: (m.subject as string) || undefined,
      text: (m.text as string) || undefined,
      receivedAt: (m.receivedAt as string) || undefined,
      read: m.read as boolean,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled || document.visibilityState !== 'visible') return
      await load()
    }
    void tick()
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [load])

  // Кнопка «Обновить»: перезагрузка списка из БД. Сам забор писем с ящика
  // (IMAP) делает воркер на сервере раз в минуту — он же подтянет новые.
  const doRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await load()
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
      await load()
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={() => setFolder('inbox')} style={btnStyle(folder === 'inbox')}>{t.crm.mailFolderInbox}</button>
        <button type="button" onClick={() => setFolder('sent')} style={btnStyle(folder === 'sent')}>{t.crm.mailFolderSent}</button>
        <button type="button" onClick={() => setFolder('all')} style={btnStyle(folder === 'all')}>{t.crm.filterAll}</button>
        <button type="button" onClick={() => void doRefresh()} disabled={refreshing}
          title={refreshing ? t.crm.mailUpdating : t.crm.mailRefresh}
          aria-label={refreshing ? t.crm.mailUpdating : t.crm.mailRefresh}
          style={{ ...btnStyle(false), padding: '6px 10px', lineHeight: 1, opacity: refreshing ? 0.55 : 1 }}>
          <span aria-hidden="true" className={refreshing ? 'material-symbols-outlined mail-sync-spin' : 'material-symbols-outlined'}
            style={{ fontSize: 16, lineHeight: 1 }}>sync</span>
        </button>
        {selected && (
          <button type="button" onClick={openReply}
            style={{ marginLeft: 'auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '10px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
            {t.crm.mailReply}
          </button>
        )}
      </div>

      {emails.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, color: '#25241f', fontWeight: 600 }}>{t.crm.mailUnconnected}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#817b70', lineHeight: 1.7 }}>
            {t.crm.mailUnconnectedHint}
          </p>
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

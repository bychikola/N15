'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

interface MessageItem {
  id: number
  text: string
  read: boolean
  createdAt: string
  senderId: number
  senderName: string
}

const POLL_MS = 8_000

function dayLabel(iso: string, t: { lkChat: { today: string; yesterday: string } }, locale: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  if (startOf(d) === startOf(now)) return t.lkChat.today
  if (startOf(d) === startOf(now) - 86400000) return t.lkChat.yesterday
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

export default function ChatThread({ applicationId, lang, variant = 'lk' }: { applicationId: number; lang: string; variant?: 'lk' | 'crm' }) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [meId, setMeId] = useState<number | null>(null)
  const [meRole, setMeRole] = useState<string>('user')
  const [objectInfo, setObjectInfo] = useState<{ id?: number; title?: string; agentName?: string; agentPhone?: string; agentPhoto?: string; clientName?: string; clientPhone?: string }>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesRef = useRef<HTMLDivElement>(null)
  const isCrm = variant === 'crm'
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState('call')
  const [taskDue, setTaskDue] = useState('today')
  const [taskPosted, setTaskPosted] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    setMeId(me.id as number)
    setMeRole((me.role as string) || 'user')

    const [appRes, msgRes] = await Promise.all([
      fetch(`/api/applications/${applicationId}?depth=2`, { credentials: 'include' }),
      fetch(
        `/api/messages?${new URLSearchParams({
          where: JSON.stringify({ application: { equals: applicationId } }),
          sort: 'createdAt',
          limit: '200',
          depth: '1',
        })}`,
        { credentials: 'include' },
      ),
    ])
    if (!appRes.ok) {
      // Нет доступа к заявке или она не найдена — не оставляем вечную загрузку
      setLoadError(`HTTP ${appRes.status}`)
      setLoading(false)
      return
    }
    const app = await appRes.json()
    const obj = app.object as Record<string, unknown> | undefined
    const agent = app.agent as Record<string, unknown> | undefined
    const clientUser = app.user as Record<string, unknown> | undefined
    setObjectInfo({
      id: obj?.id as number | undefined,
      title: (obj?.title as string) || undefined,
      agentName: (agent?.name as string) || undefined,
      agentPhone: (agent?.phone as string) || undefined,
      agentPhoto:
        agent?.photo && typeof agent.photo === 'object'
          ? ((agent.photo as Record<string, unknown>).url as string) || undefined
          : undefined,
      clientName: (clientUser?.name as string) || (app.clientName as string) || undefined,
      clientPhone: (clientUser?.phone as string) || (app.clientPhone as string) || undefined,
    })

    const msgData = await msgRes.json()
    const docs = (msgData.docs || []) as Record<string, unknown>[]
    const mapped = docs.map((m) => {
      const sender = m.sender as Record<string, unknown> | number | undefined
      const senderId = typeof sender === 'object' && sender ? (sender.id as number) : (sender as number)
      const senderName = typeof sender === 'object' && sender ? ((sender.name as string) || '') : ''
      return {
        id: m.id as number,
        text: m.text as string,
        read: m.read as boolean,
        createdAt: m.createdAt as string,
        senderId,
        senderName,
      }
    })

    // Фолбэк: текст заявки как первое сообщение, если сообщений в чате нет
    // (гостевая заявка или старая, созданная до появления Messages-записи)
    if (mapped.length === 0 && typeof app.message === 'string' && app.message.trim()) {
      const clientId = typeof app.user === 'object' && app.user ? (app.user as Record<string, unknown>).id as number : 0
      mapped.push({
        id: -1,
        text: app.message.trim(),
        read: false,
        createdAt: app.createdAt as string,
        senderId: clientId,
        senderName: (clientUser?.name as string) || (app.clientName as string) || '',
      })
    }
    setMessages(mapped)
    setLoadError(null)
    setLoading(false)

    // Пометить входящие непрочитанные прочитанными
    const unread = docs.filter((m) => {
      const sender = m.sender as Record<string, unknown> | number | undefined
      const sid = typeof sender === 'object' && sender ? (sender.id as number) : (sender as number)
      return sid !== me.id && m.read === false
    })
    for (const m of unread) {
      void fetch(`/api/messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ read: true }),
      })
    }
  }, [applicationId])

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

  useEffect(() => {
    // Скроллим ТОЛЬКО контейнер сообщений (не страницу): scrollIntoView
    // прокручивал body вниз, когда сообщений было меньше высоты панели
    const el = messagesRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const send = async () => {
    const value = text.trim()
    if (!value || sending || meId === null) return
    setSending(true)
    setText('')
    // Оптимистичное сообщение
    const optimistic: MessageItem = {
      id: -Date.now(),
      text: value,
      read: false,
      createdAt: new Date().toISOString(),
      senderId: meId,
      senderName: '',
    }
    setMessages((prev) => [...prev, optimistic])
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ application: applicationId, sender: meId, text: value }),
      })
      await load()
    } finally {
      setSending(false)
    }
  }

  const personName = meRole === 'agent' ? objectInfo.clientName : objectInfo.agentName
  const personPhone = meRole === 'agent' ? (isCrm ? objectInfo.clientPhone : undefined) : objectInfo.agentPhone
  const personInitials = personName
    ? personName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  // Фото собеседника: для клиента — фото агента; агент видит клиента (только инициалы)
  const personPhoto = meRole === 'user' ? objectInfo.agentPhoto : undefined

  const addTask = async () => {
    if (!taskTitle.trim() || meId === null) return
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const todayISO = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    const tomorrow = new Date(now.getTime() + 86400000)
    const tomorrowISO = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`
    const dueDate = taskDue === 'today' ? todayISO : tomorrowISO
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: taskTitle.trim(), taskType, dueDate, application: applicationId, assignedTo: meId }),
    })
    if (res.ok) {
      setTaskTitle('')
      setShowTaskForm(false)
      setTaskPosted(true)
      setTimeout(() => setTaskPosted(false), 2000)
    }
  }

  if (loading) {
    return <p style={isCrm ? { color: '#817b70', fontSize: 12 } : undefined} className={isCrm ? undefined : 'text-[var(--n15-muted)]'}>{t.lk.loading}</p>
  }

  if (loadError) {
    return (
      <div
        style={isCrm ? { background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: '46px 20px', textAlign: 'center' } : undefined}
        className={isCrm ? undefined : 'bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-12 text-center'}
      >
        <p style={isCrm ? { color: '#817b70', fontSize: 13, margin: '0 0 6px' } : undefined} className={isCrm ? undefined : 'text-sm text-[var(--n15-muted)] mb-2'}>
          {t.crm.chatNotFound}
        </p>
        <p style={isCrm ? { color: '#9b958a', fontSize: 11, margin: '0 0 18px' } : undefined} className={isCrm ? undefined : 'text-[11px] text-[var(--n15-muted)] mb-4'}>
          {loadError}
        </p>
        <Link
          href={isCrm ? '/crm/messages' : `/${lang}/lk/messages`}
          style={isCrm ? { display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '10px 18px', textDecoration: 'none' } : undefined}
          className={isCrm ? undefined : 'inline-block text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-6 py-2.5 hover:bg-[var(--n15-gold)]/8 transition-colors'}
        >
          {t.crm.chatBack}
        </Link>
      </div>
    )
  }

  return (
    <div
      style={isCrm ? { display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'hidden' } : undefined}
      className={isCrm ? 'crm-chat-panel' : 'flex flex-col h-[65vh] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15'}
    >
      {/* Шапка досье: объект + собеседник */}
      <div
        style={isCrm ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e5dfd3', background: '#faf8f4' } : undefined}
        className={isCrm ? undefined : 'flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40'}
      >
        <div className="min-w-0" style={isCrm ? { display: 'flex', alignItems: 'center', gap: 12 } : undefined}>
          {isCrm && (
            <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', background: '#f2eadf', border: '1px solid #d9d1c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {personPhoto ? (
                <img src={personPhoto} alt={personName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 13, color: '#8d6b40', fontWeight: 600 }}>{personInitials}</span>
              )}
            </div>
          )}
          <div style={isCrm ? { minWidth: 0 } : undefined}>
            {objectInfo.id ? (
              <Link href={`/${lang}/catalog/${objectInfo.id}`}
                style={isCrm ? { color: '#8d6b40', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-sm text-[var(--n15-gold)] hover:underline truncate'}>
                {objectInfo.title}
              </Link>
            ) : (
              <span style={isCrm ? { color: '#817b70', fontSize: 12, display: 'block' } : undefined} className={isCrm ? undefined : 'text-sm text-[var(--n15-muted)]'}>{t.lkChat.requestCard} #{applicationId}</span>
            )}
            {personName && (
              <div style={isCrm ? { color: '#25241f', fontSize: 14, fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-[10px] tracking-[0.15em] uppercase text-[var(--n15-muted)] mt-1'}>{personName}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0" style={isCrm ? { gap: 14 } : undefined}>
          {personPhone && (
            <a href={`tel:${personPhone.replace(/\s+/g, '')}`}
              style={isCrm ? { display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '8px 14px', textDecoration: 'none', whiteSpace: 'nowrap' } : undefined}
              className={isCrm ? undefined : 'inline-flex items-center gap-1.5 text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-4 py-2 hover:bg-[var(--n15-gold)]/8 transition-colors'}>
              {isCrm ? null : <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">call</span>}
              {t.lkChat.call}
            </a>
          )}
          {isCrm && (
            <button type="button" onClick={() => setShowTaskForm((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '8px 14px', cursor: 'pointer', background: '#fff' }}>
              {/* Когда меню задачи открыто — «− Задача»: понятно, что повторное нажатие закроет */}
              {taskPosted ? t.crm.chatTaskDone : t.crm.chatTaskBtn.replace('+', showTaskForm ? '−' : '+')}
            </button>
          )}
        </div>
      </div>

      {isCrm && showTaskForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 18px', borderBottom: '1px solid #e5dfd3', background: '#faf8f4' }}>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder={t.crm.taskTitlePh}
            aria-label={t.crm.taskTitlePh}
            style={{ flex: '2 1 220px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 12px', font: '12px Arial, Helvetica, sans-serif' }}
          />
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={{ flex: '1 1 120px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}>
            <option value="call">{t.crm.taskTypeCall}</option>
            <option value="showing">{t.crm.taskTypeShowing}</option>
            <option value="meeting">{t.crm.taskTypeMeeting}</option>
            <option value="task">{t.crm.taskTypeTask}</option>
          </select>
          <select value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={{ flex: '1 1 120px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}>
            <option value="today">{t.crm.taskDueToday}</option>
            <option value="tomorrow">{t.crm.taskDueTomorrow}</option>
          </select>
          <button type="button" onClick={() => void addTask()}
            style={{ flex: '0 0 auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '9px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
            {t.crm.taskAdd}
          </button>
        </div>
      )}

      {/* Сообщения */}
      <div
        ref={messagesRef}
        style={isCrm ? { flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '18px', minHeight: 200, overflowY: 'auto' } : { overflowY: 'auto' }}
        className={isCrm ? undefined : 'flex-1 flex flex-col gap-3 px-6 py-6'}
      >
        {messages.length === 0 && (
          <div style={isCrm ? { margin: 'auto', textAlign: 'center', padding: '48px 20px' } : undefined}
            className={isCrm ? undefined : 'text-center py-10'}>
            <div style={isCrm ? { width: 64, height: 64, margin: '0 auto 16px', borderRadius: '50%', background: '#f2eadf', border: '1px solid #d9d1c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#8d6b40', fontWeight: 600 } : undefined}>
              {isCrm ? personInitials : null}
            </div>
            <p style={isCrm ? { fontSize: 13, color: '#25241f', margin: '0 0 6px', fontWeight: 600 } : undefined}
              className={isCrm ? undefined : 'text-sm text-[var(--n15-muted)]'}>{t.lkChat.empty}</p>
            <p style={isCrm ? { fontSize: 11, color: '#9b958a', margin: 0 } : undefined}>
              {isCrm ? t.lkChat.emptyHint : ''}
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === meId
          const showDay = i === 0 || dayLabel(messages[i - 1].createdAt, t, t.locale) !== dayLabel(m.createdAt, t, t.locale)
          // Группировка: подряд от одного отправителя в пределах 5 минут — без аватара и имени
          const prev = messages[i - 1]
          const grouped = !showDay && !!prev && prev.senderId === m.senderId &&
            (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60 * 1000
          // Аватар и имя входящего: для агента — его фото, для клиента — инициалы
          const incomingPhoto = !mine && meRole === 'user' ? objectInfo.agentPhoto : undefined
          const incomingInitials = !mine && m.senderName
            ? m.senderName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
            : ''
          return (
            <div key={m.id}>
              {showDay && (
                <div style={isCrm ? { display: 'flex', alignItems: 'center', gap: 10, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: '#817b70', margin: '16px 0 12px' } : undefined}
                  className={isCrm ? undefined : 'flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--n15-muted)] my-4'}>
                  <span style={isCrm ? { flex: 1, height: 1, background: '#e5dfd3' } : undefined} className={isCrm ? undefined : 'flex-1 h-px bg-[var(--n15-gold)]/10'} />
                  {dayLabel(m.createdAt, t, t.locale)}
                  <span style={isCrm ? { flex: 1, height: 1, background: '#e5dfd3' } : undefined} className={isCrm ? undefined : 'flex-1 h-px bg-[var(--n15-gold)]/10'} />
                </div>
              )}
              <div style={isCrm ? { display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 10 } : undefined}
                className={`flex items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}${!isCrm && grouped ? ' -mt-1' : ''}`}>
                {!mine && (
                  grouped ? (
                    <div style={isCrm ? { width: 36, flexShrink: 0 } : undefined} className={isCrm ? undefined : 'w-9 shrink-0'} />
                  ) : (
                    <div
                      style={isCrm ? { width: 36, height: 36, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', background: '#f2eadf', border: '1px solid #d9d1c4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}
                      className={isCrm ? undefined : 'w-9 h-9 shrink-0 rounded-full overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 flex items-center justify-center'}
                    >
                      {incomingPhoto ? (
                        <img src={incomingPhoto} alt={m.senderName} style={isCrm ? { width: '100%', height: '100%', objectFit: 'cover' } : undefined} className={isCrm ? undefined : 'w-full h-full object-cover'} />
                      ) : (
                        <span style={isCrm ? { fontSize: 11, color: '#8d6b40', fontWeight: 600 } : undefined}
                          className={isCrm ? undefined : 'text-[11px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]'}>{incomingInitials}</span>
                      )}
                    </div>
                  )
                )}
                <div style={isCrm ? { display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: 'min(70%, 520px)' } : undefined}
                  className={isCrm ? undefined : 'max-w-[70%]'}>
                  {!mine && !grouped && m.senderName && (
                    <div style={isCrm ? { fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8d6b40', marginBottom: 4 } : undefined}
                      className={isCrm ? undefined : 'text-[10px] tracking-[0.12em] uppercase text-[var(--n15-gold)] mb-1'}>{m.senderName}</div>
                  )}
                  <div
                    style={{
                      // break-word (не anywhere): ломает только при переполнении и не
                      // влияет на min-content — иначе с fit-content пузырь схлопывается
                      // до одной буквы и текст идёт вертикально в некоторых браузерах
                      wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap',
                      // fit-content: пузырь по размеру текста, а не растянутая полоса
                      width: 'fit-content', maxWidth: '100%',
                      ...(isCrm
                        ? mine
                          ? // «хвостик» как в мессенджерах — справа внизу
                            { background: '#a7814e', color: '#fff', borderRadius: '12px 12px 3px 12px', padding: '8px 13px', fontSize: 14, lineHeight: 1.45 }
                          : { background: '#fff', border: '1px solid #e5dfd3', color: '#25241f', borderRadius: '12px 12px 12px 3px', padding: '8px 13px', fontSize: 14, lineHeight: 1.45 }
                        : {}),
                    }}
                    className={isCrm ? undefined : `px-4 py-3 text-sm leading-relaxed ${
                      mine
                        ? 'border border-[var(--n15-gold)]/50 bg-[var(--n15-gold)]/8 text-[var(--n15-white)]'
                        : 'bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 text-[var(--n15-silver)]'
                    }`}
                  >
                    <div>{m.text}</div>
                    <div style={isCrm ? { fontSize: 10, marginTop: 3, marginRight: -3, marginBottom: -3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: mine ? 'rgba(255,255,255,.72)' : '#9b958a', minWidth: 34 } : undefined}
                      className={isCrm ? undefined : 'text-[10px] mt-1.5 flex items-center justify-end gap-1 text-[var(--n15-muted)]'}>
                      {new Date(m.createdAt).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })}
                      {mine && m.read && (
                        <span style={isCrm ? { fontSize: 11, letterSpacing: -1 } : undefined} title={t.lkChat.readMark}>✓✓</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Инпут */}
      <div
        style={isCrm ? { padding: '14px 18px', borderTop: '1px solid #e5dfd3', background: '#faf8f4' } : undefined}
        className={isCrm ? undefined : 'px-6 py-4 border-t border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40'}
      >
        <div
          style={isCrm ? { display: 'flex', gap: 10, alignItems: 'center' } : undefined}
          className={isCrm ? undefined : 'flex gap-3 items-end'}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={t.lkChat.placeholder}
            rows={isCrm ? 2 : 2}
            style={isCrm ? { flex: 1, minHeight: 58, maxHeight: 150, boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 10, background: '#fff', color: '#25241f', padding: '16px 18px', font: '15px/1.45 Arial, Helvetica, sans-serif', resize: 'none', outline: 'none' } : undefined}
            className={isCrm ? undefined : 'flex-1 bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/60 resize-none'}
          />
          <button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            style={isCrm ? { alignSelf: 'stretch', border: 0, borderRadius: 10, background: '#a7814e', color: '#fff', padding: '0 30px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.5 : 1 } : undefined}
            className={isCrm ? undefined : 'inline-flex items-center gap-1.5 px-5 py-3 text-xs uppercase tracking-wider bg-[var(--n15-gold)] text-[var(--on-accent)] font-medium transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer'}
          >
            {sending ? t.lkChat.sending : t.lkChat.send}
          </button>
        </div>
      </div>
    </div>
  )
}

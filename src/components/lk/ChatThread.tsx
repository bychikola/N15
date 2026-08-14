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

export default function ChatThread({ applicationId, lang }: { applicationId: number; lang: string }) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [meId, setMeId] = useState<number | null>(null)
  const [meRole, setMeRole] = useState<string>('user')
  const [objectInfo, setObjectInfo] = useState<{ id?: number; title?: string; agentName?: string; agentPhone?: string; clientName?: string }>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

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
    if (!appRes.ok) return
    const app = await appRes.json()
    const obj = app.object as Record<string, unknown> | undefined
    const agent = app.agent as Record<string, unknown> | undefined
    const clientUser = app.user as Record<string, unknown> | undefined
    setObjectInfo({
      id: obj?.id as number | undefined,
      title: (obj?.title as string) || undefined,
      agentName: (agent?.name as string) || undefined,
      agentPhone: (agent?.phone as string) || undefined,
      clientName: (clientUser?.name as string) || (app.clientName as string) || undefined,
    })

    const msgData = await msgRes.json()
    const docs = (msgData.docs || []) as Record<string, unknown>[]
    setMessages(
      docs.map((m) => {
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
      }),
    )
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
  const personPhone = meRole === 'agent' ? undefined : objectInfo.agentPhone

  if (loading) {
    return <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
  }

  return (
    <div className="flex flex-col min-h-[60vh]">
      {/* Шапка: объект + собеседник */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--n15-gold)]/10">
        {objectInfo.id ? (
          <Link href={`/${lang}/catalog/${objectInfo.id}`} className="text-sm text-[var(--n15-gold)] hover:underline">
            {objectInfo.title}
          </Link>
        ) : (
          <span className="text-sm text-[var(--n15-muted)]">{t.lkChat.requestCard} #{applicationId}</span>
        )}
        <div className="flex items-center gap-3">
          {personName && <span className="text-sm text-[var(--n15-white)]">{personName}</span>}
          {personPhone && (
            <a href={`tel:${personPhone.replace(/\s+/g, '')}`}
              className="text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-3 py-1.5 hover:bg-[var(--n15-gold)]/8 transition-colors">
              {t.lkChat.call}
            </a>
          )}
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 flex flex-col gap-3 py-2">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--n15-muted)] text-center py-10">{t.lkChat.empty}</p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === meId
          const showDay = i === 0 || dayLabel(messages[i - 1].createdAt, t, t.locale) !== dayLabel(m.createdAt, t, t.locale)
          return (
            <div key={m.id}>
              {showDay && (
                <div className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--n15-muted)] my-3">
                  {dayLabel(m.createdAt, t, t.locale)}
                </div>
              )}
              <div className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                mine
                  ? 'ml-auto border border-[var(--n15-gold)]/40 text-[var(--n15-white)]'
                  : 'mr-auto bg-[var(--n15-charcoal)] text-[var(--n15-silver)]'
              }`}>
                <div>{m.text}</div>
                <div className="text-[10px] mt-1 flex items-center justify-end gap-1 text-[var(--n15-muted)]">
                  {new Date(m.createdAt).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })}
                  {mine && m.read && (
                    <span className="material-symbols-outlined text-[12px] text-[var(--n15-gold)]" title={t.lkChat.readMark}>done_all</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Инпут */}
      <div className="sticky bottom-0 pt-3 mt-3 border-t border-[var(--n15-gold)]/10 bg-[var(--n15-black)]">
        <div className="flex gap-2">
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
            rows={2}
            className="flex-1 bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50 resize-none"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className="self-end px-5 py-2.5 text-xs uppercase tracking-wider bg-[var(--n15-gold)] text-[var(--on-accent)] font-medium transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer"
          >
            {sending ? t.lkChat.sending : t.lkChat.send}
          </button>
        </div>
      </div>
    </div>
  )
}

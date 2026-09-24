'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import { LkShell } from '@/components/lk/LkShell'

/**
 * Переписка по объявлению доски (/lk/board/messages/<adId>).
 *
 * Одна страница на обе стороны: покупатель открывает её из кабинета и видит
 * переписку с автором, автор — переписку с конкретным покупателем (кого
 * указывает параметр ?with=, потому что у автора диалогов может быть
 * несколько). Сообщения обновляются опросом раз в 8 секунд — как в переписке
 * по заявкам (см. src/components/lk/ChatThread.tsx): постоянного соединения
 * на этом сайте нет, а открытая вкладка должна получать ответы сама.
 */
const POLL_MS = 8_000

interface MessageItem {
  id: number
  text: string
  createdAt: string
  senderId: number
  senderName: string
}

export default function BoardDialogPage() {
  const params = useParams<{ lang: string; adId: string }>()
  const lang = params?.lang || 'ru'
  const adId = Number(params?.adId)
  const search = useSearchParams()
  const withId = search?.get('with') || ''
  const { t } = useI18n()

  const [messages, setMessages] = useState<MessageItem[]>([])
  const [meId, setMeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Загрузка в стиле обещаний, а не async/await: состояние меняется только
  // в колбэках — правило react-hooks/set-state-in-effect не пропускает
  // setState, достижимый из тела эффекта синхронно (см. ту же схему
  // в src/app/(site)/[lang]/lk/board/page.tsx)
  const load = useCallback(() => {
    const query = new URLSearchParams({ ad: String(adId) })
    if (withId) query.set('with', withId)
    return fetch(`/api/board/messages?${query}`, { credentials: 'include' })
      .then((res) => res.json().catch(() => null))
      .then((data: { messages?: MessageItem[]; error?: string } | null) => {
        if (data?.error) {
          setError(data.error)
          return
        }
        setMessages(Array.isArray(data?.messages) ? data.messages : [])
      })
      .catch(() => setError(t.board.msgFailed))
      .finally(() => setLoading(false))
  }, [adId, withId, t.board.msgFailed])

  useEffect(() => {
    void load()
  }, [load])

  // Кто я — нужно, чтобы отличать свои сообщения от чужих
  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setMeId(d?.user?.id ?? null))
      .catch(() => null)
  }, [])

  // Опрос: открытая вкладка сама получает ответы собеседника
  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async () => {
    if (sending) return
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ adId, text, ...(withId ? { to: Number(withId) } : {}) }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.board.msgFailed)
        return
      }
      setText('')
      await load()
    } catch {
      setError(t.board.msgFailed)
    } finally {
      setSending(false)
    }
  }

  return (
    <LkShell active="board">
      <Link
        href={`/${lang}/lk/board`}
        style={{ display: 'inline-block', marginBottom: 14, color: 'var(--n15-gold)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}
      >
        {t.board.dialogBack}
      </Link>

      <h1 style={{ margin: '0 0 4px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.board.msgTitle}
      </h1>
      <p style={{ margin: '0 0 16px', color: 'var(--n15-muted)', fontSize: 11 }}>
        {t.board.dialogAbout}:{' '}
        <Link href={`/${lang}/board/${adId}`} style={{ color: 'var(--n15-gold)' }}>
          #{adId}
        </Link>
      </p>

      <div style={{ border: '1px solid rgba(167,129,78,.25)', borderRadius: 12, padding: 16, maxWidth: 720 }}>
        {loading ? (
          <p style={{ color: 'var(--n15-muted)', fontSize: 13 }}>{t.common.loading}</p>
        ) : !messages.length ? (
          <p style={{ color: 'var(--n15-muted)', fontSize: 13 }}>{t.board.dialogEmpty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {messages.map((m) => {
              const mine = meId != null && m.senderId === meId
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    border: '1px solid rgba(167,129,78,.25)',
                    borderRadius: 10,
                    padding: '9px 12px',
                    background: mine ? 'rgba(167,129,78,.12)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--n15-muted)', marginBottom: 3 }}>
                    {mine ? t.board.dialogYou : m.senderName || '—'} ·{' '}
                    {new Date(m.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{m.text}</div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder={t.board.msgPlaceholder}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(167,129,78,.35)', borderRadius: 8, background: 'transparent', color: 'var(--n15-silver)', padding: '10px 12px', fontSize: 13, font: '13px Arial, Helvetica, sans-serif' }}
        />
        {error && <p style={{ margin: '8px 0 0', color: '#9b4e43', fontSize: 11.5 }}>{error}</p>}
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending}
          style={{ marginTop: 10, border: '1px solid var(--n15-gold)', borderRadius: 7, background: 'transparent', color: 'var(--n15-gold)', padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer', opacity: sending ? 0.5 : 1 }}
        >
          {sending ? t.board.dialogSending : t.board.dialogSend}
        </button>
      </div>
    </LkShell>
  )
}

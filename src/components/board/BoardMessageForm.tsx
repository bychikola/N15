'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

/**
 * «Написать автору» на странице объявления.
 *
 * Сообщение уходит на POST /api/board/messages: маршрут проверяет сессию,
 * что объявление опубликовано, и что пишут именно автору (себе писать нельзя).
 * Гостю вместо формы показываем вход со ссылкой — так же, как на странице
 * подачи: без аккаунта некому ответить, и переписку негде прочитать.
 *
 * Ответ автор пишет из личного кабинета; покупатель читает переписку там же —
 * в разделе «Мои объявления» (см. /lk/board).
 */
export const BoardMessageForm: FC<{ t: Dict; adId: number; loggedIn: boolean; lang: string }> = ({
  t,
  adId,
  loggedIn,
  lang,
}) => {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (busy) return
    if (!text.trim()) {
      setError(t.board.msgEmpty)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ adId, text }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.board.msgFailed)
        return
      }
      setText('')
      setSent(true)
    } catch {
      setError(t.board.msgFailed)
    } finally {
      setBusy(false)
    }
  }

  if (!loggedIn) {
    return (
      <div>
        <p className="text-[11px] leading-relaxed text-[var(--n15-muted)] mb-3">{t.board.msgLoginHint}</p>
        <Link
          href={`/${lang}/login`}
          className="block w-full text-center px-4 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300"
        >
          {t.board.msgLogin}
        </Link>
      </div>
    )
  }

  if (sent) {
    return (
      <div>
        <p className="text-sm text-[var(--n15-gold)] mb-2">{t.board.msgSent}</p>
        <p className="text-[11px] leading-relaxed text-[var(--n15-muted)] mb-3">{t.board.msgSentHint}</p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-[11px] text-[var(--n15-gold)] hover:underline underline-offset-2 cursor-pointer"
        >
          {t.board.msgAnother}
        </button>
      </div>
    )
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={t.board.msgPlaceholder}
        className="w-full box-border bg-[var(--n15-black)] border border-[var(--n15-gold)]/30 px-3 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]"
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className="mt-2 w-full px-4 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer disabled:opacity-50"
      >
        {busy ? t.board.msgSending : t.board.msgSend}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--n15-muted)]">{error || t.board.msgHint}</p>
    </div>
  )
}

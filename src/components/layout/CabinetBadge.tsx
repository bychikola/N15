'use client'

import { useEffect, useState } from 'react'

const POLL_MS = 30_000

/** Золотой бейдж непрочитанных сообщений на ссылке «Личный кабинет» в шапке. */
export default function CabinetBadge() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (document.visibilityState !== 'visible') return
      try {
        const meRes = await fetch('/api/users/me', { credentials: 'include' })
        const meData = await meRes.json()
        const me = meData?.user
        if (!me) {
          if (!cancelled) setUnread(0)
          return
        }
        const res = await fetch(
          `/api/messages?${new URLSearchParams({
            where: JSON.stringify({
              and: [
                { 'application.user': { equals: me.id } },
                { read: { equals: false } },
                { 'sender.id': { not_equals: me.id } },
              ],
            }),
            limit: '0',
          })}`,
          { credentials: 'include' },
        )
        const data = await res.json()
        if (!cancelled) setUnread(data.totalDocs ?? 0)
      } catch {
        // нет сети/сессии — бейдж не показываем
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (unread === 0) return null

  return (
    <span className="ml-1.5 min-w-4 h-4 px-1 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[10px] font-semibold inline-flex items-center justify-center">
      {unread}
    </span>
  )
}

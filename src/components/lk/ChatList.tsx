'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

interface ConversationItem {
  applicationId: number
  objectTitle: string
  objectImage?: string
  personName: string
  lastText: string
  lastAt: string
  unread: number
}

const POLL_MS = 10_000

export default function ChatList({ lang }: { lang: string }) {
  const { t } = useI18n()
  const [items, setItems] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const meRes = await fetch('/api/users/me', { credentials: 'include' })
      const meData = await meRes.json()
      const me = meData?.user
      if (!me) {
        setItems([])
        return
      }
      // Мои заявки (как клиент) или назначенные мне (как агент)
      const where = me.role === 'agent'
        ? { 'agent.user': { equals: me.id } }
        : { user: { equals: me.id } }
      const appsRes = await fetch(
        `/api/applications?${new URLSearchParams({
          where: JSON.stringify(where),
          depth: '2',
          limit: '50',
          sort: '-createdAt',
        })}`,
        { credentials: 'include' },
      )
      const appsData = await appsRes.json()
      const apps = (appsData.docs || []) as Record<string, unknown>[]

      const convs: ConversationItem[] = []
      for (const app of apps) {
        const appId = app.id as number
        const obj = app.object as Record<string, unknown> | undefined
        const agent = app.agent as Record<string, unknown> | undefined
        const clientUser = app.user as Record<string, unknown> | undefined

        const msgRes = await fetch(
          `/api/messages?${new URLSearchParams({
            where: JSON.stringify({ application: { equals: appId } }),
            sort: '-createdAt',
            limit: '1',
            depth: '0',
          })}`,
          { credentials: 'include' },
        )
        const msgData = await msgRes.json()
        const last = (msgData.docs || [])[0] as Record<string, unknown> | undefined

        const unreadRes = await fetch(
          `/api/messages?${new URLSearchParams({
            where: JSON.stringify({
              and: [
                { application: { equals: appId } },
                { read: { equals: false } },
                { 'sender.id': { not_equals: me.id } },
              ],
            }),
            limit: '0',
          })}`,
          { credentials: 'include' },
        )
        const unreadData = await unreadRes.json()

        convs.push({
          applicationId: appId,
          objectTitle: (obj?.title as string) || (app.type as string) || '',
          objectImage: ((obj?.primaryImage as Record<string, unknown>)?.url as string) || undefined,
          personName:
            me.role === 'agent'
              ? (clientUser?.name as string) || (app.clientName as string) || ''
              : (agent?.name as string) || '',
          lastText: (last?.text as string) || (app.message as string) || '',
          lastAt: (last?.createdAt as string) || (app.createdAt as string) || '',
          unread: unreadData.totalDocs ?? 0,
        })
      }
      setItems(convs)
    } finally {
      setLoading(false)
    }
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

  if (loading) {
    return <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
  }

  if (items.length === 0) {
    return (
      <div>
        <p className="text-[var(--n15-muted)] mb-6">{t.lkMessages.empty}</p>
        <Link href={`/${lang}/catalog`} className="text-sm text-[var(--n15-gold)] underline">
          {t.lkMessages.viewCatalog}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-[var(--n15-gold)]/10">
      {items.map((c) => (
        <Link key={c.applicationId} href={`/${lang}/lk/messages/${c.applicationId}`}
          className="flex items-center gap-4 py-4 group">
          <div className="w-14 h-14 shrink-0 overflow-hidden bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10 flex items-center justify-center">
            {c.objectImage ? (
              <img src={c.objectImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[var(--n15-gold)]/40">apartment</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors truncate">
                {c.objectTitle}
              </span>
              <span className="text-[10px] text-[var(--n15-muted)] shrink-0">
                {c.lastAt ? new Date(c.lastAt).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 mt-0.5">
              <span className="text-xs text-[var(--n15-muted)] truncate">
                {c.personName}{c.lastText ? ` · ${c.lastText}` : ''}
              </span>
              {c.unread > 0 && (
                <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[11px] font-semibold flex items-center justify-center">
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

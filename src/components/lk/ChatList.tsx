'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { STAGES, stageLabel } from './FunnelCard'

interface ConversationItem {
  applicationId: number
  objectTitle: string
  objectImage?: string
  personName: string
  lastText: string
  lastAt: string
  unread: number
  status: string
  agentId?: number
  agentName?: string
}

const POLL_MS = 10_000

const crmRowStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14,
  display: 'flex', alignItems: 'center', gap: 14, color: '#25241f', textDecoration: 'none',
}
const crmThumbStyle: React.CSSProperties = {
  width: 56, height: 56, flexShrink: 0, overflow: 'hidden', borderRadius: 8,
  background: '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const crmBadgeStyle: React.CSSProperties = {
  flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
  background: '#a7814e', color: '#fff', fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

export default function ChatList({ lang, basePath = '/lk/messages', variant = 'lk', showFilters = false }: { lang: string; basePath?: string; variant?: 'lk' | 'crm'; showFilters?: boolean }) {
  const { t } = useI18n()
  const isCrm = variant === 'crm'
  const [search, setSearch] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [meRole, setMeRole] = useState<string>('user')
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
      setMeRole((me.role as string) || 'user')
      // Мои заявки (как клиент), назначенные мне (как агент), все (админ)
      const where = me.role === 'agent'
        ? { 'agent.user': { equals: me.id } }
        : me.role === 'admin'
          ? undefined
          : { user: { equals: me.id } }
      const appParams = new URLSearchParams({ depth: '2', limit: '200', sort: '-createdAt' })
      if (where) appParams.set('where', JSON.stringify(where))
      const appsRes = await fetch(`/api/applications?${appParams}`, { credentials: 'include' })
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
          status: (app.status as string) || '',
          agentId: (agent as Record<string, unknown> | undefined)?.id as number | undefined,
          agentName: (agent as Record<string, unknown> | undefined)?.name as string | undefined,
        })
      }
      if (me.role === 'admin') {
        const agentsRes = await fetch('/api/agents?limit=100&depth=0', { credentials: 'include' })
        const agentsData = await agentsRes.json()
        setAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name })))
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

  const visibleItems = items.filter((c) => {
    if (onlyUnread && c.unread === 0) return false
    if (statusFilter && c.status !== statusFilter) return false
    if (agentFilter && c.agentId !== Number(agentFilter)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.objectTitle.toLowerCase().includes(q) ||
      c.personName.toLowerCase().includes(q) ||
      c.lastText.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
  }

  if (items.length === 0) {
    return (
      <div style={isCrm ? { background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' } : undefined}
        className={isCrm ? undefined : 'bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-10 text-center'}>
        <span style={isCrm ? { display: 'block', color: '#b99a6a', fontSize: 26, marginBottom: 10 } : undefined}
          className={isCrm ? 'material-symbols-outlined' : 'material-symbols-outlined text-3xl text-[var(--n15-gold)]/40 mb-3'} aria-hidden="true">forum</span>
        <p style={isCrm ? { color: '#817b70', fontSize: 13, margin: '0 0 14px' } : undefined}
          className={isCrm ? undefined : 'text-sm text-[var(--n15-muted)] mb-6'}>
          {t.lkMessages.empty}
        </p>
        <Link href={`/${lang}/catalog`}
          style={isCrm ? { display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '10px 18px', textDecoration: 'none' } : undefined}
          className={isCrm ? undefined : 'inline-block text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-6 py-2.5 hover:bg-[var(--n15-gold)]/8 transition-colors'}>
          {t.lkMessages.viewCatalog}
        </Link>
      </div>
    )
  }

  return (
    <div style={isCrm ? { display: 'flex', flexDirection: 'column', gap: 10 } : undefined} className={isCrm ? undefined : 'space-y-3'}>
      {isCrm && showFilters && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.crm.searchPlaceholder}
            aria-label={t.crm.searchPlaceholder}
            style={{ flex: '1 1 260px', maxWidth: 420, boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif' }}
          />
          <button
            type="button"
            onClick={() => setOnlyUnread((v) => !v)}
            style={{
              border: '1px solid #d9d1c4', borderRadius: 999, background: onlyUnread ? '#a7814e' : '#fff',
              color: onlyUnread ? '#fff' : '#716b62', padding: '9px 16px', fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer',
            }}
          >
            {t.crm.filterUnread}
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t.crm.filterStatus}
            style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}
          >
            <option value="">{t.crm.filterStatus}: {t.crm.filterAll}</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{stageLabel(t, s.value)}</option>
            ))}
          </select>
          {meRole === 'admin' && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label={t.crm.filterAgent}
              style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}
            >
              <option value="">{t.crm.filterAgent}: {t.crm.filterAll}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {t.crm.chatsTotal}: {visibleItems.length}
          </span>
        </div>
      )}
      {visibleItems.map((c) => (
        <Link key={c.applicationId} href={`${basePath}/${c.applicationId}`}
          style={isCrm ? crmRowStyle : undefined}
          className={isCrm ? undefined : 'flex items-center gap-4 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-4 hover:border-[var(--n15-gold)]/40 transition-colors group'}>
          <div style={isCrm ? crmThumbStyle : undefined}
            className={isCrm ? undefined : 'w-14 h-14 shrink-0 overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 flex items-center justify-center'}>
            {c.objectImage ? (
              <img src={c.objectImage} alt="" style={isCrm ? { width: '100%', height: '100%', objectFit: 'cover' } : undefined} className={isCrm ? undefined : 'w-full h-full object-cover'} />
            ) : (
              <span style={isCrm ? { color: '#b99a6a' } : undefined} className="material-symbols-outlined text-[var(--n15-gold)]/40">apartment</span>
            )}
          </div>
          <div style={isCrm ? { flex: 1, minWidth: 0 } : undefined} className={isCrm ? undefined : 'flex-1 min-w-0'}>
            <div style={isCrm ? { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 } : undefined}
              className={isCrm ? undefined : 'flex items-baseline justify-between gap-3'}>
              <span style={isCrm ? { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors truncate'}>
                {c.objectTitle}
              </span>
              <span style={isCrm ? { fontSize: 10, color: '#817b70', flexShrink: 0 } : undefined}
                className={isCrm ? undefined : 'text-[10px] tracking-wide text-[var(--n15-muted)] shrink-0'}>
                {c.lastAt ? new Date(c.lastAt).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <div style={isCrm ? { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 4 } : undefined}
              className={isCrm ? undefined : 'flex items-baseline justify-between gap-3 mt-1'}>
              <span style={isCrm ? { fontSize: 11, color: '#8a857b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-xs text-[var(--n15-muted)] truncate'}>
                {c.personName && <span style={isCrm ? { color: '#25241f' } : undefined} className={isCrm ? undefined : 'text-[var(--n15-silver)]'}>{c.personName} · </span>}
                {c.lastText}
              </span>
              {c.unread > 0 && (
                <span style={isCrm ? crmBadgeStyle : undefined}
                  className={isCrm ? undefined : 'shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[11px] font-semibold flex items-center justify-center'}>
                  {c.unread}
                </span>
              )}
            </div>
          </div>
          {!isCrm && (
            <span className="material-symbols-outlined text-lg text-[var(--n15-muted)] group-hover:text-[var(--n15-gold)] transition-colors shrink-0" aria-hidden="true">
              arrow_forward
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

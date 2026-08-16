'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import FunnelCard, { STAGES, stageLabel, type FunnelApplication } from './FunnelCard'

const POLL_MS = 30_000

const money = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v) + ' млн'

export default function FunnelBoard({ lang }: { lang: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [meRole, setMeRole] = useState<string>('user')
  const [meAgentId, setMeAgentId] = useState<number | null>(null)
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [apps, setApps] = useState<FunnelApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [quickName, setQuickName] = useState('')
  const [lossApp, setLossApp] = useState<FunnelApplication | null>(null)
  const [lossTarget, setLossTarget] = useState<string>('')
  const [lossReason, setLossReason] = useState('')

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    setMeRole((me.role as string) || 'user')

    if (me.role === 'agent') {
      const agentRes = await fetch(`/api/agents?${new URLSearchParams({ where: JSON.stringify({ user: { equals: me.id } }), limit: '1', depth: '0' })}`, { credentials: 'include' })
      const agentData = await agentRes.json()
      setMeAgentId(((agentData.docs || [])[0] as { id?: number } | undefined)?.id ?? null)
    }

    const where: Record<string, unknown> = {}
    if (me.role === 'agent') {
      // Свои заявки + общий пул «Неразобранное»
      where.or = [
        { 'agent.user': { equals: me.id } },
        { status: { equals: 'unsorted' } },
      ]
    } else if (me.role === 'admin' && agentFilter) {
      if (agentFilter === 'none') {
        where.agent = { equals: null }
      } else {
        where.agent = { equals: parseInt(agentFilter, 10) }
      }
    }

    const params = new URLSearchParams({ sort: '-createdAt', depth: '2', limit: '200' })
    if (Object.keys(where).length) params.set('where', JSON.stringify(where))
    const res = await fetch(`/api/applications?${params}`, { credentials: 'include' })
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]

    const result: FunnelApplication[] = []
    for (const a of docs) {
      const appId = a.id as number
      const obj = a.object as Record<string, unknown> | undefined
      const clientUser = a.user as Record<string, unknown> | undefined

      const [msgRes, unreadRes] = await Promise.all([
        fetch(`/api/messages?${new URLSearchParams({ where: JSON.stringify({ application: { equals: appId } }), sort: '-createdAt', limit: '1' })}`, { credentials: 'include' }),
        fetch(`/api/messages?${new URLSearchParams({ where: JSON.stringify({ and: [{ application: { equals: appId } }, { read: { equals: false } }, { 'sender.id': { not_equals: me.id } }] }), limit: '0' })}`, { credentials: 'include' }),
      ])
      const msgData = await msgRes.json()
      const unreadData = await unreadRes.json()
      const last = (msgData.docs || [])[0] as Record<string, unknown> | undefined

      result.push({
        id: appId,
        status: a.status as string,
        type: a.type as string,
        createdAt: a.createdAt as string,
        clientName: (clientUser?.name as string) || (a.clientName as string) || '—',
        clientPhone: (clientUser?.phone as string) || (a.clientPhone as string) || undefined,
        objectTitle: (obj?.title as string) || undefined,
        objectId: (obj?.id as number) || undefined,
        objectPrice: (obj?.price as number) || undefined,
        lastText: (last?.text as string) || undefined,
        lastActionAt: (last?.createdAt as string) || (a.createdAt as string) || undefined,
        unread: unreadData.totalDocs ?? 0,
        tags: ((a.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean),
      })
    }
    setApps(result)

    if (me.role === 'admin') {
      const agentsRes = await fetch('/api/agents?limit=100&depth=0', { credentials: 'include' })
      const agentsData = await agentsRes.json()
      setAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name })))
    }
    setLoading(false)
  }, [agentFilter])

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

  // Локальный поиск (debounce 200 мс)
  const [searchApplied, setSearchApplied] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSearchApplied(search.trim().toLowerCase()), 200)
    return () => clearTimeout(id)
  }, [search])

  const visibleApps = useMemo(() => {
    if (!searchApplied) return apps
    return apps.filter((a) =>
      a.clientName.toLowerCase().includes(searchApplied) ||
      (a.objectTitle || '').toLowerCase().includes(searchApplied),
    )
  }, [apps, searchApplied])

  const moveStage = async (app: FunnelApplication, newStatus: string) => {
    if ((newStatus === 'closed' || newStatus === 'rejected') && meRole !== 'user') {
      setLossApp(app)
      setLossTarget(newStatus)
      setLossReason('')
      return
    }
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: newStatus } : a)))
    const body: Record<string, unknown> = { status: newStatus }
    // Агент забирает заявку из «Неразобранного» — назначается автоматически
    if (app.status === 'unsorted' && newStatus !== 'unsorted' && meRole === 'agent' && meAgentId) {
      body.agent = meAgentId
    }
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }

  const moveBy = (app: FunnelApplication, delta: number) => {
    const idx = STAGES.findIndex((s) => s.value === app.status)
    const target = STAGES[idx + delta]
    if (target) {
      void moveStage(app, target.value)
    }
  }

  const handleDrop = (stage: string) => {
    if (draggingId !== null) {
      const app = apps.find((a) => a.id === draggingId)
      if (app) {
        void moveStage(app, stage)
      }
    }
    setDraggingId(null)
    setDragOverStage(null)
  }

  const openChat = (appId: number) => {
    router.push(`/crm/messages/${appId}`)
  }

  const confirmLoss = async (withReason: boolean) => {
    if (!lossApp) return
    const app = lossApp
    const target = lossTarget
    const reason = withReason ? lossReason.trim() : ''
    setLossApp(null)
    setLossTarget('')
    setLossReason('')
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: target } : a)))
    const body: Record<string, unknown> = { status: target }
    if (app.status === 'unsorted' && target !== 'unsorted' && meRole === 'agent' && meAgentId) {
      body.agent = meAgentId
    }
    if (reason) {
      body.lossReason = reason
    }
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }

  const patchTags = async (app: FunnelApplication, tags: string[]) => {
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, tags } : a)))
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tags: tags.map((tg) => ({ tag: tg })) }),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }

  const quickAdd = async () => {
    const name = quickName.trim()
    if (!name) return
    setQuickName('')
    await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: 'viewing', clientName: name, status: 'unsorted', source: 'manual' }),
    })
    await load()
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const searchInputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8,
    background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif',
  }
  const columnStyle: React.CSSProperties = {
    flexShrink: 0, width: 300, minHeight: 300, display: 'flex', flexDirection: 'column',
    background: '#f5f2eb', border: '1px solid #e5dfd3', borderRadius: 12,
  }
  const columnHeaderStyle: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid #e5dfd3', display: 'flex',
    alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.crm.searchPlaceholder}
            aria-label={t.crm.searchPlaceholder}
            style={searchInputStyle}
          />
        </div>
        {meRole === 'admin' && (
          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setLoading(true) }}
            style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 10px', font: '12px Arial, Helvetica, sans-serif' }}
          >
            <option value="">{t.crm.agentsAll}</option>
            <option value="none">{t.lkFunnel.noAgent}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {searchApplied && (
          <button type="button" onClick={() => setSearch('')}
            style={{ border: 0, background: 'none', color: '#8d6b40', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
            ✕
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12 }}>
        {STAGES.map((stage) => {
          const stageApps = visibleApps.filter((a) => a.status === stage.value)
          const stageSum = stageApps.reduce((sum, a) => sum + (a.objectPrice || 0), 0)
          return (
            <div
              key={stage.value}
              style={columnStyle}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStage(stage.value)
              }}
              onDragLeave={() => {
                if (dragOverStage === stage.value) setDragOverStage(null)
              }}
              onDrop={() => handleDrop(stage.value)}
            >
              <div style={columnHeaderStyle}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046', fontWeight: 600 }}>
                  {stageLabel(t, stage.value)}
                </span>
                <span style={{ fontSize: 10, color: '#817b70', whiteSpace: 'nowrap' }}>
                  {stageApps.length}{stageSum > 0 ? ` · ${money(stageSum / 1_000_000)} ₽` : ''}
                </span>
              </div>
              <div
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
                  outline: dragOverStage === stage.value ? '2px dashed #b68a51' : 'none',
                }}
              >
                {stageApps.length === 0 && draggingId !== null && (
                  <div style={{ border: '1px dashed #cbbda9', borderRadius: 9, padding: 14, textAlign: 'center', fontSize: 9, color: '#9b958a', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    ↓
                  </div>
                )}
                {stage.value === 'unsorted' && meRole !== 'user' && (
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void quickAdd()
                      }
                    }}
                    placeholder={t.crm.quickAddPlaceholder}
                    aria-label={t.crm.quickAddPlaceholder}
                    style={{
                      boxSizing: 'border-box', width: '100%', border: '1px dashed #cbbda9', borderRadius: 8,
                      background: '#fcfaf7', color: '#25241f', padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif',
                    }}
                  />
                )}
                {stageApps.map((app) => (
                  <div
                    key={app.id}
                    draggable
                    onDragStart={() => setDraggingId(app.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                    onClick={() => openChat(app.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <FunnelCard
                      app={app}
                      lang={lang}
                      t={t}
                      canMoveLeft={STAGES.findIndex((s) => s.value === app.status) > 0}
                      canMoveRight={STAGES.findIndex((s) => s.value === app.status) < STAGES.length - 1}
                      onMoveLeft={() => moveBy(app, -1)}
                      onMoveRight={() => moveBy(app, 1)}
                      onOpenChat={() => openChat(app.id)}
                      onAddTag={meRole !== 'user' ? (tag) => void patchTags(app, [...app.tags, tag]) : undefined}
                      onRemoveTag={meRole !== 'user' ? (tag) => void patchTags(app, app.tags.filter((tg) => tg !== tag)) : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {lossApp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}
          onClick={() => { setLossApp(null); setLossReason(''); setLossTarget('') }}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 460px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>{t.crm.lossTitle}</h2>
              <button type="button" onClick={() => { setLossApp(null); setLossReason(''); setLossTarget('') }}
                style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {t.crm.lossReasons.map((r) => (
                <button key={r} type="button" onClick={() => setLossReason(r)}
                  style={{ border: '1px solid #d9d1c4', borderRadius: 999, background: lossReason === r ? '#a7814e' : '#fff', color: lossReason === r ? '#fff' : '#716b62', padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              placeholder={t.crm.lossCustom}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void confirmLoss(true)} disabled={!lossReason.trim()}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: lossReason.trim() ? 1 : 0.5 }}>
                {t.crm.lossAdd}
              </button>
              <button type="button" onClick={() => void confirmLoss(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.lossSkip}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

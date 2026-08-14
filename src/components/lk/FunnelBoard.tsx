'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import FunnelCard, { STAGES, stageLabel, type FunnelApplication } from './FunnelCard'

const POLL_MS = 30_000

export default function FunnelBoard({ lang }: { lang: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [meRole, setMeRole] = useState<string>('user')
  const [meId, setMeId] = useState<number | null>(null)
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [apps, setApps] = useState<FunnelApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    setMeId(me.id as number)
    setMeRole((me.role as string) || 'user')

    // Фильтр заявок: агент — свои, админ — все (или по выбранному агенту)
    const where: Record<string, unknown> = {}
    if (me.role === 'agent') {
      where['agent.user'] = { equals: me.id }
    } else if (me.role === 'admin' && agentFilter) {
      if (agentFilter === 'none') {
        where.agent = { equals: null }
      } else {
        where.agent = { equals: parseInt(agentFilter, 10) }
      }
    }

    const params = new URLSearchParams({
      sort: '-createdAt',
      depth: '2',
      limit: '200',
    })
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
        clientPhone: a.clientPhone as string | undefined,
        objectTitle: (obj?.title as string) || undefined,
        objectId: (obj?.id as number) || undefined,
        lastText: (last?.text as string) || undefined,
        unread: unreadData.totalDocs ?? 0,
      })
    }
    setApps(result)

    // Список агентов — только для админского фильтра
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

  const moveStage = async (appId: number, newStatus: string) => {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)))
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
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
      void moveStage(app.id, target.value)
    }
  }

  const handleDrop = (stage: string) => {
    if (draggingId !== null) {
      void moveStage(draggingId, stage)
    }
    setDraggingId(null)
    setDragOverStage(null)
  }

  if (loading) {
    return <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-xs text-[var(--n15-muted)]">{t.lkFunnel.dragHint}</p>
        {meRole === 'admin' && (
          <label className="flex items-center gap-2 text-xs text-[var(--n15-muted)]">
            <span className="text-[10px] tracking-[0.2em] uppercase">{t.lkApplications.agentLabel}:</span>
            <select
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setLoading(true) }}
              className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 px-3 py-2 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50"
            >
              <option value="">{t.lkFunnel.allAgents}</option>
              <option value="none">{t.lkFunnel.noAgent}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {STAGES.map((stage) => {
          const stageApps = apps.filter((a) => a.status === stage.value)
          return (
            <div
              key={stage.value}
              className="shrink-0 w-[280px] flex flex-col bg-[var(--n15-charcoal)]/60 border border-[var(--n15-gold)]/10 min-h-[300px]"
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStage(stage.value)
              }}
              onDragLeave={() => {
                if (dragOverStage === stage.value) setDragOverStage(null)
              }}
              onDrop={() => handleDrop(stage.value)}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--n15-gold)]/10">
                <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]">
                  {stageLabel(t, stage.value)}
                </span>
                <span className="text-xs text-[var(--n15-muted)]">{stageApps.length}</span>
              </div>

              <div className={`flex-1 flex flex-col gap-3 p-3 ${dragOverStage === stage.value ? 'outline-dashed outline-1 outline-[var(--n15-gold)]/50' : ''}`}>
                {stageApps.length === 0 && draggingId !== null && (
                  <div className="border border-dashed border-[var(--n15-gold)]/25 rounded-sm p-4 text-center text-[10px] uppercase tracking-[0.15em] text-[var(--n15-muted)]">
                    ↓
                  </div>
                )}
                {stageApps.map((app) => (
                  <div
                    key={app.id}
                    draggable={meRole === 'admin' || meRole === 'agent'}
                    onDragStart={() => setDraggingId(app.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                    onClick={() => router.push(`/${lang}/lk/messages/${app.id}`)}
                    className="cursor-pointer"
                  >
                    <FunnelCard
                      app={app}
                      lang={lang}
                      t={t}
                      canMoveLeft={STAGES.findIndex((s) => s.value === app.status) > 0}
                      canMoveRight={STAGES.findIndex((s) => s.value === app.status) < STAGES.length - 1}
                      onMoveLeft={() => moveBy(app, -1)}
                      onMoveRight={() => moveBy(app, 1)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

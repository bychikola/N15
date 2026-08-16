'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { STAGES, stageLabel, type FunnelApplication } from '@/components/lk/FunnelCard'

const POLL_MS = 30_000

export default function LeadsList() {
  const { t } = useI18n()
  const [apps, setApps] = useState<FunnelApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    const where: Record<string, unknown> = {}
    if (me.role === 'agent') {
      where['agent.user'] = { equals: me.id }
    }
    const params = new URLSearchParams({ sort: '-createdAt', depth: '2', limit: '200' })
    if (Object.keys(where).length) params.set('where', JSON.stringify(where))
    const res = await fetch(`/api/applications?${params}`, { credentials: 'include' })
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]
    setApps(docs.map((a) => {
      const obj = a.object as Record<string, unknown> | undefined
      const agent = a.agent as Record<string, unknown> | undefined
      const clientUser = a.user as Record<string, unknown> | undefined
      return {
        id: a.id as number,
        status: a.status as string,
        type: a.type as string,
        createdAt: a.createdAt as string,
        clientName: (clientUser?.name as string) || (a.clientName as string) || '—',
        clientPhone: (clientUser?.phone as string) || (a.clientPhone as string) || undefined,
        objectTitle: (obj?.title as string) || undefined,
        objectId: (obj?.id as number) || undefined,
        objectPrice: (obj?.price as number) || undefined,
        tags: ((a.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean),
        agentName: (agent?.name as string) || undefined,
        unread: 0,
      }
    }))
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return apps
    return apps.filter((a) =>
      a.clientName.toLowerCase().includes(q) ||
      (a.objectTitle || '').toLowerCase().includes(q) ||
      (a.agentName || '').toLowerCase().includes(q),
    )
  }, [apps, search])

  const changeStatus = async (app: FunnelApplication, status: string) => {
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)))
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #eee9e1', fontSize: 12, color: '#25241f', whiteSpace: 'nowrap' }
  const headCell: React.CSSProperties = { ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }
  const selectStyle: React.CSSProperties = { border: '1px solid #d9d1c4', borderRadius: 7, background: '#fff', color: '#25241f', padding: '6px 8px', font: '11px Arial, Helvetica, sans-serif' }

  return (
    <div>
      <div style={{ marginBottom: 14, maxWidth: 420 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.crm.searchPlaceholder}
          aria-label={t.crm.searchPlaceholder}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif' }}
        />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#faf8f4' }}>
              <th style={headCell}>{t.crm.thClient}</th>
              <th style={headCell}>{t.crm.thObject}</th>
              <th style={headCell}>{t.crm.thAgent}</th>
              <th style={headCell}>{t.crm.thStage}</th>
              <th style={{ ...headCell, textAlign: 'right' }}>{t.crm.objPrice}</th>
              <th style={headCell}>{t.crm.updated}</th>
              <th style={headCell}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <td style={cell}>
                  <div style={{ fontWeight: 600 }}>{a.clientName}</div>
                  {a.clientPhone && <div style={{ fontSize: 10, color: '#8d6b40' }}>{a.clientPhone}</div>}
                </td>
                <td style={{ ...cell, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.objectTitle || '—'}
                </td>
                <td style={cell}>{a.agentName || '—'}</td>
                <td style={cell}>
                  <select value={a.status} onChange={(e) => void changeStatus(a, e.target.value)} style={selectStyle}>
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{stageLabel(t, s.value)}</option>
                    ))}
                  </select>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {a.objectPrice != null ? new Intl.NumberFormat('ru-RU').format(a.objectPrice) + ' ₽' : '—'}
                </td>
                <td style={cell}>{new Date(a.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}</td>
                <td style={cell}>
                  <Link href={`/crm/messages/${a.id}`} style={{ color: '#8d6b40', fontSize: 11, textDecoration: 'none', border: '1px solid #d9d1c4', borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                    {t.crm.chat}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

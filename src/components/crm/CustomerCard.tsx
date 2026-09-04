'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { APPLICATION_TYPE_LABELS } from '@/components/lk/FunnelCard'

interface AppItem {
  id: number
  objectTitle: string
  createdAt: string
}

export default function CustomerCard({ id }: { id: number }) {
  const { t } = useI18n()
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${id}?depth=1`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    setCustomer(data)
    const appsRes = await fetch(
      `/api/applications?${new URLSearchParams({ where: JSON.stringify({ customer: { equals: id } }), sort: '-createdAt', limit: '100', depth: '1' })}`,
      { credentials: 'include' },
    )
    const appsData = await appsRes.json()
    setApps(((appsData.docs || []) as Record<string, unknown>[]).map((a) => {
      const obj = a.object as Record<string, unknown> | undefined
      return {
        id: a.id as number,
        objectTitle: (obj?.title as string) || APPLICATION_TYPE_LABELS[a.type as string] || '—',
        createdAt: a.createdAt as string,
      }
    }))
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled) return
      await load()
    }
    void tick()
    return () => { cancelled = true }
  }, [load])

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  if (!customer) {
    return <p style={{ color: '#9b4e43', fontSize: 12 }}>{t.crm.customerEmpty}</p>
  }

  const agent = customer.agent as Record<string, unknown> | undefined
  const tags = ((customer.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean)

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, padding: '12px 0', borderBottom: '1px solid #eee9e1', fontSize: 12, color: '#25241f' }
  const labelStyle: React.CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046', whiteSpace: 'nowrap' }

  return (
    <div>
      <Link href="/crm/customers" style={{ display: 'inline-block', marginBottom: 16, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8d6b40', textDecoration: 'none' }}>
        {t.crm.customerBack}
      </Link>
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 22, maxWidth: 640 }}>
        <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>{customer.name as string}</h2>
        {tags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tg) => (
              <span key={tg} style={{ padding: '4px 10px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{tg}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerPhone}</span><span>{customer.phone ? <a href={`tel:${(customer.phone as string).replace(/\s+/g, '')}`} style={{ color: '#8d6b40', textDecoration: 'none' }}>{customer.phone as string}</a> : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerEmail}</span><span>{customer.email ? (customer.email as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerCompany}</span><span>{customer.company ? (customer.company as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerPosition}</span><span>{customer.position ? (customer.position as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerAgent}</span><span>{agent?.name ? (agent.name as string) : '—'}</span></div>
          {customer.note ? (
            <div style={rowStyle}><span style={labelStyle}>{t.crm.customerNote}</span><span style={{ whiteSpace: 'pre-wrap', textAlign: 'right' }}>{customer.note as string}</span></div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 18, background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 22, maxWidth: 640 }}>
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>{t.crm.customerApplications}</span>
          <span style={{ marginLeft: 8, fontSize: 10, color: '#817b70' }}>{apps.length}</span>
        </div>
        {apps.length === 0 ? (
          <p style={{ color: '#9b958a', fontSize: 11, margin: 0 }}>{t.crm.customerNoApps}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee9e1', fontSize: 12 }}>
                    <Link href={`/crm/messages/${a.id}`} style={{ color: '#25241f', textDecoration: 'none' }}>{a.objectTitle}</Link>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee9e1', fontSize: 10, color: '#817b70', textAlign: 'right' }}>
                    {new Date(a.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

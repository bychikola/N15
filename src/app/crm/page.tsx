import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from './auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmDenied } from '@/components/crm/CrmDenied'
import { stageLabel } from '@/components/lk/FunnelCard'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    return <CrmDenied t={t} />
  }

  const payload = await getPayload({ config })
  const [objectsCount, clientsCount, activeLeads, messagesCount, recentDocs] = await Promise.all([
    payload.count({ collection: 'objects' }),
    payload.count({ collection: 'users', where: { role: { equals: 'user' } } }),
    payload.count({
      collection: 'applications',
      where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] },
    }),
    payload.count({ collection: 'messages' }),
    payload.find({
      collection: 'applications',
      sort: '-createdAt',
      limit: 5,
      depth: 1,
    }),
  ])

  const metrics = [
    { label: t.crm.metricObjects, value: String(objectsCount.totalDocs), note: t.crm.metricObjectsNote },
    { label: t.crm.metricLeads, value: String(activeLeads.totalDocs), note: t.crm.metricLeadsNote },
    { label: t.crm.metricClients, value: String(clientsCount.totalDocs), note: t.crm.metricClientsNote },
    { label: t.crm.metricMessages, value: String(messagesCount.totalDocs), note: t.crm.metricMessagesNote },
  ]

  const recent = (recentDocs.docs || []).map((d) => {
    const a = d as unknown as Record<string, unknown>
    const obj = a.object as Record<string, unknown> | undefined
    const clientUser = a.user as Record<string, unknown> | undefined
    const agent = a.agent as Record<string, unknown> | undefined
    return {
      id: a.id as number,
      client: (clientUser?.name as string) || (a.clientName as string) || '—',
      object: (obj?.title as string) || (a.type as string) || '—',
      stage: stageLabel(t, (a.status as string) || 'new'),
      agent: (agent?.name as string) || '—',
    }
  })

  return (
    <CrmShell user={user} t={t} active="overview">
      <div className="crm-metrics">
        {metrics.map((m) => (
          <article className="crm-metric" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </div>
      <div className="crm-grid">
        <article className="crm-card wide" id="leads">
          <div className="crm-card-header">
            <h2>{t.crm.recentLeads}</h2>
            <span>{t.crm.recentLeadsNote}</span>
          </div>
          {recent.length ? (
            <table className="crm-table">
              <thead>
                <tr><th>{t.crm.thClient}</th><th>{t.crm.thObject}</th><th>{t.crm.thStage}</th><th>{t.crm.thAgent}</th></tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td><a href={`/crm/messages/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><strong>{r.client}</strong></a></td>
                    <td>{r.object}</td>
                    <td><span className="crm-status">{r.stage}</span></td>
                    <td>{r.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty"><strong>{t.crm.emptyLeads}</strong><p>{t.crm.emptyLeadsText}</p></div>
          )}
        </article>
      </div>
    </CrmShell>
  )
}

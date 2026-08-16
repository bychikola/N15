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

  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const tomorrowD = new Date(today.getTime() + 86400000)
  const tomorrowISO = `${tomorrowD.getFullYear()}-${pad(tomorrowD.getMonth() + 1)}-${pad(tomorrowD.getDate())}`

  const taskWhere: Record<string, unknown> = user.role === 'admin' ? {} : { assignedTo: { equals: user.id } }
  const [tasksOverdue, tasksTodayUp, tasksTomorrowUp, tasksAll, activeAppsAll] = await Promise.all([
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { less_than: todayISO } } }),
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { greater_than_equal: todayISO } } }),
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { greater_than_equal: tomorrowISO } } }),
    payload.find({ collection: 'tasks', limit: 500, depth: 0 }),
    payload.find({ collection: 'applications', limit: 1000, depth: 0, where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] } }),
  ])
  const tasksTodayCount = Math.max(0, tasksTodayUp.totalDocs - tasksTomorrowUp.totalDocs)

  // Заявок без задач: активные заявки без привязки к задачам
  const appsWithTasks = new Set((tasksAll.docs || []).map((tk) => (tk as unknown as { application?: number | null }).application).filter(Boolean))
  const activeApps = (activeAppsAll.docs || []) as { id: number }[]
  const leadsNoTasks = activeApps.filter((a) => !appsWithTasks.has(a.id)).length

  const metrics = [
    { label: t.crm.metricObjects, value: String(objectsCount.totalDocs), note: t.crm.metricObjectsNote },
    { label: t.crm.metricLeads, value: String(activeLeads.totalDocs), note: t.crm.metricLeadsNote },
    { label: t.crm.metricClients, value: String(clientsCount.totalDocs), note: t.crm.metricClientsNote },
    { label: t.crm.metricMessages, value: String(messagesCount.totalDocs), note: t.crm.metricMessagesNote },
    { label: t.crm.metricTasksOverdue, value: String(tasksOverdue.totalDocs), note: t.crm.taskColOverdue },
    { label: t.crm.metricTasksToday, value: String(tasksTodayCount), note: t.crm.taskColToday },
    { label: t.crm.metricTasksTomorrow, value: String(tasksTomorrowUp.totalDocs), note: t.crm.taskColTomorrow },
    { label: t.crm.metricLeadsNoTasks, value: String(leadsNoTasks), note: t.crm.recentLeadsNote },
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

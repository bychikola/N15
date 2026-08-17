import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from './auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmDenied } from '@/components/crm/CrmDenied'
import { STAGES, stageLabel } from '@/components/lk/FunnelCard'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function CrmPage({ searchParams }: PageProps) {
  const { period = 'week' } = await searchParams
  const periodKey: 'today' | 'week' | 'month' = period === 'today' || period === 'month' ? period : 'week'
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

  const taskWhere: Where = user.role === 'admin' ? {} : { assignedTo: { equals: user.id } }
  // Даты бакетим в JS (строки YYYY-MM-DD) — SQL-сравнения дат зависят от TZ сервера
  const [tasksAll, activeAppsAll, appsAll] = await Promise.all([
    payload.find({ collection: 'tasks', where: taskWhere, limit: 500, depth: 0 }),
    payload.find({ collection: 'applications', limit: 1000, depth: 0, where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] } }),
    payload.find({ collection: 'applications', limit: 1000, depth: 1, sort: '-createdAt' }),
  ])
  const taskDocs = (tasksAll.docs || []) as { dueDate?: string; done?: boolean; completedAt?: string; application?: number | null }[]
  const openTasks = taskDocs.filter((tk) => !tk.done)
  const keyOf = (iso: string | undefined) => (iso || '').slice(0, 10)
  const tasksOverdueCount = openTasks.filter((tk) => keyOf(tk.dueDate || '') < todayISO).length
  const tasksTodayCount = openTasks.filter((tk) => keyOf(tk.dueDate || '') === todayISO).length
  const tasksTomorrowCount = openTasks.filter((tk) => keyOf(tk.dueDate || '') === tomorrowISO).length

  // Заявок без задач: активные заявки без привязки к задачам
  const appsWithTasks = new Set(taskDocs.map((tk) => tk.application).filter(Boolean))
  const activeApps = (activeAppsAll.docs || []) as { id: number }[]
  const leadsNoTasks = activeApps.filter((a) => !appsWithTasks.has(a.id)).length

  // Период для виджетов
  const startDate = new Date(today.getTime() - (periodKey === 'today' ? 0 : periodKey === 'week' ? 6 * 86400000 : 29 * 86400000))
  const startKey = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const periodLabel = t.crm[periodKey === 'today' ? 'periodToday' : periodKey === 'week' ? 'periodWeek' : 'periodMonth']

  const appDocs = (appsAll.docs || []) as { id: number; status?: string; createdAt?: string; updatedAt?: string; object?: { price?: number } | null }[]
  // Новые заявки за период
  const newLeadsPeriod = appDocs.filter((a) => keyOf(a.createdAt) >= startKey).length
  // Успешные сделки за период: closed + обновлены в периоде
  const dealsSumPeriod = appDocs
    .filter((a) => a.status === 'closed' && keyOf(a.updatedAt) >= startKey)
    .reduce((sum, a) => sum + (a.object?.price || 0), 0)
  // Выполненные задачи за период
  const doneTasksPeriod = taskDocs.filter((tk) => tk.done && keyOf(tk.completedAt) >= startKey).length

  // Прогноз продаж: активные заявки × вероятность стадии
  const STAGE_PROB: Record<string, number> = { unsorted: 0.1, new: 0.2, call: 0.3, showing: 0.5, negotiation: 0.7, deal: 0.9 }
  const forecastRows = STAGES
    .filter((s) => STAGE_PROB[s.value] !== undefined)
    .map((s) => {
      const items = appDocs.filter((a) => a.status === s.value)
      const sum = items.reduce((acc, a) => acc + (a.object?.price || 0), 0)
      return { stage: s.value, count: items.length, sum, prob: STAGE_PROB[s.value], weighted: Math.round(sum * STAGE_PROB[s.value]) }
    })
    .filter((r) => r.count > 0)
  const forecastTotal = forecastRows.reduce((acc, r) => acc + r.weighted, 0)

  const metrics = [
    { label: t.crm.metricObjects, value: String(objectsCount.totalDocs), note: t.crm.metricObjectsNote },
    { label: t.crm.metricLeads, value: String(activeLeads.totalDocs), note: t.crm.metricLeadsNote },
    { label: t.crm.metricClients, value: String(clientsCount.totalDocs), note: t.crm.metricClientsNote },
    { label: t.crm.metricMessages, value: String(messagesCount.totalDocs), note: t.crm.metricMessagesNote },
    { label: t.crm.metricTasksOverdue, value: String(tasksOverdueCount), note: t.crm.taskColOverdue },
    { label: t.crm.metricTasksToday, value: String(tasksTodayCount), note: t.crm.taskColToday },
    { label: t.crm.metricTasksTomorrow, value: String(tasksTomorrowCount), note: t.crm.taskColTomorrow },
    { label: t.crm.metricLeadsNoTasks, value: String(leadsNoTasks), note: t.crm.recentLeadsNote },
    { label: t.crm.metricNewLeadsPeriod, value: String(newLeadsPeriod), note: periodLabel },
    { label: t.crm.metricTasksDonePeriod, value: String(doneTasksPeriod), note: periodLabel },
    { label: t.crm.metricDealsSumPeriod, value: dealsSumPeriod >= 1_000_000 ? `${(dealsSumPeriod / 1_000_000).toFixed(1)} млн` : `${dealsSumPeriod.toLocaleString('ru-RU')} ₽`, note: periodLabel },
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['today', 'week', 'month'] as const).map((p) => (
          <a
            key={p}
            href={`/crm?period=${p}`}
            style={{
              border: '1px solid #d9d1c4', borderRadius: 7, background: periodKey === p ? '#a7814e' : '#fff',
              color: periodKey === p ? '#fff' : '#716b62', padding: '8px 14px', fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '.08em', textDecoration: 'none',
            }}
          >
            {t.crm[p === 'today' ? 'periodToday' : p === 'week' ? 'periodWeek' : 'periodMonth']}
          </a>
        ))}
      </div>
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
        <article className="crm-card wide" id="forecast">
          <div className="crm-card-header">
            <h2>{t.crm.forecastTitle}</h2>
            <span>{periodLabel}</span>
          </div>
          {forecastRows.length ? (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>{t.crm.forecastStage}</th>
                  <th>{t.crm.forecastCount}</th>
                  <th>{t.crm.forecastSum}</th>
                  <th>{t.crm.forecastProb}</th>
                  <th>{t.crm.forecastWeighted}</th>
                </tr>
              </thead>
              <tbody>
                {forecastRows.map((r) => (
                  <tr key={r.stage}>
                    <td><span className="crm-status">{stageLabel(t, r.stage)}</span></td>
                    <td>{r.count}</td>
                    <td>{r.sum ? `${(r.sum / 1_000_000).toFixed(1)} млн` : '—'}</td>
                    <td>{Math.round(r.prob * 100)}%</td>
                    <td><strong>{r.weighted ? `${(r.weighted / 1_000_000).toFixed(1)} млн` : '—'}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty"><strong>{t.crm.emptyLeads}</strong><p>{t.crm.emptyLeadsText}</p></div>
          )}
          <p style={{ margin: '14px 0 0', fontSize: 12, color: '#25241f' }}>
            {t.crm.forecastTotal}: <strong>{(forecastTotal / 1_000_000).toFixed(1)} млн</strong>
          </p>
        </article>
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

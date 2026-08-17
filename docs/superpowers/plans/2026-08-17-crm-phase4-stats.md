# Фаза 4: Аналитика (amoCRM) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Вкладка «Аналитика» в CRM как «Анализ продаж» amoCRM: воронка по стадиям с долями, показатели за период (создано/закрыто/отказы/сумма/средняя длительность сделки), причины отказа, отчёт по агентам.

**Architecture:** Серверная страница `/crm/stats` с `searchParams.period` (как дашборд фазы 3). Один `find` заявок (depth 1) + `find` агентов; все расчёты в JS по строкам `YYYY-MM-DD` (независимо от TZ).

**Скрин-референс:** `scrape/screens/amocrm-stats-v2.png` (воронка конверсии по этапам, суммы, длительность сделки, прогноз).

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 4.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- Даты бакетим ТОЛЬКО в JS строками `YYYY-MM-DD`
- Периоды: today / week / month (как на дашборде)
- «Цели агентов» из спеки НЕ входят в эту фазу (нужен UI настройки целей) — откладываем

---

### Task 1: Страница /crm/stats + навигация + словари

**Files:**
- Create: `src/app/crm/stats/page.tsx`
- Modify: `src/components/crm/CrmShell.tsx`
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Словари**

В блок `crm` ru (после `forecastTotal`):

```ts
    navStats: 'Аналитика',
    statsFunnelTitle: 'Анализ продаж',
    statsFunnel: 'Воронка по стадиям',
    statsFunnelShare: 'Доля от активных',
    statsCreatedPeriod: 'Создано заявок за период',
    statsClosedPeriod: 'Успешно закрыто за период',
    statsRejectedPeriod: 'Отказов за период',
    statsDealSumPeriod: 'Сумма успешных за период',
    statsAvgDealDays: 'Средняя длительность сделки',
    statsDays: 'дн.',
    statsLossReasons: 'Причины отказа за период',
    statsAgentsTitle: 'Отчёт по агентам',
    statsAgentLeads: 'Активных заявок',
    statsAgentClosed: 'Закрыто за период',
    statsAgentSum: 'Сумма закрытых',
    statsAgentConv: 'Конверсия',
    statsNoAgent: 'Без агента',
    statsNoData: 'Недостаточно данных за период',
```

В блок `crm` os (после `forecastTotal`):

```ts
    navStats: 'Аналитикæ',
    statsFunnelTitle: 'Уæйты анализ',
    statsFunnel: 'Стадитæм гæсгæ воронкæ',
    statsFunnelShare: 'Активонты хай',
    statsCreatedPeriod: 'Периоды арæзт заявкæтæ',
    statsClosedPeriod: 'Æнтыст æхгæд периоды',
    statsRejectedPeriod: 'Æнæнтыст периоды',
    statsDealSumPeriod: 'Æнтысты суммæ периоды',
    statsAvgDealDays: 'Базары рæстæмбис дæргъ',
    statsDays: 'боны',
    statsLossReasons: 'Æнæнтысты аххæсттæ периоды',
    statsAgentsTitle: 'Агентты отчёт',
    statsAgentLeads: 'Активон заявкæтæ',
    statsAgentClosed: 'Æхгæд периоды',
    statsAgentSum: 'Æхгæдты суммæ',
    statsAgentConv: 'Конверси',
    statsNoAgent: 'Æнæ агент',
    statsNoData: 'Периодæн бæрæггæнæнтæ нæ фаг',
```

- [ ] **Step 2: Навигация**

В `src/components/crm/CrmShell.tsx` в navItems после customers:

```ts
    { id: 'stats', href: '/crm/stats', label: t.crm.navStats },
```

- [ ] **Step 3: Страница**

`src/app/crm/stats/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { STAGES, stageLabel } from '@/components/lk/FunnelCard'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

const money = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} млн` : `${v.toLocaleString('ru-RU')} ₽`)

export default async function CrmStatsPage({ searchParams }: PageProps) {
  const { period = 'week' } = await searchParams
  const periodKey: 'today' | 'week' | 'month' = period === 'today' || period === 'month' ? period : 'week'
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }

  const payload = await getPayload({ config })
  const [appsRes, agentsRes] = await Promise.all([
    payload.find({ collection: 'applications', limit: 1000, depth: 1, sort: '-createdAt' }),
    payload.find({ collection: 'agents', limit: 100, depth: 0 }),
  ])

  const nowD = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const startDate = new Date(nowD.getTime() - (periodKey === 'today' ? 0 : periodKey === 'week' ? 6 * 86400000 : 29 * 86400000))
  const startKey = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const periodLabel = t.crm[periodKey === 'today' ? 'periodToday' : periodKey === 'week' ? 'periodWeek' : 'periodMonth']
  const keyOf = (v?: string) => (v || '').slice(0, 10)

  type AppDoc = { id: number; status?: string; createdAt?: string; updatedAt?: string; lossReason?: string | null; object?: { price?: number } | null; agent?: { id: number; name?: string } | null }

  const apps = (appsRes.docs || []) as AppDoc[]
  const active = apps.filter((a) => a.status !== 'closed' && a.status !== 'rejected')
  const createdPeriod = apps.filter((a) => keyOf(a.createdAt) >= startKey)
  const closedPeriod = apps.filter((a) => a.status === 'closed' && keyOf(a.updatedAt) >= startKey)
  const rejectedPeriod = apps.filter((a) => a.status === 'rejected' && keyOf(a.updatedAt) >= startKey)
  const dealSumPeriod = closedPeriod.reduce((sum, a) => sum + (a.object?.price || 0), 0)
  const avgDealDays = closedPeriod.length
    ? closedPeriod.reduce((sum, a) => sum + Math.max(0, (new Date(a.updatedAt || '').getTime() - new Date(a.createdAt || '').getTime()) / 86400000), 0) / closedPeriod.length
    : null

  // Воронка: текущие активные по стадиям + доля от активных
  const funnelRows = STAGES.filter((s) => s.value !== 'closed' && s.value !== 'rejected')
    .map((s) => {
      const items = active.filter((a) => a.status === s.value)
      const sum = items.reduce((acc, a) => acc + (a.object?.price || 0), 0)
      return { stage: s.value, count: items.length, sum, share: active.length ? Math.round((items.length / active.length) * 100) : 0 }
    })
    .filter((r) => r.count > 0)

  // Причины отказа за период
  const lossCounts = new Map<string, number>()
  for (const a of rejectedPeriod) {
    const reason = (a.lossReason || '—').trim() || '—'
    lossCounts.set(reason, (lossCounts.get(reason) || 0) + 1)
  }
  const lossReasons = Array.from(lossCounts.entries()).sort((x, y) => y[1] - x[1])

  // Отчёт по агентам
  const agentRows = (agentsRes.docs || [] as unknown[]).map((ag) => {
    const a = ag as { id: number; name?: string }
    const mine = apps.filter((app) => app.agent?.id === a.id)
    const mineActive = mine.filter((app) => app.status !== 'closed' && app.status !== 'rejected')
    const mineClosed = mine.filter((app) => app.status === 'closed' && keyOf(app.updatedAt) >= startKey)
    const mineSum = mineClosed.reduce((sum, app) => sum + (app.object?.price || 0), 0)
    const mineAll = mineActive.length + mineClosed.length
    return {
      name: a.name || '—',
      activeCount: mineActive.length,
      closedCount: mineClosed.length,
      sum: mineSum,
      conv: mineAll ? Math.round((mineClosed.length / mineAll) * 100) : 0,
    }
  })
  const unassigned = apps.filter((a) => !a.agent)
  if (unassigned.length) {
    const unassignedActive = unassigned.filter((a) => a.status !== 'closed' && a.status !== 'rejected').length
    agentRows.push({ name: t.crm.statsNoAgent, activeCount: unassignedActive, closedCount: 0, sum: 0, conv: 0 })
  }

  const tile = (label: string, value: string, note: string) => ({ label, value, note })
  const tiles = [
    tile(t.crm.statsCreatedPeriod, String(createdPeriod.length), periodLabel),
    tile(t.crm.statsClosedPeriod, String(closedPeriod.length), periodLabel),
    tile(t.crm.statsRejectedPeriod, String(rejectedPeriod.length), periodLabel),
    tile(t.crm.statsDealSumPeriod, money(dealSumPeriod), periodLabel),
    tile(t.crm.statsAvgDealDays, avgDealDays != null ? `${avgDealDays.toFixed(1)} ${t.crm.statsDays}` : '—', periodLabel),
  ]

  const btnStyle = (activeBtn: boolean): React.CSSProperties => ({
    border: '1px solid #d9d1c4', borderRadius: 7, background: activeBtn ? '#a7814e' : '#fff',
    color: activeBtn ? '#fff' : '#716b62', padding: '8px 14px', fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '.08em', textDecoration: 'none',
  })

  return (
    <CrmShell user={user} t={t} active="stats">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['today', 'week', 'month'] as const).map((p) => (
          <a key={p} href={`/crm/stats?period=${p}`} style={btnStyle(periodKey === p)}>
            {t.crm[p === 'today' ? 'periodToday' : p === 'week' ? 'periodWeek' : 'periodMonth']}
          </a>
        ))}
      </div>

      <div className="crm-metrics">
        {tiles.map((m) => (
          <article className="crm-metric" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </div>

      <div className="crm-grid">
        <article className="crm-card wide">
          <div className="crm-card-header">
            <h2>{t.crm.statsFunnel}</h2>
            <span>{t.crm.statsFunnelShare}</span>
          </div>
          {funnelRows.length ? (
            <table className="crm-table">
              <thead>
                <tr><th>{t.crm.forecastStage}</th><th>{t.crm.forecastCount}</th><th>{t.crm.forecastSum}</th><th>{t.crm.statsFunnelShare}</th></tr>
              </thead>
              <tbody>
                {funnelRows.map((r) => (
                  <tr key={r.stage}>
                    <td><span className="crm-status">{stageLabel(t, r.stage)}</span></td>
                    <td>{r.count}</td>
                    <td>{r.sum ? money(r.sum) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 160, height: 8, borderRadius: 4, background: '#f2eadf', overflow: 'hidden' }}>
                          <div style={{ width: `${r.share}%`, height: '100%', background: '#a7814e' }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#817b70', minWidth: 34 }}>{r.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty"><strong>{t.crm.statsNoData}</strong></div>
          )}
        </article>

        <article className="crm-card">
          <div className="crm-card-header">
            <h2>{t.crm.statsLossReasons}</h2>
            <span>{periodLabel}</span>
          </div>
          {lossReasons.length ? (
            <table className="crm-table">
              <tbody>
                {lossReasons.map(([reason, count]) => (
                  <tr key={reason}>
                    <td>{reason}</td>
                    <td><strong>{count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty"><strong>{t.crm.statsNoData}</strong></div>
          )}
        </article>

        <article className="crm-card wide">
          <div className="crm-card-header">
            <h2>{t.crm.statsAgentsTitle}</h2>
            <span>{periodLabel}</span>
          </div>
          <table className="crm-table">
            <thead>
              <tr><th>{t.crm.thAgent}</th><th>{t.crm.statsAgentLeads}</th><th>{t.crm.statsAgentClosed}</th><th>{t.crm.statsAgentSum}</th><th>{t.crm.statsAgentConv}</th></tr>
            </thead>
            <tbody>
              {agentRows.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.activeCount}</td>
                  <td>{r.closedCount}</td>
                  <td>{r.sum ? money(r.sum) : '—'}</td>
                  <td>{r.conv}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </CrmShell>
  )
}
```

- [ ] **Step 4: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/app/crm/stats/page.tsx"`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): analytics page with funnel, loss reasons and agent report" && git push origin master`

---

### Task 2: Верификация фазы 4

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер)**

1. Навигация «Аналитика» → /crm/stats
2. Переключатель периодов; показатели меняются
3. Воронка: строки по стадиям с прогресс-барами долей
4. Причины отказа: топ-причины из closed/rejected заявок
5. Отчёт по агентам: строки агентов + «Без агента»
6. Регрессия: дашборд, воронка, чаты, клиенты, объекты

- [ ] **Step 3: Скриншот** — `scrape/screens/n15-crm-stats.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 4 verification" && git push origin master
```

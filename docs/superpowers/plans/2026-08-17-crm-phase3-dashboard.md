# Фаза 3: Дашборд (amoCRM) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Дашборд CRM как в amoCRM: переключатель периода (сегодня/неделя/месяц), виджеты за период (новые заявки, выполненные задачи, успешные сделки), прогноз продаж по стадиям с вероятностями.

**Architecture:** Серверный /crm с `searchParams.period` (ссылки-кнопки, без клиентского JS). Все подсчёты за период — в JS по одному `find` заявок и задач (строки `YYYY-MM-DD` — не зависит от TZ сервера). Tasks получает `completedAt`.

**Скрин-референс:** `scrape/screens/amocrm-dashboard-v2.png` (виджеты, переключатели Сегодня/Вчера/Неделя/Месяц, прогноз продаж).

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 3.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- Даты бакетим ТОЛЬКО в JS строками `YYYY-MM-DD` (SQL-сравнения дат зависят от TZ сервера)
- «Все/Мои» не делаем: агент и так видит только свои задачи/заявки (+ общий пул unsorted), админ — всё

## Вероятности стадий (прогноз продаж)

```
unsorted 0.1 · new 0.2 · call 0.3 · showing 0.5 · negotiation 0.7 · deal 0.9
```

---

### Task 1: completedAt у задач + словари периода/прогноза

**Files:**
- Modify: `src/payload/collections/Tasks.ts`
- Modify: `src/components/crm/TasksBoard.tsx`
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Поле completedAt**

В `src/payload/collections/Tasks.ts` после `done` добавить:

```ts
    {
      name: 'completedAt',
      type: 'date',
      label: 'Выполнена (дата)',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
```

- [ ] **Step 2: setDone проставляет completedAt**

В `src/components/crm/TasksBoard.tsx` заменить `setDone`:

```tsx
  const setDone = async (id: number, done: boolean) => {
    setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, done } : tk)))
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ done, completedAt: done ? new Date().toISOString() : null }),
    })
  }
```

- [ ] **Step 3: Словари**

В блок `crm` ru (после `customerNoApps`):

```ts
    periodToday: 'Сегодня',
    periodWeek: 'Неделя',
    periodMonth: 'Месяц',
    metricNewLeadsPeriod: 'Новых заявок за период',
    metricTasksDonePeriod: 'Выполнено задач за период',
    metricDealsSumPeriod: 'Успешные сделки за период',
    forecastTitle: 'Прогноз продаж',
    forecastStage: 'Стадия',
    forecastCount: 'Заявок',
    forecastSum: 'Сумма',
    forecastProb: 'Вероятность',
    forecastWeighted: 'Взвешенная сумма',
    forecastTotal: 'Итого прогноз',
```

В блок `crm` os (после `customerNoApps`):

```ts
    periodToday: 'Абон',
    periodWeek: 'Къуыри',
    periodMonth: 'Мæй',
    metricNewLeadsPeriod: 'Ног заявкæтæ периоды',
    metricTasksDonePeriod: 'Æххæст хæстæ периоды',
    metricDealsSumPeriod: 'Æнтыст базартæ периоды',
    forecastTitle: 'Уæйты прогноз',
    forecastStage: 'Стади',
    forecastCount: 'Заявкæтæ',
    forecastSum: 'Суммæ',
    forecastProb: 'Æнтысты æвæрц',
    forecastWeighted: 'Уæзæй æвæрд суммæ',
    forecastTotal: 'Æдæппæт прогноз',
```

- [ ] **Step 4: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/payload/collections/Tasks.ts src/components/crm/TasksBoard.tsx`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): completedAt on tasks, period and forecast dictionaries" && git push origin master`

---

### Task 2: Дашборд — периоды, виджеты, прогноз

**Files:**
- Modify: `src/app/crm/page.tsx`

- [ ] **Step 1: Сигнатура + период**

```tsx
interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function CrmPage({ searchParams }: PageProps) {
  const { period = 'week' } = await searchParams
  const periodKey: 'today' | 'week' | 'month' = period === 'today' || period === 'month' ? period : 'week'
```

Период → дата старта:

```ts
  const nowD = new Date()
  const padD = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${padD(d.getMonth() + 1)}-${padD(d.getDate())}`
  const startDate = new Date(nowD.getTime() - (periodKey === 'today' ? 0 : periodKey === 'week' ? 6 * 86400000 : 29 * 86400000))
  const startKey = iso(startDate)
```

- [ ] **Step 2: Один fetch заявок + JS-бакетинг**

Заменить текущий `activeAppsAll` fetch (в Promise.all) на fetch с depth 1:

```ts
    payload.find({ collection: 'applications', limit: 1000, depth: 1, where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] } }),
    payload.find({ collection: 'applications', limit: 1000, depth: 1, sort: '-createdAt' }),
```

Первый — для «заявок без задач» (activeAppsAll). Второй — все заявки для периода/прогноза (appsAll). Обновить Promise.all: добавить `appsAll`.

После подсчётов добавить:

```ts
  const appDocs = (appsAll.docs || []) as { id: number; status?: string; createdAt?: string; updatedAt?: string; object?: { price?: number } | null }[]
  const keyOfDate = (v?: string) => (v || '').slice(0, 10)
  // Новые заявки за период
  const newLeadsPeriod = appDocs.filter((a) => keyOfDate(a.createdAt) >= startKey).length
  // Успешные сделки за период: closed + обновлены в периоде
  const dealsSumPeriod = appDocs
    .filter((a) => a.status === 'closed' && keyOfDate(a.updatedAt) >= startKey)
    .reduce((sum, a) => sum + (a.object?.price || 0), 0)
  // Выполненные задачи за период
  const doneTasksPeriod = taskDocs.filter((tk) => tk.done && keyOfDate(tk.completedAt) >= startKey).length
```

⚠️ `taskDocs` тип расширить: `{ dueDate?: string; done?: boolean; completedAt?: string }`.

- [ ] **Step 3: Прогноз продаж**

```ts
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
```

⚠️ Импорт: `import { STAGES, stageLabel } from '@/components/lk/FunnelCard'` (stageLabel уже импортирован — добавить STAGES).

⚠️ ЗАМЕЧАНИЕ: `appsAll` без where — для агента отдаст только доступные ему (access control применяется) — ок, прогноз агента по своим заявкам, админа — по всем.

- [ ] **Step 4: Метрики за период в metrics**

В массив `metrics` добавить (money — через млн):

```ts
    { label: t.crm.metricNewLeadsPeriod, value: String(newLeadsPeriod), note: t.crm.periodWeek === undefined ? '' : periodLabel },
    { label: t.crm.metricTasksDonePeriod, value: String(doneTasksPeriod), note: periodLabel },
    { label: t.crm.metricDealsSumPeriod, value: dealsSumPeriod >= 1_000_000 ? `${(dealsSumPeriod / 1_000_000).toFixed(1)} млн` : `${dealsSumPeriod.toLocaleString('ru-RU')} ₽`, note: periodLabel },
```

где `const periodLabel = t.crm[periodKey === 'today' ? 'periodToday' : periodKey === 'week' ? 'periodWeek' : 'periodMonth']`

- [ ] **Step 5: Переключатель периода + панель прогноза**

Перед `<div className="crm-metrics">` добавить переключатель:

```tsx
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
```

После `crm-metrics` добавить панель прогноза (в `crm-grid` отдельной карточкой):

```tsx
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
```

- [ ] **Step 5: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/app/crm/page.tsx`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): dashboard period switcher, period widgets and sales forecast" && git push origin master`

---

### Task 3: Верификация фазы 3

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер, agent1@test.ru)**

1. /crm — переключатель Сегодня/Неделя/Месяц, активная кнопка подсвечена
2. Переключение периода меняет счётчики (создать заявку/задачу → числа выросли)
3. Выполненная задача с completedAt сегодня → «Выполнено задач за период» = 1 при «Сегодня»
4. Прогноз продаж: строки по стадиям с вероятностями, итог = сумма взвешенных
5. Регрессия: воронка, чаты, клиенты, объекты

- [ ] **Step 3: Скриншоты** — `scrape/screens/n15-crm-dashboard-v2.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 3 verification" && git push origin master
```

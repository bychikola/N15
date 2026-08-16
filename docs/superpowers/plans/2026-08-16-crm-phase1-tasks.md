# Фаза 1: Задачи (amoCRM) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Задачи как в amoCRM: коллекция Tasks, вкладка «Задачи» (line-колонки: просроченные/сегодня/завтра/позже + выполненные), quick-add с привязкой к заявке, задача из чата заявки, счётчики на дашборде.

**Architecture:** Новая коллекция Payload `tasks` (title, type, dueDate, done, application, assignedTo). Клиентский TasksBoard в CRM-палитре. Скрины-референсы: `scrape/screens/amocrm-todo-line.png`, `amocrm-todo-list.png`, `amocrm-task-form.png`.

**Tech Stack:** Next.js 16 + Payload 3, inline-стили CRM-палитры, i18n ru/os.

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 1.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- Типы задач (как amo «Связаться/Встреча/Написать», адаптировано к недвижимости): Звонок `call`, Показ `showing`, Встреча `meeting`, Задача `task`

---

### Task 1: Коллекция Tasks + страница + навигация + словари

**Files:**
- Create: `src/payload/collections/Tasks.ts`
- Modify: `src/payload/payload.config.ts`
- Modify: `src/components/crm/CrmShell.tsx`
- Create: `src/app/crm/tasks/page.tsx`
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Коллекция Tasks**

`src/payload/collections/Tasks.ts`:

```ts
import type { CollectionConfig } from 'payload'

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'title',
    group: 'Агентство',
    defaultColumns: ['title', 'type', 'dueDate', 'done'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Агент видит только свои задачи
      return { assignedTo: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { assignedTo: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { assignedTo: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Текст задачи',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      label: 'Тип задачи',
      options: [
        { label: 'Звонок', value: 'call' },
        { label: 'Показ', value: 'showing' },
        { label: 'Встреча', value: 'meeting' },
        { label: 'Задача', value: 'task' },
      ],
      required: true,
      defaultValue: 'call',
    },
    {
      name: 'dueDate',
      type: 'date',
      label: 'Срок',
      required: true,
    },
    {
      name: 'done',
      type: 'checkbox',
      label: 'Выполнена',
      defaultValue: false,
    },
    {
      name: 'application',
      type: 'relationship',
      label: 'Заявка',
      relationTo: 'applications',
    },
    {
      name: 'assignedTo',
      type: 'relationship',
      label: 'Ответственный',
      relationTo: 'users',
      required: true,
    },
  ],
}
```

- [ ] **Step 2: Подключить коллекцию**

В `src/payload/payload.config.ts`:

```ts
import { Tasks } from './collections/Tasks'
...
  collections: [Users, Media, Objects, Agents, Applications, Tasks, Messages, Blog, Pages],
```

- [ ] **Step 3: Навигация**

В `src/components/crm/CrmShell.tsx` в `navItems` после messages:

```ts
    { id: 'tasks', href: '/crm/tasks', label: t.crm.navTasks },
```

- [ ] **Step 4: Страница**

`src/app/crm/tasks/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import TasksBoard from '@/components/crm/TasksBoard'

export const dynamic = 'force-dynamic'

export default async function CrmTasksPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="tasks">
      <TasksBoard t={t} />
    </CrmShell>
  )
}
```

- [ ] **Step 5: Словари**

В блок `crm` ru (после `tagPlaceholder`):

```ts
    navTasks: 'Задачи',
    taskAdd: 'Поставить задачу',
    taskTitlePh: 'Текст задачи',
    taskTypeCall: 'Звонок',
    taskTypeShowing: 'Показ',
    taskTypeMeeting: 'Встреча',
    taskTypeTask: 'Задача',
    taskDueToday: 'Сегодня',
    taskDueTomorrow: 'Завтра',
    taskDueDate: 'Дата',
    taskColOverdue: 'Просроченные',
    taskColToday: 'На сегодня',
    taskColTomorrow: 'На завтра',
    taskColLater: 'Позже',
    taskDoneSection: 'Выполненные',
    taskApp: 'Заявка',
    taskAppNone: '—',
    taskDelete: 'Удалить',
    metricTasksOverdue: 'Просроченные задачи',
    metricTasksToday: 'Задач на сегодня',
    metricTasksTomorrow: 'Задач на завтра',
    metricLeadsNoTasks: 'Заявок без задач',
    chatTaskBtn: '+ Задача',
    chatTaskDone: 'Задача поставлена ✓',
```

В блок `crm` os (после `tagPlaceholder`):

```ts
    navTasks: 'Хæстæ',
    taskAdd: 'Хæс сæвæрын',
    taskTitlePh: 'Хæсы текст',
    taskTypeCall: 'Дзурд',
    taskTypeShowing: 'Кæсын',
    taskTypeMeeting: 'Æмбæлд',
    taskTypeTask: 'Хæс',
    taskDueToday: 'Абон',
    taskDueTomorrow: 'Райсом',
    taskDueDate: 'Датæ',
    taskColOverdue: 'Фæстиуджытæ',
    taskColToday: 'Абонмæ',
    taskColTomorrow: 'Райсоммæ',
    taskColLater: 'Фæстæдæр',
    taskDoneSection: 'Æххæстгонд',
    taskApp: 'Заявкæ',
    taskAppNone: '—',
    taskDelete: 'Асхафын',
    metricTasksOverdue: 'Фæстиуджытæ хæстæ',
    metricTasksToday: 'Хæстæ абонмæ',
    metricTasksTomorrow: 'Хæстæ райсоммæ',
    metricLeadsNoTasks: 'Заявкæтæ æнæ хæсты',
    chatTaskBtn: '+ Хæс',
    chatTaskDone: 'Хæс сæвæрд æрцыд ✓',
```

- [ ] **Step 6: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS (TasksBoard ещё не существует — до Task 2 tsc упадёт на импорте; поэтому Task 1 и Task 2 коммитим вместе)

---

### Task 2: TasksBoard (line + quick-add + done + удаление)

**Files:**
- Create: `src/components/crm/TasksBoard.tsx`

- [ ] **Step 1: Компонент**

`src/components/crm/TasksBoard.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

const POLL_MS = 30_000

const TYPE_LABELS: Record<string, string> = {
  call: 'taskTypeCall', showing: 'taskTypeShowing', meeting: 'taskTypeMeeting', task: 'taskTypeTask',
}

function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dayKey(iso: string): string {
  // дата из Payload — 'YYYY-MM-DD...' — берём первые 10 символов
  return (iso || '').slice(0, 10)
}

export default function TasksBoard({ t }: { t: Dict }) {
  const [tasks, setTasks] = useState<{ id: number; title: string; type: string; dueDate: string; done: boolean; appId?: number; appTitle?: string }[]>([])
  const [apps, setApps] = useState<{ id: number; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', type: 'call', due: 'today', date: localISO(new Date()), app: '' })
  const [saving, setSaving] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const todayKey = localISO(new Date())
  const tomorrowKey = localISO(new Date(Date.now() + 86400000))

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    const where: Record<string, unknown> = {}
    if (me.role !== 'admin') {
      where.assignedTo = { equals: me.id }
    }
    const params = new URLSearchParams({ sort: 'dueDate', limit: '300', depth: '1' })
    if (Object.keys(where).length) params.set('where', JSON.stringify(where))
    const [tasksRes, appsRes] = await Promise.all([
      fetch(`/api/tasks?${params}`, { credentials: 'include' }),
      fetch('/api/applications?limit=200&depth=1', { credentials: 'include' }),
    ])
    const tasksData = await tasksRes.json()
    const appsData = await appsRes.json()
    setTasks(((tasksData.docs || []) as Record<string, unknown>[]).map((tk) => {
      const app = tk.application as Record<string, unknown> | undefined
      return {
        id: tk.id as number,
        title: tk.title as string,
        type: tk.type as string,
        dueDate: dayKey(tk.dueDate as string),
        done: tk.done as boolean,
        appId: app?.id as number | undefined,
        appTitle: app?.title as string | undefined,
      }
    }))
    setApps(((appsData.docs || []) as Record<string, unknown>[]).map((a) => ({ id: a.id as number, title: a.title as string })))
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

  const add = async () => {
    if (saving || !form.title.trim()) return
    setSaving(true)
    const due = form.due === 'today' ? todayKey : form.due === 'tomorrow' ? tomorrowKey : form.date
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: form.title.trim(),
        type: form.type,
        dueDate: due,
        application: form.app ? Number(form.app) : undefined,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm((prev) => ({ ...prev, title: '', app: '' }))
      await load()
    }
  }

  const setDone = async (id: number, done: boolean) => {
    setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, done } : tk)))
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ done }),
    })
  }

  const remove = async (id: number) => {
    if (!window.confirm(t.crm.taskDelete + '?')) return
    setTasks((prev) => prev.filter((tk) => tk.id !== id))
    await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' })
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const open = tasks.filter((tk) => !tk.done)
  const buckets = [
    { key: 'overdue', label: t.crm.taskColOverdue, items: open.filter((tk) => tk.dueDate < todayKey) },
    { key: 'today', label: t.crm.taskColToday, items: open.filter((tk) => tk.dueDate === todayKey) },
    { key: 'tomorrow', label: t.crm.taskColTomorrow, items: open.filter((tk) => tk.dueDate === tomorrowKey) },
    { key: 'later', label: t.crm.taskColLater, items: open.filter((tk) => tk.dueDate > tomorrowKey) },
  ]
  const doneTasks = tasks.filter((tk) => tk.done)

  const inputStyle: React.CSSProperties = {
    boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f',
    padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif',
  }
  const columnStyle: React.CSSProperties = {
    background: '#f5f2eb', border: '1px solid #e5dfd3', borderRadius: 12, padding: 12,
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5dfd3', borderRadius: 10, padding: 12, marginBottom: 8,
  }

  const taskCard = (tk: { id: number; title: string; type: string; dueDate: string; done: boolean; appId?: number; appTitle?: string }) => (
    <div key={tk.id} style={{ ...cardStyle, opacity: tk.done ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input
          type="checkbox"
          checked={tk.done}
          onChange={(e) => void setDone(tk.id, e.target.checked)}
          aria-label={t.crm.taskDoneSection}
          style={{ marginTop: 3, accentColor: '#a7814e' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#25241f', textDecoration: tk.done ? 'line-through' : 'none' }}>{tk.title}</div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {t.crm[TYPE_LABELS[tk.type] as keyof Dict['crm']] || tk.type}
            </span>
            {tk.appId && tk.appTitle ? (
              <Link href={`/crm/messages/${tk.appId}`} style={{ fontSize: 10, color: '#8d6b40', textDecoration: 'underline' }}>
                {tk.appTitle}
              </Link>
            ) : (
              <span style={{ fontSize: 10, color: '#9b958a' }}>{t.crm.taskAppNone}</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 9, color: tk.dueDate < todayKey ? '#9b4e43' : '#817b70' }}>
              {new Date(tk.dueDate + 'T00:00:00').toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}
            </span>
            <button type="button" onClick={() => void remove(tk.id)} aria-label={t.crm.taskDelete}
              style={{ border: 0, background: 'none', color: '#9b4e43', fontSize: 10, cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Quick-add как в amoCRM to-do line */}
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder={t.crm.taskTitlePh}
          aria-label={t.crm.taskTitlePh}
          style={{ ...inputStyle, flex: '2 1 260px' }}
        />
        <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} style={{ ...inputStyle, flex: '1 1 130px' }}>
          <option value="call">{t.crm.taskTypeCall}</option>
          <option value="showing">{t.crm.taskTypeShowing}</option>
          <option value="meeting">{t.crm.taskTypeMeeting}</option>
          <option value="task">{t.crm.taskTypeTask}</option>
        </select>
        <select value={form.due} onChange={(e) => setForm((p) => ({ ...p, due: e.target.value }))} style={{ ...inputStyle, flex: '1 1 130px' }}>
          <option value="today">{t.crm.taskDueToday}</option>
          <option value="tomorrow">{t.crm.taskDueTomorrow}</option>
          <option value="date">{t.crm.taskDueDate}</option>
        </select>
        {form.due === 'date' && (
          <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} style={{ ...inputStyle, flex: '1 1 150px' }} />
        )}
        <select value={form.app} onChange={(e) => setForm((p) => ({ ...p, app: e.target.value }))} style={{ ...inputStyle, flex: '1 1 190px' }}>
          <option value="">{t.crm.taskApp}: {t.crm.taskAppNone}</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} disabled={saving || !form.title.trim()}
          style={{ flex: '0 0 auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: saving || !form.title.trim() ? 0.5 : 1 }}>
          {t.crm.taskAdd}
        </button>
      </div>

      {/* Колонки как в to-do line */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
        {buckets.map((b) => (
          <div key={b.key} style={columnStyle}>
            <div style={{ padding: '0 4px 10px', borderBottom: '1px solid #e5dfd3', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: b.key === 'overdue' ? '#9b4e43' : '#927046', fontWeight: 600 }}>{b.label}</span>
              <span style={{ fontSize: 10, color: '#817b70' }}>{b.items.length}</span>
            </div>
            {b.items.length === 0 && (
              <p style={{ color: '#9b958a', fontSize: 11, textAlign: 'center', margin: '14px 0' }}>{t.crm.taskAppNone}</p>
            )}
            {b.items.map(taskCard)}
          </div>
        ))}
      </div>

      {/* Выполненные */}
      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={() => setShowDone((v) => !v)}
          style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '8px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
          {t.crm.taskDoneSection} ({doneTasks.length})
        </button>
        {showDone && (
          <div style={{ marginTop: 10, maxWidth: 560 }}>
            {doneTasks.length === 0 ? (
              <p style={{ color: '#9b958a', fontSize: 11 }}>{t.crm.taskAppNone}</p>
            ) : doneTasks.map(taskCard)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/TasksBoard.tsx src/payload/collections/Tasks.ts`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit (вместе с Task 1)**

```bash
git add -A && git commit -m "feat(crm): tasks collection, tasks board with quick add and done" && git push origin master
```

---

### Task 3: Задача из чата заявки (ChatThread, CRM)

**Files:**
- Modify: `src/components/lk/ChatThread.tsx`

- [ ] **Step 1: Состояние и форма**

1. Состояния после `const isCrm = ...`:

```tsx
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState('call')
  const [taskDue, setTaskDue] = useState('today')
  const [taskPosted, setTaskPosted] = useState(false)
```

2. Обработчик:

```tsx
  const addTask = async () => {
    if (!taskTitle.trim() || meId === null) return
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const todayISO = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    const tomorrow = new Date(now.getTime() + 86400000)
    const tomorrowISO = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`
    const dueDate = taskDue === 'today' ? todayISO : tomorrowISO
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: taskTitle.trim(), type: taskType, dueDate, application: applicationId, assignedTo: meId }),
    })
    if (res.ok) {
      setTaskTitle('')
      setShowTaskForm(false)
      setTaskPosted(true)
      setTimeout(() => setTaskPosted(false), 2000)
    }
  }
```

3. В шапке чата (блок `{personPhone && (...)}` — после него), только для CRM:

```tsx
          {isCrm && (
            <button type="button" onClick={() => setShowTaskForm((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '8px 14px', cursor: 'pointer', background: '#fff' }}>
              {taskPosted ? t.crm.chatTaskDone : t.crm.chatTaskBtn}
            </button>
          )}
```

4. Мини-форма под шапкой (сразу после закрывающего `</div>` шапки), только CRM:

```tsx
      {isCrm && showTaskForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 18px', borderBottom: '1px solid #e5dfd3', background: '#faf8f4' }}>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder={t.crm.taskTitlePh}
            aria-label={t.crm.taskTitlePh}
            style={{ flex: '2 1 220px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 12px', font: '12px Arial, Helvetica, sans-serif' }}
          />
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={{ flex: '1 1 120px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}>
            <option value="call">{t.crm.taskTypeCall}</option>
            <option value="showing">{t.crm.taskTypeShowing}</option>
            <option value="meeting">{t.crm.taskTypeMeeting}</option>
            <option value="task">{t.crm.taskTypeTask}</option>
          </select>
          <select value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={{ flex: '1 1 120px', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}>
            <option value="today">{t.crm.taskDueToday}</option>
            <option value="tomorrow">{t.crm.taskDueTomorrow}</option>
          </select>
          <button type="button" onClick={() => void addTask()}
            style={{ flex: '0 0 auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '9px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
            {t.crm.taskAdd}
          </button>
        </div>
      )}
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/ChatThread.tsx`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(crm): create task from application chat" && git push origin master
```

---

### Task 4: Счётчики задач на дашборде

**Files:**
- Modify: `src/app/crm/page.tsx`

- [ ] **Step 1: Подсчёты на сервере**

После существующего `Promise.all` добавить:

```ts
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const tomorrowD = new Date(today.getTime() + 86400000)
  const tomorrowISO = `${tomorrowD.getFullYear()}-${pad(tomorrowD.getMonth() + 1)}-${pad(tomorrowD.getDate())}`

  const taskWhere: Record<string, unknown> = user.role === 'admin' ? {} : { assignedTo: { equals: user.id } }
  const [tasksOverdue, tasksToday, tasksTomorrow, tasksAll, activeAppsAll] = await Promise.all([
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { less_than: todayISO } } }),
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { greater_than_equal: todayISO }, and: [] } }),
    payload.count({ collection: 'tasks', where: { ...taskWhere, done: { not_equals: true }, dueDate: { greater_than_equal: tomorrowISO } } }),
    payload.find({ collection: 'tasks', limit: 500, depth: 0 }),
    payload.find({ collection: 'applications', limit: 1000, depth: 0, where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] } }),
  ])
```

⚠️ `tasksToday` должен считаться как `dueDate >= today AND < tomorrow` — вместо этого упрощённо:

```ts
  const tasksTodayCount = tasksToday.totalDocs - tasksTomorrow.totalDocs
```

и `tasksTomorrow` как `dueDate >= tomorrow AND < dayAfter`:

```ts
  const dayAfter = new Date(tomorrowD.getTime() + 86400000)
  const dayAfterISO = `${dayAfter.getFullYear()}-${pad(dayAfter.getMonth() + 1)}-${pad(dayAfter.getDate())}`
```

Итоговый блок (заменить заготовку выше):

```ts
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
```

2. В массив `metrics` добавить:

```ts
    { label: t.crm.metricTasksOverdue, value: String(tasksOverdue.totalDocs), note: t.crm.taskColOverdue },
    { label: t.crm.metricTasksToday, value: String(tasksTodayCount), note: t.crm.taskColToday },
    { label: t.crm.metricTasksTomorrow, value: String(tasksTomorrowUp.totalDocs), note: t.crm.taskColTomorrow },
    { label: t.crm.metricLeadsNoTasks, value: String(leadsNoTasks), note: t.crm.recentLeadsNote },
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/app/crm/page.tsx`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(crm): task counters on dashboard" && git push origin master
```

---

### Task 5: Верификация фазы 1

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер, agent1@test.ru)**

1. Вкладка «Задачи» в сайдбаре открывает /crm/tasks
2. Quick-add: текст «Позвонить клиенту», тип Звонок, Сегодня, заявка → Enter/кнопка → карточка в «На сегодня»
3. Срок «Завтра» → карточка в «На завтра»; дата в прошлом → «Просроченные»
4. Чекбокс → задача в «Выполненные», счётчик обновился
5. Из чата заявки: «+ Задача» → мини-форма → поставить → в списке задач с привязкой к заявке
6. Дашборд: 4 новых счётчика показывают корректные числа
7. Агент видит только свои задачи (проверить через API вторым агентом — пропустить, если нет второго)
8. Регрессия: воронка, чаты, объекты

- [ ] **Step 3: Скриншоты** — `scrape/screens/n15-crm-tasks.png`, `n15-crm-tasks-dashboard.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 1 verification" && git push origin master
```

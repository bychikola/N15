# CRM-воронка (канбан-доска агента) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Канбан-воронка заявок в ЛК: агент двигает свои заявки по 7 стадиям (drag на десктопе, ←/→ на мобильном), админ видит все воронки с фильтром по агентам.

**Architecture:** Расширяем поле `status` (7 стадий), ужесточаем `Applications.update` (агент — только назначенные ему), новая страница `/lk/funnel` в LkShell с нативным HTML5 DnD и polling 30 сек. Клиентские статусы — упрощённый маппинг.

**Tech Stack:** Next.js 16 (Turbopack), Tailwind 4, Payload REST, TypeScript, i18n (ru/os), Material Symbols.

**Спека:** `docs/superpowers/specs/2026-08-14-crm-funnel-design.md`

## Global Constraints

- Тестового фреймворка нет — проверка: `npx tsc --noEmit` + `npm run lint` (по изменённым файлам) + сценарии в браузере (dev-сервер http://localhost:3000)
- **TypeScript в проекте модифицирован: однострочные `if (x) a() else b()` без фигурных скобок ломают компиляцию — всегда `{ }`**
- **Правило `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect — только в обработчиках или после await**
- Все UI-строки через словари i18n; os типизирован как `typeof ru` — пропущенный ключ ломает сборку
- Стиль: charcoal-подложки, рамки золото 15%/40%, капс-лейблы, иконки Material Symbols (полный шрифт подключён)
- Работаем в master, коммит после каждой задачи

---

### Task 1: Payload — 7 стадий, ужесточение access, миграция

**Files:**
- Modify: `src/payload/collections/Applications.ts`

**Interfaces:**
- Produces: статусы `new | call | showing | negotiation | deal | closed | rejected`; access `update`: admin → всё, agent → только назначенные ему. Используется в Tasks 3-6.

- [ ] **Step 1: Заменить options у поля status**

В `src/payload/collections/Applications.ts` найти поле `status` и заменить его options на:

```ts
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Новая', value: 'new' },
        { label: 'Звонок', value: 'call' },
        { label: 'Показ', value: 'showing' },
        { label: 'Переговоры', value: 'negotiation' },
        { label: 'Сделка', value: 'deal' },
        { label: 'Закрыто', value: 'closed' },
        { label: 'Отказ', value: 'rejected' },
      ],
      defaultValue: 'new',
      required: true,
    },
```

- [ ] **Step 2: Ужесточить update**

Заменить строку update в access:

```ts
    update: ({ req: { user } }) => !!user && (user.role === 'admin' || user.role === 'agent'),
```

на:

```ts
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role === 'agent') {
        // Агент правит только назначенные ему заявки
        const where: Where = { 'agent.user': { equals: user.id } }
        return where
      }
      return false
    },
```

(тип `Where` уже импортирован в этом файле — если нет, добавить в импорт `import type { CollectionConfig, Where } from 'payload'`)

- [ ] **Step 3: Миграция существующих данных (локальная SQLite)**

Run (одной командой в Git Bash, python с utf-8):

```bash
PYTHONIOENCODING=utf-8 python -c "
import sqlite3
c = sqlite3.connect('n15.db')
mapping = {'processing': 'call', 'completed': 'closed', 'cancelled': 'rejected'}
for old, new in mapping.items():
    c.execute('UPDATE applications SET status=? WHERE status=?', (new, old))
    print(old, '->', new, '| rows:', c.rowcount)
c.commit()
print('migration done')
"
```

Expected: строки с `rows: N` (N может быть 0 — ок)

- [ ] **Step 4: Миграция для прода (PostgreSQL)**

Эти же запросы добавить в `docker-entrypoint.sh` **после** блока инициализации схемы (перед `echo "Starting Next.js server..."`):

```sh
# Миграция статусов заявок (CRM-воронка): старые значения -> новые
if [ -n "$DATABASE_URI" ]; then
  node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URI });
    const mapping = [['processing','call'],['completed','closed'],['cancelled','rejected']];
    (async () => {
      await c.connect();
      for (const [oldV, newV] of mapping) {
        await c.query('UPDATE applications SET status=\$1 WHERE status=\$2', [newV, oldV]);
      }
      await c.end();
    })().catch(() => process.exit(1));
  " || echo "status migration skipped"
fi
```

- [ ] **Step 5: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Перезапустить dev и проверить схему**

- Перезапустить dev-сервер; открыть http://localhost:3000/admin/collections/applications/create — в поле «Статус» 7 вариантов
- Если SQLite-ошибки про индексы — дропнуть конфликтующие (как раньше: `python -c "import sqlite3; c=sqlite3.connect('n15.db'); c.execute('DROP INDEX IF EXISTS <имя>'); c.commit()"`)

- [ ] **Step 7: Commit**

```bash
git add src/payload/collections/Applications.ts docker-entrypoint.sh
git commit -m "feat(crm): 7 funnel stages in applications + agent-scoped update access + status migration"
```

---

### Task 2: Ключи i18n для воронки (ru + os)

**Files:**
- Modify: `src/i18n/dictionaries.ts`

**Interfaces:**
- Produces: `lkFunnel.title`, `lkFunnel.dragHint`, `lkFunnel.allAgents`, `lkFunnel.noAgent`, `lkFunnel.unassigned`, `lkFunnel.moveLeft/moveRight` (aria), `lkApplications.statusCall/statusShowing/statusNegotiation/statusDeal/statusClosed/statusRejected`, `crm.stage.*` — используется в Tasks 3-6

- [ ] **Step 1: Добавить в `ru`**

После блока `lkChat: { ... },` добавить:

```ts
  lkFunnel: {
    title: 'Воронка',
    dragHint: 'Перетащите заявку в другую стадию',
    allAgents: 'Все агенты',
    noAgent: 'Без агента',
    moveLeft: 'На стадию назад',
    moveRight: 'На стадию вперёд',
  },
  crm: {
    stageNew: 'Новая',
    stageCall: 'Звонок',
    stageShowing: 'Показ',
    stageNegotiation: 'Переговоры',
    stageDeal: 'Сделка',
    stageClosed: 'Закрыто',
    stageRejected: 'Отказ',
  },
```

Внутри `lkApplications` после `agentLabel` добавить упрощённые клиентские статусы:

```ts
    statusCall: 'В работе у агента',
    statusShowing: 'В работе у агента',
    statusNegotiation: 'В работе у агента',
    statusDeal: 'В работе у агента',
    statusClosed: 'Завершена',
    statusRejected: 'Отменена',
```

- [ ] **Step 2: Зеркально в `os`**

После os-блока `lkChat` добавить:

```ts
  lkFunnel: {
    title: 'Воронкæ',
    dragHint: 'Заявкæ æндæр стадимæ æрхаут',
    allAgents: 'Æппæт агенттæ',
    noAgent: 'Æнæ агент',
    moveLeft: 'Раздæры стадимæ',
    moveRight: 'Иннæ стадимæ',
  },
  crm: {
    stageNew: 'Ног',
    stageCall: 'Дзурд',
    stageShowing: 'Кæсын',
    stageNegotiation: 'Ныхæстæ',
    stageDeal: 'Базар',
    stageClosed: 'Æхгæд',
    stageRejected: 'Нæ райстой',
  },
```

Внутри os-`lkApplications` после `agentLabel`:

```ts
    statusCall: 'Агент кусы',
    statusShowing: 'Агент кусы',
    statusNegotiation: 'Агент кусы',
    statusDeal: 'Агент кусы',
    statusClosed: 'Феци',
    statusRejected: 'Ныууагъд',
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS (пропущенный ключ в os = ошибка типа)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/dictionaries.ts
git commit -m "feat(i18n): funnel stages and simplified client statuses (ru+os)"
```

---

### Task 3: Компонент FunnelCard

**Files:**
- Create: `src/components/lk/FunnelCard.tsx`

**Interfaces:**
- Produces:
  - `export interface FunnelApplication { id: number; status: string; type: string; createdAt: string; clientName: string; clientPhone?: string; objectTitle?: string; objectId?: number; lastText?: string; unread: number }`
  - `export const STAGES: { value: string; labelKey: string }[]` — порядок стадий, используется в Task 4
  - `FunnelCard({ app, lang, t }: { app: FunnelApplication; lang: string; t: Dict })` — рендер карточки (без DnD-логики; draggable-атрибуты вешает родитель Task 4 через обёртку)

- [ ] **Step 1: Создать файл**

`src/components/lk/FunnelCard.tsx`:

```tsx
import type { Dict } from '@/i18n/dictionaries'
import Link from 'next/link'

export interface FunnelApplication {
  id: number
  status: string
  type: string
  createdAt: string
  clientName: string
  clientPhone?: string
  objectTitle?: string
  objectId?: number
  lastText?: string
  unread: number
}

export const STAGES: { value: string; labelKey: string }[] = [
  { value: 'new', labelKey: 'crm.stageNew' },
  { value: 'call', labelKey: 'crm.stageCall' },
  { value: 'showing', labelKey: 'crm.stageShowing' },
  { value: 'negotiation', labelKey: 'crm.stageNegotiation' },
  { value: 'deal', labelKey: 'crm.stageDeal' },
  { value: 'closed', labelKey: 'crm.stageClosed' },
  { value: 'rejected', labelKey: 'crm.stageRejected' },
]

export function stageLabel(t: Dict, stage: string): string {
  const found = STAGES.find((s) => s.value === stage)
  if (!found) return stage
  const key = found.labelKey
  return (t.crm as Record<string, string>)[key.split('.')[1]] || stage
}

const typeKeys: Record<string, string> = {
  viewing: 'Просмотр', callback: 'Обратный звонок', mortgage: 'Ипотека', consultation: 'Консультация',
}

interface Props {
  app: FunnelApplication
  lang: string
  t: Dict
  onMoveLeft?: () => void
  onMoveRight?: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
}

export default function FunnelCard({ app, lang, t, onMoveLeft, onMoveRight, canMoveLeft, canMoveRight }: Props) {
  return (
    <div className="relative bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 hover:border-[var(--n15-gold)]/40 p-4 transition-all duration-300 cursor-grab active:cursor-grabbing shadow-[0_24px_48px_-32px_rgba(63,17,22,0.2)]">
      {app.unread > 0 && (
        <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[11px] font-semibold flex items-center justify-center">
          {app.unread}
        </span>
      )}

      <Link
        href={app.objectId ? `/${lang}/catalog/${app.objectId}` : `/${lang}/lk/messages/${app.id}`}
        className="block text-sm text-[var(--n15-gold)] hover:underline pr-8"
        onClick={(e) => e.stopPropagation()}
      >
        {app.objectTitle || `${t.lkChat.requestCard} #${app.id}`}
      </Link>

      <div className="text-xs text-[var(--n15-white)] mt-1.5 truncate">
        {app.clientName}
        {app.clientPhone && <span className="text-[var(--n15-muted)]"> · {app.clientPhone}</span>}
      </div>

      <div className="text-[10px] tracking-[0.15em] uppercase text-[var(--n15-muted)] mt-1.5">
        {typeKeys[app.type] || app.type} · {new Date(app.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}
      </div>

      {app.lastText && (
        <div className="text-xs text-[var(--n15-muted)] mt-2 truncate">«{app.lastText}»</div>
      )}

      {/* Touch-стрелки: видимы только на устройствах с coarse-указателем */}
      <div className="funnel-arrows mt-3 pt-3 border-t border-[var(--n15-gold)]/10">
        <button
          type="button"
          onClick={(e) => {
            // Карточка лежит внутри <Link> на чат — стрелки не должны
            // уводить в чат, только двигать стадию
            e.preventDefault()
            e.stopPropagation()
            onMoveLeft?.()
          }}
          disabled={!canMoveLeft}
          aria-label={t.lkFunnel.moveLeft}
          className="material-symbols-outlined text-base text-[var(--n15-gold)] disabled:opacity-25 disabled:cursor-default cursor-pointer"
        >
          chevron_left
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onMoveRight?.()
          }}
          disabled={!canMoveRight}
          aria-label={t.lkFunnel.moveRight}
          className="material-symbols-outlined text-base text-[var(--n15-gold)] disabled:opacity-25 disabled:cursor-default cursor-pointer ml-2"
        >
          chevron_right
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS для touch-стрелок**

В `src/app/globals.css` (после блока `.photo-grid__tile`):

```css
/* Стрелки воронки: видны только на сенсорных устройствах */
.funnel-arrows {
  display: none;
}
@media (pointer: coarse) {
  .funnel-arrows {
    display: block;
  }
}
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelCard.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/lk/FunnelCard.tsx src/app/globals.css
git commit -m "feat(crm): FunnelCard component with unread badge, preview, touch arrows"
```

---

### Task 4: Компонент FunnelBoard (колонки + DnD + polling)

**Files:**
- Create: `src/components/lk/FunnelBoard.tsx`

**Interfaces:**
- Consumes: `FunnelCard`, `FunnelApplication`, `STAGES`, `stageLabel` (Task 3), ключи `lkFunnel.*` (Task 2)
- Produces: `FunnelBoard({ lang }: { lang: string })` — доска, сама грузит данные (как ChatList)

- [ ] **Step 1: Создать файл**

`src/components/lk/FunnelBoard.tsx`:

```tsx
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
      const agent = a.agent as Record<string, unknown> | undefined

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
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelBoard.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/lk/FunnelBoard.tsx
git commit -m "feat(crm): FunnelBoard — kanban columns, HTML5 drag-and-drop, 30s polling, admin agent filter"
```

---

### Task 5: Страница /lk/funnel + пункт в сайдбаре по роли

**Files:**
- Create: `src/app/(site)/[lang]/lk/funnel/page.tsx`
- Modify: `src/components/lk/LkShell.tsx`

**Interfaces:**
- Consumes: `FunnelBoard` (Task 4), `LkShell` (существующий), ключи `lkFunnel.title` (Task 2)

- [ ] **Step 1: Создать страницу**

`src/app/(site)/[lang]/lk/funnel/page.tsx`:

```tsx
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { getDictionary } from '@/i18n/dictionaries'
import FunnelBoard from '@/components/lk/FunnelBoard'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function FunnelPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="funnel">
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkFunnel.title}</h1>
          <FunnelBoard lang={lang} />
        </LkShell>
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Пункт в сайдбаре по роли**

В `src/components/lk/LkShell.tsx`:
- Добавить состояние роли: после `const [user, setUser] = ...` добавить `const [role, setRole] = useState<string>('user')`
- В `load()` после `setUser(me)` добавить: `setRole((me.role as string) || 'user')`
- Заменить массив `navItems` на построение с условием. Текущий блок:

```tsx
  const navItems: NavItem[] = [
    { href: `/${lang}/lk`, icon: 'dashboard', label: t.lk.home },
    { href: `/${lang}/lk/favorites`, icon: 'favorite', label: t.lk.favorites, count: counts?.favorites },
    { href: `/${lang}/lk/applications`, icon: 'article', label: t.lk.applications, count: counts?.applications },
    { href: `/${lang}/lk/messages`, icon: 'forum', label: t.lk.messages, count: counts?.unread },
    { href: `/${lang}/lk/profile`, icon: 'person', label: t.lk.profile },
  ]
```

заменить на:

```tsx
  const navItems: NavItem[] = [
    { href: `/${lang}/lk`, icon: 'dashboard', label: t.lk.home },
    { href: `/${lang}/lk/favorites`, icon: 'favorite', label: t.lk.favorites, count: counts?.favorites },
    { href: `/${lang}/lk/applications`, icon: 'article', label: t.lk.applications, count: counts?.applications },
    ...(role === 'agent' || role === 'admin'
      ? [{ href: `/${lang}/lk/funnel`, icon: 'view_kanban', label: t.lkFunnel.title }]
      : []),
    { href: `/${lang}/lk/messages`, icon: 'forum', label: t.lk.messages, count: counts?.unread },
    { href: `/${lang}/lk/profile`, icon: 'person', label: t.lk.profile },
  ]
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/app/(site)/[lang]/lk/funnel/page.tsx" src/components/lk/LkShell.tsx`
Expected: PASS

- [ ] **Step 4: Проверить в браузере**

- Войти под клиентом (client1@test.ru) → пункта «Воронка» в сайдбаре НЕТ
- Войти под агентом (agent1@test.ru / роль agent) → пункт «Воронка» есть → страница открывается, колонки видны
- Войти под админом → виден фильтр агентов

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/[lang]/lk/funnel/page.tsx" src/components/lk/LkShell.tsx
git commit -m "feat(crm): funnel page + role-gated sidebar item"
```

---

### Task 6: Упрощённые статусы для клиента

**Files:**
- Modify: `src/app/(site)/[lang]/lk/applications/page.tsx`

**Interfaces:**
- Consumes: ключи `lkApplications.status*` (Task 2)

- [ ] **Step 1: Маппинг клиентских статусов**

В `src/app/(site)/[lang]/lk/applications/page.tsx` заменить блок `statusLabels` и `statusColors` на упрощённые. Текущие:

```tsx
  const statusLabels: Record<string, string> = {
    new: t.lkApplications.statusNew,
    processing: t.lkApplications.statusProcessing,
    completed: t.lkApplications.statusCompleted,
    cancelled: t.lkApplications.statusCancelled,
  }
```

заменить на:

```tsx
  const statusLabels: Record<string, string> = {
    new: t.lkApplications.statusNew,
    call: t.lkApplications.statusCall,
    showing: t.lkApplications.statusShowing,
    negotiation: t.lkApplications.statusNegotiation,
    deal: t.lkApplications.statusDeal,
    closed: t.lkApplications.statusClosed,
    rejected: t.lkApplications.statusRejected,
  }
```

И `statusStyles`:

```tsx
const statusStyles: Record<string, string> = {
  new: 'border-[var(--n15-gold)]/50 text-[var(--n15-gold)]',
  call: 'border-blue-400/50 text-blue-400',
  showing: 'border-blue-400/50 text-blue-400',
  negotiation: 'border-blue-400/50 text-blue-400',
  deal: 'border-blue-400/50 text-blue-400',
  closed: 'border-green-400/50 text-green-400',
  rejected: 'border-[var(--n15-muted)]/40 text-[var(--n15-muted)]',
}
```

(старые ключи `processing/completed/cancelled` в словарях оставить — их может использовать другой код; новые `statusCall` и т.д. уже добавлены в Task 2)

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/app/(site)/[lang]/lk/applications/page.tsx"`
Expected: PASS

- [ ] **Step 3: Проверить в браузере**

- Войти клиентом (client1@test.ru) → `/ru/lk/applications` — заявка со статусом «Новая» (или «В работе у агента», если агент сдвинул стадию)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/[lang]/lk/applications/page.tsx"
git commit -m "feat(crm): client sees simplified 4 statuses mapped from 7 stages"
```

---

### Task 7: Сквозная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint 2>&1 | grep -cE " error "`
Expected: `0`

- [ ] **Step 2: Сценарий агента**

1. Войти агентом (agent1@test.ru): `/ru/lk/funnel` — видны только его заявки
2. Перетащить заявку из «Новая» в «Звонок» → PATCH ушёл (Network), карточка осталась в новой колонке после reload
3. Мобильный эмулейт (DevTools, touch): карточка показывает ←/→; нажатие → двигает стадию

- [ ] **Step 3: Сценарий админа**

1. Войти админом: виден фильтр агентов; «Все агенты» — все заявки; выбор «Без агента» — неназначенные; выбор агента — его колонки
2. Перетаскивание работает и для админа

- [ ] **Step 4: Сценарий клиента**

1. Войти клиентом: пункта «Воронка» нет в сайдбаре
2. `/ru/lk/applications` — упрощённые статусы («Новая» / «В работе у агента» / «Завершена» / «Отменена»)

- [ ] **Step 5: Обе темы + os**

- Переключить тему на воронке — карточки/колонки читаются
- `/os/lk/funnel` (агентом) — осетинские заголовки стадий

- [ ] **Step 6: Commit + push**

```bash
git status && git add -A && git commit -m "chore(crm): final funnel verification fixes" || echo "nothing to commit"
git push origin master
```

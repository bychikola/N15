# Фаза 0: Ядро сделок (amoCRM) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Приблизить воронку CRM N15 к amoCRM: стадия «Неразобранное», быстрое добавление заявки, вид «Список», причины отказа, теги.

**Architecture:** Расширяем коллекцию Applications (unsorted, tags, lossReason, budget, source), дорабатываем FunnelBoard/FunnelCard (автоназначение агента, quick-add, модалка отказа, теги), добавляем LeadsList + переключатель вида.

**Tech Stack:** Next.js 16 + Payload 3, inline-стили CRM-палитры, i18n ru/os.

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 0.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер

---

### Task 1: Схема Applications + заявки с сайта в «Неразобранное» + словари

**Files:**
- Modify: `src/payload/collections/Applications.ts`
- Modify: `src/components/objects/ViewRequestForm.tsx`
- Modify: `src/i18n/dictionaries.ts`
- Modify: `src/app/(site)/[lang]/lk/applications/page.tsx:38-46`

- [ ] **Step 1: Расширить коллекцию Applications**

В `src/payload/collections/Applications.ts`:

1. `clientPhone`: убрать `required: true`, добавить `admin: { description: 'Можно не указывать при ручном создании' }`
2. В options статуса первым добавить:

```ts
{ label: 'Неразобранное', value: 'unsorted' },
```

и сменить `defaultValue: 'new'` → `defaultValue: 'unsorted'`.

3. После поля `agent` добавить поля:

```ts
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [
        { name: 'tag', type: 'text', label: 'Тег' },
      ],
    },
    {
      name: 'lossReason',
      type: 'text',
      label: 'Причина отказа',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'budget',
      type: 'number',
      label: 'Бюджет (₽)',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'source',
      type: 'text',
      label: 'Источник',
      admin: {
        position: 'sidebar',
      },
    },
```

- [ ] **Step 2: Заявка с сайта → unsorted + source**

В `src/components/objects/ViewRequestForm.tsx` в body POST-запроса:

```tsx
        body: JSON.stringify({
          type: 'viewing',
          object: objectId,
          clientName: name,
          clientPhone: phone,
          message,
          status: 'unsorted',
          source: 'site',
          ...(userId ? { user: userId } : {}),
        }),
```

- [ ] **Step 3: Словари**

В `src/i18n/dictionaries.ts` в блок `crm` ru (после `stageRejected`):

```ts
    stageUnsorted: 'Неразобранное',
    viewKanban: 'Канбан',
    viewList: 'Список',
    quickAddPlaceholder: 'Быстрое добавление: имя клиента',
    lossTitle: 'Причина отказа',
    lossAdd: 'Закрыть с причиной',
    lossSkip: 'Без причины',
    lossCustom: 'Своя причина…',
    tagPlaceholder: '+ тег',
```

и в блок `crm` os (после `stageRejected`):

```ts
    stageUnsorted: 'Нæхицæнгонд',
    viewKanban: 'Канбан',
    viewList: 'Номхыгъд',
    quickAddPlaceholder: 'Тагъд бафтау: клиенты ном',
    lossTitle: 'Æнæнтысты аххос',
    lossAdd: 'Аххосимæ сæхгæн',
    lossSkip: 'Æнæ аххос',
    lossCustom: 'Уæхи аххос…',
    tagPlaceholder: '+ тег',
```

Быстрые причины отказа (ru / os) — в том же блоке crm:

```ts
    lossReasons: ['Не договорились по цене', 'Купили в другом месте', 'Недоступен', 'Думает'],
```

```ts
    lossReasons: ['Аргъы нæ сразы стæм', 'Æндæр ран балхæдтой', 'Нæ дзуапп дæтты', 'Хъуыды кæны'],
```

- [ ] **Step 4: ЛК — unsorted показываем как «Новая»**

В `src/app/(site)/[lang]/lk/applications/page.tsx` в `statusLabels` добавить первой строкой:

```ts
    unsorted: t.lkApplications.statusNew,
```

- [ ] **Step 5: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(crm): unsorted stage, tags/lossReason/budget/source fields on applications" && git push origin master
```

---

### Task 2: FunnelBoard — колонка «Неразобранное», автоназначение, быстрое добавление

**Files:**
- Modify: `src/components/lk/FunnelCard.tsx`
- Modify: `src/components/lk/FunnelBoard.tsx`

**Interfaces:**
- Consumes: поле `status: 'unsorted'` в Applications; ключи `crm.stageUnsorted`, `crm.quickAddPlaceholder`

- [ ] **Step 1: Стадия unsorted в STAGES**

В `src/components/lk/FunnelCard.tsx` в массив `STAGES` первой строкой:

```ts
  { value: 'unsorted', labelKey: 'crm.stageUnsorted' },
```

- [ ] **Step 2: FunnelBoard — автоназначение агента при переносе**

В `src/components/lk/FunnelBoard.tsx`:

1. Добавить состояние после `const [meId, setMeId] = ...`:

```tsx
  const [meAgentId, setMeAgentId] = useState<number | null>(null)
```

2. В `load()` после `setMeRole(...)` добавить (внутри `if (me.role === 'agent')`):

```tsx
    if (me.role === 'agent') {
      const agentRes = await fetch(`/api/agents?${new URLSearchParams({ where: JSON.stringify({ user: { equals: me.id } }), limit: '1', depth: '0' })}`, { credentials: 'include' })
      const agentData = await agentRes.json()
      setMeAgentId(((agentData.docs || [])[0] as { id?: number } | undefined)?.id ?? null)
    }
```

3. Заменить `moveStage`:

```tsx
  const moveStage = async (app: FunnelApplication, newStatus: string) => {
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: newStatus } : a)))
    const body: Record<string, unknown> = { status: newStatus }
    // Агент забирает заявку из «Неразобранного» — назначается автоматически
    if (app.status === 'unsorted' && newStatus !== 'unsorted' && meRole === 'agent' && meAgentId) {
      body.agent = meAgentId
    }
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }
```

4. Обновить вызовы: `moveBy` → `moveStage(app, target.value)`; `handleDrop` → `moveStage(apps.find((a) => a.id === draggingId)!, stage)` — если заявка не найдена, ничего не делать:

```tsx
  const handleDrop = (stage: string) => {
    if (draggingId !== null) {
      const app = apps.find((a) => a.id === draggingId)
      if (app) {
        void moveStage(app, stage)
      }
    }
    setDraggingId(null)
    setDragOverStage(null)
  }
```

- [ ] **Step 3: Быстрое добавление в колонке «Неразобранное»**

1. Состояние: `const [quickName, setQuickName] = useState('')`
2. Обработчик:

```tsx
  const quickAdd = async () => {
    const name = quickName.trim()
    if (!name) return
    setQuickName('')
    await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: 'viewing', clientName: name, status: 'unsorted', source: 'manual' }),
    })
    await load()
  }
```

3. В JSX внутри контейнера карточек колонки, после `{stageApps.map(...)}` добавить (только для `stage.value === 'unsorted'` и не для клиентов — `meRole !== 'user'`):

```tsx
                {stage.value === 'unsorted' && meRole !== 'user' && (
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void quickAdd()
                      }
                    }}
                    placeholder={t.crm.quickAddPlaceholder}
                    aria-label={t.crm.quickAddPlaceholder}
                    style={{
                      boxSizing: 'border-box', width: '100%', border: '1px dashed #cbbda9', borderRadius: 8,
                      background: '#fcfaf7', color: '#25241f', padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif',
                    }}
                  />
                )}
```

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelBoard.tsx src/components/lk/FunnelCard.tsx`
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(crm): unsorted column, agent auto-assign on claim, quick add" && git push origin master
```

---

### Task 3: Модалка причины отказа при закрытии

**Files:**
- Modify: `src/components/lk/FunnelBoard.tsx`

- [ ] **Step 1: Состояние и перехват перехода (только для агентов/админов)**

1. Состояния:

```tsx
  const [lossApp, setLossApp] = useState<FunnelApplication | null>(null)
  const [lossTarget, setLossTarget] = useState<string>('')
  const [lossReason, setLossReason] = useState('')
```

2. В начале `moveStage` перехватить закрытие (клиентам — без модалки, у них нет прав PATCH):

```tsx
  const moveStage = async (app: FunnelApplication, newStatus: string) => {
    if ((newStatus === 'closed' || newStatus === 'rejected') && meRole !== 'user') {
      setLossApp(app)
      setLossTarget(newStatus)
      setLossReason('')
      return
    }
```

- [ ] **Step 2: Подтверждение с причиной (прямой PATCH, без рекурсии в moveStage)**

```tsx
  const confirmLoss = async (withReason: boolean) => {
    if (!lossApp) return
    const app = lossApp
    const target = lossTarget
    const reason = withReason ? lossReason.trim() : ''
    setLossApp(null)
    setLossTarget('')
    setLossReason('')
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: target } : a)))
    const body: Record<string, unknown> = { status: target }
    if (app.status === 'unsorted' && target !== 'unsorted' && meRole === 'agent' && meAgentId) {
      body.agent = meAgentId
    }
    if (reason) {
      body.lossReason = reason
    }
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }
```

- [ ] **Step 3: JSX модалки (перед закрывающим `</div>` корневого контейнера)**

```tsx
      {lossApp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}
          onClick={() => { setLossApp(null); setLossReason(''); setLossTarget('') }}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 460px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>{t.crm.lossTitle}</h2>
              <button type="button" onClick={() => { setLossApp(null); setLossReason(''); setLossTarget('') }}
                style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {t.crm.lossReasons.map((r) => (
                <button key={r} type="button" onClick={() => setLossReason(r)}
                  style={{ border: '1px solid #d9d1c4', borderRadius: 999, background: lossReason === r ? '#a7814e' : '#fff', color: lossReason === r ? '#fff' : '#716b62', padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              placeholder={t.crm.lossCustom}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void confirmLoss(true)} disabled={!lossReason.trim()}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: lossReason.trim() ? 1 : 0.5 }}>
                {t.crm.lossAdd}
              </button>
              <button type="button" onClick={() => void confirmLoss(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.lossSkip}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelBoard.tsx`
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(crm): loss reason modal on closing applications" && git push origin master
```

---

### Task 4: Теги на карточках заявок

**Files:**
- Modify: `src/components/lk/FunnelCard.tsx`
- Modify: `src/components/lk/FunnelBoard.tsx`

- [ ] **Step 1: FunnelCard — теги и колбэки**

В `src/components/lk/FunnelCard.tsx`:

1. В `FunnelApplication` добавить: `tags: string[]`
2. В Props добавить: `onAddTag?: (tag: string) => void; onRemoveTag?: (tag: string) => void`
3. В деструктуризацию компонента добавить `onAddTag, onRemoveTag`
4. После блока `{app.lastText && (...)}` добавить (теги видны всем; удаление/добавление — только когда колбэки переданы, т.е. в CRM):

```tsx
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
        onClick={(e) => e.stopPropagation()}>
        {app.tags.map((tg) => (
          <span key={tg} style={{ padding: '3px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: onRemoveTag ? 'pointer' : 'default' }}
            onClick={() => onRemoveTag?.(tg)}>
            {tg}{onRemoveTag && ' ✕'}
          </span>
        ))}
        {onAddTag && (
          <input
            type="text"
            placeholder={t.crm.tagPlaceholder}
            aria-label={t.crm.tagPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) {
                  onAddTag(v)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }
            }}
            style={{ width: 64, boxSizing: 'border-box', border: '1px dashed #cbbda9', borderRadius: 999, background: '#fcfaf7', color: '#25241f', padding: '3px 8px', font: '9px Arial, Helvetica, sans-serif' }}
          />
        )}
      </div>
```

- [ ] **Step 2: FunnelBoard — загрузка и PATCH тегов**

В `src/components/lk/FunnelBoard.tsx`:

1. В маппинге заявки (в `result.push({...})`) добавить:

```tsx
        tags: ((a.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean),
```

2. Обработчики:

```tsx
  const patchTags = async (app: FunnelApplication, tags: string[]) => {
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, tags } : a)))
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tags: tags.map((tg) => ({ tag: tg })) }),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }
```

3. В `<FunnelCard ...>` передать колбэки только для CRM-ролей (клиент теги не меняет):

```tsx
                      onAddTag={meRole !== 'user' ? (tag) => void patchTags(app, [...app.tags, tag]) : undefined}
                      onRemoveTag={meRole !== 'user' ? (tag) => void patchTags(app, app.tags.filter((tg) => tg !== tag)) : undefined}
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelCard.tsx src/components/lk/FunnelBoard.tsx`
Expected: PASS (0 errors)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(crm): tags on funnel cards" && git push origin master
```

---

### Task 5: Вид «Список» заявок + переключатель

**Files:**
- Create: `src/components/crm/LeadsView.tsx`
- Create: `src/components/crm/LeadsList.tsx`
- Modify: `src/app/crm/leads/page.tsx`

- [ ] **Step 1: LeadsList (таблица)**

`src/components/crm/LeadsList.tsx` — 'use client', копирует логику загрузки FunnelBoard (me/where/agents) с колонками:

```tsx
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
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.thClient}</th>
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.thObject}</th>
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.thAgent}</th>
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.thStage}</th>
              <th style={{ ...cell, textAlign: 'right', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.objPrice}</th>
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}>{t.crm.updated}</th>
              <th style={{ ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }}></th>
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
```

⚠️ `FunnelApplication.agentName` — поле добавить в интерфейс `FunnelApplication` в `FunnelCard.tsx`:

```ts
  agentName?: string
```

- [ ] **Step 2: LeadsView — переключатель**

`src/components/crm/LeadsView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import FunnelBoard from '@/components/lk/FunnelBoard'
import LeadsList from './LeadsList'

export default function LeadsView({ t }: { t: Dict }) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  const btn = (active: boolean): React.CSSProperties => ({
    border: '1px solid #d9d1c4', borderRadius: 7, background: active ? '#a7814e' : '#fff',
    color: active ? '#fff' : '#716b62', padding: '8px 14px', fontSize: 10, textTransform: 'uppercase',
    letterSpacing: '.08em', cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setView('kanban')} style={btn(view === 'kanban')}>{t.crm.viewKanban}</button>
        <button type="button" onClick={() => setView('list')} style={btn(view === 'list')}>{t.crm.viewList}</button>
      </div>
      {view === 'kanban' ? <FunnelBoard lang="ru" /> : <LeadsList />}
    </div>
  )
}
```

- [ ] **Step 3: Страница**

В `src/app/crm/leads/page.tsx` заменить импорт и рендер:

```tsx
import LeadsView from '@/components/crm/LeadsView'
...
      <LeadsView t={t} />
```

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/LeadsView.tsx src/components/crm/LeadsList.tsx`
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(crm): leads list view with kanban/list toggle" && git push origin master
```

---

### Task 6: Финальная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер, локально: agent1@test.ru / client1@test.ru)**

1. Гостевая заявка с объекта → падает в «Неразобранное» (CRM)
2. Агент перетаскивает её в «Новая» → заявка назначена на него (проверить через /api/applications)
3. Быстрое добавление (имя → Enter) → новая заявка в «Неразобранном»
4. Перетащить в «Закрыто» → модалка причины; выбрать причину → сохранена (lossReason в API)
5. Теги: добавить тег Enter → сохранился; клик по тегу → удалился
6. Вид «Список»: таблица, поиск, смена статуса из select, ссылка в чат
7. ЛК клиента: заявка unsorted отображается как «Новая»
8. Регрессия: чаты, объекты, лендинг

- [ ] **Step 3: Скриншоты** — `scrape/screens/n15-crm-leads-v2.png` (канбан + неразобранное), `n15-crm-leads-list.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 0 verification" && git push origin master
```

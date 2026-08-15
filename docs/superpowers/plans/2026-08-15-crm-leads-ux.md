# Переработка вкладки «Заявки» (CRM-воронка) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Воронка «Заявки» в CRM-стиле: полная карточка (телефон, кнопки ←/→/ЧАТ/ПОЗВОНИТЬ, дата последнего действия), поиск по клиенту/объекту, фильтр агента для админа, суммы цен по стадиям.

**Architecture:** Переработка `FunnelCard`/`FunnelBoard` (ЛК их больше не использует): CRM-стиль (белые карточки, тёмный текст), локальный поиск с debounce, суммы по видимым заявкам. Стили — в `crm.css`.

**Tech Stack:** Next.js 16, Tailwind-утилиты + scoped CRM CSS, i18n ru/os.

**Спека:** `docs/superpowers/specs/2026-08-15-crm-leads-ux-design.md`

## Global Constraints

- **⚠️ ЗАПРЕЩЕНЫ git-коммиты и push — явная команда пользователя. Шаги «Commit» ПРОПУСКАЮТСЯ.**
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- TypeScript модифицирован: однострочные `if (x) a() else b()` без фигурных скобок ломают компиляцию — всегда `{ }`
- Правило `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- Палитра CRM: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, радиусы 12px

---

### Task 1: i18n ключи для воронки (ru+os)

**Files:**
- Modify: `src/i18n/dictionaries.ts` (внутрь существующих `crm`-блоков)

**Interfaces:**
- Produces: `crm.searchPlaceholder`, `crm.chat`, `crm.call`, `crm.updated`, `crm.agentsAll` — используются в Tasks 2-3

- [ ] **Step 1: В ru-блок `crm` (после `recentLeadsNote`) добавить**

```ts
    searchPlaceholder: 'Поиск по клиенту или объекту…',
    chat: 'Чат',
    call: 'Позвонить',
    updated: 'Обновлено',
    agentsAll: 'Все агенты',
```

- [ ] **Step 2: В os-блок `crm` (после `recentLeadsNote`) добавить**

```ts
    searchPlaceholder: 'Клиент кæнæ объектмæ гæсгæ агур…',
    chat: 'Чат',
    call: 'Фæдзурын',
    updated: 'Æрæздæхт',
    agentsAll: 'Æппæт агенттæ',
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: НЕ коммитить** — перейти к Task 2

---

### Task 2: FunnelCard — полная карточка в CRM-стиле

**Files:**
- Modify: `src/components/lk/FunnelCard.tsx` (полная замена)

**Interfaces:**
- Produces: `FunnelApplication` с полями `clientPhone?: string`, `lastActionAt?: string`, `objectPrice?: number`; `STAGES`, `stageLabel` (без изменений); `FunnelCard` с пропами `onMoveLeft/onMoveRight/onOpenChat` и `canMoveLeft/canMoveRight`

- [ ] **Step 1: Заменить `src/components/lk/FunnelCard.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

export interface FunnelApplication {
  id: number
  status: string
  type: string
  createdAt: string
  clientName: string
  clientPhone?: string
  objectTitle?: string
  objectId?: number
  objectPrice?: number
  lastText?: string
  lastActionAt?: string
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
  onOpenChat?: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
}

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 16,
  color: '#25241f', cursor: 'grab', boxShadow: '0 1px 2px rgba(37,36,31,.04)',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-block', padding: '4px 8px', borderRadius: 999, background: '#f2eadf',
  color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em',
}

const actionBtn: React.CSSProperties = {
  border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62',
  padding: '6px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer',
}

export default function FunnelCard({ app, lang, t, onMoveLeft, onMoveRight, onOpenChat, canMoveLeft, canMoveRight }: Props) {
  const lastAction = app.lastActionAt || app.createdAt
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <a
          href={app.objectId ? `/${lang}/catalog/${app.objectId}` : undefined}
          onClick={(e) => { e.stopPropagation(); if (!app.objectId) { e.preventDefault(); onOpenChat?.() } }}
          style={{ fontWeight: 600, fontSize: 13, color: '#25241f', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {app.objectTitle || `Заявка #${app.id}`}
        </a>
        {app.unread > 0 && (
          <span style={{ flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: '#a7814e', color: '#fff', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {app.unread}
          </span>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: '#25241f' }}>
        {app.clientName}
        {app.clientPhone && (
          <a href={`tel:${app.clientPhone.replace(/\s+/g, '')}`} style={{ color: '#8d6b40', marginLeft: 6, textDecoration: 'none' }}>
            {app.clientPhone}
          </a>
        )}
      </div>

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        <span style={pillStyle}>{typeKeys[app.type] || app.type}</span>
        <span>{t.crm.updated}: {new Date(lastAction).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}</span>
      </div>

      {app.lastText && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#8a857b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          «{app.lastText}»
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* stopPropagation: кнопки не должны проваливаться в клик по карточке (открытие чата) */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveLeft?.() }} disabled={!canMoveLeft} aria-label={t.lkFunnel.moveLeft} style={{ ...actionBtn, opacity: canMoveLeft ? 1 : 0.3 }}>
          ←
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveRight?.() }} disabled={!canMoveRight} aria-label={t.lkFunnel.moveRight} style={{ ...actionBtn, opacity: canMoveRight ? 1 : 0.3 }}>
          →
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenChat?.() }} style={{ ...actionBtn, marginLeft: 'auto' }}>
          {t.crm.chat}
        </button>
        {app.clientPhone && (
          <a href={`tel:${app.clientPhone.replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()} style={{ ...actionBtn, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ☎ {t.crm.call}
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelCard.tsx`
Expected: PASS

- [ ] **Step 3: НЕ коммитить** — перейти к Task 3

---

### Task 3: FunnelBoard — поиск, суммы, фильтр, CRM-колонки

**Files:**
- Modify: `src/components/lk/FunnelBoard.tsx` (полная замена)

**Interfaces:**
- Consumes: `FunnelCard`, `FunnelApplication`, `STAGES`, `stageLabel` (Task 2)
- Produces: `FunnelBoard({ lang }: { lang: string })` — обновлённая доска

- [ ] **Step 1: Заменить `src/components/lk/FunnelBoard.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import FunnelCard, { STAGES, stageLabel, type FunnelApplication } from './FunnelCard'

const POLL_MS = 30_000

const money = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v) + ' млн'

export default function FunnelBoard({ lang }: { lang: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [meRole, setMeRole] = useState<string>('user')
  const [meId, setMeId] = useState<number | null>(null)
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [search, setSearch] = useState('')
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

    const params = new URLSearchParams({ sort: '-createdAt', depth: '2', limit: '200' })
    if (Object.keys(where).length) params.set('where', JSON.stringify(where))
    const res = await fetch(`/api/applications?${params}`, { credentials: 'include' })
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]

    const result: FunnelApplication[] = []
    for (const a of docs) {
      const appId = a.id as number
      const obj = a.object as Record<string, unknown> | undefined
      const clientUser = a.user as Record<string, unknown> | undefined

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
        clientPhone: (clientUser?.phone as string) || (a.clientPhone as string) || undefined,
        objectTitle: (obj?.title as string) || undefined,
        objectId: (obj?.id as number) || undefined,
        objectPrice: (obj?.price as number) || undefined,
        lastText: (last?.text as string) || undefined,
        lastActionAt: (last?.createdAt as string) || (a.createdAt as string) || undefined,
        unread: unreadData.totalDocs ?? 0,
      })
    }
    setApps(result)

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

  // Локальный поиск (debounce 200 мс)
  const [searchApplied, setSearchApplied] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSearchApplied(search.trim().toLowerCase()), 200)
    return () => clearTimeout(id)
  }, [search])

  const visibleApps = useMemo(() => {
    if (!searchApplied) return apps
    return apps.filter((a) =>
      a.clientName.toLowerCase().includes(searchApplied) ||
      (a.objectTitle || '').toLowerCase().includes(searchApplied),
    )
  }, [apps, searchApplied])

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

  const openChat = (appId: number) => {
    router.push(`/crm/messages/${appId}`)
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const searchInputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8,
    background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif',
  }
  const columnStyle: React.CSSProperties = {
    flexShrink: 0, width: 300, minHeight: 300, display: 'flex', flexDirection: 'column',
    background: '#f5f2eb', border: '1px solid #e5dfd3', borderRadius: 12,
  }
  const columnHeaderStyle: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid #e5dfd3', display: 'flex',
    alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.crm.searchPlaceholder}
            aria-label={t.crm.searchPlaceholder}
            style={searchInputStyle}
          />
        </div>
        {meRole === 'admin' && (
          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setLoading(true) }}
            style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 10px', font: '12px Arial, Helvetica, sans-serif' }}
          >
            <option value="">{t.crm.agentsAll}</option>
            <option value="none">{t.lkFunnel.noAgent}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {searchApplied && (
          <button type="button" onClick={() => setSearch('')}
            style={{ border: 0, background: 'none', color: '#8d6b40', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
            ✕
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12 }}>
        {STAGES.map((stage) => {
          const stageApps = visibleApps.filter((a) => a.status === stage.value)
          const stageSum = stageApps.reduce((sum, a) => sum + (a.objectPrice || 0), 0)
          return (
            <div
              key={stage.value}
              style={columnStyle}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStage(stage.value)
              }}
              onDragLeave={() => {
                if (dragOverStage === stage.value) setDragOverStage(null)
              }}
              onDrop={() => handleDrop(stage.value)}
            >
              <div style={columnHeaderStyle}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046', fontWeight: 600 }}>
                  {stageLabel(t, stage.value)}
                </span>
                <span style={{ fontSize: 10, color: '#817b70', whiteSpace: 'nowrap' }}>
                  {stageApps.length}{stageSum > 0 ? ` · ${money(stageSum / 1_000_000)} ₽` : ''}
                </span>
              </div>
              <div
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
                  outline: dragOverStage === stage.value ? '2px dashed #b68a51' : 'none',
                }}
              >
                {stageApps.length === 0 && draggingId !== null && (
                  <div style={{ border: '1px dashed #cbbda9', borderRadius: 9, padding: 14, textAlign: 'center', fontSize: 9, color: '#9b958a', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    ↓
                  </div>
                )}
                {stageApps.map((app) => (
                  <div
                    key={app.id}
                    draggable
                    onDragStart={() => setDraggingId(app.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                    onClick={() => openChat(app.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <FunnelCard
                      app={app}
                      lang={lang}
                      t={t}
                      canMoveLeft={STAGES.findIndex((s) => s.value === app.status) > 0}
                      canMoveRight={STAGES.findIndex((s) => s.value === app.status) < STAGES.length - 1}
                      onMoveLeft={() => moveBy(app, -1)}
                      onMoveRight={() => moveBy(app, 1)}
                      onOpenChat={() => openChat(app.id)}
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

⚠️ `t.lkFunnel.noAgent` и `t.lkFunnel.moveLeft/moveRight` — ключи lkFunnel остаются в словарях (не удалялись), используются здесь.

⚠️ Примечание к спеке: стили карточки/шапки заданы inline (тот же визуальный результат), отдельные правила в crm.css не требуются — меньше файлов, меньше риск конфликтов.

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/FunnelBoard.tsx`
Expected: PASS

- [ ] **Step 3: Проверить в браузере**

- http://localhost:3000/crm/leads (агентом) — белые карточки, телефоны-ссылки, кнопки ←/→/ЧАТ/Позвонить, суммы в шапках
- Поиск «Светлана» — карточки фильтруются, суммы пересчитываются
- Кнопка → двигает стадию; «ЧАТ» открывает диалог
- Админом — фильтр агента виден

- [ ] **Step 4: НЕ коммитить** — перейти к Task 4

---

### Task 4: Финальная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint 2>&1 | grep -cE " error "`
Expected: `0`

- [ ] **Step 2: Сценарии**

1. Агент: воронка — карточка содержит телефон (клик = tel:), кнопки работают, drag переносит, суммы корректны
2. Поиск по объекту «набережной» → одна карточка
3. Админ: фильтр «Без агента»/конкретный агент меняет доску
4. Клиент: /crm/leads → redirect на /crm (отказ)

- [ ] **Step 3: Регрессия**

- `/ru/lk` — воронки нет (не использует FunnelBoard), ЛК не сломан
- Скриншот `scrape/screens/n15-crm-leads-v2.png`

- [ ] **Step 4: Без коммитов — доложить о готовности**

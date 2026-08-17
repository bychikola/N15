# Фаза 5: imBox — общая лента чатов с фильтрами

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Приблизить «Сообщения» CRM к imBox amoCRM: общая лента всех бесед с поиском и фильтрами (только непрочитанные, по статусу заявки, по агенту).

**Architecture:** Расширяем ChatList: проп `showFilters` (только CRM) добавляет панель фильтров и клиентскую фильтрацию загруженных диалогов; ConversationItem получает статус заявки и данные агента. ЛК без изменений.

**Скрин-референс:** `scrape/screens/amocrm-imbox-v2.png` (поиск/фильтр, «Всего: N», список бесед).

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 5.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- ЛК (`variant="lk"`) не меняется: фильтры рендерятся только при `showFilters`
- Интеграции Telegram/WhatsApp не входят в фазу

---

### Task 1: ChatList — фильтры imBox

**Files:**
- Modify: `src/components/lk/ChatList.tsx`
- Modify: `src/app/crm/messages/page.tsx`
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Словари**

В блок `crm` ru (после `statsNoData`):

```ts
    filterUnread: 'Только непрочитанные',
    filterStatus: 'Статус',
    filterAgent: 'Агент',
    filterAll: 'Все',
    chatsTotal: 'Диалогов',
```

В блок `crm` os (после `statsNoData`):

```ts
    filterUnread: 'Æрмæст нæбакаст',
    filterStatus: 'Статус',
    filterAgent: 'Агент',
    filterAll: 'Æппæт',
    chatsTotal: 'Ныхæстæ',
```

- [ ] **Step 2: ConversationItem + загрузка статуса и агента**

В `src/components/lk/ChatList.tsx`:

1. Интерфейс:

```ts
interface ConversationItem {
  applicationId: number
  objectTitle: string
  objectImage?: string
  personName: string
  lastText: string
  lastAt: string
  unread: number
  status: string
  agentId?: number
  agentName?: string
}
```

2. В `load()` при маппинге (после `personName`) добавить:

```ts
          status: (app.status as string) || '',
          agentId: (agent as Record<string, unknown> | undefined)?.id as number | undefined,
          agentName: (agent as Record<string, unknown> | undefined)?.name as string | undefined,
```

3. Сигнатура: `{ lang, basePath = '/lk/messages', variant = 'lk', showFilters = false }` — тип: `{ lang: string; basePath?: string; variant?: 'lk' | 'crm'; showFilters?: boolean }`.

4. Состояния фильтров (после `const isCrm = ...`):

```tsx
  const [search, setSearch] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [meRole, setMeRole] = useState<string>('user')
```

5. В `load()` после `const me = meData?.user` добавить:

```ts
    setMeRole((me.role as string) || 'user')
```

и после цикла (перед `setItems(convs)`):

```ts
    if (me.role === 'admin') {
      const agentsRes = await fetch('/api/agents?limit=100&depth=0', { credentials: 'include' })
      const agentsData = await agentsRes.json()
      setAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name })))
    }
```

- [ ] **Step 3: Фильтрация и панель**

1. Перед `if (loading)` добавить:

```tsx
  const visibleItems = items.filter((c) => {
    if (onlyUnread && c.unread === 0) return false
    if (statusFilter && c.status !== statusFilter) return false
    if (agentFilter && c.agentId !== Number(agentFilter)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.objectTitle.toLowerCase().includes(q) ||
      c.personName.toLowerCase().includes(q) ||
      c.lastText.toLowerCase().includes(q)
    )
  })
```

2. В `return` перед списком (после `<div style={isCrm ? ...} className={...}>` контейнера списка) добавить панель фильтров — только когда `isCrm && showFilters`:

```tsx
      {isCrm && showFilters && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.crm.searchPlaceholder}
            aria-label={t.crm.searchPlaceholder}
            style={{ flex: '1 1 260px', maxWidth: 420, boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif' }}
          />
          <button
            type="button"
            onClick={() => setOnlyUnread((v) => !v)}
            style={{
              border: '1px solid #d9d1c4', borderRadius: 999, background: onlyUnread ? '#a7814e' : '#fff',
              color: onlyUnread ? '#fff' : '#716b62', padding: '9px 16px', fontSize: 10,
              textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer',
            }}
          >
            {t.crm.filterUnread}
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t.crm.filterStatus}
            style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}
          >
            <option value="">{t.crm.filterStatus}: {t.crm.filterAll}</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{stageLabel(t, s.value)}</option>
            ))}
          </select>
          {meRole === 'admin' && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label={t.crm.filterAgent}
              style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 10px', font: '12px Arial, Helvetica, sans-serif' }}
            >
              <option value="">{t.crm.filterAgent}: {t.crm.filterAll}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {t.crm.chatsTotal}: {visibleItems.length}
          </span>
        </div>
      )}
```

⚠️ Импорт в ChatList: `import { STAGES, stageLabel } from './FunnelCard'`.

3. В `items.map` заменить `{items.map((c) => (` на `{visibleItems.map((c) => (`.

- [ ] **Step 4: Передать showFilters**

В `src/app/crm/messages/page.tsx`:

```tsx
      <ChatList lang="ru" basePath="/crm/messages" variant="crm" showFilters />
```

- [ ] **Step 5: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/ChatList.tsx`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): imbox-style chat filters (search, unread, status, agent)" && git push origin master`

---

### Task 2: Верификация фазы 5

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер)**

1. /crm/messages — панель фильтров: поиск, «Только непрочитанные», статус, (админ) агент, счётчик диалогов
2. Поиск по имени клиента/объекту сужает список
3. Фильтр по статусу оставляет только диалоги этой стадии
4. «Только непрочитанные» — только диалоги с бейджем
5. ЛК /ru/lk/messages — без фильтров, стиль прежний
6. Регрессия: чат-тред открывается из отфильтрованного списка

- [ ] **Step 3: Скриншот** — `scrape/screens/n15-crm-imbox.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 5 verification" && git push origin master
```

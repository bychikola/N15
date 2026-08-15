# Переработка чатов и объектов в CRM — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести вкладки «Сообщения» (чаты) и «Объекты» к CRM-стилю: чаты через проп `variant: 'lk' | 'crm'` (ЛК без изменений), объекты — карточки + модальная форма.

**Architecture:** ChatList/ChatThread получают `variant` (default 'lk'): при 'crm' рендерят белые карточки/пузыри в CRM-палитре inline-стилями. CrmObjects переструктурируется: сетка карточек + модалка с существующей формой. Страницы /crm/messages передают `variant="crm"`.

**Tech Stack:** Next.js 16, inline-стили CRM-палитры, i18n ru/os.

**Спека:** `docs/superpowers/specs/2026-08-15-crm-chat-objects-design.md`

## Global Constraints

- **⚠️ ЗАПРЕЩЕНЫ git-коммиты и push — явная команда пользователя. Шаги «Commit» ПРОПУСКАЮТСЯ.**
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- TypeScript модифицирован: однострочные `if (x) a() else b()` без фигурных скобок ломают компиляцию — всегда `{ }`
- Правило `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12px
- ЛК-стиль (`variant="lk"`) не меняется

---

### Task 1: ChatList — variant + CRM-стили

**Files:**
- Modify: `src/components/lk/ChatList.tsx`

**Interfaces:**
- Produces: `ChatList({ lang, basePath = '/lk/messages', variant = 'lk' }: { lang: string; basePath?: string; variant?: 'lk' | 'crm' })`

- [ ] **Step 1: Изменить сигнатуру и рендер**

В `src/components/lk/ChatList.tsx`:

1. Сигнатура:

```tsx
export default function ChatList({ lang, basePath = '/lk/messages', variant = 'lk' }: { lang: string; basePath?: string; variant?: 'lk' | 'crm' }) {
```

2. Добавить константы CRM-стилей после `const POLL_MS`:

```tsx
const isCrm = variant === 'crm'
const crmRowStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14,
  display: 'flex', alignItems: 'center', gap: 14, color: '#25241f', textDecoration: 'none',
}
const crmThumbStyle: React.CSSProperties = {
  width: 56, height: 56, flexShrink: 0, overflow: 'hidden', borderRadius: 8,
  background: '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const crmBadgeStyle: React.CSSProperties = {
  flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
  background: '#a7814e', color: '#fff', fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
```

3. В JSX пустого состояния — если isCrm, обернуть в плашку:

```tsx
  if (items.length === 0) {
    return (
      <div style={isCrm ? { background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' } : undefined}
        className={isCrm ? undefined : 'bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-10 text-center'}>
        <p style={isCrm ? { color: '#817b70', fontSize: 13, margin: '0 0 14px' } : undefined}
          className={isCrm ? undefined : 'text-sm text-[var(--n15-muted)] mb-6'}>
          {t.lkMessages.empty}
        </p>
        <Link href={`/${lang}/catalog`}
          style={isCrm ? { display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '10px 18px', textDecoration: 'none' } : undefined}
          className={isCrm ? undefined : 'inline-block text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-6 py-2.5 hover:bg-[var(--n15-gold)]/8 transition-colors'}>
          {t.lkMessages.viewCatalog}
        </Link>
      </div>
    )
  }
```

4. Список: обернуть в контейнер с gap. Для CRM заменить `space-y-3`-контейнер и Link-строки. Заменить блок:

```tsx
  return (
    <div className="space-y-3">
      {items.map((c) => (
        <Link key={c.applicationId} href={`${basePath}/${c.applicationId}`}
          className="flex items-center gap-4 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-4 hover:border-[var(--n15-gold)]/40 transition-colors group">
          ...
        </Link>
      ))}
    </div>
  )
```

на версию с ветвлением стилей:

```tsx
  return (
    <div style={isCrm ? { display: 'flex', flexDirection: 'column', gap: 10 } : undefined} className={isCrm ? undefined : 'space-y-3'}>
      {items.map((c) => (
        <Link key={c.applicationId} href={`${basePath}/${c.applicationId}`}
          style={isCrm ? crmRowStyle : undefined}
          className={isCrm ? undefined : 'flex items-center gap-4 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-4 hover:border-[var(--n15-gold)]/40 transition-colors group'}>
          <div style={isCrm ? crmThumbStyle : undefined}
            className={isCrm ? undefined : 'w-14 h-14 shrink-0 overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 flex items-center justify-center'}>
            {c.objectImage ? (
              <img src={c.objectImage} alt="" style={isCrm ? { width: '100%', height: '100%', objectFit: 'cover' } : undefined} className={isCrm ? undefined : 'w-full h-full object-cover'} />
            ) : (
              <span style={isCrm ? { color: '#b99a6a' } : undefined} className={isCrm ? undefined : 'material-symbols-outlined text-[var(--n15-gold)]/40'}>apartment</span>
            )}
          </div>
          <div style={isCrm ? { flex: 1, minWidth: 0 } : undefined} className={isCrm ? undefined : 'flex-1 min-w-0'}>
            <div style={isCrm ? { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 } : undefined}
              className={isCrm ? undefined : 'flex items-baseline justify-between gap-3'}>
              <span style={isCrm ? { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors truncate'}>
                {c.objectTitle}
              </span>
              <span style={isCrm ? { fontSize: 10, color: '#817b70', flexShrink: 0 } : undefined}
                className={isCrm ? undefined : 'text-[10px] tracking-wide text-[var(--n15-muted)] shrink-0'}>
                {c.lastAt ? new Date(c.lastAt).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <div style={isCrm ? { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 4 } : undefined}
              className={isCrm ? undefined : 'flex items-baseline justify-between gap-3 mt-1'}>
              <span style={isCrm ? { fontSize: 11, color: '#8a857b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                className={isCrm ? undefined : 'text-xs text-[var(--n15-muted)] truncate'}>
                {c.personName && <span style={isCrm ? { color: '#25241f' } : undefined} className={isCrm ? undefined : 'text-[var(--n15-silver)]'}>{c.personName} · </span>}
                {c.lastText}
              </span>
              {c.unread > 0 && (
                <span style={isCrm ? crmBadgeStyle : undefined}
                  className={isCrm ? undefined : 'shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[11px] font-semibold flex items-center justify-center'}>
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
```

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/ChatList.tsx`
Expected: PASS

- [ ] **Step 3: НЕ коммитить** — перейти к Task 2

---

### Task 2: ChatThread — variant + CRM-стили

**Files:**
- Modify: `src/components/lk/ChatThread.tsx`

**Interfaces:**
- Produces: `ChatThread({ applicationId, lang, variant = 'lk' }: { applicationId: number; lang: string; variant?: 'lk' | 'crm' })`

- [ ] **Step 1: Сигнатура и стили**

В `src/components/lk/ChatThread.tsx`:

1. Сигнатура:

```tsx
export default function ChatThread({ applicationId, lang, variant = 'lk' }: { applicationId: number; lang: string; variant?: 'lk' | 'crm' }) {
```

2. Внутри компонента (после `const bottomRef`):

```tsx
  const isCrm = variant === 'crm'
```

3. Заменить блок `if (loading)` — стиль загрузки CRM:

```tsx
  if (loading) {
    return <p style={isCrm ? { color: '#817b70', fontSize: 12 } : undefined} className={isCrm ? undefined : 'text-[var(--n15-muted)]'}>{t.lk.loading}</p>
  }
```

4. Заменить корневой `<div className="flex flex-col min-h-[65vh] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15">` на:

```tsx
  return (
    <div
      style={isCrm ? { display: 'flex', flexDirection: 'column', minHeight: '60vh', background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'hidden' } : undefined}
      className={isCrm ? undefined : 'flex flex-col min-h-[65vh] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15'}
    >
```

5. Шапка (заменить `className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40"`):

```tsx
      <div
        style={isCrm ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e5dfd3', background: '#faf8f4' } : undefined}
        className={isCrm ? undefined : 'flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40'}
      >
```

Внутри шапки:
- ссылку объекта — style CRM: `{ color: '#8d6b40', fontSize: 13, fontWeight: 600, textDecoration: 'none' }`
- имя собеседника (капс-лейбл) — style CRM: `{ color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em' }`
- кнопку «Позвонить» — style CRM: `{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '8px 14px', textDecoration: 'none' }`

6. Область сообщений (`className="flex-1 flex flex-col gap-3 px-6 py-6"`):

```tsx
      <div
        style={isCrm ? { flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '18px', minHeight: 200 } : undefined}
        className={isCrm ? undefined : 'flex-1 flex flex-col gap-3 px-6 py-6'}
      >
```

7. Пузыри — заменить класс пузыря на CRM-ветку. Текущий блок:

```tsx
              <div className={`max-w-[70%] px-4 py-3 text-sm leading-relaxed ${
                mine
                  ? 'border border-[var(--n15-gold)]/50 bg-[var(--n15-gold)]/8 text-[var(--n15-white)]'
                  : 'bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 text-[var(--n15-silver)]'
              }`}>
```

на:

```tsx
              <div
                style={isCrm
                  ? mine
                    ? { maxWidth: '70%', marginLeft: 'auto', background: '#a7814e', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }
                    : { maxWidth: '70%', marginRight: 'auto', background: '#fff', border: '1px solid #e5dfd3', color: '#25241f', borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }
                  : undefined}
                className={isCrm ? undefined : `max-w-[70%] px-4 py-3 text-sm leading-relaxed ${
                  mine
                    ? 'border border-[var(--n15-gold)]/50 bg-[var(--n15-gold)]/8 text-[var(--n15-white)]'
                    : 'bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 text-[var(--n15-silver)]'
                }`}
              >
```

8. Инпут-панель (`className="px-6 py-4 border-t border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40"`):

```tsx
      <div
        style={isCrm ? { padding: '14px 18px', borderTop: '1px solid #e5dfd3', background: '#faf8f4' } : undefined}
        className={isCrm ? undefined : 'px-6 py-4 border-t border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/40'}
      >
```

- textarea — style CRM: `{ flex: 1, boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '10px 12px', font: '13px Arial, Helvetica, sans-serif', resize: 'none' }`
- кнопка отправки — style CRM: `{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }`

9. Аватар входящего — заменить блок:

```tsx
                {!mine && (
                  <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 flex items-center justify-center">
```

на:

```tsx
                {!mine && (
                  <div
                    style={isCrm ? { width: 36, height: 36, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', background: '#f2eadf', border: '1px solid #d9d1c4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}
                    className={isCrm ? undefined : 'w-9 h-9 shrink-0 rounded-full overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 flex items-center justify-center'}
                  >
```

И в инициалах внутри (span с `text-[11px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]`) при CRM: style `{ fontSize: 11, color: '#8d6b40' }`.

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/ChatThread.tsx`
Expected: PASS

- [ ] **Step 3: Передать variant на CRM-страницах**

В `src/app/crm/messages/page.tsx`: `<ChatList lang="ru" basePath="/crm/messages" variant="crm" />`
В `src/app/crm/messages/[applicationId]/page.tsx`: `<ChatThread applicationId={id} lang="ru" variant="crm" />`

- [ ] **Step 4: Проверить в браузере**

- /crm/messages — белые карточки диалогов; клик → чат
- Чат: белая панель, свои пузыри бронзовые, входящие белые; отправка работает
- /ru/lk/messages (клиент) — ЛК-стиль без изменений

- [ ] **Step 5: НЕ коммитить** — перейти к Task 3

---

### Task 3: CrmObjects — карточки + модальная форма

**Files:**
- Modify: `src/components/crm/CrmObjects.tsx`

**Interfaces:**
- Consumes: всё как сейчас; меняется только рендер списка и формы

- [ ] **Step 1: Модалка + сетка карточек**

В `src/components/crm/CrmObjects.tsx`:

1. Добавить состояние модалки: `const [modalOpen, setModalOpen] = useState(false)` (вместо аккордеона)
2. `startEdit` дополнительно вызывает `setModalOpen(true)`
3. «Добавить объект» — кнопка сверху: `onClick={() => { resetForm(); setModalOpen(true) }}` в стиле бронзовой кнопки
4. Заменить `<details className="crm-property-editor" ...>` на модалку:

```tsx
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button type="button" onClick={() => { resetForm(); setModalOpen(true) }}
          style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
          + {t.crm.objAdd}
        </button>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setModalOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 900px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
                {editId ? t.crm.objEdit : t.crm.objAdd}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>
                ✕
              </button>
            </div>
            <div className="crm-property-form">
              {/* ...все поля формы как сейчас (Field-блоки) остаются внутри... */}
            </div>
          </div>
        </div>
      )}
```

⚠️ Контент формы не меняется — просто переезжает из `<details>` в модалку. Сохранить все Field-блоки без изменений; кнопки save — те же.

5. Список — карточки вместо таблицы. Заменить `<table className="crm-table crm-properties-table">...` на:

```tsx
      {loading ? (
        <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
      ) : rows.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {rows.map((o) => (
            <div key={o.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14 }}>
              <div style={{ aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden', background: o.thumb ? undefined : '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {o.thumb
                  ? <img src={o.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: '#b99a6a', fontSize: 26 }}>⌂</span>}
              </div>
              <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.title}
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{o.category}</span>
                <span style={{ fontSize: 9, color: '#817b70' }}>{o.status === 'published' ? t.crm.statusPublished : o.status === 'archived' ? t.crm.statusArchived : t.crm.statusDraft}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#25241f' }}>
                  {o.price != null ? new Intl.NumberFormat('ru-RU').format(o.price) + ' ₽' : '—'}
                </strong>
                {o.agentName && <span style={{ fontSize: 10, color: '#8a857b' }}>{o.agentName}</span>}
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', gap: 6 }}>
                <button type="button" onClick={async () => { const res = await fetch(`/api/objects/${o.id}`, { credentials: 'include' }); const d = await res.json(); startEdit(d) }}
                  style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                  {t.crm.objEdit}
                </button>
                {isAdmin && (
                  <button type="button" onClick={() => void remove(o.id)}
                    style={{ border: '1px solid #e3cfc7', borderRadius: 6, background: 'transparent', color: '#9b4e43', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                    {t.crm.objDelete}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="crm-empty"><strong>{t.crm.objAdd}</strong></div>
      )}
```

6. В `save()` после успеха: `setModalOpen(false)` + `resetForm()` + `await load()`

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/CrmObjects.tsx`
Expected: PASS

- [ ] **Step 3: Проверить в браузере**

- /crm/objects — сетка карточек (миниатюра, название, категория, цена, статус, агент, кнопки)
- «Добавить объект» → модалка; заполнить и сохранить → модалка закрылась, карточка появилась
- «Редактировать» → модалка с данными; «Удалить» (админ) с confirm

- [ ] **Step 4: НЕ коммитить** — перейти к Task 4

---

### Task 4: Финальная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint 2>&1 | grep -cE " error "`
Expected: `0`

- [ ] **Step 2: Сценарии**

1. /crm/messages — белые карточки; чат — пузыри CRM-стиля, отправка работает
2. /ru/lk/messages (клиент) — ЛК-стиль без изменений
3. /crm/objects — карточки, модалка: создать объект с фото → сохранился; редактировать; удалить (админ)

- [ ] **Step 3: Регрессия**

- /crm/leads — воронка работает (карточки/поиск/суммы не сломаны)
- Скриншоты: `scrape/screens/n15-crm-messages-v2.png`, `n15-crm-objects-v2.png`

- [ ] **Step 4: Без коммитов — доложить о готовности**

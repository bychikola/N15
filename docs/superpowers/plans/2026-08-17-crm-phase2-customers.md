# Фаза 2: Клиенты (списки) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Единый реестр клиентов как в amoCRM «Списки»: коллекция Customers, вкладка «Клиенты» (таблица + поиск + модалка формы), карточка клиента со связанными заявками, автосвязь заявок с клиентом по телефону.

**Architecture:** Коллекция Payload `customers` (name, phone, email, company, position, tags, agent, note); Applications получает `customer` relation; сайт-форма ищет клиента по телефону и линкует; страницы /crm/customers и /crm/customers/[id].

**Скрины-референсы:** `scrape/screens/amocrm-contacts.png` (список), `amocrm-contact-card.png` (карточка: имя/контакты/ответственный/сделки/лента событий/примечание).

**Спека:** `docs/superpowers/specs/2026-08-16-amocrm-port-design.md` · Фаза 2.

## Global Constraints

- TypeScript модифицирован: однострочные `if (x) a() else b()` без `{ }` ломают компиляцию
- `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- CRM-палитра: карточки `#fff`/border `#e5dfd3`, текст `#25241f`, muted `#817b70`, акцент `#a7814e`, фон зоны `#f5f2eb`, radius 12
- После каждого логического блока — commit+push (правило пользователя)
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер
- Доступ: клиенты видны всем агентам и админу (общий реестр как в amo); удаление — только админ

---

### Task 1: Схема Customers + поле customer в Applications + словари + навигация

**Files:**
- Create: `src/payload/collections/Customers.ts`
- Modify: `src/payload/payload.config.ts`
- Modify: `src/payload/collections/Applications.ts`
- Modify: `src/components/crm/CrmShell.tsx`
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Коллекция Customers**

`src/payload/collections/Customers.ts`:

```ts
import type { CollectionConfig } from 'payload'

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: {
    useAsTitle: 'name',
    group: 'Агентство',
    defaultColumns: ['name', 'phone', 'email', 'company'],
  },
  access: {
    read: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'ФИО',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
      admin: {
        description: 'По номеру заявки с сайта автоматически привязываются к клиенту',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'company',
      type: 'text',
      label: 'Компания',
    },
    {
      name: 'position',
      type: 'text',
      label: 'Должность',
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [
        { name: 'tag', type: 'text', label: 'Тег' },
      ],
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Ответственный',
      relationTo: 'agents',
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Примечание',
    },
  ],
}
```

- [ ] **Step 2: Подключить коллекцию + поле customer**

1. `src/payload/payload.config.ts`:

```ts
import { Customers } from './collections/Customers'
...
  collections: [Users, Media, Objects, Agents, Applications, Tasks, Messages, Blog, Pages, Customers],
```

2. `src/payload/collections/Applications.ts` — после поля `user` добавить:

```ts
    {
      name: 'customer',
      type: 'relationship',
      label: 'Клиент',
      relationTo: 'customers',
    },
```

- [ ] **Step 3: Навигация**

В `src/components/crm/CrmShell.tsx` в navItems после tasks:

```ts
    { id: 'customers', href: '/crm/customers', label: t.crm.navCustomers },
```

- [ ] **Step 4: Словари**

В блок `crm` ru (после `chatTaskDone`):

```ts
    navCustomers: 'Клиенты',
    customerAdd: 'Добавить клиента',
    customerEdit: 'Редактировать клиента',
    customerName: 'ФИО',
    customerPhone: 'Телефон',
    customerEmail: 'Email',
    customerCompany: 'Компания',
    customerPosition: 'Должность',
    customerAgent: 'Ответственный',
    customerNote: 'Примечание',
    customerApplications: 'Заявки клиента',
    customerSave: 'Сохранить',
    customerDelete: 'Удалить',
    customerEmpty: 'Клиентов пока нет',
    customerBack: '← Ко всем клиентам',
    customerNoApps: 'Заявок пока нет',
```

В блок `crm` os (после `chatTaskDone`):

```ts
    navCustomers: 'Клиенттæ',
    customerAdd: 'Клиент бафтау',
    customerEdit: 'Клиент баив',
    customerName: 'ФИО',
    customerPhone: 'Телефон',
    customerEmail: 'Email',
    customerCompany: 'Компани',
    customerPosition: 'Бынат',
    customerAgent: 'Агент',
    customerNote: 'Фиппаинаг',
    customerApplications: 'Клиенты заявкæтæ',
    customerSave: 'Бавæрын',
    customerDelete: 'Асхафын',
    customerEmpty: 'Клиенттæ нырма нæй',
    customerBack: '← Æппæт клиенттæм',
    customerNoApps: 'Заявкæтæ нырма нæй',
```

- [ ] **Step 5: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS (страниц ещё нет — импорты не добавляем до Task 2)
Commit: `git add -A && git commit -m "feat(crm): customers collection, application link, nav, dictionaries" && git push origin master`

---

### Task 2: Вкладка «Клиенты» — таблица + модалка формы

**Files:**
- Create: `src/components/crm/CustomersList.tsx`
- Create: `src/app/crm/customers/page.tsx`

- [ ] **Step 1: CustomersList**

`src/components/crm/CustomersList.tsx` — 'use client', таблица как LeadsList:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

const POLL_MS = 30_000

interface CustomerRow {
  id: number
  name: string
  phone?: string
  email?: string
  company?: string
  agentName?: string
}

const emptyForm = { name: '', phone: '', email: '', company: '', position: '', note: '' }

export default function CustomersList() {
  const { t } = useI18n()
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/customers?limit=300&depth=1&sort=-updatedAt', { credentials: 'include' })
    const data = await res.json()
    setRows(((data.docs || []) as Record<string, unknown>[]).map((c) => {
      const agent = c.agent as Record<string, unknown> | undefined
      return {
        id: c.id as number,
        name: c.name as string,
        phone: (c.phone as string) || undefined,
        email: (c.email as string) || undefined,
        company: (c.company as string) || undefined,
        agentName: agent?.name as string | undefined,
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
    if (!q) return rows
    return rows.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const startAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setSaveError('')
    setModalOpen(true)
  }

  const startEdit = async (id: number) => {
    const res = await fetch(`/api/customers/${id}?depth=0`, { credentials: 'include' })
    const d = await res.json()
    setEditId(id)
    setForm({
      name: (d.name as string) || '',
      phone: (d.phone as string) || '',
      email: (d.email as string) || '',
      company: (d.company as string) || '',
      position: (d.position as string) || '',
      note: (d.note as string) || '',
    })
    setSaveError('')
    setModalOpen(true)
  }

  const save = async () => {
    if (saving || !form.name.trim()) return
    setSaving(true)
    setSaveError('')
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      // Нормализуем телефон для дедупа: только цифры и +
      phone: form.phone.replace(/[^\d+]/g, '') || undefined,
      email: form.email.trim() || undefined,
      company: form.company.trim() || undefined,
      position: form.position.trim() || undefined,
      note: form.note.trim() || undefined,
    }
    const res = await fetch(editId ? `/api/customers/${editId}` : '/api/customers', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setModalOpen(false)
      await load()
    } else {
      setSaveError(t.crm.objSaveError)
    }
  }

  const set = (k: keyof typeof emptyForm, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const cell: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #eee9e1', fontSize: 12, color: '#25241f', whiteSpace: 'nowrap' }
  const headCell: React.CSSProperties = { ...cell, textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7,
    background: 'white', color: '#25241f', padding: 12, font: '12px Arial, Helvetica, sans-serif',
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.crm.searchPlaceholder}
            aria-label={t.crm.searchPlaceholder}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif' }}
          />
        </div>
        <button type="button" onClick={startAdd}
          style={{ marginLeft: 'auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
          + {t.crm.customerAdd}
        </button>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setModalOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 560px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
                {editId ? t.crm.customerEdit : t.crm.customerAdd}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerName}
                <input value={form.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerPhone}
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerEmail}
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerCompany}
                <input value={form.company} onChange={(e) => set('company', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerPosition}
                <input value={form.position} onChange={(e) => set('position', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t.crm.customerNote}
                <textarea rows={3} value={form.note} onChange={(e) => set('note', e.target.value)} style={{ ...inputStyle, resize: 'none' }} />
              </label>
            </div>
            {saveError && <p style={{ margin: '14px 0 0', color: '#9b4e43', fontSize: 11 }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => void save()} disabled={saving || !form.name.trim()}
                style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
                {t.crm.customerSave}
              </button>
              <button type="button" onClick={() => setModalOpen(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#faf8f4' }}>
                <th style={headCell}>{t.crm.customerName}</th>
                <th style={headCell}>{t.crm.customerPhone}</th>
                <th style={headCell}>{t.crm.customerEmail}</th>
                <th style={headCell}>{t.crm.customerCompany}</th>
                <th style={headCell}>{t.crm.customerAgent}</th>
                <th style={headCell}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={cell}>
                    <Link href={`/crm/customers/${c.id}`} style={{ color: '#25241f', textDecoration: 'none', fontWeight: 600 }}>{c.name}</Link>
                  </td>
                  <td style={cell}>{c.phone ? <a href={`tel:${c.phone.replace(/\s+/g, '')}`} style={{ color: '#8d6b40', textDecoration: 'none' }}>{c.phone}</a> : '—'}</td>
                  <td style={cell}>{c.email || '—'}</td>
                  <td style={cell}>{c.company || '—'}</td>
                  <td style={cell}>{c.agentName || '—'}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => void startEdit(c.id)}
                      style={{ border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62', padding: '7px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                      {t.crm.customerEdit}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: '0 0 14px' }}>{t.crm.customerEmpty}</p>
          <button type="button" onClick={startAdd}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
            + {t.crm.customerAdd}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Страница**

`src/app/crm/customers/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import CustomersList from '@/components/crm/CustomersList'

export const dynamic = 'force-dynamic'

export default async function CrmCustomersPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="customers">
      <CustomersList />
    </CrmShell>
  )
}
```

- [ ] **Step 3: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/CustomersList.tsx`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): customers tab with table, search and modal form" && git push origin master`

---

### Task 3: Карточка клиента + автосвязь заявок по телефону

**Files:**
- Create: `src/components/crm/CustomerCard.tsx`
- Create: `src/app/crm/customers/[id]/page.tsx`
- Modify: `src/components/objects/ViewRequestForm.tsx`

- [ ] **Step 1: CustomerCard**

`src/components/crm/CustomerCard.tsx` — 'use client', загрузка по id:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

interface AppItem {
  id: number
  objectTitle: string
  status: string
  createdAt: string
}

export default function CustomerCard({ id }: { id: number }) {
  const { t } = useI18n()
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${id}?depth=1`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    setCustomer(data)
    const appsRes = await fetch(
      `/api/applications?${new URLSearchParams({ where: JSON.stringify({ customer: { equals: id } }), sort: '-createdAt', limit: '100', depth: '1' })}`,
      { credentials: 'include' },
    )
    const appsData = await appsRes.json()
    setApps(((appsData.docs || []) as Record<string, unknown>[]).map((a) => {
      const obj = a.object as Record<string, unknown> | undefined
      return {
        id: a.id as number,
        objectTitle: (obj?.title as string) || (a.type as string) || '—',
        status: a.status as string,
        createdAt: a.createdAt as string,
      }
    }))
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled) return
      await load()
    }
    void tick()
    return () => { cancelled = true }
  }, [load])

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  if (!customer) {
    return <p style={{ color: '#9b4e43', fontSize: 12 }}>{t.crm.customerEmpty}</p>
  }

  const agent = customer.agent as Record<string, unknown> | undefined
  const tags = ((customer.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean)

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, padding: '12px 0', borderBottom: '1px solid #eee9e1', fontSize: 12, color: '#25241f' }
  const labelStyle: React.CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: '#927046' }

  return (
    <div>
      <Link href="/crm/customers" style={{ display: 'inline-block', marginBottom: 16, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8d6b40', textDecoration: 'none' }}>
        {t.crm.customerBack}
      </Link>
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 22, maxWidth: 640 }}>
        <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>{customer.name as string}</h2>
        {tags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tg) => (
              <span key={tg} style={{ padding: '4px 10px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{tg}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerPhone}</span><span>{customer.phone ? <a href={`tel:${(customer.phone as string).replace(/\s+/g, '')}`} style={{ color: '#8d6b40', textDecoration: 'none' }}>{customer.phone as string}</a> : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerEmail}</span><span>{customer.email ? (customer.email as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerCompany}</span><span>{customer.company ? (customer.company as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerPosition}</span><span>{customer.position ? (customer.position as string) : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>{t.crm.customerAgent}</span><span>{agent?.name ? (agent.name as string) : '—'}</span></div>
          {customer.note ? (
            <div style={rowStyle}><span style={labelStyle}>{t.crm.customerNote}</span><span style={{ whiteSpace: 'pre-wrap', textAlign: 'right' }}>{customer.note as string}</span></div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 18, background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 22, maxWidth: 640 }}>
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>{t.crm.customerApplications}</span>
          <span style={{ marginLeft: 8, fontSize: 10, color: '#817b70' }}>{apps.length}</span>
        </div>
        {apps.length === 0 ? (
          <p style={{ color: '#9b958a', fontSize: 11, margin: 0 }}>{t.crm.customerNoApps}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee9e1', fontSize: 12 }}>
                    <Link href={`/crm/messages/${a.id}`} style={{ color: '#25241f', textDecoration: 'none' }}>{a.objectTitle}</Link>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee9e1', fontSize: 10, color: '#817b70', textAlign: 'right' }}>
                    {new Date(a.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Страница карточки**

`src/app/crm/customers/[id]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import CustomerCard from '@/components/crm/CustomerCard'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CrmCustomerPage({ params }: PageProps) {
  const { id } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  const customerId = parseInt(id, 10)
  if (!Number.isFinite(customerId)) notFound()
  return (
    <CrmShell user={user} t={t} active="customers">
      <CustomerCard id={customerId} />
    </CrmShell>
  )
}
```

- [ ] **Step 3: Автосвязь заявки с клиентом по телефону (сайт-форма)**

В `src/components/objects/ViewRequestForm.tsx` перед POST-ом заявки (после определения userId) добавить поиск клиента:

```tsx
      // Автопривязка к клиенту по номеру телефона
      let customerId: number | undefined
      try {
        const custRes = await fetch(
          `/api/customers?${new URLSearchParams({ where: JSON.stringify({ phone: { equals: phone.replace(/\s+/g, '') } }), limit: '1', depth: '0' })}`,
          { credentials: 'include' },
        )
        const custData = await custRes.json()
        const custDoc = (custData.docs || [])[0] as { id?: number } | undefined
        customerId = custDoc?.id
      } catch {
        // нет доступа к клиентам (гость) — останется без привязки
      }
```

и в body заявки добавить:

```tsx
          ...(customerId ? { customer: customerId } : {}),
```

⚠️ ВАЖНО: у гостей нет доступа к /api/customers (access: только agent/admin) — fetch вернёт 403 и customerId останется undefined. Это ок: гостевая заявка без привязки, агент привяжет вручную. Для АВТОРИЗОВАННОГО клиента (role user) тоже 403 — норм, привязка остаётся за агентами. Альтернатива (серверная привязка при создании заявки) — вне фазы 2.

Также для телефона с пробелами: сайт-форма шлёт как ввели (с пробелами), клиенты в базе — как ввели агенты. Нормализуем обе стороны: `phone.replace(/[^\d+]/g, '')`. В where — `phone: { equals: phone.replace(/[^\d+]/g, '') }`. Агентская форма сохраняет как ввёл — добавить нормализацию при сохранении в CustomersList save(): `phone: form.phone.replace(/[^\d+]/g, '')`.

- [ ] **Step 4: Проверить + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/CustomerCard.tsx src/components/objects/ViewRequestForm.tsx`
Expected: PASS (0 errors)
Commit: `git add -A && git commit -m "feat(crm): customer card with related applications, phone auto-link from site form" && git push origin master`

---

### Task 4: Верификация фазы 2

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint`
Expected: 0 ошибок

- [ ] **Step 2: Сценарии (браузер, agent1@test.ru)**

1. Вкладка «Клиенты» открывает /crm/customers; пустое состояние с кнопкой
2. «Добавить клиента» → модалка → сохранить → строка в таблице
3. Редактировать клиента → данные подтянулись → сохранить
4. Карточка клиента: данные, примечание, блок «Заявки клиента»
5. Гостевая заявка с сайта с телефоном существующего клиента → заявка получила `customer` (проверить через API)
6. Поиск по клиентам работает
7. Регрессия: воронка, чаты, задачи, объекты

- [ ] **Step 3: Скриншоты** — `scrape/screens/n15-crm-customers.png`, `n15-crm-customer-card.png`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(crm): phase 2 verification" && git push origin master
```

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

interface TaskItem {
  id: number
  title: string
  type: string
  dueDate: string
  done: boolean
  appId?: number
  appTitle?: string
}

export default function TasksBoard({ t }: { t: Dict }) {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [apps, setApps] = useState<{ id: number; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', type: 'call', due: 'today', date: localISO(new Date()), app: '' })
  const [saving, setSaving] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const nowD = new Date()
  const todayKey = localISO(nowD)
  const tomorrowKey = localISO(new Date(nowD.getTime() + 86400000))

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

  const taskCard = (tk: TaskItem) => (
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

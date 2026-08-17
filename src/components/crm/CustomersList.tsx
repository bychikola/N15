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
  const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }

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
              <label style={fieldLabel}>
                {t.crm.customerName}
                <input value={form.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} />
              </label>
              <label style={fieldLabel}>
                {t.crm.customerPhone}
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} />
              </label>
              <label style={fieldLabel}>
                {t.crm.customerEmail}
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
              </label>
              <label style={fieldLabel}>
                {t.crm.customerCompany}
                <input value={form.company} onChange={(e) => set('company', e.target.value)} style={inputStyle} />
              </label>
              <label style={fieldLabel}>
                {t.crm.customerPosition}
                <input value={form.position} onChange={(e) => set('position', e.target.value)} style={inputStyle} />
              </label>
              <label style={fieldLabel}>
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

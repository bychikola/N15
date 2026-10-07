'use client'

import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { DEVELOPER_STATUS_LABELS, isDeveloperArchived } from '@/lib/developers'

/**
 * Раздел CRM «Застройщики»: карточки компаний-застройщиков и их жилые
 * комплексы (см. src/payload/collections/Developers.ts и Complexes.ts).
 *
 * Раздел открыт только администратору (проверка на странице
 * /crm/developers): в карточке лежит контакт ответственного представителя —
 * персональные данные, которые не показываются никому, кроме администратора
 * (полевой доступ коллекции Developers). Список застройщиков и комплексов
 * читается из REST Payload под сессией сотрудника: агенты справочник видят
 * (выбирают застройщика в карточке объекта), но контакты им не отдаются.
 *
 * Застройщик создаётся и правится формой, комплекс — строкой внутри карточки
 * застройщика; удалить застройщика с комплексами нельзя, пока они не
 * перенесены или удалены (иначе комплексы остались бы без компании).
 */

interface DeveloperContacts {
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}

interface DeveloperRow {
  id: number
  name: string
  description: string
  website: string
  status: string
  // Публикация на сайте (поле showOnSite коллекции Developers): по умолчанию
  // выключена, включает администратор
  showOnSite: boolean
  logoId: number | null
  logoUrl: string | null
  contacts: DeveloperContacts
}

interface ComplexRow {
  id: number
  name: string
  developer: number | null
  locality: string
  street: string
}

/** id связи из ответа Payload: число, строка-id или объект { id } */
function relId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
    if (typeof id === 'string' && id.trim() && Number.isFinite(Number(id))) return Number(id)
  }
  return null
}

// Подстановка %d/%s в строку словаря (как в других разделах CRM)
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '10px 12px',
  font: '12px Arial, Helvetica, sans-serif',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  color: '#6f6a61',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  minWidth: 0,
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  padding: 16,
}

const smallBtnStyle: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 6,
  background: '#faf7f2',
  color: '#716b62',
  padding: '8px 12px',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  background: '#a7814e',
  color: '#fff',
  padding: '11px 18px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

const emptyDevForm = {
  name: '',
  description: '',
  website: '',
  status: 'active',
  // Новый застройщик по умолчанию не публикуется: показ на сайте включает
  // администратор (см. поле showOnSite коллекции Developers)
  showOnSite: false,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  logoId: null as number | null,
  logoUrl: null as string | null,
}

type DevFormState = typeof emptyDevForm

const emptyComplexForm = { id: null as number | null, name: '', locality: '', street: '' }
type ComplexFormState = typeof emptyComplexForm

interface Props {
  t: Dict
}

export const CrmDevelopers: FC<Props> = ({ t }) => {
  const [developers, setDevelopers] = useState<DeveloperRow[]>([])
  const [complexes, setComplexes] = useState<ComplexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [q, setQ] = useState('')

  // null — форма закрыта, { id: null } — новый застройщик, { id } — правка
  const [editor, setEditor] = useState<{ id: number | null } | null>(null)
  const [form, setForm] = useState<DevFormState>(emptyDevForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')

  // Форма комплекса: null — закрыта, иначе добавление или правка строки
  const [complexForm, setComplexForm] = useState<ComplexFormState | null>(null)
  const [complexSaving, setComplexSaving] = useState(false)
  const [complexError, setComplexError] = useState('')
  const [complexNote, setComplexNote] = useState('')

  const load = useCallback(async () => {
    try {
      const [devRes, cxRes] = await Promise.all([
        fetch('/api/developers?limit=200&depth=1&sort=name', { credentials: 'include' }),
        fetch('/api/complexes?limit=500&depth=0&sort=name', { credentials: 'include' }),
      ])
      if (!devRes.ok || !cxRes.ok) throw new Error('load failed')
      const devData = (await devRes.json()) as { docs?: Record<string, unknown>[] }
      const cxData = (await cxRes.json()) as { docs?: Record<string, unknown>[] }
      setDevelopers(
        (devData.docs || []).map((d) => {
          const logo = d.logo as { id?: number; url?: string } | undefined
          const contacts = (d.contacts || {}) as DeveloperContacts
          return {
            id: Number(d.id),
            name: String(d.name || ''),
            description: String(d.description || ''),
            website: String(d.website || ''),
            status: String(d.status || 'active'),
            showOnSite: d.showOnSite === true,
            logoId: relId(d.logo),
            logoUrl: logo && typeof logo === 'object' ? logo.url || null : null,
            contacts: {
              contactName: contacts.contactName || '',
              contactPhone: contacts.contactPhone || '',
              contactEmail: contacts.contactEmail || '',
            },
          }
        }),
      )
      setComplexes(
        (cxData.docs || []).map((c) => ({
          id: Number(c.id),
          name: String(c.name || ''),
          developer: relId(c.developer),
          locality: String(c.locality || ''),
          street: String(c.street || ''),
        })),
      )
      setLoadError('')
    } catch {
      setLoadError(t.crm.devLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // Первичная загрузка — через микротаск: иначе setState внутри load()
    // формально достижим синхронно из тела эффекта
    // (правило react-hooks/set-state-in-effect), как в MarketParser
    void Promise.resolve().then(() => load())
  }, [load])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return developers
    return developers.filter((d) => `${d.name} ${d.website}`.toLowerCase().includes(needle))
  }, [developers, q])

  // Комплексы выбранного в форме застройщика — чужие в списке не показываем
  const editorComplexes = useMemo(
    () => (editor?.id ? complexes.filter((c) => c.developer === editor.id) : []),
    [complexes, editor],
  )

  const openNew = () => {
    setEditor({ id: null })
    setForm({ ...emptyDevForm })
    setSaveError('')
    setSavedNote('')
    setLogoError('')
    setComplexForm(null)
    setComplexError('')
    setComplexNote('')
  }

  const openEdit = (d: DeveloperRow) => {
    setEditor({ id: d.id })
    setForm({
      name: d.name,
      description: d.description,
      website: d.website,
      status: d.status === 'archived' ? 'archived' : 'active',
      showOnSite: d.showOnSite,
      contactName: d.contacts.contactName || '',
      contactPhone: d.contacts.contactPhone || '',
      contactEmail: d.contacts.contactEmail || '',
      logoId: d.logoId,
      logoUrl: d.logoUrl,
    })
    setSaveError('')
    setSavedNote('')
    setLogoError('')
    setComplexForm(null)
    setComplexError('')
    setComplexNote('')
  }

  const closeEditor = () => {
    setEditor(null)
    setComplexForm(null)
    setSaveError('')
    setSavedNote('')
    setLogoError('')
    setComplexError('')
    setComplexNote('')
  }

  const saveDeveloper = async () => {
    if (!editor || saving) return
    if (!form.name.trim()) {
      setSaveError(t.crm.devNameRequired)
      return
    }
    setSaving(true)
    setSaveError('')
    setSavedNote('')
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        website: form.website.trim() || null,
        status: form.status,
        // Публикация на сайте — переключатель администратора (поле showOnSite)
        showOnSite: form.showOnSite,
        contacts: {
          contactName: form.contactName.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        },
        logo: form.logoId,
      }
      const id = editor.id
      const res = await fetch(id ? `/api/developers/${id}` : '/api/developers', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setSaveError(t.crm.devSaveFailed)
        return
      }
      const data = (await res.json().catch(() => null)) as { doc?: { id?: number } } | null
      const savedId = data?.doc?.id ?? id
      await load()
      setEditor(savedId ? { id: Number(savedId) } : { id: null })
      setSavedNote(t.crm.devSaved)
    } catch {
      setSaveError(t.crm.devSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const removeDeveloper = async (d: DeveloperRow) => {
    const count = complexes.filter((c) => c.developer === d.id).length
    if (count > 0) {
      setLoadError(t.crm.devDeleteHasComplexes)
      return
    }
    if (!window.confirm(t.crm.devDeleteConfirm)) return
    try {
      const res = await fetch(`/api/developers/${d.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        setLoadError(t.crm.devDeleteFailed)
        return
      }
      if (editor?.id === d.id) closeEditor()
      setLoadError('')
      await load()
    } catch {
      setLoadError(t.crm.devDeleteFailed)
    }
  }

  const uploadLogo = async (file: File) => {
    setLogoBusy(true)
    setLogoError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      // kind=logo: знак «Н15» на логотип застройщика не накладываем
      // (см. src/app/api/crm/upload/route.ts)
      fd.append('kind', 'logo')
      const res = await fetch('/api/crm/upload', { method: 'POST', body: fd, credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { doc?: { id?: number; url?: string } } | null
      if (!res.ok || !data?.doc?.id) {
        setLogoError(t.crm.devLogoFailed)
        return
      }
      setForm((f) => ({ ...f, logoId: data.doc!.id!, logoUrl: data.doc!.url || null }))
    } catch {
      setLogoError(t.crm.devLogoFailed)
    } finally {
      setLogoBusy(false)
    }
  }

  const saveComplex = async () => {
    if (!complexForm || !editor?.id || complexSaving) return
    if (!complexForm.name.trim()) {
      setComplexError(t.crm.devComplexNameRequired)
      return
    }
    setComplexSaving(true)
    setComplexError('')
    setComplexNote('')
    try {
      const body = {
        name: complexForm.name.trim(),
        developer: editor.id,
        locality: complexForm.locality.trim() || null,
        street: complexForm.street.trim() || null,
      }
      const res = await fetch(complexForm.id ? `/api/complexes/${complexForm.id}` : '/api/complexes', {
        method: complexForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setComplexError(t.crm.devSaveFailed)
        return
      }
      await load()
      setComplexForm(null)
      setComplexNote(t.crm.devComplexSaved)
    } catch {
      setComplexError(t.crm.devSaveFailed)
    } finally {
      setComplexSaving(false)
    }
  }

  const removeComplex = async (c: ComplexRow) => {
    if (!window.confirm(t.crm.devComplexDeleteConfirm)) return
    try {
      const res = await fetch(`/api/complexes/${c.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        setComplexError(t.crm.devComplexDeleteFailed)
        return
      }
      setComplexError('')
      await load()
    } catch {
      setComplexError(t.crm.devComplexDeleteFailed)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            {t.crm.devTitle}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
            {t.crm.devSubtitle}
          </p>
        </div>
        <button type="button" onClick={openNew} style={{ ...primaryBtnStyle, flex: 'none' }}>
          + {t.crm.devAdd}
        </button>
      </div>

      {loadError && (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: '#e3c9a6', background: '#fdf8f1', color: '#8b683f', fontSize: 11 }}>
          {loadError}
        </div>
      )}

      {/* Поиск по названию и сайту */}
      <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ ...labelStyle, flex: '1 1 260px' }}>
          {t.crm.devSearchLabel}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.crm.devSearchPh} style={inputStyle} />
        </label>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', paddingBottom: 12 }}>
          {fmt(t.crm.devFound, visible.length)}
        </span>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#817b70', fontSize: 12 }}>{t.crm.devSaving}</div>
      ) : !developers.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.devEmpty}</p>
          <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.devEmptyText}</p>
        </div>
      ) : !visible.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center', color: '#817b70', fontSize: 13 }}>
          {t.crm.devNothingFound}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visible.map((d) => (
            <div key={d.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {d.logoUrl ? (
                  <img src={d.logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain', background: '#faf7f2', flex: 'none' }} />
                ) : (
                  <span
                    style={{
                      width: 48, height: 48, borderRadius: 10, background: '#b38a52', color: '#fff',
                      display: 'grid', placeItems: 'center', fontFamily: "'New Standard', Georgia, serif", fontSize: 18, flex: 'none',
                    }}
                  >
                    {d.name.trim().charAt(0).toUpperCase() || '—'}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                  {isDeveloperArchived(d.status) ? (
                    <span style={{ display: 'inline-block', marginTop: 3, padding: '3px 9px', borderRadius: 999, background: '#efeadf', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {DEVELOPER_STATUS_LABELS.archived}
                    </span>
                  ) : (
                    d.showOnSite && (
                      <span style={{ display: 'inline-block', marginTop: 3, padding: '3px 9px', borderRadius: 999, background: '#eef3e8', color: '#5b7a4e', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {t.crm.devShowOnSiteBadge}
                      </span>
                    )
                  )}
                </div>
              </div>

              {d.description && (
                <p style={{ margin: '10px 0 0', color: '#6f6a61', fontSize: 11, lineHeight: 1.45 }}>{d.description}</p>
              )}
              {d.website && (
                <a href={d.website} target="_blank" rel="noopener noreferrer" style={{ marginTop: 8, fontSize: 11, color: '#927046' }}>
                  {d.website}
                </a>
              )}
              <div style={{ marginTop: 10, fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {fmt(t.crm.devComplexesCount, complexes.filter((c) => c.developer === d.id).length)}
              </div>
              {/* Контакт представителя — только администратору (раздел и так
                  администраторский, но подпись о приватности держим на месте) */}
              {(d.contacts.contactName || d.contacts.contactPhone || d.contacts.contactEmail) && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee9e1', fontSize: 11, color: '#25241f', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {d.contacts.contactName && <span>{d.contacts.contactName}</span>}
                  {d.contacts.contactPhone && <span>{d.contacts.contactPhone}</span>}
                  {d.contacts.contactEmail && <span>{d.contacts.contactEmail}</span>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => openEdit(d)} style={{ ...smallBtnStyle, flex: 1 }}>
                  {t.crm.devEdit}
                </button>
                <button type="button" onClick={() => void removeDeveloper(d)} style={{ ...smallBtnStyle, flex: 'none' }}>
                  {t.crm.devDelete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Форма застройщика: новый или правка выбранного */}
      {editor && (
        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
              {editor.id ? form.name || t.crm.devEdit : t.crm.devNew}
            </strong>
            <button type="button" onClick={closeEditor} style={smallBtnStyle}>{t.crm.devClose}</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <label style={labelStyle}>
              {t.crm.devName}
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t.crm.devNamePh} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.devWebsite}
              <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder={t.crm.devWebsitePh} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.devStatus}
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="active">{t.crm.devStatusActive}</option>
                <option value="archived">{t.crm.devStatusArchived}</option>
              </select>
            </label>
            <div style={labelStyle}>
              {t.crm.devLogo}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain', background: '#faf7f2', flex: 'none' }} />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadLogo(file)
                    e.target.value = ''
                  }}
                  style={{ ...inputStyle, padding: 8 }}
                />
              </div>
              <span style={{ color: '#9b958a', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
                {logoBusy ? t.crm.devSaving : t.crm.devLogoHint}
              </span>
              {form.logoId != null && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, logoId: null, logoUrl: null }))}
                  style={{ ...smallBtnStyle, alignSelf: 'flex-start' }}
                >
                  {t.crm.devLogoRemove}
                </button>
              )}
              {logoError && <span style={{ color: '#b4552f', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>{logoError}</span>}
            </div>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              {t.crm.devDescription}
              <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle} />
            </label>
            {/* Публикация на сайте: отдельный переключатель администратора,
                по умолчанию выключен. Архивные компании на сайте не
                показываются независимо от него (поле showOnSite коллекции
                Developers) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.showOnSite}
                  onChange={(e) => setForm((f) => ({ ...f, showOnSite: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: '#a7814e', flex: 'none' }}
                />
                {t.crm.devShowOnSite}
              </label>
              <p style={{ margin: '6px 0 0', color: '#9b958a', fontSize: 10, lineHeight: 1.5, maxWidth: 620 }}>
                {t.crm.devShowOnSiteHint}
              </p>
            </div>
          </div>

          {/* Контакт ответственного представителя — персональные данные,
              доступны только администраторам (см. коллекцию Developers) */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee9e1' }}>
            <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.devContactsBlock}</div>
            <p style={{ margin: '4px 0 12px', color: '#817b70', fontSize: 10 }}>{t.crm.devContactsNote}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <label style={labelStyle}>
                {t.crm.devContactName}
                <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t.crm.devContactPhone}
                <input inputMode="tel" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t.crm.devContactEmail}
                <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} style={inputStyle} />
              </label>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void saveDeveloper()} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? t.crm.devSaving : t.crm.devSave}
            </button>
            {saveError && <span style={{ color: '#b4552f', fontSize: 11 }}>{saveError}</span>}
            {savedNote && <span style={{ color: '#5b7a4e', fontSize: 11 }}>{savedNote}</span>}
          </div>

          {/* Жилые комплексы: только у сохранённого застройщика (новому
              сначала нужно сохранение — иначе комплексу не к чему привязаться) */}
          {editor.id ? (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #eee9e1' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.devComplexesBlock}</div>
              <p style={{ margin: '4px 0 12px', color: '#817b70', fontSize: 10 }}>{t.crm.devComplexesNote}</p>

              {!editorComplexes.length && !complexForm && (
                <p style={{ color: '#9b958a', fontSize: 11, margin: '0 0 12px' }}>{t.crm.devComplexEmpty}</p>
              )}

              {editorComplexes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {editorComplexes.map((c) => (
                    <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, border: '1px solid #eee9e1', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#25241f' }}>{c.name}</div>
                        <div style={{ marginTop: 2, fontSize: 10, color: '#817b70' }}>
                          {[c.locality, c.street].filter(Boolean).join(', ') || '—'}
                        </div>
                      </div>
                      <button type="button" onClick={() => { setComplexForm({ id: c.id, name: c.name, locality: c.locality, street: c.street }); setComplexError(''); setComplexNote('') }} style={smallBtnStyle}>
                        {t.crm.devComplexEdit}
                      </button>
                      <button type="button" onClick={() => void removeComplex(c)} style={smallBtnStyle}>
                        {t.crm.devDelete}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {complexForm ? (
                <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                    {t.crm.devComplexName}
                    <input value={complexForm.name} onChange={(e) => setComplexForm((f) => (f ? { ...f, name: e.target.value } : f))} placeholder={t.crm.devComplexNamePh} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {t.crm.devComplexLocality}
                    <input value={complexForm.locality} onChange={(e) => setComplexForm((f) => (f ? { ...f, locality: e.target.value } : f))} placeholder={t.crm.devComplexLocalityPh} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {t.crm.devComplexStreet}
                    <input value={complexForm.street} onChange={(e) => setComplexForm((f) => (f ? { ...f, street: e.target.value } : f))} style={inputStyle} />
                  </label>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => void saveComplex()} disabled={complexSaving} style={{ ...primaryBtnStyle, opacity: complexSaving ? 0.6 : 1 }}>
                      {complexSaving ? t.crm.devComplexSaving : t.crm.devComplexSave}
                    </button>
                    <button type="button" onClick={() => { setComplexForm(null); setComplexError('') }} style={smallBtnStyle}>
                      {t.crm.devClose}
                    </button>
                    {complexError && <span style={{ color: '#b4552f', fontSize: 11 }}>{complexError}</span>}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setComplexForm({ ...emptyComplexForm }); setComplexError(''); setComplexNote('') }} style={smallBtnStyle}>
                  + {t.crm.devComplexAdd}
                </button>
              )}
              {complexNote && <p style={{ margin: '10px 0 0', color: '#5b7a4e', fontSize: 11 }}>{complexNote}</p>}
            </div>
          ) : (
            <p style={{ margin: '16px 0 0', color: '#9b958a', fontSize: 11 }}>{t.crm.devComplexesAfterSave}</p>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { AgentCard } from '@/lib/agents-service'

/**
 * Раздел CRM «Агенты»: риелторы агентства карточками — фото (или инициалы),
 * имя и фамилия, должность, телефон и количество активных объектов. Карточка
 * ведёт в профиль агента со списком его объектов (/crm/agents/<id>).
 *
 * Раздел открыт всем сотрудникам CRM; клиентам сайта и посетителям он не
 * виден — страница проверяет доступ до отдачи данных (см. src/app/crm/agents).
 * Персональные данные собственников и закрытые документы в раздел не
 * попадают (см. src/lib/agents-service.ts).
 */

interface Props {
  t: Dict
  agents: AgentCard[]
  /** Кнопка «Добавить агента»: админ или сотрудник с разрешением (см. Users.ts) */
  canManage: boolean
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

export const CrmAgents: FC<Props> = ({ t, agents, canManage }) => {
  const [q, setQ] = useState('')
  const router = useRouter()

  // Модальное окно «Добавить агента»
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fields, setFields] = useState({
    name: '', position: '', phone: '', email: '', telegram: '', whatsapp: '',
  })
  const [active, setActive] = useState(true)
  const [photoId, setPhotoId] = useState<number | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const setField = (key: keyof typeof fields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setFields({ name: '', position: '', phone: '', email: '', telegram: '', whatsapp: '' })
    setActive(true)
    setPhotoId(null)
    setPhotoError('')
    setFormError('')
  }

  // Фото грузим сразу при выборе: к моменту сохранения у нас готовый id
  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true)
    setPhotoError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/crm/upload', { method: 'POST', body, credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPhotoError(data?.error || t.crm.agAddPhotoFailed)
        return
      }
      setPhotoId(Number(data?.doc?.id) || null)
    } catch {
      setPhotoError(t.crm.agAddPhotoFailed)
    } finally {
      setPhotoBusy(false)
    }
  }

  const submit = async () => {
    if (saving) return
    if (!fields.name.trim()) {
      setFormError(t.crm.agAddNameRequired)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch('/api/agents/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: fields.name,
          position: fields.position,
          phone: fields.phone,
          email: fields.email,
          telegram: fields.telegram,
          whatsapp: fields.whatsapp,
          photoId,
          isActive: active,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setFormError(data?.error || t.crm.agAddFailed)
        return
      }
      setAddOpen(false)
      resetForm()
      // Список агентов собирается на сервере — обновляем страницу
      router.refresh()
    } catch {
      setFormError(t.crm.agAddFailed)
    } finally {
      setSaving(false)
    }
  }

  // Фильтр по имени агента: ищем по имени и фамилии, должности и телефону
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return agents
    return agents.filter((a) =>
      [a.name, a.position, a.phone].join(' ').toLowerCase().includes(needle),
    )
  }, [agents, q])

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            {t.crm.agTitle}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
            {t.crm.agSubtitle}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { resetForm(); setAddOpen(true) }}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '11px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', flex: 'none' }}
          >
            + {t.crm.agAddButton}
          </button>
        )}
      </div>

      {/* Поиск по имени агента */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5dfd3',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <label style={{ ...labelStyle, flex: '1 1 260px' }}>
          {t.crm.agSearchLabel}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.crm.agSearchPh}
            style={inputStyle}
          />
        </label>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', paddingBottom: 12 }}>
          {fmt(t.crm.agFound, visible.length, agents.length)}
        </span>
      </div>

      {!agents.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agEmpty}</p>
          <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.agEmptyText}</p>
        </div>
      ) : !visible.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agNothingFound}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visible.map((agent) => (
            <Link
              key={agent.id}
              href={`/crm/agents/${agent.id}`}
              style={{
                display: 'block',
                background: '#fff',
                border: '1px solid #e5dfd3',
                borderRadius: 12,
                padding: 16,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Фото агента, а без него — инициалы (как на сайте) */}
                {agent.photo ? (
                  <img
                    src={agent.photo}
                    alt=""
                    style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', flex: 'none' }}
                  />
                ) : (
                  <span
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      background: '#b38a52',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: "'New Standard', Georgia, serif",
                      fontSize: 19,
                      flex: 'none',
                    }}
                  >
                    {agent.initials || '—'}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.name || `Агент #${agent.id}`}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: '#817b70' }}>
                    {agent.position || t.crm.agNoPosition}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 11, color: agent.phone ? '#25241f' : '#9b958a' }}>
                  {agent.phone || t.crm.agNoPhone}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    {t.crm.agActiveObjects}
                  </span>
                  <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20, color: '#25241f' }}>
                    {agent.counts.active}
                  </strong>
                </div>
                {/* Неактивного агента показываем в списке (за ним остались
                    объекты), но помечаем — новых сделок он не ведёт */}
                {!agent.isActive && (
                  <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: 999, background: '#efeadf', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t.crm.agInactive}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#927046', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  {t.crm.agOpenProfile} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Модальное окно «Добавить агента» */}
      {addOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => !saving && setAddOpen(false)}
        >
          <div
            style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 620px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
                {t.crm.agAddTitle}
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>
                {t.crm.agAddName}
                <input value={fields.name} onChange={(e) => setField('name', e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t.crm.agAddPosition}
                <input value={fields.position} onChange={(e) => setField('position', e.target.value)} style={inputStyle} placeholder={t.crm.agAddPositionPh} />
              </label>
              <label style={labelStyle}>
                {t.crm.agAddPhone}
                <input inputMode="tel" value={fields.phone} onChange={(e) => setField('phone', e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t.crm.agAddEmail}
                <input inputMode="email" value={fields.email} onChange={(e) => setField('email', e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t.crm.agAddTelegram}
                <input value={fields.telegram} onChange={(e) => setField('telegram', e.target.value)} style={inputStyle} placeholder="@username" />
              </label>
              <label style={labelStyle}>
                {t.crm.agAddWhatsapp}
                <input value={fields.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} style={inputStyle} placeholder="https://wa.me/7…" />
              </label>
            </div>

            {/* Фото: грузится сразу при выборе файла */}
            <div style={{ marginTop: 14 }}>
              <span style={{ ...labelStyle, display: 'block' }}>{t.crm.agAddPhoto}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadPhoto(file)
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#716b62', padding: '9px 14px', fontSize: 11, cursor: 'pointer', opacity: photoBusy ? 0.6 : 1 }}
                >
                  {photoBusy ? t.crm.agAddPhotoUploading : t.crm.agAddPhotoPick}
                </button>
                {photoId && <span style={{ fontSize: 11, color: '#4e7a3a' }}>{t.crm.agAddPhotoReady}</span>}
                {photoError && <span style={{ fontSize: 11, color: '#9b4e43' }}>{photoError}</span>}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: '#25241f', cursor: 'pointer' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t.crm.agAddActive}
            </label>

            {formError && <p style={{ margin: '12px 0 0', color: '#9b4e43', fontSize: 11 }}>{formError}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? t.crm.agAddSaving : t.crm.agAddSave}
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={saving}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}
              >
                {t.crm.dupCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

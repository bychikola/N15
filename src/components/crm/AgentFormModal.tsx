'use client'

import { useRef, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { AgentCard } from '@/lib/agents-service'
import { maskRuPhoneInput } from '@/lib/phone'

/**
 * Модальное окно профиля агента — одно на создание и правку:
 *
 *   - «Добавить агента» в разделе «Агенты» (agent не передан);
 *   - «Редактировать» на карточке агента и в его профиле (agent передан —
 *     поля заполняются текущими значениями).
 *
 * Фото грузится сразу при выборе файла (/api/crm/upload), к сохранению готов
 * только его id: так сотрудник видит результат до нажатия «Сохранить», а форма
 * не теряет данные при неудачной загрузке. В правке фото меняется только если
 * его тронули — иначе в теле запроса ключа photoId нет, и снимок остаётся
 * прежним (см. PATCH в /api/agents/manage).
 *
 * Права проверяет сервер (маршрут отвечает 403) — окно открывают только те,
 * кому кнопка показана.
 */

interface Props {
  t: Dict
  /** Профиль для правки; без него окно создаёт нового агента */
  agent?: AgentCard | null
  onClose: () => void
  /** Сохранено — страница обновляет данные (router.refresh на стороне вызова) */
  onSaved: () => void
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

export const AgentFormModal: FC<Props> = ({ t, agent, onClose, onSaved }) => {
  const editing = !!agent

  const [fields, setFields] = useState({
    name: agent?.name || '',
    position: agent?.position || '',
    phone: agent?.phone || '',
    email: agent?.email || '',
    telegram: agent?.telegram || '',
    whatsapp: agent?.whatsapp || '',
  })
  const [active, setActive] = useState(agent ? agent.isActive : true)

  // Фото: uploaded — только что загруженное, removed — сотрудник убрал текущее.
  // Пока фото не трогали, в правке остаётся снимок профиля (agent.photo)
  const [uploaded, setUploaded] = useState<{ id: number; url?: string } | null>(null)
  const [removed, setRemoved] = useState(false)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const setField = (key: keyof typeof fields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const preview = uploaded?.url || (removed ? undefined : agent?.photo)
  const hasPhoto = !!preview

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
      const id = Number(data?.doc?.id)
      if (!Number.isInteger(id) || id <= 0) {
        setPhotoError(t.crm.agAddPhotoFailed)
        return
      }
      setUploaded({ id, url: typeof data?.doc?.url === 'string' ? data.doc.url : undefined })
      // Новое фото заменяет прежнее — «убрать» больше не о чем
      setRemoved(false)
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
      // В правке поле фото отправляем только когда его меняли: без ключа
      // сервер оставляет текущий снимок, null — убирает (см. PATCH)
      const photoPart = uploaded
        ? { photoId: uploaded.id }
        : removed
          ? { photoId: null }
          : editing
            ? {}
            : { photoId: null }

      const body = {
        ...(editing ? { id: agent!.id } : {}),
        name: fields.name,
        position: fields.position,
        phone: fields.phone,
        email: fields.email,
        telegram: fields.telegram,
        whatsapp: fields.whatsapp,
        isActive: active,
        ...photoPart,
      }

      const res = await fetch('/api/agents/manage', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setFormError(data?.error || (editing ? t.crm.agEditFailed : t.crm.agAddFailed))
        return
      }
      onSaved()
    } catch {
      setFormError(editing ? t.crm.agEditFailed : t.crm.agAddFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
      onClick={() => !saving && onClose()}
    >
      <div
        style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 620px)', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
            {editing ? t.crm.agEditTitle : t.crm.agAddTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        </div>

        {/* В правке напоминаем, чей профиль открыт: в списке рядом несколько
            похожих имён, а сохранение перезапишет именно этого агента */}
        {editing && (
          <p style={{ margin: '-8px 0 14px', color: '#817b70', fontSize: 11 }}>
            {t.crm.agEditProfileLabel}: <strong style={{ color: '#25241f', fontWeight: 600 }}>{agent?.name || `Агент #${agent?.id}`}</strong>
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={labelStyle}>
            {t.crm.agAddName}
            <input value={fields.name} onChange={(e) => setField('name', e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            {t.crm.agAddPosition}
            <input value={fields.position} onChange={(e) => setField('position', e.target.value)} style={inputStyle} placeholder={t.crm.agAddPositionPh} />
          </label>
          {/* Телефон и WhatsApp — с маской: номер сразу виден в том же виде,
              в каком попадёт в карточку («+7 (918) 828-40-88»). Ссылку wa.me
              маска не трогает — значения с буквами пропускает как есть */}
          <label style={labelStyle}>
            {t.crm.agAddPhone}
            <input inputMode="tel" value={fields.phone} onChange={(e) => setField('phone', maskRuPhoneInput(e.target.value))} style={inputStyle} placeholder="+7 (___) ___-__-__" />
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
            <input value={fields.whatsapp} onChange={(e) => setField('whatsapp', maskRuPhoneInput(e.target.value))} style={inputStyle} placeholder="+7 (___) ___-__-__ или https://wa.me/7…" />
          </label>
        </div>

        {/* Фото: грузится сразу при выборе файла, в правке видно текущий снимок */}
        <div style={{ marginTop: 14 }}>
          <span style={{ ...labelStyle, display: 'block' }}>{t.crm.agAddPhoto}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {hasPhoto && (
              <img
                src={preview}
                alt=""
                style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e5dfd3', flex: 'none' }}
              />
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadPhoto(file)
                // Иначе повторный выбор того же файла не вызовет change
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
              style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#716b62', padding: '9px 14px', fontSize: 11, cursor: 'pointer', opacity: photoBusy ? 0.6 : 1 }}
            >
              {photoBusy ? t.crm.agAddPhotoUploading : hasPhoto ? t.crm.agEditPhotoReplace : t.crm.agAddPhotoPick}
            </button>
            {/* Убрать можно и только что загруженное, и текущее фото профиля */}
            {(uploaded || (!removed && agent?.photo)) && (
              <button
                type="button"
                onClick={() => { setUploaded(null); setRemoved(true); setPhotoError('') }}
                disabled={photoBusy || saving}
                style={{ border: '1px solid #e5d6cf', borderRadius: 8, background: '#fff', color: '#9b4e43', padding: '9px 14px', fontSize: 11, cursor: 'pointer' }}
              >
                {t.crm.agEditPhotoRemove}
              </button>
            )}
            {!photoError && (uploaded || removed) && (
              <span style={{ fontSize: 11, color: removed ? '#9b4e43' : '#4e7a3a' }}>
                {removed ? t.crm.agEditPhotoRemoved : t.crm.agAddPhotoReady}
              </span>
            )}
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
            {saving ? t.crm.agAddSaving : editing ? t.crm.agEditSave : t.crm.agAddSave}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}
          >
            {t.crm.dupCancel}
          </button>
        </div>
      </div>
    </div>
  )
}

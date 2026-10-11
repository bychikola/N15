'use client'

import { useRef, useState, type FC, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardEditData } from '@/lib/owner-board-edit'
import { isPlotCategoryCode, OBJECT_CATEGORIES, HOUSE_TYPES } from '@/lib/object-categories'
import { COMMERCIAL_TYPES } from '@/lib/commercial-types'
import { BOARD_MAX_PHOTOS } from '@/lib/board'

/**
 * Правка объявления собственника администратором в CRM.
 *
 * Форма открывается со страницы /crm/board/owner/[id] и меняет содержание
 * объявления, собранного из заявки: заголовок, описание, параметры, стоимость
 * и фотографии с выбором главной. Контакты и адрес здесь не редактируются —
 * имя собственника остаётся в публичной карточке, а телефон на сайт не
 * публикуется вовсе (связь идёт через Н15, см. boardShowsPublicPhone).
 *
 * Сохранение уходит multipart-запросом на /api/crm/board/owner-ad: снимки до
 * публикации лежат в закрытом хранилище, поэтому их принимает тот же маршрут,
 * что меняет текст (см. updateOwnerBoardAdByAdmin). После сохранения страница
 * показывает результат: опубликованное объявление остаётся на доске, остальные
 * уходят на модерацию.
 */

interface Props {
  t: Dict
  ad: OwnerBoardEditData
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  padding: 20,
  marginBottom: 14,
}

const btnStyle: React.CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '9px 14px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  cursor: 'pointer',
}

const btnGold: React.CSSProperties = {
  ...btnStyle,
  border: 0,
  background: '#a7814e',
  color: '#fff',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#25241f',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: '#817b70',
  textTransform: 'uppercase',
  letterSpacing: '.09em',
  marginBottom: 5,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  color: '#817b70',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 10,
}

const grid = (min: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 12,
})

const hintStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11,
  color: '#817b70',
  lineHeight: 1.55,
}

/** Поле с меткой сверху — как в карточке заявки */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}

export const OwnerBoardAdEdit: FC<Props> = ({ t, ad }) => {
  const router = useRouter()
  const [fields, setFields] = useState<Record<string, string>>(ad.fields)
  const [existingPhotos, setExistingPhotos] = useState(ad.photos)
  const [newPhotos, setNewPhotos] = useState<{ file: File; url: string }[]>([])
  const [mainKey, setMainKey] = useState(ad.photos[0] ? `existing:${ad.photos[0].id}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<null | { published: boolean }>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }))

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return
    const room = Math.max(0, BOARD_MAX_PHOTOS - existingPhotos.length - newPhotos.length)
    const added = Array.from(files)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setNewPhotos((prev) => [...prev, ...added])
    setError('')
  }

  const removeExisting = (id: number) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== id))
    if (mainKey === `existing:${id}`) setMainKey('')
  }

  const removeNew = (index: number) => {
    setNewPhotos((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== index)
    })
    setMainKey((prev) => {
      if (!prev.startsWith('new:')) return prev
      const at = Number(prev.slice(4))
      if (at === index) return ''
      return at > index ? `new:${at - 1}` : prev
    })
  }

  // Ключи фотографий в порядке показа: прежние, затем только что выбранные
  const photoKeys = [
    ...existingPhotos.map((p) => `existing:${p.id}`),
    ...newPhotos.map((_, i) => `new:${i}`),
  ]
  const mainEffective = mainKey && photoKeys.includes(mainKey) ? mainKey : photoKeys[0] || ''
  const photoCount = existingPhotos.length + newPhotos.length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!fields.title.trim() || !fields.description.trim() || !fields.price.trim()) {
      setError(t.crm.ownEditRequired)
      return
    }
    if (!photoCount) {
      setError(t.crm.ownEditNeedPhoto)
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('boardAdId', String(ad.id))
      for (const [key, value] of Object.entries(fields)) body.append(key, String(value ?? '').trim())
      for (const photo of newPhotos) body.append('photos', photo.file)
      body.append('keepPhotos', existingPhotos.map((p) => p.id).join(','))
      if (mainEffective) body.append('mainPhoto', mainEffective)

      const res = await fetch('/api/crm/board/owner-ad', { method: 'POST', body, credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { error?: string; published?: boolean } | null
      if (!res.ok) {
        setError(data?.error || t.crm.ownEditFailed)
        return
      }
      setSaved({ published: data?.published === true })
      router.refresh()
    } catch {
      setError(t.crm.ownEditFailed)
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 15, color: saved.published ? '#3f6b34' : '#8d6b40', marginBottom: 10 }}>
          {saved.published ? t.crm.ownEditSavedPublished : t.crm.ownEditSavedPending}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a href={`/ru/board/${ad.id}`} target="_blank" rel="noreferrer" style={{ ...btnGold, textDecoration: 'none' }}>
            {t.crm.ownEditOpenBoard}
          </a>
          {ad.applicationId && (
            <Link
              href={`/crm/owner-applications/${ad.applicationId}`}
              style={{ ...btnStyle, textDecoration: 'none' }}
            >
              {t.crm.ownEditBack}
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={cardStyle}>
      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {/* Объект: сделка, категория, тип дома, коммерция */}
      <div style={{ ...sectionTitle, marginTop: 0 }}>{t.crm.ownEditObject}</div>
      <div style={{ ...grid(160), marginBottom: 12 }}>
        <Field label={t.crm.ownDeal}>
          <select value={fields.dealType} onChange={(e) => set('dealType', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="sale">{t.object.sale}</option>
            <option value="rent">{t.object.rent}</option>
          </select>
        </Field>
        <Field label={t.board.paramCategory}>
          <select value={fields.category} onChange={(e) => set('category', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {OBJECT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t.board.formHouseType}>
          <select value={fields.houseType} onChange={(e) => set('houseType', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{t.board.formNotSet}</option>
            {HOUSE_TYPES.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
        </Field>
        {fields.category === 'commercial' && (
          <Field label={t.board.formCommercialType}>
            <select value={fields.commercialType} onChange={(e) => set('commercialType', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">{t.board.formNotSet}</option>
              {COMMERCIAL_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label={t.board.formTitle}>
        <input
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={120}
          style={inputStyle}
        />
      </Field>

      {/* Параметры: цена, площадь, комнаты, этаж */}
      <div style={{ ...grid(140), margin: '12px 0' }}>
        <Field label={t.board.formPrice}>
          <input inputMode="numeric" value={fields.price} onChange={(e) => set('price', e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t.board.formArea}>
          <input inputMode="decimal" value={fields.area} onChange={(e) => set('area', e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t.board.formAreaUnit}>
          <select value={fields.areaUnit} onChange={(e) => set('areaUnit', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="sqm">м²</option>
            <option value="are">{t.catalog.areName}</option>
            <option value="ha">{t.catalog.hectareName}</option>
          </select>
        </Field>
      </div>

      <div style={{ ...grid(140), marginBottom: 12 }}>
        <Field label={t.board.formRooms}>
          <input inputMode="numeric" value={fields.rooms} onChange={(e) => set('rooms', e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t.board.formFloor}>
          <input inputMode="numeric" value={fields.floor} onChange={(e) => set('floor', e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t.board.formTotalFloors}>
          <input inputMode="numeric" value={fields.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {isPlotCategoryCode(fields.category) && (
        <div style={{ ...grid(140), marginBottom: 12 }}>
          <Field label={t.board.formPlotArea}>
            <input inputMode="decimal" value={fields.plotArea} onChange={(e) => set('plotArea', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t.board.formAreaUnit}>
            <select value={fields.plotAreaUnit} onChange={(e) => set('plotAreaUnit', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="are">{t.catalog.areName}</option>
              <option value="ha">{t.catalog.hectareName}</option>
              <option value="sqm">м²</option>
            </select>
          </Field>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <Field label={t.board.formDescription}>
          <textarea
            value={fields.description}
            onChange={(e) => set('description', e.target.value)}
            rows={6}
            maxLength={6000}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Field label={t.board.formVideo}>
          <textarea
            value={fields.videoLinks}
            onChange={(e) => set('videoLinks', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
      </div>

      {/* Фотографии: убрать, добавить, выбрать главную */}
      <div style={{ ...sectionTitle, marginTop: 0 }}>{t.board.formPhotos}</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 10 }}>
        {t.board.formPhotosHint.replace('%d', String(BOARD_MAX_PHOTOS))}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          addPhotos(e.target.files)
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photoCount >= BOARD_MAX_PHOTOS}
          style={{ ...btnStyle, opacity: photoCount >= BOARD_MAX_PHOTOS ? 0.45 : 1 }}
        >
          {t.board.formPhotoPick}
        </button>
        <span style={{ fontSize: 11, color: '#817b70' }}>
          {t.board.formPhotosCount.replace('%d', String(photoCount))}
        </span>
      </div>

      {(existingPhotos.length > 0 || newPhotos.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          {existingPhotos.map((photo) => {
            const key = `existing:${photo.id}`
            return (
              <div key={key} style={{ width: 104 }}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={photo.thumb || photo.url}
                    alt=""
                    style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeExisting(photo.id)}
                    aria-label={t.board.formPhotoRemove}
                    style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid #d9d1c4', borderRadius: 999, color: '#9b4e43', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
                {mainEffective === key ? (
                  <span style={{ display: 'block', marginTop: 5, textAlign: 'center', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: '#a7814e' }}>
                    {t.board.formPhotoMain}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMainKey(key)}
                    style={{ display: 'block', width: '100%', marginTop: 5, textAlign: 'center', border: 0, background: 'none', fontSize: 9, lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '.06em', color: '#817b70', cursor: 'pointer' }}
                  >
                    {t.board.formPhotoMakeMain}
                  </button>
                )}
              </div>
            )
          })}
          {newPhotos.map((photo, index) => {
            const key = `new:${index}`
            return (
              <div key={`${photo.file.name}-${index}`} style={{ width: 104 }}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={photo.url}
                    alt=""
                    style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeNew(index)}
                    aria-label={t.board.formPhotoRemove}
                    style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid #d9d1c4', borderRadius: 999, color: '#9b4e43', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
                {mainEffective === key ? (
                  <span style={{ display: 'block', marginTop: 5, textAlign: 'center', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: '#a7814e' }}>
                    {t.board.formPhotoMain}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMainKey(key)}
                    style={{ display: 'block', width: '100%', marginTop: 5, textAlign: 'center', border: 0, background: 'none', fontSize: 9, lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '.06em', color: '#817b70', cursor: 'pointer' }}
                  >
                    {t.board.formPhotoMakeMain}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Собственник и адрес — только для справки: имя остаётся в карточке,
          телефон на сайте не показывается, адрес меняет Н15 при проверке */}
      <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '12px 14px', marginBottom: 18, background: '#fdfbf7' }}>
        <div style={sectionTitle}>{t.crm.ownEditOwner}</div>
        <div style={{ fontSize: 13, color: '#25241f', marginBottom: 4 }}>
          {ad.contactName || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#817b70', lineHeight: 1.6 }}>
          {t.crm.ownEditPhoneHidden}
        </div>
        {ad.address && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#716b62' }}>
            {t.crm.ownEditAddress}: {ad.address}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="submit" disabled={busy} style={{ ...btnGold, opacity: busy ? 0.45 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? t.crm.ownEditSaving : t.crm.ownEditSave}
        </button>
        {ad.applicationId && (
          <Link href={`/crm/owner-applications/${ad.applicationId}`} style={{ ...btnStyle, textDecoration: 'none' }}>
            {t.crm.ownEditBack}
          </Link>
        )}
      </div>
      <p style={hintStyle}>{ad.published ? t.crm.ownEditPublishedNote : t.crm.ownEditPendingNote}</p>
    </form>
  )
}

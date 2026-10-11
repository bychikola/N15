'use client'

import { useRef, useState, type CSSProperties, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardPhoto } from '@/lib/owner-service'
import { OWNER_MAX_PHOTOS } from '@/lib/owner-form'

/**
 * Фотографии заявки собственника в карточке CRM: добавить, убрать и выбрать
 * главную до публикации на доске.
 *
 * Снимки уходят multipart-запросом на /api/crm/owner-applications/photos и
 * ложатся в закрытое хранилище заявок (owner-materials) — то же, куда пишет
 * публичная форма. Главное фото — первое в списке: именно из начала списка
 * берётся обложка объявления при публикации (см. updateOwnerApplicationPhotos).
 *
 * Блок показывается только пока заявка не ушла на доску: у опубликованного
 * объявления снимки правятся в его карточке (see OwnerBoardAdEdit).
 */

interface Props {
  t: Dict
  applicationId: number
  photos: OwnerBoardPhoto[]
}

const sectionTitle: CSSProperties = {
  fontSize: 10,
  color: '#817b70',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 8,
}

const btnStyle: CSSProperties = {
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

const btnGold: CSSProperties = {
  ...btnStyle,
  border: 0,
  background: '#a7814e',
  color: '#fff',
}

const hintStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11,
  color: '#817b70',
  lineHeight: 1.55,
}

export const OwnerApplicationPhotos: FC<Props> = ({ t, applicationId, photos }) => {
  const router = useRouter()
  const [existingPhotos, setExistingPhotos] = useState<OwnerBoardPhoto[]>(photos)
  const [newPhotos, setNewPhotos] = useState<{ file: File; url: string }[]>([])
  const [mainKey, setMainKey] = useState(photos[0] ? `existing:${photos[0].id}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return
    const room = Math.max(0, OWNER_MAX_PHOTOS - existingPhotos.length - newPhotos.length)
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

  const submit = async () => {
    if (busy) return
    if (!photoCount) {
      setError(t.crm.ownPhotosNeedOne)
      return
    }
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const body = new FormData()
      body.append('applicationId', String(applicationId))
      for (const photo of newPhotos) body.append('photos', photo.file)
      body.append('keepPhotos', existingPhotos.map((p) => p.id).join(','))
      if (mainEffective) body.append('mainPhoto', mainEffective)

      const res = await fetch('/api/crm/owner-applications/photos', {
        method: 'POST',
        body,
        credentials: 'include',
      })
      const data = (await res.json().catch(() => null)) as
        | { error?: string; photos?: OwnerBoardPhoto[] }
        | null
      if (!res.ok) {
        setError(data?.error || t.crm.ownPhotosFailed)
        return
      }
      // Сервер вернул сохранённый порядок со ссылками: показываем его же,
      // а выбранные, но не отправленные файлы из формы убираем
      if (Array.isArray(data?.photos)) setExistingPhotos(data.photos)
      setNewPhotos([])
      setMainKey('')
      setSaved(true)
      router.refresh()
    } catch {
      setError(t.crm.ownPhotosFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={sectionTitle}>{t.crm.ownPhotosEdit}</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 10 }}>
        {t.crm.ownPhotosEditHint.replace('%d', String(OWNER_MAX_PHOTOS))}
      </p>

      {saved && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#3f6b34' }}>{t.crm.ownPhotosSaved}</p>
      )}
      {error && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9b4e43' }}>{error}</p>}

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
          disabled={busy || photoCount >= OWNER_MAX_PHOTOS}
          style={{ ...btnStyle, opacity: busy || photoCount >= OWNER_MAX_PHOTOS ? 0.45 : 1 }}
        >
          {t.board.formPhotoPick}
        </button>
        <span style={{ fontSize: 11, color: '#817b70' }}>
          {t.board.formPhotosCount.replace('%d', String(photoCount))}
        </span>
      </div>

      {photoCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          {existingPhotos.map((photo) => {
            const key = `existing:${photo.id}`
            return (
              <div key={key} style={{ width: 104 }}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={photo.thumb || photo.url || ''}
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
                    style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px dashed #d9d1c4' }}
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

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        style={{ ...btnGold, opacity: busy ? 0.45 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        {busy ? t.crm.ownEditSaving : t.crm.ownPhotosSave}
      </button>
    </div>
  )
}

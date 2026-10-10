'use client'

import { useCallback, useEffect, useState, type ChangeEvent, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, photoSizeLabel, isAllowedPhoto } from '@/lib/photo-rules'

/**
 * Редактор раздела «Медиа и документы» карточки ЖК в CRM. Открывается кнопкой
 * «Редактировать» у комплекса в разделе /crm/developers (см. CrmDevelopers.tsx)
 * и правит поля коллекции complexes (см. src/payload/collections/Complexes.ts):
 * название и адрес комплекса, планировки, паркинг, кладовые, галерею,
 * PDF-презентацию и фотоотчёты строительства.
 *
 * Файлы грузятся кнопкой прямо в CRM — не ссылками:
 *   • изображения — /api/crm/upload (коллекция media, знак «Н15» ставит хук);
 *   • PDF — /api/crm/documents/upload (коллекция complex-documents).
 * Загрузка одного файла сразу создаёт документ, а в комплекс он попадает при
 * сохранении карточки — в теле PATCH уходят только ссылки (id).
 *
 * Файлы можно добавлять пачкой, удалять, заменять, менять порядок, а в галерее
 * — выбирать главное изображение. После сохранения всё показывается на
 * публичной странице комплекса в блоке этого ЖК.
 */

/** Загруженный файл: id, адрес и подсказки для превью */
interface MediaLike {
  id: number
  url: string
  filename: string
  mimeType: string
}

interface PlanningItem {
  key: string
  file: MediaLike | null
  name: string
  rooms: string
  area: string
  building: string
}

interface GalleryItem {
  key: string
  photo: MediaLike
  isMain: boolean
}

interface ReportItem {
  key: string
  date: string
  stage: string
  photos: MediaLike[]
}

interface MediaGroup {
  description: string
  photos: MediaLike[]
}

type UploadResult = { ok: true; doc: MediaLike } | { ok: false; error: string }

/** Счётчик для ключей строк: React нужен устойчивый key у новых записей */
let keySeq = 0
const nextKey = () => `k${++keySeq}`

/** Ссылка на медиа из ответа Payload: объект { id, url } или число-id */
function mediaRef(value: unknown): MediaLike | null {
  if (value == null) return null
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    const id = Number(v.id)
    if (!Number.isFinite(id)) return null
    return {
      id,
      url: String(v.url || ''),
      filename: String(v.filename || ''),
      mimeType: String(v.mimeType || ''),
    }
  }
  const id = Number(value)
  return Number.isFinite(id) ? { id, url: '', filename: '', mimeType: '' } : null
}

/** Список медиа из поля upload hasMany — без пустых мест */
function mediaList(value: unknown): MediaLike[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const ref = mediaRef(item)
    return ref ? [ref] : []
  })
}

/** Перестановка элемента массива (порядок фото и строк) */
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** PDF ли это (by mime). Для превью планировки выбираем картинку или документ */
const isPdf = (ref: MediaLike) =>
  ref.mimeType === 'application/pdf' || /\.pdf$/i.test(ref.filename)

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '9px 11px',
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

const smallBtnStyle: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 6,
  background: '#faf7f2',
  color: '#716b62',
  padding: '7px 10px',
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

const sectionStyle: React.CSSProperties = {
  border: '1px solid #e5dfd3',
  borderRadius: 10,
  padding: 14,
}

const uploadLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: '1px dashed #cbbda9',
  borderRadius: 8,
  background: '#fcfaf7',
  color: '#8b683f',
  padding: '9px 14px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

interface Props {
  complexId: number
  t: Dict
  onClose: () => void
  onSaved?: (name: string) => void
}

export const ComplexMediaEditor: FC<Props> = ({ complexId, t, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Название и адрес комплекса
  const [name, setName] = useState('')
  const [locality, setLocality] = useState('')
  const [street, setStreet] = useState('')

  const [plannings, setPlannings] = useState<PlanningItem[]>([])
  const [parking, setParking] = useState<MediaGroup>({ description: '', photos: [] })
  const [storerooms, setStorerooms] = useState<MediaGroup>({ description: '', photos: [] })
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [presentation, setPresentation] = useState<MediaLike | null>(null)
  const [reports, setReports] = useState<ReportItem[]>([])

  const [busy, setBusy] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/complexes/${complexId}?depth=1`, { credentials: 'include' })
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as Record<string, unknown> | null
      // REST Payload отдаёт документ по id без обёртки { doc }, но на случай
      // другой версии/формы ответа принимаем оба варианта
      const doc = (
        data && typeof data === 'object' && 'doc' in data
          ? (data as { doc?: Record<string, unknown> }).doc
          : data
      ) as Record<string, unknown> | undefined
      if (!doc || doc.id == null) throw new Error('no doc')
      setName(String(doc.name || ''))
      setLocality(String(doc.locality || ''))
      setStreet(String(doc.street || ''))
      setPlannings(
        (Array.isArray(doc.plannings) ? doc.plannings : []).flatMap((raw) => {
          const item = raw as Record<string, unknown>
          // Планировка — либо изображение (media), либо PDF (complex-documents)
          const file = mediaRef(item.image) || mediaRef(item.document)
          // Пустую строку (без файла и без подписей) не показываем
          if (!file && !item.name && !item.rooms && !item.building && item.area == null) return []
          return [{
            key: nextKey(),
            file,
            name: String(item.name || ''),
            rooms: String(item.rooms || ''),
            area: item.area != null && item.area !== '' ? String(item.area) : '',
            building: String(item.building || ''),
          }]
        }),
      )
      const parkingDoc = (doc.parking && typeof doc.parking === 'object' ? doc.parking : {}) as Record<string, unknown>
      const storeroomsDoc = (doc.storerooms && typeof doc.storerooms === 'object' ? doc.storerooms : {}) as Record<string, unknown>
      setParking({ description: String(parkingDoc.description || ''), photos: mediaList(parkingDoc.photos) })
      setStorerooms({ description: String(storeroomsDoc.description || ''), photos: mediaList(storeroomsDoc.photos) })
      const galleryItems = (Array.isArray(doc.gallery) ? doc.gallery : []).flatMap((raw) => {
        const item = raw as Record<string, unknown>
        const photo = mediaRef(item.photo)
        return photo ? [{ key: nextKey(), photo, isMain: item.isMain === true }] : []
      })
      // Главное изображение — ровно одно: если в базе отметок несколько, берём первую
      const mainKey = galleryItems.find((g) => g.isMain)?.key
      setGallery(galleryItems.map((g) => ({ ...g, isMain: mainKey ? g.key === mainKey : false })))
      setPresentation(mediaRef(doc.presentation))
      setReports(
        (Array.isArray(doc.photoReports) ? doc.photoReports : []).map((raw) => {
          const item = raw as Record<string, unknown>
          return {
            key: nextKey(),
            date: String(item.date || '').slice(0, 10),
            stage: String(item.stage || ''),
            photos: mediaList(item.photos),
          }
        }),
      )
      setLoadError('')
    } catch {
      setLoadError(t.crm.complexLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [complexId, t])

  useEffect(() => {
    // Отложенный запуск — как в CrmDevelopers: setState не должен быть
    // синхронно достижим из тела эффекта (правило react-hooks/set-state-in-effect)
    void Promise.resolve().then(() => load())
  }, [load])

  /** Отправка одного файла: изображения — в media, PDF — в complex-documents */
  const uploadFile = useCallback(async (file: File, kind: 'image' | 'pdf' | 'auto'): Promise<UploadResult> => {
    // auto — кнопка планировок принимает и картинки, и PDF: маршрут выбираем
    // по самому файлу
    const fileIsPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const target = kind === 'auto' ? (fileIsPdf ? 'pdf' : 'image') : kind
    if (target === 'image') {
      if (!isAllowedPhoto({ name: file.name, type: file.type })) {
        return { ok: false, error: t.crm.mediaUploadBadType }
      }
    } else if (!fileIsPdf) {
      return { ok: false, error: t.crm.mediaUploadBadType }
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: `${t.crm.mediaUploadTooBig} ${photoSizeLabel(file.size)} — ${PHOTO_MAX_LABEL}` }
    }
    const fd = new FormData()
    fd.append('file', file)
    const url = target === 'pdf' ? '/api/crm/documents/upload' : '/api/crm/upload'
    try {
      const res = await fetch(url, { method: 'POST', body: fd, credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { doc?: Record<string, unknown>; code?: string; error?: string } | null
      const doc = mediaRef(data?.doc)
      if (!res.ok || !doc) {
        if (res.status === 401 || data?.code === 'session_expired') return { ok: false, error: t.crm.objUploadSession }
        return { ok: false, error: data?.error || t.crm.mediaUploadFailed }
      }
      return { ok: true, doc }
    } catch {
      return { ok: false, error: t.crm.mediaUploadFailed }
    }
  }, [t])

  /**
   * Загрузка пачки файлов одного вида: идём по одному — десяток фото разом
   * съедает память контейнера (как в CrmObjects). Возвращаем загруженные
   * документы, ошибки показываем строкой под кнопкой.
   */
  const uploadBatch = useCallback(async (files: File[], kind: 'image' | 'pdf' | 'auto'): Promise<MediaLike[]> => {
    if (!files.length) return []
    setUploadError('')
    setBusy(kind === 'pdf' ? t.crm.mediaUploadPdf : t.crm.mediaUpload)
    const done: MediaLike[] = []
    const errors: string[] = []
    for (const file of files) {
      const result = await uploadFile(file, kind)
      if (result.ok) done.push(result.doc)
      else errors.push(`${file.name}: ${result.error}`)
    }
    setBusy('')
    if (errors.length) setUploadError(errors.join('; '))
    return done
  }, [t, uploadFile])

  /** Выбор файлов в скрытом input: сбрасываем value, чтобы тот же файл брался снова */
  const pickFiles = (e: ChangeEvent<HTMLInputElement>, kind: 'image' | 'pdf' | 'auto', onLoaded: (docs: MediaLike[]) => void) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) void uploadBatch(files, kind).then(onLoaded)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    setSavedNote('')
    try {
      const body = {
        name: name.trim(),
        locality: locality.trim() || null,
        street: street.trim() || null,
        plannings: plannings.map((p) => ({
          // Файл уходит в своё поле: изображение — в image, PDF — в document
          image: p.file && !isPdf(p.file) ? p.file.id : null,
          document: p.file && isPdf(p.file) ? p.file.id : null,
          name: p.name.trim() || null,
          rooms: p.rooms.trim() || null,
          area: p.area.trim() === '' ? null : Number(p.area.replace(',', '.')),
          building: p.building.trim() || null,
        })),
        parking: {
          description: parking.description.trim() || null,
          photos: parking.photos.map((p) => p.id),
        },
        storerooms: {
          description: storerooms.description.trim() || null,
          photos: storerooms.photos.map((p) => p.id),
        },
        gallery: gallery.map((g) => ({ photo: g.photo.id, isMain: g.isMain })),
        presentation: presentation?.id ?? null,
        photoReports: reports.map((r) => ({
          date: r.date || null,
          stage: r.stage.trim() || null,
          photos: r.photos.map((p) => p.id),
        })),
      }
      const res = await fetch(`/api/complexes/${complexId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setSaveError(t.crm.complexSaveFailed)
        return
      }
      setSavedNote(t.crm.complexSaved)
      onSaved?.(name.trim())
    } catch {
      setSaveError(t.crm.complexSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  // ── Планировки ────────────────────────────────────────────────────────
  const addPlanning = () => setPlannings((prev) => [...prev, { key: nextKey(), file: null, name: '', rooms: '', area: '', building: '' }])
  const patchPlanning = (key: string, patch: Partial<PlanningItem>) =>
    setPlannings((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const removePlanning = (key: string) => setPlannings((prev) => prev.filter((p) => p.key !== key))

  // ── Фото в группах (паркинг, кладовые) ───────────────────────────────
  const patchGroupPhotos = (setter: React.Dispatch<React.SetStateAction<MediaGroup>>) => (docs: MediaLike[]) =>
    setter((prev) => ({ ...prev, photos: [...prev.photos, ...docs] }))

  // ── Галерея ───────────────────────────────────────────────────────────
  const setGalleryMain = (key: string) =>
    setGallery((prev) => prev.map((g) => ({ ...g, isMain: g.key === key })))

  // ── Фотоотчёты ────────────────────────────────────────────────────────
  const addReport = () => setReports((prev) => [...prev, { key: nextKey(), date: '', stage: '', photos: [] }])
  const patchReport = (key: string, patch: Partial<ReportItem>) =>
    setReports((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeReport = (key: string) => setReports((prev) => prev.filter((r) => r.key !== key))

  /** Общая плитка фото: превью, стрелки порядка и удаление */
  const PhotoTile = ({ photo, index, total, onMove, onRemove }: {
    photo: MediaLike
    index: number
    total: number
    onMove: (from: number, to: number) => void
    onRemove: () => void
  }) => (
    <div style={{ border: '1px solid #e2dacd', borderRadius: 9, background: '#fff', padding: 7 }}>
      {photo.url ? (
        <img src={photo.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', width: '100%', aspectRatio: '4/3', background: '#faf7f2', borderRadius: 6, color: '#9b958a', fontSize: 10 }}>
          {t.crm.planningPdf}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} style={{ ...smallBtnStyle, flex: 'none', opacity: index === 0 ? 0.4 : 1 }} aria-label={t.crm.mediaUp}>↑</button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(index, index + 1)} style={{ ...smallBtnStyle, flex: 'none', opacity: index === total - 1 ? 0.4 : 1 }} aria-label={t.crm.mediaDown}>↓</button>
        <button type="button" onClick={onRemove} style={{ ...smallBtnStyle, flex: 1, color: '#9b4e43' }}>{t.crm.mediaRemove}</button>
      </div>
    </div>
  )

  return (
    <div style={{ border: '1px solid #e5dfd3', borderRadius: 12, background: '#fff', padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
          {t.crm.complexMediaTitle}: {name || '…'}
        </strong>
        <button type="button" onClick={onClose} style={smallBtnStyle}>{t.crm.devClose}</button>
      </div>
      <p style={{ margin: '0 0 14px', color: '#817b70', fontSize: 10.5, lineHeight: 1.5, maxWidth: 760 }}>
        {t.crm.complexMediaHint}
      </p>

      {loading ? (
        <p style={{ color: '#817b70', fontSize: 12 }}>{t.crm.complexLoading}</p>
      ) : loadError ? (
        <p style={{ color: '#b4552f', fontSize: 12 }}>{loadError}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Название и адрес комплекса */}
          <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>
              {t.crm.devComplexName}
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.devComplexLocality}
              <input value={locality} onChange={(e) => setLocality(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.devComplexStreet}
              <input value={street} onChange={(e) => setStreet(e.target.value)} style={inputStyle} />
            </label>
          </div>

          {/* Статус загрузки и ошибки — общие для всех секций */}
          {(busy || uploadError) && (
            <div style={{ fontSize: 10.5, color: uploadError ? '#b4552f' : '#8b683f' }}>
              {uploadError || `${busy}…`}
            </div>
          )}

          {/* ── Планировки ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.planningsTitle}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={uploadLabelStyle}>
                  {t.crm.mediaUpload}
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" style={{ display: 'none' }}
                    onChange={(e) => pickFiles(e, 'auto', (docs) => setPlannings((prev) => [
                      ...prev,
                      // Каждый загруженный файл — новая строка планировки: подписи
                      // (название, комнаты, площадь, корпус) заполняют рядом
                      ...docs.map((d) => ({ key: nextKey(), file: d, name: '', rooms: '', area: '', building: '' })),
                    ]))}
                  />
                </label>
                <button type="button" onClick={addPlanning} style={smallBtnStyle}>+ {t.crm.planningAdd}</button>
              </div>
            </div>
            <p style={{ margin: '6px 0 12px', color: '#9b958a', fontSize: 10 }}>{t.crm.planningsHint}</p>
            {plannings.length === 0 && <p style={{ color: '#9b958a', fontSize: 11, margin: 0 }}>{t.crm.planningEmpty}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {plannings.map((p, i) => (
                <div key={p.key} style={{ border: '1px solid #eee9e1', borderRadius: 9, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.file?.url && !isPdf(p.file) ? (
                      <img src={p.file.url} alt="" style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5dfd3' }} />
                    ) : (
                      <span style={{ width: 84, height: 64, display: 'grid', placeItems: 'center', background: '#faf7f2', border: '1px solid #e5dfd3', borderRadius: 6, color: '#9b958a', fontSize: 10 }}>
                        {p.file ? (isPdf(p.file) ? t.crm.planningPdf : '—') : t.crm.planningNoFile}
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label style={uploadLabelStyle}>
                        {p.file ? t.crm.mediaReplace : t.crm.mediaUpload}
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" style={{ display: 'none' }}
                          onChange={(e) => pickFiles(e, 'auto', (docs) => docs[0] && patchPlanning(p.key, { file: docs[0] }))}
                        />
                      </label>
                      <button type="button" disabled={i === 0} onClick={() => setPlannings((prev) => move(prev, i, i - 1))} style={{ ...smallBtnStyle, opacity: i === 0 ? 0.4 : 1 }} aria-label={t.crm.mediaUp}>↑</button>
                      <button type="button" disabled={i === plannings.length - 1} onClick={() => setPlannings((prev) => move(prev, i, i + 1))} style={{ ...smallBtnStyle, opacity: i === plannings.length - 1 ? 0.4 : 1 }} aria-label={t.crm.mediaDown}>↓</button>
                      <button type="button" onClick={() => removePlanning(p.key)} style={{ ...smallBtnStyle, color: '#9b4e43' }}>{t.crm.mediaRemove}</button>
                    </div>
                  </div>
                  <label style={labelStyle}>
                    {t.crm.planningName}
                    <input value={p.name} placeholder={t.crm.planningNamePh} onChange={(e) => patchPlanning(p.key, { name: e.target.value })} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {t.crm.planningRooms}
                    <input value={p.rooms} placeholder={t.crm.planningRoomsPh} onChange={(e) => patchPlanning(p.key, { rooms: e.target.value })} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {t.crm.planningArea}
                    <input inputMode="decimal" value={p.area} onChange={(e) => patchPlanning(p.key, { area: e.target.value })} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {t.crm.planningBuilding}
                    <input value={p.building} placeholder={t.crm.planningBuildingPh} onChange={(e) => patchPlanning(p.key, { building: e.target.value })} style={inputStyle} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* ── Паркинг ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.parkingTitle}</div>
              <label style={uploadLabelStyle}>
                {t.crm.mediaUpload}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={(e) => pickFiles(e, 'image', patchGroupPhotos(setParking))}
                />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>
              {t.crm.mediaDescription}
              <textarea rows={2} value={parking.description} placeholder={t.crm.parkingDescriptionPh} onChange={(e) => setParking((prev) => ({ ...prev, description: e.target.value }))} style={inputStyle} />
            </label>
            {parking.photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
                {parking.photos.map((photo, i) => (
                  <PhotoTile key={photo.id} photo={photo} index={i} total={parking.photos.length}
                    onMove={(from, to) => setParking((prev) => ({ ...prev, photos: move(prev.photos, from, to) }))}
                    onRemove={() => setParking((prev) => ({ ...prev, photos: prev.photos.filter((_, idx) => idx !== i) }))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Кладовые ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.storeroomsTitle}</div>
              <label style={uploadLabelStyle}>
                {t.crm.mediaUpload}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={(e) => pickFiles(e, 'image', patchGroupPhotos(setStorerooms))}
                />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>
              {t.crm.mediaDescription}
              <textarea rows={2} value={storerooms.description} placeholder={t.crm.storeroomsDescriptionPh} onChange={(e) => setStorerooms((prev) => ({ ...prev, description: e.target.value }))} style={inputStyle} />
            </label>
            {storerooms.photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
                {storerooms.photos.map((photo, i) => (
                  <PhotoTile key={photo.id} photo={photo} index={i} total={storerooms.photos.length}
                    onMove={(from, to) => setStorerooms((prev) => ({ ...prev, photos: move(prev.photos, from, to) }))}
                    onRemove={() => setStorerooms((prev) => ({ ...prev, photos: prev.photos.filter((_, idx) => idx !== i) }))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Галерея ЖК ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.galleryTitle}</div>
              <label style={uploadLabelStyle}>
                {t.crm.mediaUpload}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={(e) => pickFiles(e, 'image', (docs) => setGallery((prev) => [...prev, ...docs.map((d) => ({ key: nextKey(), photo: d, isMain: false }))]))}
                />
              </label>
            </div>
            <p style={{ margin: '6px 0 0', color: '#9b958a', fontSize: 10 }}>{t.crm.galleryHint}</p>
            {gallery.length === 0 && <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.galleryEmpty}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
              {gallery.map((g, i) => (
                <div key={g.key} style={{ border: g.isMain ? '2px solid #a7814e' : '1px solid #e2dacd', borderRadius: 9, background: '#fff', padding: 7 }}>
                  {g.photo.url ? (
                    <img src={g.photo.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '4/3', background: '#faf7f2', borderRadius: 6 }} />
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {g.isMain ? (
                      <span style={{ flex: 1, textAlign: 'center', background: '#a7814e', color: '#fff', borderRadius: 5, padding: '7px 4px', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {t.crm.galleryMain}
                      </span>
                    ) : (
                      <button type="button" onClick={() => setGalleryMain(g.key)} style={{ ...smallBtnStyle, flex: 1 }}>{t.crm.galleryMakeMain}</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button type="button" disabled={i === 0} onClick={() => setGallery((prev) => move(prev, i, i - 1))} style={{ ...smallBtnStyle, flex: 'none', opacity: i === 0 ? 0.4 : 1 }} aria-label={t.crm.mediaUp}>↑</button>
                    <button type="button" disabled={i === gallery.length - 1} onClick={() => setGallery((prev) => move(prev, i, i + 1))} style={{ ...smallBtnStyle, flex: 'none', opacity: i === gallery.length - 1 ? 0.4 : 1 }} aria-label={t.crm.mediaDown}>↓</button>
                    <button type="button" onClick={() => setGallery((prev) => prev.filter((_, idx) => idx !== i))} style={{ ...smallBtnStyle, flex: 1, color: '#9b4e43' }}>{t.crm.mediaRemove}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Презентация ЖК ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.presentationTitle}</div>
              <label style={uploadLabelStyle}>
                {presentation ? t.crm.presentationReplace : t.crm.presentationUpload}
                <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={(e) => pickFiles(e, 'pdf', (docs) => docs[0] && setPresentation(docs[0]))}
                />
              </label>
            </div>
            <p style={{ margin: '6px 0 8px', color: '#9b958a', fontSize: 10 }}>{t.crm.presentationHint}</p>
            {presentation ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#25241f' }}>
                <span>{presentation.filename || t.crm.planningPdf}</span>
                {presentation.url && (
                  <a href={presentation.url} target="_blank" rel="noopener noreferrer" style={{ color: '#927046' }}>{t.crm.presentationOpen}</a>
                )}
                <button type="button" onClick={() => setPresentation(null)} style={{ ...smallBtnStyle, color: '#9b4e43' }}>{t.crm.mediaRemove}</button>
              </div>
            ) : (
              <p style={{ color: '#9b958a', fontSize: 11, margin: 0 }}>{t.crm.presentationEmpty}</p>
            )}
          </div>

          {/* ── Фотоотчёты строительства ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.photoReportsTitle}</div>
              <button type="button" onClick={addReport} style={smallBtnStyle}>+ {t.crm.photoReportAdd}</button>
            </div>
            {reports.length === 0 && <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.photoReportEmpty}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              {reports.map((r, i) => (
                <div key={r.key} style={{ border: '1px solid #eee9e1', borderRadius: 9, padding: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={labelStyle}>
                      {t.crm.photoReportDate}
                      <input type="date" value={r.date} onChange={(e) => patchReport(r.key, { date: e.target.value })} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      {t.crm.photoReportStage}
                      <input value={r.stage} placeholder={t.crm.photoReportStagePh} onChange={(e) => patchReport(r.key, { stage: e.target.value })} style={inputStyle} />
                    </label>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <label style={uploadLabelStyle}>
                        {t.crm.mediaUpload}
                        <input type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                          onChange={(e) => pickFiles(e, 'image', (docs) => patchReport(r.key, { photos: [...r.photos, ...docs] }))}
                        />
                      </label>
                      <button type="button" disabled={i === 0} onClick={() => setReports((prev) => move(prev, i, i - 1))} style={{ ...smallBtnStyle, opacity: i === 0 ? 0.4 : 1 }} aria-label={t.crm.mediaUp}>↑</button>
                      <button type="button" disabled={i === reports.length - 1} onClick={() => setReports((prev) => move(prev, i, i + 1))} style={{ ...smallBtnStyle, opacity: i === reports.length - 1 ? 0.4 : 1 }} aria-label={t.crm.mediaDown}>↓</button>
                      <button type="button" onClick={() => removeReport(r.key)} style={{ ...smallBtnStyle, color: '#9b4e43' }}>{t.crm.mediaRemove}</button>
                    </div>
                  </div>
                  {r.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 10 }}>
                      {r.photos.map((photo, pi) => (
                        <PhotoTile key={photo.id} photo={photo} index={pi} total={r.photos.length}
                          onMove={(from, to) => patchReport(r.key, { photos: move(r.photos, from, to) })}
                          onRemove={() => patchReport(r.key, { photos: r.photos.filter((_, idx) => idx !== pi) })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Панель сохранения */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void save()} disabled={saving || loading || !!loadError} style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}>
          {saving ? t.crm.devSaving : t.crm.complexSave}
        </button>
        {saveError && <span style={{ color: '#b4552f', fontSize: 11 }}>{saveError}</span>}
        {savedNote && <span style={{ color: '#5b7a4e', fontSize: 11 }}>{savedNote}</span>}
      </div>
    </div>
  )
}

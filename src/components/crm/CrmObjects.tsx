'use client'

import { useCallback, useEffect, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'

interface ObjectRow {
  id: number
  title: string
  category: string
  price: number | null
  status: string
  agentName?: string
  thumb?: string
}

interface PhotoItem {
  id: number | null
  url?: string
}

const emptyForm = {
  title: '', type: 'sale', category: 'apartment', price: '', area: '', livingArea: '',
  kitchenArea: '', rooms: '', floor: '', totalFloors: '', buildingType: '', condition: '',
  heating: '', balcony: '', water: '', sewerage: '', electricity: '', gas: '', internet: '',
  city: 'Владикавказ', district: '', street: '', house: '', apartment: '',
  lat: '', lng: '', description: '', status: 'draft', agent: '',
}

type FormState = typeof emptyForm

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7,
  background: 'white', color: '#25241f', padding: 12, font: '12px Arial, Helvetica, sans-serif',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {label}{children}
    </label>
  )
}

export const CrmObjects: FC<{ t: Dict; isAdmin: boolean }> = ({ t, isAdmin }) => {
  const [rows, setRows] = useState<ObjectRow[]>([])
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [features, setFeatures] = useState<string[]>([])
  const [featureInput, setFeatureInput] = useState('')
  // Перетаскивание фото для смены порядка
  const [dragPhotoIdx, setDragPhotoIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    const [objectsRes, agentsRes] = await Promise.all([
      fetch('/api/objects?limit=100&depth=1', { credentials: 'include' }),
      fetch('/api/agents?limit=100', { credentials: 'include' }),
    ])
    const objectsData = await objectsRes.json()
    const agentsData = await agentsRes.json()
    setRows(
      ((objectsData.docs || []) as Record<string, unknown>[]).map((o) => {
        const img = o.primaryImage as { url?: string } | undefined
        const agent = o.agent as { name?: string } | undefined
        return {
          id: o.id as number,
          title: o.title as string,
          category: o.category as string,
          price: o.price as number | null,
          status: o.status as string,
          agentName: agent?.name,
          thumb: img?.url,
        }
      }),
    )
    setAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name })))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled) return
      await load()
    }
    void tick()
    return () => { cancelled = true }
  }, [load])

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setPhotos([])
    setFeatures([])
    setSaveError('')
  }

  const startEdit = (o: Record<string, unknown>) => {
    setModalOpen(true)
    setSaveError('')
    const addr = o.address as Record<string, unknown> | undefined
    const coords = o.coordinates as Record<string, unknown> | undefined
    const agentRel = o.agent as Record<string, unknown> | undefined
    setEditId(o.id as number)
    setForm({
      ...emptyForm,
      title: (o.title as string) || '',
      type: (o.type as string) || 'sale',
      category: (o.category as string) || 'apartment',
      price: o.price != null ? String(o.price) : '',
      area: o.area != null ? String(o.area) : '',
      livingArea: o.livingArea != null ? String(o.livingArea) : '',
      kitchenArea: o.kitchenArea != null ? String(o.kitchenArea) : '',
      rooms: o.rooms != null ? String(o.rooms) : '',
      floor: o.floor != null ? String(o.floor) : '',
      totalFloors: o.totalFloors != null ? String(o.totalFloors) : '',
      buildingType: (o.buildingType as string) || '',
      condition: (o.condition as string) || '',
      heating: (o.heating as string) || '',
      balcony: (o.balcony as string) || '',
      water: (o.water as string) || '',
      sewerage: (o.sewerage as string) || '',
      electricity: (o.electricity as string) || '',
      gas: (o.gas as string) || '',
      internet: (o.internet as string) || '',
      city: (addr?.city as string) || 'Владикавказ',
      district: (addr?.district as string) || '',
      street: (addr?.street as string) || '',
      house: (addr?.house as string) || '',
      apartment: (addr?.apartment as string) || '',
      lat: coords?.lat != null ? String(coords.lat) : '',
      lng: coords?.lng != null ? String(coords.lng) : '',
      description: '',
      status: (o.status as string) || 'draft',
      agent: agentRel?.id != null ? String(agentRel.id) : '',
    })
    const img = o.primaryImage as { id?: number; url?: string } | undefined
    const imgs = (o.images as { id?: number; url?: string }[] | undefined) || []
    const all: PhotoItem[] = []
    if (img?.id) all.push({ id: img.id as number, url: img.url })
    for (const i of imgs) {
      if (i.id && !all.some((p) => p.id === i.id)) all.push({ id: i.id as number, url: i.url })
    }
    setPhotos(all)
    setFeatures(((o.features as { feature?: string }[] | undefined) || []).map((f) => f.feature || '').filter(Boolean))
    const rt = o.description as { root?: { children?: { children?: { text?: string }[] }[] } } | undefined
    const descText = (rt?.root?.children || []).map((p) => (p.children || []).map((c) => c.text || '').join('')).filter(Boolean).join('\n')
    setForm((prev) => ({ ...prev, description: descText }))
  }

  const onPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      // Накладываем водяной знак (левый верхний угол с отступом) до загрузки
      const watermarked = await applyWatermark(file)
      if (!watermarked) continue
      const fd = new FormData()
      fd.append('file', watermarked, file.name)
      const res = await fetch('/api/media', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) continue
      const data = await res.json()
      const doc = data.doc as { id?: number; url?: string } | undefined
      if (doc?.id) {
        setPhotos((prev) => [...prev, { id: doc.id as number, url: doc.url }])
      }
    }
    e.target.value = ''
  }

  // Водяной знак: рисуем фото на canvas и поверх — watermark.png в левом верхнем
  // углу с отступом ~3% ширины; размер знака ~28% ширины фото
  const applyWatermark = (file: File): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const wm = new Image()
        wm.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
          ctx.drawImage(img, 0, 0)
          const wmW = Math.round(canvas.width * 0.28)
          const wmH = Math.round(wmW * (wm.naturalHeight / wm.naturalWidth))
          const margin = Math.round(canvas.width * 0.03)
          ctx.drawImage(wm, margin, margin, wmW, wmH)
          canvas.toBlob(
            (blob) => resolve(blob),
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            0.92,
          )
        }
        wm.onerror = () => resolve(null)
        wm.src = '/img/watermark.png'
      }
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(file)
    })
  }

  const makeCover = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.unshift(item)
      return next
    })
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const movePhoto = (from: number, to: number) => {
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const save = async () => {
    if (saving || !form.title.trim()) return
    if (!form.price) {
      setSaveError(t.crm.objPriceRequired)
      return
    }
    setSaving(true)
    setSaveError('')
    const mediaIds = photos.map((p) => p.id).filter((id): id is number => id !== null)
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      category: form.category,
      price: form.price ? Number(form.price) : undefined,
      area: form.area ? Number(form.area) : undefined,
      livingArea: form.livingArea ? Number(form.livingArea) : undefined,
      kitchenArea: form.kitchenArea ? Number(form.kitchenArea) : undefined,
      rooms: form.rooms ? Number(form.rooms) : undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      totalFloors: form.totalFloors ? Number(form.totalFloors) : undefined,
      buildingType: form.buildingType || undefined,
      condition: form.condition || undefined,
      heating: form.heating || undefined,
      balcony: form.balcony || undefined,
      water: form.water || undefined,
      sewerage: form.sewerage || undefined,
      electricity: form.electricity || undefined,
      gas: form.gas || undefined,
      internet: form.internet || undefined,
      address: {
        city: form.city,
        district: form.district,
        street: form.street,
        house: form.house,
        apartment: form.apartment,
      },
      coordinates: form.lat || form.lng ? { lat: Number(form.lat) || undefined, lng: Number(form.lng) || undefined } : undefined,
      description: form.description.trim()
        ? { root: { children: [{ children: [{ text: form.description.trim(), type: 'text', version: 1 }], type: 'paragraph', version: 1 }], type: 'root', version: 1 } }
        : undefined,
      features: features.map((feature) => ({ feature })),
      status: form.status,
      agent: form.agent ? Number(form.agent) : undefined,
      primaryImage: mediaIds[0],
      images: mediaIds.slice(1),
    }

    const res = await fetch(editId ? `/api/objects/${editId}` : '/api/objects', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      resetForm()
      setModalOpen(false)
      await load()
    } else {
      // Показываем причину ошибки — раньше неудача была безмолвной
      const errData = await res.json().catch(() => null) as { errors?: { message?: string }[] } | null
      const serverMsg = errData?.errors?.[0]?.message
      setSaveError(serverMsg ? `${t.crm.objSaveError} (${serverMsg})` : t.crm.objSaveError)
    }
  }

  const remove = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm(t.crm.objDeleteConfirm)) return
    await fetch(`/api/objects/${id}`, { method: 'DELETE', credentials: 'include' })
    await load()
  }

  const set = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  return (
    <div>
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
          <Field label={t.crm.objTitle}><input value={form.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objType}>
            <select value={form.type} onChange={(e) => set('type', e.target.value)} style={inputStyle}>
              <option value="sale">Продажа</option><option value="rent">Аренда</option>
            </select>
          </Field>
          <Field label={t.crm.objCategory}>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} style={inputStyle}>
              <option value="apartment">Квартира</option><option value="house">Дом</option><option value="townhouse">Таунхаус</option><option value="commercial">Коммерческая</option><option value="land">Участок</option>
            </select>
          </Field>
          <Field label={t.crm.objPrice}><input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objArea}><input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objLivingArea}><input type="number" value={form.livingArea} onChange={(e) => set('livingArea', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objKitchenArea}><input type="number" value={form.kitchenArea} onChange={(e) => set('kitchenArea', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objRooms}><input type="number" value={form.rooms} onChange={(e) => set('rooms', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objFloor}><input type="number" value={form.floor} onChange={(e) => set('floor', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objTotalFloors}><input type="number" value={form.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objBuildingType}>
            <input value={form.buildingType} onChange={(e) => set('buildingType', e.target.value)} style={inputStyle} list="crm-building-type" />
          </Field>
          <Field label={t.crm.objCondition}>
            <input value={form.condition} onChange={(e) => set('condition', e.target.value)} style={inputStyle} list="crm-condition" />
          </Field>
          <Field label={t.crm.objHeating}>
            <input value={form.heating} onChange={(e) => set('heating', e.target.value)} style={inputStyle} list="crm-heating" />
          </Field>
          <Field label={t.crm.objBalcony}>
            <input value={form.balcony} onChange={(e) => set('balcony', e.target.value)} style={inputStyle} list="crm-balcony" />
          </Field>
          <Field label={t.crm.objWater}>
            <input value={form.water} onChange={(e) => set('water', e.target.value)} style={inputStyle} list="crm-water" />
          </Field>
          <Field label={t.crm.objSewerage}>
            <input value={form.sewerage} onChange={(e) => set('sewerage', e.target.value)} style={inputStyle} list="crm-sewerage" />
          </Field>
          <Field label={t.crm.objElectricity}>
            <input value={form.electricity} onChange={(e) => set('electricity', e.target.value)} style={inputStyle} list="crm-electricity" />
          </Field>
          <Field label={t.crm.objGas}>
            <input value={form.gas} onChange={(e) => set('gas', e.target.value)} style={inputStyle} list="crm-gas" />
          </Field>
          <Field label={t.crm.objInternet}>
            <input value={form.internet} onChange={(e) => set('internet', e.target.value)} style={inputStyle} list="crm-internet" />
          </Field>

          <datalist id="crm-building-type">
            <option value="Кирпичный" /><option value="Монолитный" /><option value="Панельный" />
          </datalist>
          <datalist id="crm-condition">
            <option value="Новое" /><option value="Хорошее" /><option value="Требует ремонта" />
          </datalist>
          <datalist id="crm-heating">
            <option value="Центральное" /><option value="Автономное" /><option value="Газовое" />
          </datalist>
          <datalist id="crm-balcony">
            <option value="Есть" /><option value="Лоджия" /><option value="Несколько" />
          </datalist>
          <datalist id="crm-water">
            <option value="Есть" /><option value="Центральная" /><option value="Своя" />
          </datalist>
          <datalist id="crm-sewerage">
            <option value="Есть" /><option value="Центральная" /><option value="Септик" />
          </datalist>
          <datalist id="crm-electricity">
            <option value="Есть" /><option value="Нет" />
          </datalist>
          <datalist id="crm-gas">
            <option value="Есть" /><option value="Магистральный" /><option value="Баллонный" />
          </datalist>
          <datalist id="crm-internet">
            <option value="Есть" /><option value="Нет" />
          </datalist>

          <div className="span-2" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
            <Field label={t.crm.objCity}><input value={form.city} onChange={(e) => set('city', e.target.value)} style={inputStyle} /></Field>
            <Field label={t.crm.objDistrict}><input value={form.district} onChange={(e) => set('district', e.target.value)} style={inputStyle} /></Field>
            <Field label={t.crm.objStreet}><input value={form.street} onChange={(e) => set('street', e.target.value)} style={inputStyle} /></Field>
            <Field label={t.crm.objHouse}><input value={form.house} onChange={(e) => set('house', e.target.value)} style={inputStyle} /></Field>
            <Field label={t.crm.objApartment}><input value={form.apartment} onChange={(e) => set('apartment', e.target.value)} style={inputStyle} /></Field>
          </div>
          <Field label={t.crm.objLat}><input value={form.lat} onChange={(e) => set('lat', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objLng}><input value={form.lng} onChange={(e) => set('lng', e.target.value)} style={inputStyle} /></Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objDescription}>
              <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objFeatures}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => { if (featureInput.trim()) { setFeatures((prev) => [...prev, featureInput.trim()]); setFeatureInput('') } }} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                  {t.crm.objFeatureAdd}
                </button>
              </div>
              {features.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {features.map((f, i) => (
                    <span key={`${f}-${i}`} style={{ padding: '6px 10px', background: '#f2ede4', borderRadius: 999, fontSize: 11, color: '#716b62', cursor: 'pointer' }} onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))}>
                      {f} ✕
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <Field label={t.crm.objStatus}>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
              <option value="draft">{t.crm.statusDraft}</option>
              <option value="published">{t.crm.statusPublished}</option>
              <option value="archived">{t.crm.statusArchived}</option>
            </select>
          </Field>
          <Field label={t.crm.objAgent}>
            <select value={form.agent} onChange={(e) => set('agent', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-gallery-field">
              <div className="crm-gallery-heading">
                <div>
                  <strong>{t.crm.objPhotos}</strong>
                  <small>{t.crm.objPhotosHint}</small>
                  <small style={{ display: 'block', marginTop: 4 }}>{t.crm.objPhotosOrder}</small>
                </div>
                <label className="crm-photo-picker" style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px dashed #cbbda9', borderRadius: 9, background: '#fcfaf7', cursor: 'pointer', padding: 16 }}>
                  <span>{t.crm.objPhotoPick}</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => void onPhotoPick(e)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                </label>
              </div>
              {photos.length ? (
                <div className="crm-photo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10 }}>
                  {photos.map((p, i) => (
                    <div
                      key={p.id ?? `new-${i}`}
                      className="crm-photo"
                      draggable={photos.length > 1}
                      onDragStart={(e) => { setDragPhotoIdx(i); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i) }}
                      onDrop={() => {
                        if (dragPhotoIdx !== null && dragPhotoIdx !== i) {
                          movePhoto(dragPhotoIdx, i)
                        }
                        setDragPhotoIdx(null)
                        setDragOverIdx(null)
                      }}
                      onDragEnd={() => { setDragPhotoIdx(null); setDragOverIdx(null) }}
                      style={{
                        padding: 7, border: '1px solid #e2dacd', borderRadius: 9, background: 'white',
                        cursor: photos.length > 1 ? 'grab' : 'default',
                        outline: dragOverIdx === i && dragPhotoIdx !== null ? '2px dashed #b68a51' : 'none',
                        opacity: dragPhotoIdx === i ? 0.45 : 1,
                        transition: 'opacity .15s',
                      }}
                    >
                      <img src={p.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6, pointerEvents: 'none' }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'stretch' }}>
                        {i === 0 ? (
                          <b style={{ flex: 1, textAlign: 'center', background: '#a7814e', color: 'white', borderRadius: 5, padding: '7px 4px', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.07em' }}>Обложка</b>
                        ) : (
                          <button type="button" onClick={() => makeCover(i)} style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: 7, fontSize: 8, cursor: 'pointer' }} title={t.crm.objPhotoCover}>{t.crm.objPhotoCover}</button>
                        )}
                        {i > 0 && (
                          <button type="button" onClick={() => movePhoto(i, i - 1)} aria-label="↑" style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>↑</button>
                        )}
                        {i < photos.length - 1 && (
                          <button type="button" onClick={() => movePhoto(i, i + 1)} aria-label="↓" style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>↓</button>
                        )}
                        <button type="button" onClick={() => removePhoto(i)} aria-label={t.crm.objPhotoRemove} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#9b4e43', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9b958a', fontSize: 11 }}>{t.crm.objNoPhotos}</p>
              )}
            </div>
          </div>

          <div className="span-2 crm-form-actions" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button type="button" onClick={() => void save()} disabled={saving} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '14px 22px', textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, cursor: 'pointer' }}>
              {saving ? t.crm.objSaving : editId ? t.crm.objEdit : t.crm.objAdd}
            </button>
            {saved && <p style={{ margin: 0, color: '#8b683f', fontSize: 11 }}>{t.crm.objSaved} ✓</p>}
            {saveError && <p style={{ margin: 0, color: '#9b4e43', fontSize: 11 }}>{saveError}</p>}
          </div>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: '0 0 14px' }}>{t.crm.objEmpty}</p>
          <button type="button" onClick={() => { resetForm(); setModalOpen(true) }}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
            + {t.crm.objAdd}
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState, type ChangeEvent, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, photoSizeLabel, isAllowedPhoto } from '@/lib/photo-rules'
import { COMMERCIAL_TYPES } from '@/lib/commercial-types'
import { PURCHASE_OPTIONS, isPurchaseOption, type PurchaseOption } from '@/lib/purchase-options'
import { UNIT_STATUSES, isUnitCategory, type UnitCategory } from '@/lib/complex-units'

/**
 * «Машино-места и коммерческие помещения» — раздел карточки ЖК в CRM
 * (см. ComplexMediaEditor.tsx, где он встроен, и CrmDevelopers.tsx).
 *
 * Каждый объект сохраняется как обычная карточка коллекции objects с
 * привязкой к этому комплексу и его застройщику (поля complex и developer):
 * так машино-место или помещение попадает в общую подборку застройщика и
 * каталог без второй сущности-дубля. Характеристики переиспользуют поля
 * объекта — название (title), площадь (area), цена (price), варианты покупки
 * (purchaseOptions), фотографии (images) и планировка (floorPlan); отдельно
 * заведены только статус готовности (unitStatus) и условия оплаты
 * (paymentTerms), см. src/lib/complex-units.ts и Objects.ts.
 *
 * Данные читаются REST-ом Payload: список — фильтром по комплексу, запись —
 * POST/PATCH в /api/objects. Карточки заводит администратор: раздел ЖК ему и
 * так доступен (см. /crm/developers), а объекты создаются как объекты офиса
 * Н15 (ownership=office) — без личного ответственного агента.
 */

/** Ссылка на медиа из ответа Payload: объект { id, url } или число-id */
interface MediaLike {
  id: number
  url: string
  filename: string
  mimeType: string
}

/** Объект новостройки в списке комплекса */
interface UnitRow {
  id: number
  title: string
  category: UnitCategory
  commercialType: string
  price: number | null
  area: number | null
  unitStatus: string
  paymentTerms: string
  purchaseOptions: PurchaseOption[]
  images: MediaLike[]
  floorPlan: MediaLike | null
}

/** Состояние формы объекта: как в списке, но поля — строки для ввода */
interface UnitForm {
  kind: UnitCategory
  commercialType: string
  title: string
  area: string
  price: string
  unitStatus: string
  payments: Record<'cash' | 'installment' | 'mortgage', boolean>
  // Прочие варианты покупки (семейная/военная ипотека, маткапитал), если их
  // отметили в общей форме объекта: здесь их не показываем, но при
  // сохранении не теряем
  extraPayments: PurchaseOption[]
  paymentTerms: string
  images: MediaLike[]
  floorPlan: MediaLike | null
}

// Способы оплаты объекта в форме: коды те же, что в общих вариантах покупки
// (purchaseOptions) — «ипотека», «рассрочка», «наличные». Порядок фиксирован,
// чтобы список кодов в теле запроса не гулял
const PAYMENT_FIELDS = [
  { field: 'mortgage', code: 'mortgage' },
  { field: 'installment', code: 'installment' },
  { field: 'cash', code: 'cash' },
] as const

const emptyForm = (kind: UnitCategory): UnitForm => ({
  kind,
  commercialType: '',
  title: '',
  area: '',
  price: '',
  unitStatus: 'available',
  payments: { cash: true, installment: false, mortgage: false },
  extraPayments: [],
  paymentTerms: '',
  images: [],
  floorPlan: null,
})

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

const PHOTO_FORMATS = 'image/jpeg,image/png,image/webp'

/** Цена/площадь из JSON — числом, если значение задано */
const numOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Число из поля ввода: пусто — null, иначе число (запятая как разделитель) */
const parseNum = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Подпись варианта покупки для CRM — из общего справочника */
const purchaseLabel = (code: string): string => PURCHASE_OPTIONS.find((o) => o.value === code)?.label || code

interface Props {
  complexId: number
  /** Застройщик комплекса — без него объект к ЖК не привязать */
  developerId: number | null
  t: Dict
  /** Сохранение/удаление меняет подборку объектов застройщика — сообщаем наверх */
  onChanged?: () => void
}

export const ComplexUnitsEditor: FC<Props> = ({ complexId, developerId, t, onChanged }) => {
  const [units, setUnits] = useState<UnitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // null — форма закрыта, { id: null } — новый объект, { id } — правка
  const [editor, setEditor] = useState<{ id: number | null } | null>(null)
  const [form, setForm] = useState<UnitForm>(emptyForm('garage'))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [note, setNote] = useState('')

  const [busy, setBusy] = useState('')
  const [uploadError, setUploadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/objects?where[complex][equals]=${complexId}&limit=200&depth=1&sort=-createdAt`,
        { credentials: 'include' },
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { docs?: Record<string, unknown>[] }
      setUnits(
        (data.docs || []).flatMap((doc) => {
          // Показываем только объекты новостройки: категория гараж или
          // коммерческая (см. src/lib/complex-units.ts). Прочие объекты ЖК
          // (квартиры) ведёт общая форма объекта
          if (!isUnitCategory(doc.category)) return []
          return [{
            id: Number(doc.id),
            title: String(doc.title || ''),
            category: doc.category,
            commercialType: String(doc.commercialType || ''),
            price: numOrNull(doc.price),
            area: numOrNull(doc.area),
            unitStatus: String(doc.unitStatus || ''),
            paymentTerms: String(doc.paymentTerms || ''),
            purchaseOptions: ((doc.purchaseOptions as unknown[] | undefined) || []).filter(isPurchaseOption),
            images: mediaList(doc.images),
            floorPlan: mediaRef(doc.floorPlan),
          }]
        }),
      )
      setLoadError('')
    } catch {
      setLoadError(t.crm.unitsLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [complexId, t])

  useEffect(() => {
    // Отложенный запуск — как в ComplexMediaEditor: setState не должен быть
    // синхронно достижим из тела эффекта (правило react-hooks/set-state-in-effect)
    void Promise.resolve().then(() => load())
  }, [load])

  const openNew = (kind: UnitCategory) => {
    setEditor({ id: null })
    setForm(emptyForm(kind))
    setSaveError('')
    setNote('')
    setUploadError('')
  }

  const openEdit = (u: UnitRow) => {
    setEditor({ id: u.id })
    setForm({
      kind: u.category,
      commercialType: u.commercialType,
      title: u.title,
      area: u.area != null ? String(u.area) : '',
      price: u.price != null ? String(u.price) : '',
      unitStatus: u.unitStatus,
      payments: {
        cash: u.purchaseOptions.includes('cash'),
        installment: u.purchaseOptions.includes('installment'),
        mortgage: u.purchaseOptions.includes('mortgage'),
      },
      extraPayments: u.purchaseOptions.filter((o) => o !== 'cash' && o !== 'installment' && o !== 'mortgage'),
      paymentTerms: u.paymentTerms,
      images: u.images,
      floorPlan: u.floorPlan,
    })
    setSaveError('')
    setNote('')
    setUploadError('')
  }

  const close = () => {
    setEditor(null)
    setSaveError('')
    setUploadError('')
  }

  /** Отправка одного файла в медиахранилище (знак «Н15» ставит хук media) */
  const uploadFile = useCallback(async (file: File): Promise<MediaLike | null> => {
    if (!isAllowedPhoto({ name: file.name, type: file.type })) {
      setUploadError(t.crm.mediaUploadBadType)
      return null
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setUploadError(`${t.crm.mediaUploadTooBig} ${photoSizeLabel(file.size)} — ${PHOTO_MAX_LABEL}`)
      return null
    }
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/crm/upload', { method: 'POST', body: fd, credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { doc?: Record<string, unknown> } | null
      const doc = mediaRef(data?.doc)
      if (!res.ok || !doc) {
        setUploadError(res.status === 401 ? t.crm.objUploadSession : t.crm.mediaUploadFailed)
        return null
      }
      return doc
    } catch {
      setUploadError(t.crm.mediaUploadFailed)
      return null
    }
  }, [t])

  /** Загрузка пачки фото: по одному — десяток разом ест память контейнера */
  const pickPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploadError('')
    setBusy(t.crm.mediaUpload)
    void (async () => {
      const done: MediaLike[] = []
      for (const file of files) {
        const doc = await uploadFile(file)
        if (doc) done.push(doc)
      }
      if (done.length) setForm((f) => ({ ...f, images: [...f.images, ...done] }))
      setBusy('')
    })()
  }

  const pickFloorPlan = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    setBusy(t.crm.mediaUpload)
    void (async () => {
      const doc = await uploadFile(file)
      if (doc) setForm((f) => ({ ...f, floorPlan: doc }))
      setBusy('')
    })()
  }

  const save = async () => {
    if (!editor || saving) return
    if (!form.title.trim()) {
      setSaveError(t.crm.unitsNameRequired)
      return
    }
    if (parseNum(form.price) == null) {
      setSaveError(t.crm.unitsPriceRequired)
      return
    }
    if (developerId == null) {
      setSaveError(t.crm.unitsSaveFailed)
      return
    }
    setSaving(true)
    setSaveError('')
    setNote('')
    try {
      // Отмеченные здесь способы оплаты + прочие, сохранённые в общей форме.
      // Порядок кодов — как в общем справочнике (purchaseOptions), чтобы
      // список в теле запроса не гулял
      const selectedPayments = new Set<string>([
        ...PAYMENT_FIELDS.filter((p) => form.payments[p.field]).map((p) => p.code),
        ...form.extraPayments,
      ])
      const purchaseOptions = PURCHASE_OPTIONS.map((o) => o.value).filter((v) => selectedPayments.has(v))
      const body = {
        title: form.title.trim(),
        type: 'sale',
        category: form.kind,
        commercialType: form.kind === 'commercial' ? form.commercialType || null : null,
        price: parseNum(form.price),
        area: parseNum(form.area),
        purchaseOptions,
        unitStatus: form.unitStatus || null,
        paymentTerms: form.paymentTerms.trim() || null,
        images: form.images.map((i) => i.id),
        floorPlan: form.floorPlan?.id ?? null,
        // Привязка к ЖК и застройщику (см. validateComplexDeveloper)
        developer: developerId,
        complex: complexId,
        // Объект офиса Н15: личный ответственный агент не нужен
        ownership: 'office',
      }
      const res = await fetch(editor.id ? `/api/objects/${editor.id}` : '/api/objects', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setSaveError(t.crm.unitsSaveFailed)
        return
      }
      await load()
      setEditor(null)
      setNote(t.crm.unitsSaved)
      onChanged?.()
    } catch {
      setSaveError(t.crm.unitsSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u: UnitRow) => {
    if (!window.confirm(t.crm.unitsDeleteConfirm)) return
    try {
      const res = await fetch(`/api/objects/${u.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        setLoadError(t.crm.unitsDeleteFailed)
        return
      }
      setLoadError('')
      await load()
      onChanged?.()
    } catch {
      setLoadError(t.crm.unitsDeleteFailed)
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 15 }}>{t.crm.unitsTitle}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => openNew('garage')} style={smallBtnStyle}>{t.crm.unitsAddParking}</button>
          <button type="button" onClick={() => openNew('commercial')} style={smallBtnStyle}>{t.crm.unitsAddCommercial}</button>
        </div>
      </div>
      <p style={{ margin: '6px 0 12px', color: '#9b958a', fontSize: 10, lineHeight: 1.5 }}>{t.crm.unitsHint}</p>

      {loadError && <p style={{ color: '#b4552f', fontSize: 11, margin: '0 0 10px' }}>{loadError}</p>}

      {loading ? (
        <p style={{ color: '#817b70', fontSize: 11, margin: 0 }}>{t.crm.unitsLoading}</p>
      ) : units.length === 0 ? (
        <p style={{ color: '#9b958a', fontSize: 11, margin: 0 }}>{t.crm.unitsEmpty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {units.map((u) => (
            <div key={u.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, border: '1px solid #eee9e1', borderRadius: 8, padding: '10px 12px' }}>
              {u.images[0]?.url ? (
                <img src={u.images[0].url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', background: '#faf7f2', flex: 'none' }} />
              ) : (
                <span style={{ width: 48, height: 48, borderRadius: 8, background: '#faf7f2', display: 'grid', placeItems: 'center', color: '#9b958a', fontSize: 9, flex: 'none' }}>
                  {u.category === 'garage' ? t.crm.unitsKindParking : t.crm.unitsKindCommercial}
                </span>
              )}
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#25241f' }}>{u.title || '—'}</div>
                <div style={{ marginTop: 2, fontSize: 10, color: '#817b70' }}>
                  {[
                    u.category === 'garage' ? t.crm.unitsKindParking : t.crm.unitsKindCommercial,
                    u.area != null ? `${u.area} м²` : '',
                    u.price != null ? `${u.price.toLocaleString('ru-RU')} ₽` : '',
                  ].filter(Boolean).join(' · ')}
                </div>
                {u.purchaseOptions.length > 0 && (
                  <div style={{ marginTop: 2, fontSize: 10, color: '#8b683f' }}>
                    {u.purchaseOptions.map(purchaseLabel).join(' · ')}
                  </div>
                )}
              </div>
              {u.unitStatus && (
                <span style={{ padding: '3px 9px', borderRadius: 999, background: '#eef3e8', color: '#5b7a4e', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', flex: 'none' }}>
                  {UNIT_STATUSES.find((s) => s.value === u.unitStatus)?.label || u.unitStatus}
                </span>
              )}
              <button type="button" onClick={() => openEdit(u)} style={smallBtnStyle}>{t.crm.unitsEdit}</button>
              <button type="button" onClick={() => void remove(u)} style={{ ...smallBtnStyle, color: '#9b4e43' }}>{t.crm.unitsDelete}</button>
            </div>
          ))}
        </div>
      )}

      {note && <p style={{ margin: '10px 0 0', color: '#5b7a4e', fontSize: 11 }}>{note}</p>}

      {/* Форма объекта: новый или правка выбранного */}
      {editor && (
        <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 16 }}>
              {form.kind === 'garage' ? t.crm.unitsKindParking : t.crm.unitsKindCommercial}
            </strong>
            <button type="button" onClick={close} style={smallBtnStyle}>{t.crm.devClose}</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {!editor.id && (
              <label style={labelStyle}>
                {t.crm.unitsKind}
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as UnitCategory }))} style={inputStyle}>
                  <option value="garage">{t.crm.unitsKindParking}</option>
                  <option value="commercial">{t.crm.unitsKindCommercial}</option>
                </select>
              </label>
            )}
            {form.kind === 'commercial' && (
              <label style={labelStyle}>
                {t.crm.unitsCommercialType}
                <select value={form.commercialType} onChange={(e) => setForm((f) => ({ ...f, commercialType: e.target.value }))} style={inputStyle}>
                  <option value="">{t.crm.unitsStatusEmpty}</option>
                  {COMMERCIAL_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              {t.crm.unitsName}
              <input value={form.title} placeholder={t.crm.unitsNamePh} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.unitsArea}
              <input inputMode="decimal" value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.unitsPrice}
              <input inputMode="numeric" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t.crm.unitsStatus}
              <select value={form.unitStatus} onChange={(e) => setForm((f) => ({ ...f, unitStatus: e.target.value }))} style={inputStyle}>
                <option value="">{t.crm.unitsStatusEmpty}</option>
                {UNIT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Способы и условия оплаты */}
          <div style={{ marginTop: 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>{t.crm.unitsPayments}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {([
                ['cash', t.crm.unitsPaymentCash],
                ['installment', t.crm.unitsPaymentInstallment],
                ['mortgage', t.crm.unitsPaymentMortgage],
              ] as const).map(([field, label]) => (
                <label key={field} style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 9, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 12, color: '#25241f' }}>
                  <input
                    type="checkbox"
                    checked={form.payments[field]}
                    onChange={(e) => setForm((f) => ({ ...f, payments: { ...f.payments, [field]: e.target.checked } }))}
                    style={{ width: 16, height: 16, accentColor: '#a7814e', flex: 'none' }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>
              {t.crm.unitsPaymentTerms}
              <textarea rows={2} value={form.paymentTerms} placeholder={t.crm.unitsPaymentTermsPh} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} style={inputStyle} />
            </label>
          </div>

          {/* Фотографии и планировка */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ ...labelStyle, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: '#25241f' }}>{t.crm.unitsPhotos}</span>
                <label style={uploadLabelStyle}>
                  {t.crm.mediaUpload}
                  <input type="file" multiple accept={PHOTO_FORMATS} style={{ display: 'none' }} onChange={pickPhotos} />
                </label>
              </div>
              {form.images.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 8 }}>
                  {form.images.map((photo, i) => (
                    <div key={photo.id} style={{ border: '1px solid #e2dacd', borderRadius: 8, background: '#fff', padding: 6 }}>
                      {photo.url ? (
                        <img src={photo.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                      ) : (
                        <div style={{ width: '100%', aspectRatio: '4/3', background: '#faf7f2', borderRadius: 6 }} />
                      )}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))} style={{ ...smallBtnStyle, width: '100%', marginTop: 6, color: '#9b4e43' }}>
                        {t.crm.mediaRemove}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ ...labelStyle, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: '#25241f' }}>{t.crm.unitsFloorPlan}</span>
                <span style={{ color: '#9b958a', fontSize: 10 }}>{t.crm.unitsFloorPlanHint}</span>
              </div>
              {form.floorPlan?.url && (
                <img src={form.floorPlan.url} alt="" style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5dfd3' }} />
              )}
              <label style={uploadLabelStyle}>
                {form.floorPlan ? t.crm.mediaReplace : t.crm.mediaUpload}
                <input type="file" accept={PHOTO_FORMATS} style={{ display: 'none' }} onChange={pickFloorPlan} />
              </label>
              {form.floorPlan && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, floorPlan: null }))} style={{ ...smallBtnStyle, color: '#9b4e43' }}>
                  {t.crm.mediaRemove}
                </button>
              )}
            </div>
          </div>

          {(busy || uploadError) && (
            <div style={{ marginTop: 10, fontSize: 10.5, color: uploadError ? '#b4552f' : '#8b683f' }}>
              {uploadError || `${busy}…`}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void save()} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? t.crm.devSaving : t.crm.unitsSave}
            </button>
            <button type="button" onClick={close} style={smallBtnStyle}>{t.crm.devClose}</button>
            {saveError && <span style={{ color: '#b4552f', fontSize: 11 }}>{saveError}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

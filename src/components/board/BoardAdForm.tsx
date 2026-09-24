'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { OBJECT_CATEGORIES, HOUSE_TYPES } from '@/lib/object-categories'
import { COMMERCIAL_TYPES } from '@/lib/commercial-types'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from '@/lib/districts'
import { maskRuPhoneInput } from '@/lib/phone'
import { BOARD_MAX_PHOTOS } from '@/lib/board'

/**
 * Форма подачи объявления на доску (страница /board/new).
 *
 * Объявление уходит multipart-запросом вместе с фотографиями на
 * POST /api/board/ads: сервер проверяет сессию, лимиты, квоту, согласия
 * и файлы, кладёт снимки в закрытое хранилище и создаёт объявление
 * со статусом «На модерации». На сайт оно попадёт только после проверки —
 * об этом прямо сказано и в форме, и в правилах.
 *
 * Два согласия — две отдельные галочки: обработка персональных данных (общая
 * для всех публичных форм сайта, см. ConsentCheckbox) и правила доски. Пока
 * они не отмечены и обязательные поля не заполнены, кнопка неактивна; ту же
 * проверку повторяет маршрут.
 *
 * Телефон идёт через маску (src/lib/phone.ts) — номер сразу виден в том виде,
 * в каком его увидит покупатель по кнопке.
 */

/** Что отправляем: поля объекта, адрес и контакты */
type Form = {
  dealType: string
  category: string
  houseType: string
  commercialType: string
  title: string
  price: string
  area: string
  areaUnit: string
  plotArea: string
  plotAreaUnit: string
  rooms: string
  floor: string
  totalFloors: string
  description: string
  videoLinks: string
  city: string
  district: string
  cityDistrict: string
  locality: string
  snt: string
  street: string
  house: string
  contactName: string
  phone: string
  email: string
}

const EMPTY: Form = {
  dealType: 'sale',
  category: 'apartment',
  houseType: '',
  commercialType: '',
  title: '',
  price: '',
  area: '',
  areaUnit: 'sqm',
  plotArea: '',
  plotAreaUnit: 'are',
  rooms: '',
  floor: '',
  totalFloors: '',
  description: '',
  videoLinks: '',
  city: 'Владикавказ',
  district: '',
  cityDistrict: '',
  locality: '',
  snt: '',
  street: '',
  house: '',
  contactName: '',
  phone: '',
  email: '',
}

const labelCls = 'text-[11px] tracking-wider uppercase text-[var(--n15-muted)] mb-1.5 block'
const inputCls =
  'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/30 px-3 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]'
const hintCls = 'block mt-1.5 text-[11px] leading-relaxed text-[var(--n15-muted)]'

/** Категории с землёй: у них спрашиваем площадь участка */
const PLOT_CODES = ['land', 'house', 'townhouse', 'cottage', 'dacha', 'part_house']

interface Props {
  lang: string
  /**
   * Объявление для правки (личный кабинет). Без него форма создаёт новое.
   * В правке согласия не спрашиваем: они уже приняты при подаче — дата
   * и версия правил хранятся в объявлении и не переписываются.
   */
  initial?: {
    id: number
    status: string
    fields: Record<string, string>
    photos: { id: number; url: string; thumb: string }[]
  } | null
}

export const BoardAdForm: FC<Props> = ({ lang, initial = null }) => {
  const { t } = useI18n()
  const editing = Boolean(initial)
  const [form, setForm] = useState<Form>(() => (initial ? { ...EMPTY, ...initial.fields } as Form : EMPTY))
  // Прежние фотографии (в правке) и новые файлы — отдельно: при сохранении
  // важно передать, какие из прежних автор оставил
  const [existingPhotos, setExistingPhotos] = useState(initial?.photos || [])
  // Файл и ссылка на превью — вместе: ссылку создаём один раз при выборе,
  // иначе при каждом удалении превью пересоздавались бы и мигали
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  const [consentData, setConsentData] = useState(false)
  const [consentRules, setConsentRules] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Снимок списка для очистки ссылок при размонтировании. Обновляем его
  // в эффекте, а не при рендере: трогать ref во время рендера нельзя
  // (правило react-hooks/refs — рендер должен оставаться чистым)
  const photosRef = useRef<{ file: File; url: string }[]>([])
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  const set = (key: keyof Form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  // Ссылки на превью освобождаем при закрытии формы: иначе браузер держит
  // в памяти все выбранные файлы до перезагрузки страницы
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [])

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return
    const added = Array.from(files)
      .slice(0, Math.max(0, BOARD_MAX_PHOTOS - photos.length - existingPhotos.length))
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotos((prev) => [...prev, ...added])
    setError('')
  }

  const removeExisting = (id: number) => setExistingPhotos((prev) => prev.filter((p) => p.id !== id))

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const requiredFilled =
    form.title.trim() && form.price.trim() && form.description.trim() && form.contactName.trim() && form.phone.trim()
  const photoCount = photos.length + existingPhotos.length
  const canSend = Boolean(requiredFilled) && photoCount > 0 && (editing || (consentData && consentRules)) && !sending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    if (!requiredFilled) {
      setError(t.board.formRequired)
      return
    }
    if (!photoCount) {
      setError(t.board.formNeedPhoto)
      return
    }
    if (!editing && (!consentData || !consentRules)) {
      setError(t.board.formConsentRequired)
      return
    }
    setSending(true)
    setError('')
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) body.append(key, String(value).trim())
      for (const photo of photos) body.append('photos', photo.file)

      let url = '/api/board/ads'
      if (initial) {
        // Правка: прежние фото, которые автор оставил, и служебные поля
        body.append('id', String(initial.id))
        body.append('action', 'update')
        body.append('keepPhotos', existingPhotos.map((p) => p.id).join(','))
        url = '/api/board/ads/manage'
      } else {
        body.append('consent', String(consentData))
        body.append('consentRules', String(consentRules))
      }

      const res = await fetch(url, { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.board.formError)
        return
      }
      setSent(true)
    } catch {
      setError(t.board.formError)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
          {editing ? t.board.resubmitTitle : t.board.sentTitle}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-6">
          {editing ? t.board.resubmitText : t.board.sentText}
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href={`/${lang}/lk/board`} className="px-5 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300">
            {t.board.sentMyAds}
          </Link>
          <Link href={`/${lang}/board`} className="px-5 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-muted)] hover:text-[var(--n15-silver)] transition-all duration-300">
            {t.board.sentBack}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-3xl flex flex-col gap-8">
      <p className="text-sm leading-relaxed text-[var(--n15-muted)]">
        {editing ? t.board.formEditIntro : t.board.formIntro}
      </p>

      {/* --- Об объекте --- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.board.formObject}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.dealLabel}</span>
            <select value={form.dealType} onChange={(e) => set('dealType', e.target.value)} className={inputCls}>
              <option value="sale">{t.object.sale}</option>
              <option value="rent">{t.object.rent}</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>{t.board.paramCategory}</span>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {OBJECT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>{t.board.formHouseType}</span>
            <select value={form.houseType} onChange={(e) => set('houseType', e.target.value)} className={inputCls}>
              <option value="">{t.board.formNotSet}</option>
              {HOUSE_TYPES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </label>
        </div>

        {form.category === 'commercial' && (
          <label>
            <span className={labelCls}>{t.board.formCommercialType}</span>
            <select value={form.commercialType} onChange={(e) => set('commercialType', e.target.value)} className={inputCls}>
              <option value="">{t.board.formNotSet}</option>
              {COMMERCIAL_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className={labelCls}>{t.board.formTitle}</span>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={120}
            placeholder={t.board.formTitlePh}
            className={inputCls}
          />
          <span className={hintCls}>{t.board.formTitleHint}</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.formPrice}</span>
            <input inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formArea}</span>
            <input inputMode="decimal" value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formAreaUnit}</span>
            <select value={form.areaUnit} onChange={(e) => set('areaUnit', e.target.value)} className={inputCls}>
              <option value="sqm">м²</option>
              <option value="are">{t.catalog.areName}</option>
              <option value="ha">{t.catalog.hectareName}</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.formRooms}</span>
            <input inputMode="numeric" value={form.rooms} onChange={(e) => set('rooms', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formFloor}</span>
            <input inputMode="numeric" value={form.floor} onChange={(e) => set('floor', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formTotalFloors}</span>
            <input inputMode="numeric" value={form.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} className={inputCls} />
          </label>
        </div>

        {/* Площадь участка — у домов, дач и участков: у квартиры её не бывает */}
        {PLOT_CODES.includes(form.category) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label>
              <span className={labelCls}>{t.board.formPlotArea}</span>
              <input inputMode="decimal" value={form.plotArea} onChange={(e) => set('plotArea', e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>{t.board.formAreaUnit}</span>
              <select value={form.plotAreaUnit} onChange={(e) => set('plotAreaUnit', e.target.value)} className={inputCls}>
                <option value="are">{t.catalog.areName}</option>
                <option value="ha">{t.catalog.hectareName}</option>
                <option value="sqm">м²</option>
              </select>
            </label>
          </div>
        )}

        <label>
          <span className={labelCls}>{t.board.formDescription}</span>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={6}
            maxLength={6000}
            placeholder={t.board.formDescriptionPh}
            className={inputCls}
          />
          <span className={hintCls}>{t.board.formDescriptionHint}</span>
        </label>

        <label>
          <span className={labelCls}>{t.board.formVideo}</span>
          <textarea
            value={form.videoLinks}
            onChange={(e) => set('videoLinks', e.target.value)}
            rows={2}
            placeholder="https://youtube.com/…"
            className={inputCls}
          />
        </label>
      </section>

      {/* --- Адрес --- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.board.formAddress}</h2>
        <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.board.formAddressHint}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.formCity}</span>
            <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formCityDistrict}</span>
            <select value={form.cityDistrict} onChange={(e) => set('cityDistrict', e.target.value)} className={inputCls}>
              <option value="">{t.board.formNotSet}</option>
              {CITY_DISTRICT_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>{t.board.formDistrict}</span>
            <select value={form.district} onChange={(e) => set('district', e.target.value)} className={inputCls}>
              <option value="">{t.board.formNotSet}</option>
              {DISTRICT_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.formLocality}</span>
            <input value={form.locality} onChange={(e) => set('locality', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formSnt}</span>
            <input value={form.snt} onChange={(e) => set('snt', e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formStreet}</span>
            <input value={form.street} onChange={(e) => set('street', e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="md:w-1/3">
          <span className={labelCls}>{t.board.formHouse}</span>
          <input value={form.house} onChange={(e) => set('house', e.target.value)} className={inputCls} />
          <span className={hintCls}>{t.board.formHouseHint}</span>
        </label>
      </section>

      {/* --- Фотографии --- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.board.formPhotos}</h2>
        <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">
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
          className="hidden"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photos.length + existingPhotos.length >= BOARD_MAX_PHOTOS}
            className="px-4 py-2.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer disabled:opacity-40"
          >
            {t.board.formPhotoPick}
          </button>
          {photos.length > 0 && (
            <span className="text-[11px] text-[var(--n15-muted)]">
              {t.board.formPhotosCount.replace('%d', String(photos.length + existingPhotos.length))}
            </span>
          )}
        </div>
        {(existingPhotos.length > 0 || photos.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {/* Прежние фотографии: их видит автор (свои файлы из закрытого
                хранилища), убрать можно крестиком — при сохранении список
                оставленных уходит на сервер */}
            {existingPhotos.map((photo) => (
              <div key={`existing-${photo.id}`} className="relative w-24">
                <img src={photo.thumb || photo.url} alt="" className="w-24 h-24 object-cover border border-[var(--n15-gold)]/20" />
                <button
                  type="button"
                  onClick={() => removeExisting(photo.id)}
                  aria-label={t.board.formPhotoRemove}
                  className="absolute -top-2 -right-2 w-6 h-6 grid place-items-center bg-[var(--n15-black)] border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.map((photo, index) => (
              <div key={`${photo.file.name}-${index}`} className="relative w-24">
                {/* Превью из выбранного файла: на сервер он уйдёт только при отправке */}
                <img
                  src={photo.url}
                  alt=""
                  className="w-24 h-24 object-cover border border-[var(--n15-gold)]/20"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  aria-label={t.board.formPhotoRemove}
                  className="absolute -top-2 -right-2 w-6 h-6 grid place-items-center bg-[var(--n15-black)] border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Контакты --- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.board.formContacts}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label>
            <span className={labelCls}>{t.board.formContactName}</span>
            <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>{t.board.formPhone}</span>
            <input
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', maskRuPhoneInput(e.target.value))}
              placeholder="+7 (___) ___-__-__"
              className={inputCls}
            />
            <span className={hintCls}>{t.board.formPhoneHint}</span>
          </label>
          <label>
            <span className={labelCls}>{t.board.formEmail}</span>
            <input inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </label>
        </div>
      </section>

      {/* --- Согласия: при правке не спрашиваем, они уже приняты --- */}
      {!editing && (
      <section className="flex flex-col gap-3">
        <ConsentCheckbox checked={consentData} onChange={setConsentData} />
        <label className="flex items-start gap-3 text-xs leading-relaxed text-[var(--n15-silver)]">
          <input
            type="checkbox"
            checked={consentRules}
            onChange={(e) => setConsentRules(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--n15-gold)]"
          />
          <span>
            {t.board.formRulesBefore}
            <Link href={`/${lang}/board/rules`} target="_blank" className="text-[var(--n15-gold)] hover:underline underline-offset-2">
              {t.board.formRulesLink}
            </Link>
            {t.board.formRulesAfter}
          </span>
        </label>
      </section>
      )}

      {error && <p className="text-sm text-[var(--n15-burgundy-light)]">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend}
          className="px-6 py-3.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 n15-cta-green transition-all duration-300 cursor-pointer disabled:opacity-40"
        >
          {sending ? t.board.formSending : editing ? t.board.formSaveEdit : t.board.formSend}
        </button>
        <Link href={`/${lang}/board`} className="text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-silver)]">
          {t.board.formCancel}
        </Link>
      </div>
    </form>
  )
}

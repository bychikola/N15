'use client'

import { useRef, useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { AD_CONTACT_KIND_LABELS, AD_OBJECT_TYPE_LABELS } from '@/lib/advertising'
import { AD_OFFER, AD_RULES, adDocHref } from '@/lib/advertising-legal'

/**
 * Форма заявки «Ваша реклама» (страница /advertising): кто обращается, что за
 * объект, фотографии и видео, желаемый срок и три отдельных согласия.
 *
 * Три согласия — три отдельные обязательные галочки, каждая со своим
 * документом (оферта, правила размещения, политика обработки персональных
 * данных). Объединять их нельзя: это самостоятельные юридически значимые
 * действия. Ту же проверку повторяет маршрут /api/advertising/request и
 * коллекция advertising-requests.
 *
 * Заявка уходит multipart-запросом (вместе с фотографиями) на
 * /api/advertising/request: сервер сохраняет дату и время отправки, IP-адрес,
 * принятую версию оферты и кладёт фотографии в закрытое хранилище.
 */

/** Сколько фотографий принимает форма — столько же проверяет сервер */
const MAX_PHOTOS = 6

type Form = {
  contactKind: string
  name: string
  company: string
  phone: string
  email: string
  objectType: string
  location: string
  price: string
  description: string
  listingUrl: string
  videoLinks: string
  desiredTerm: string
  message: string
}

const EMPTY: Form = {
  contactKind: 'name',
  name: '',
  company: '',
  phone: '',
  email: '',
  objectType: '',
  location: '',
  price: '',
  description: '',
  listingUrl: '',
  videoLinks: '',
  desiredTerm: '',
  message: '',
}

const labelCls = 'text-[11px] tracking-wider uppercase text-[var(--n15-muted)] mb-1.5 block'
const inputCls =
  'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/30 px-3 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]'
const hintCls = 'block mt-1.5 text-[11px] leading-relaxed text-[var(--n15-muted)]'

export const AdRequestForm: FC<{ lang: string }> = ({ lang }) => {
  const { t } = useI18n()
  const [form, setForm] = useState<Form>(EMPTY)
  const [photos, setPhotos] = useState<File[]>([])
  const [consents, setConsents] = useState({ offer: false, rights: false, data: false })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement | null>(null)

  const set =
    (key: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  /** Догрузка фотографий: не больше MAX_PHOTOS, лишние не берём */
  const addPhotos = (list: FileList | null) => {
    if (!list) return
    const next = [...photos]
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PHOTOS) break
      next.push(file)
    }
    setPhotos(next)
    if (fileInput.current) fileInput.current.value = ''
    if (next.length > photos.length && next.length >= MAX_PHOTOS) setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    // Проверки формы до отправки: подсказки понятнее серверных ошибок
    if (!form.name.trim() || !form.phone.trim() || !form.objectType) {
      setError(t.advertising.fieldsRequired)
      return
    }
    if (!consents.offer || !consents.rights || !consents.data) {
      setError(t.advertising.consentRequired)
      return
    }
    setSending(true)
    setError('')
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) body.append(key, String(value).trim())
      body.append('consentOffer', String(consents.offer))
      body.append('consentRights', String(consents.rights))
      body.append('consent', String(consents.data))
      for (const photo of photos) body.append('photos', photo)

      const res = await fetch('/api/advertising/request', { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.advertising.errorSend)
        return
      }
      setSent(true)
    } catch {
      setError(t.advertising.errorSend)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="p-6 border border-[var(--n15-green)]/25 bg-[var(--n15-black)]">
        <p className="text-base text-[var(--n15-white)] mb-2">{t.advertising.sentTitle}</p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.advertising.sentText}</p>
      </div>
    )
  }

  const sectionTitle = 'text-xs tracking-[0.16em] uppercase text-[var(--n15-gold)] mb-4'

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-8">
      {/* Кто обращается */}
      <fieldset className="flex flex-col gap-4">
        <legend className={sectionTitle}>{t.advertising.sectionContact}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className={labelCls}>{t.advertising.contactKind}</span>
            <select required value={form.contactKind} onChange={set('contactKind')} className={inputCls}>
              {(Object.keys(AD_CONTACT_KIND_LABELS) as (keyof typeof AD_CONTACT_KIND_LABELS)[]).map((key) => (
                <option key={key} value={key}>
                  {t.advertising.contactKinds[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>{t.advertising.name}</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={set('name')}
              placeholder={t.advertising.namePlaceholder}
              className={inputCls}
            />
          </label>
          <label>
            <span className={labelCls}>{t.advertising.company}</span>
            <input
              type="text"
              value={form.company}
              onChange={set('company')}
              placeholder={t.advertising.companyPlaceholder}
              className={inputCls}
            />
          </label>
          <label>
            <span className={labelCls}>{t.advertising.phone}</span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={set('phone')}
              placeholder={t.advertising.phonePlaceholder}
              className={inputCls}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>{t.advertising.email}</span>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder={t.advertising.emailPlaceholder}
              className={inputCls}
            />
            <small className={hintCls}>{t.advertising.emailHint}</small>
          </label>
        </div>
      </fieldset>

      {/* Объект */}
      <fieldset className="flex flex-col gap-4">
        <legend className={sectionTitle}>{t.advertising.sectionObject}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className={labelCls}>{t.advertising.objectType}</span>
            <select required value={form.objectType} onChange={set('objectType')} className={inputCls}>
              <option value="">{t.advertising.objectTypePlaceholder}</option>
              {(Object.keys(AD_OBJECT_TYPE_LABELS) as (keyof typeof AD_OBJECT_TYPE_LABELS)[]).map((key) => (
                <option key={key} value={key}>
                  {t.advertising.objectTypes[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>{t.advertising.location}</span>
            <input
              type="text"
              value={form.location}
              onChange={set('location')}
              placeholder={t.advertising.locationPlaceholder}
              className={inputCls}
            />
          </label>
          <label>
            <span className={labelCls}>{t.advertising.price}</span>
            <input
              type="text"
              value={form.price}
              onChange={set('price')}
              placeholder={t.advertising.pricePlaceholder}
              className={inputCls}
            />
          </label>
          <label>
            <span className={labelCls}>{t.advertising.listingUrl}</span>
            <input
              type="url"
              value={form.listingUrl}
              onChange={set('listingUrl')}
              placeholder={t.advertising.listingUrlPlaceholder}
              className={inputCls}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>{t.advertising.description}</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={set('description')}
              placeholder={t.advertising.descriptionPlaceholder}
              className={`${inputCls} resize-none`}
            />
          </label>
        </div>
      </fieldset>

      {/* Фотографии и видео — файлы и ссылки в одном блоке формы */}
      <fieldset className="flex flex-col gap-4">
        <legend className={sectionTitle}>{t.advertising.mediaTitle}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className={labelCls}>{t.advertising.photos}</span>
            <label className="flex items-center justify-center min-h-[76px] px-4 py-3 border border-dashed border-[var(--n15-gold)]/40 bg-[var(--n15-black)] cursor-pointer text-center">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => addPhotos(e.target.files)}
                className="sr-only"
              />
              <span className="text-xs text-[var(--n15-gold)]">
                {photos.length
                  ? t.advertising.photosSelected.replace('%d', String(photos.length))
                  : t.advertising.photosPick}
              </span>
            </label>
            <small className={hintCls}>{t.advertising.photosHint}</small>
            {photos.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {photos.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-[11px] text-[var(--n15-muted)]">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                      className="shrink-0 text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
                      aria-label={`${t.advertising.photos} — ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex flex-col">
            <span className={labelCls}>{t.advertising.video}</span>
            <textarea
              rows={3}
              value={form.videoLinks}
              onChange={set('videoLinks')}
              placeholder={t.advertising.videoPlaceholder}
              className={`${inputCls} resize-none`}
            />
            <small className={hintCls}>{t.advertising.videoHint}</small>
          </label>
        </div>
      </fieldset>

      {/* Желаемый срок размещения */}
      <fieldset className="flex flex-col gap-4">
        <legend className={sectionTitle}>{t.advertising.sectionTerm}</legend>
        <label className="sm:max-w-sm">
          <span className={labelCls}>{t.advertising.desiredTerm}</span>
          <input
            type="text"
            value={form.desiredTerm}
            onChange={set('desiredTerm')}
            placeholder={t.advertising.desiredTermPlaceholder}
            className={inputCls}
          />
        </label>
      </fieldset>

      {/* Три отдельные обязательные галочки — у каждой свой документ */}
      <fieldset className="flex flex-col gap-3 border-t border-[var(--n15-gold)]/20 pt-6">
        <legend className={sectionTitle}>{t.advertising.consentsTitle}</legend>
        <Consent
          checked={consents.offer}
          onChange={(v) => setConsents((prev) => ({ ...prev, offer: v }))}
          text={t.advertising.consentOfferText}
          links={[
            { href: adDocHref(lang, AD_OFFER.path), title: t.advertising.consentOfferDoc },
            { href: adDocHref(lang, AD_RULES.path), title: t.advertising.consentRulesDoc },
          ]}
          docsLabel={t.advertising.consentDocs}
        />
        <Consent
          checked={consents.rights}
          onChange={(v) => setConsents((prev) => ({ ...prev, rights: v }))}
          text={t.advertising.consentRightsText}
          links={[{ href: adDocHref(lang, AD_RULES.path), title: t.advertising.consentRulesDoc }]}
          docsLabel={t.advertising.consentDocs}
        />
        <Consent
          checked={consents.data}
          onChange={(v) => setConsents((prev) => ({ ...prev, data: v }))}
          text={t.advertising.consentDataText}
          links={[{ href: adDocHref(lang, '/privacy'), title: t.advertising.consentPrivacyDoc }]}
          docsLabel={t.advertising.consentDocs}
        />
      </fieldset>

      {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}

      <Button variant="primary" size="md" className="w-full sm:w-auto" disabled={sending}>
        {sending ? t.advertising.sending : t.advertising.submit}
      </Button>
    </form>
  )
}

/**
 * Одна галочка согласия: текст отметки и ссылки на её документы.
 * Ссылки открываются в новой вкладке — заполненная форма не теряется.
 */
const Consent: FC<{
  checked: boolean
  onChange: (v: boolean) => void
  text: string
  links: { href: string; title: string }[]
  docsLabel: string
}> = ({ checked, onChange, text, links, docsLabel }) => (
  <label className="flex items-start gap-3 text-xs leading-relaxed text-[var(--n15-silver)]">
    <input
      type="checkbox"
      required
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--n15-gold)]"
    />
    <span>
      {text}
      <span className="block mt-1 text-[11px] text-[var(--n15-muted)]">
        {docsLabel}{' '}
        {links.map((link, index) => (
          <span key={link.href}>
            {index > 0 && ' · '}
            <Link
              href={link.href}
              target="_blank"
              className="text-[var(--n15-gold)] underline underline-offset-4 hover:text-[var(--n15-gold-light)]"
            >
              {link.title}
            </Link>
          </span>
        ))}
      </span>
    </span>
  </label>
)

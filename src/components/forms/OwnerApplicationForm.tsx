'use client'

import { useEffect, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from '@/components/ui/ConsentCheckbox'
import { HoneypotField, readServerError, useSpamGuard } from '@/components/ui/SpamGuard'
import { isPlotCategoryCode, OBJECT_CATEGORIES } from '@/lib/object-categories'
import { SNT_AREAS } from '@/components/home/landing-data'
import { reachGoal } from '@/lib/metrika'

/**
 * Форма «Заявка собственника» на странице /sell: владелец рассказывает
 * об объекте, а телефон подтверждает кодом из SMS. Это не публикация
 * в каталоге: объекта в базе ещё нет, фотографии лежат в закрытом хранилище,
 * и карточка появится только после проверки администратором (см.
 * src/lib/owner-applications.ts, src/lib/owner-service.ts).
 *
 * Шаги формы: заполнение → код из SMS → готово. Если SMS отправить не
 * удалось (или провайдер не настроен), форма честно говорит, что телефон
 * подтвердит администратор при звонке: заявка при этом не теряется —
 * она уже в CRM. Код в браузер не возвращается, в ответе маршрута его нет.
 *
 * Точный адрес — служебные сведения: он уходит в CRM для поиска дублей,
 * а на сайте не публикуется (в форме об этом сказано прямо).
 */
export const OwnerApplicationForm: FC = () => {
  const { t } = useI18n()
  const { honeypot, setHoneypot, spamFields } = useSpamGuard()

  // Шаг формы: заполнение → код подтверждения → готово
  const [step, setStep] = useState<'form' | 'code' | 'done'>('form')
  const [doneKind, setDoneKind] = useState<'code' | 'noSms'>('noSms')
  const [appId, setAppId] = useState<number | null>(null)
  const [phoneSent, setPhoneSent] = useState('')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [deal, setDeal] = useState('sale')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [area, setArea] = useState('')
  const [areaUnit, setAreaUnit] = useState('sqm')
  const [plotArea, setPlotArea] = useState('')
  const [plotAreaUnit, setPlotAreaUnit] = useState('sqm')
  const [rooms, setRooms] = useState('')
  const [floor, setFloor] = useState('')
  const [totalFloors, setTotalFloors] = useState('')
  const [cadastral, setCadastral] = useState('')
  const [city, setCity] = useState('Владикавказ')
  const [locality, setLocality] = useState('')
  const [snt, setSnt] = useState('')
  const [street, setStreet] = useState('')
  const [house, setHouse] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [agreed, setAgreed] = useState(false)

  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState('')
  const [wait, setWait] = useState(0)

  // Пауза между повторными отправками кода: обратный отсчёт до нуля
  useEffect(() => {
    if (wait <= 0) return
    const timer = setInterval(() => setWait((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [wait])

  const inputCls =
    'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    if (!agreed) {
      setError(t.consent.required)
      return
    }
    setSending(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('ownerName', name)
      fd.append('ownerPhone', phone)
      fd.append('type', deal)
      fd.append('category', category)
      if (price) fd.append('price', price)
      if (area) fd.append('area', area)
      fd.append('areaUnit', areaUnit)
      if (plotArea) fd.append('plotArea', plotArea)
      fd.append('plotAreaUnit', plotAreaUnit)
      if (rooms) fd.append('rooms', rooms)
      if (floor) fd.append('floor', floor)
      if (totalFloors) fd.append('totalFloors', totalFloors)
      if (cadastral) fd.append('cadastralNumber', cadastral)
      fd.append('city', city)
      if (locality) fd.append('locality', locality)
      if (snt) fd.append('snt', snt)
      if (street) fd.append('street', street)
      if (house) fd.append('house', house)
      if (description) fd.append('description', description)
      fd.append('consent', 'true')
      // Невидимая защита от спама: ловушка и время заполнения формы
      for (const [key, value] of Object.entries(spamFields())) fd.append(key, String(value))
      for (const file of files) fd.append('photos', file)

      const res = await fetch('/api/owner-applications/submit', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!res.ok) {
        setError(await readServerError(res, t.ownerForm.error))
        return
      }
      const data = (await res.json().catch(() => null)) as
        | { id?: number; phone?: string; codeSent?: boolean }
        | null
      if (!data?.id) {
        setError(t.ownerForm.error)
        return
      }
      // Цель Метрики — без персональных данных из формы
      reachGoal('lead_form')
      setAppId(data.id)
      setPhoneSent(data.phone || phone)
      if (data.codeSent) {
        setStep('code')
        setWait(60)
      } else {
        setDoneKind('noSms')
        setStep('done')
      }
    } catch {
      setError(t.ownerForm.error)
    } finally {
      setSending(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (verifying || !appId) return
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await fetch('/api/owner-applications/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: appId, code }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setVerifyError(data?.error || t.ownerForm.error)
        return
      }
      setDoneKind('code')
      setStep('done')
    } catch {
      setVerifyError(t.ownerForm.error)
    } finally {
      setVerifying(false)
    }
  }

  const resend = async () => {
    if (resending || !appId || wait > 0) return
    setResending(true)
    setVerifyError('')
    setResendNote('')
    try {
      const res = await fetch('/api/owner-applications/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: appId }),
      })
      const data = (await res.json().catch(() => null)) as
        | { error?: string; waitSeconds?: number; codeSent?: boolean }
        | null
      if (!res.ok) {
        if (typeof data?.waitSeconds === 'number') setWait(data.waitSeconds)
        setVerifyError(data?.error || t.ownerForm.error)
        return
      }
      setWait(60)
      setResendNote(t.ownerForm.resendOk)
    } catch {
      setVerifyError(t.ownerForm.error)
    } finally {
      setResending(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="p-6 border border-[var(--n15-green)]/25 bg-[var(--n15-black)]">
        <p className="text-base text-[var(--n15-white)] mb-2">
          {doneKind === 'code' ? t.ownerForm.codeOkTitle : t.ownerForm.sentTitle}
        </p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">
          {doneKind === 'code' ? t.ownerForm.codeOkText : t.ownerForm.codeNoSms}
        </p>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <form onSubmit={(e) => void verify(e)} className="flex flex-col gap-4 p-6 border border-[var(--n15-gold)]/15">
        <div>
          <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1">
            {t.ownerForm.codeTitle}
          </h3>
          <p className="text-sm text-[var(--n15-muted)] leading-relaxed">
            {t.ownerForm.codeText.replace('%s', phoneSent)}
          </p>
        </div>
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder={t.ownerForm.codePh}
          aria-label={t.ownerForm.codeLabel}
          className={`${inputCls} tracking-[.4em]`}
        />
        {verifyError && <p className="text-xs text-[var(--n15-burgundy)]">{verifyError}</p>}
        {resendNote && <p className="text-xs text-[var(--n15-green)]">{resendNote}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" size="md" disabled={verifying || code.length !== 5}>
            {verifying ? t.ownerForm.codeChecking : t.ownerForm.codeSubmit}
          </Button>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || wait > 0}
            className="text-xs text-[var(--n15-gold)] underline underline-offset-4 disabled:opacity-50"
          >
            {resending
              ? t.ownerForm.resending
              : wait > 0
                ? t.ownerForm.resendWait.replace('%d', String(wait))
                : t.ownerForm.resend}
          </button>
        </div>
      </form>
    )
  }

  const plot = isPlotCategoryCode(category)
  const land = category === 'land'

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--n15-gold)] mb-1">{t.ownerForm.eyebrow}</p>
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1">
          {t.ownerForm.title}
        </h3>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.ownerForm.lead}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.ownerForm.namePh}
          aria-label={t.ownerForm.nameLabel}
          className={`${inputCls} sm:flex-1`}
        />
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.ownerForm.phonePh}
          aria-label={t.ownerForm.phoneLabel}
          className={`${inputCls} sm:flex-1`}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.ownerForm.phoneHint}</p>

      <div className="flex flex-col sm:flex-row gap-4">
        <select
          value={deal}
          onChange={(e) => setDeal(e.target.value)}
          aria-label={t.ownerForm.dealLabel}
          className={`${inputCls} cursor-pointer sm:flex-1`}
        >
          <option value="sale">{t.ownerForm.dealSale}</option>
          <option value="rent">{t.ownerForm.dealRent}</option>
        </select>
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t.ownerForm.categoryLabel}
          className={`${inputCls} cursor-pointer sm:flex-1`}
        >
          <option value="">{t.ownerForm.categoryPh}</option>
          {OBJECT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t.ownerForm.pricePh}
          aria-label={t.ownerForm.priceLabel}
          className={`${inputCls} sm:flex-1`}
        />
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder={t.ownerForm.areaLabel}
          aria-label={t.ownerForm.areaLabel}
          className={`${inputCls} sm:flex-1`}
        />
        {land && (
          <select
            value={areaUnit}
            onChange={(e) => setAreaUnit(e.target.value)}
            aria-label={t.ownerForm.areaUnitLabel}
            className={`${inputCls} cursor-pointer sm:flex-1`}
          >
            <option value="sqm">м²</option>
            <option value="are">сотки</option>
            <option value="ha">гектары</option>
          </select>
        )}
      </div>

      {plot && (
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={plotArea}
            onChange={(e) => setPlotArea(e.target.value)}
            placeholder={t.ownerForm.plotAreaLabel}
            aria-label={t.ownerForm.plotAreaLabel}
            className={`${inputCls} sm:flex-1`}
          />
          <select
            value={plotAreaUnit}
            onChange={(e) => setPlotAreaUnit(e.target.value)}
            aria-label={t.ownerForm.areaUnitLabel}
            className={`${inputCls} cursor-pointer sm:flex-1`}
          >
            <option value="sqm">м²</option>
            <option value="are">сотки</option>
            <option value="ha">гектары</option>
          </select>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={rooms}
          onChange={(e) => setRooms(e.target.value)}
          placeholder={t.ownerForm.roomsLabel}
          aria-label={t.ownerForm.roomsLabel}
          className={`${inputCls} sm:flex-1`}
        />
        <input
          type="number"
          inputMode="numeric"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          placeholder={t.ownerForm.floorLabel}
          aria-label={t.ownerForm.floorLabel}
          className={`${inputCls} sm:flex-1`}
        />
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={totalFloors}
          onChange={(e) => setTotalFloors(e.target.value)}
          placeholder={t.ownerForm.totalFloorsLabel}
          aria-label={t.ownerForm.totalFloorsLabel}
          className={`${inputCls} sm:flex-1`}
        />
      </div>

      <input
        type="text"
        value={cadastral}
        onChange={(e) => setCadastral(e.target.value)}
        placeholder={t.ownerForm.cadastralPh}
        aria-label={t.ownerForm.cadastralLabel}
        className={inputCls}
      />

      {/* Адрес объекта: точный дом уходит только в CRM — об этом сказано
          рядом с полями, чтобы человек не удивлялся, почему адреса нет
          на сайте до проверки */}
      <div className="border-t border-[var(--n15-gold)]/10 pt-4">
        <p className="text-xs uppercase tracking-wider text-[var(--n15-white)] mb-2">{t.ownerForm.addressTitle}</p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t.ownerForm.cityLabel}
              aria-label={t.ownerForm.cityLabel}
              className={`${inputCls} sm:flex-1`}
            />
            <input
              type="text"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder={t.ownerForm.localityLabel}
              aria-label={t.ownerForm.localityLabel}
              className={`${inputCls} sm:flex-1`}
            />
          </div>
          <select
            value={snt}
            onChange={(e) => setSnt(e.target.value)}
            aria-label={t.ownerForm.sntLabel}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">{t.ownerForm.sntNone}</option>
            {SNT_AREAS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder={t.ownerForm.streetLabel}
              aria-label={t.ownerForm.streetLabel}
              className={`${inputCls} sm:flex-[2]`}
            />
            <input
              type="text"
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              placeholder={t.ownerForm.houseLabel}
              aria-label={t.ownerForm.houseLabel}
              className={`${inputCls} sm:flex-1`}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.ownerForm.addressNote}</p>
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t.ownerForm.descriptionPh}
        aria-label={t.ownerForm.descriptionLabel}
        rows={4}
        className={`${inputCls} resize-none`}
      />

      {/* Фотографии до одобрения лежат в закрытом хранилище: на сайте они
          появятся только копиями после проверки (см. owner-service) */}
      <div>
        <label className="flex items-center gap-3 text-xs text-[var(--n15-silver)] cursor-pointer">
          <span className="border border-[var(--n15-gold)]/25 px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--n15-gold)]">
            {t.ownerForm.photosPick}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 10))}
            className="hidden"
          />
          {files.length > 0 && <span>{t.ownerForm.photosChosen.replace('%d', String(files.length))}</span>}
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.ownerForm.photosHint}</p>
      </div>

      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}
      <Button variant="primary" size="md" disabled={sending || !agreed}>
        {sending ? t.ownerForm.sending : t.ownerForm.submit}
      </Button>
    </form>
  )
}

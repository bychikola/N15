'use client'

import { useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox, MarketingConsent } from '@/components/ui/ConsentCheckbox'
// Тип недвижимости в заявке на подбор — категории каталога: заявку и объект
// агент читает одними и теми же словами (см. src/lib/object-categories.ts)
import { OBJECT_CATEGORIES } from '@/lib/object-categories'
import { reachGoal } from '@/lib/metrika'

/**
 * Виды заявок публичных форм: оценка объекта, продажа объекта, подбор
 * недвижимости и заявка на поиск (когда подходящего объекта нет). Код вида
 * уходит в CRM типом заявки — значения объявлены в коллекции applications,
 * подписи для списка заявок — в APPLICATION_TYPE_LABELS (FunnelCard.tsx).
 */
export type LeadKind = 'valuation' | 'sale' | 'selection' | 'search' | 'consultation'

interface Props {
  kind: LeadKind
  /** Заголовок и пояснение формы. По умолчанию — тексты словаря
   *  (t.lead.*) по виду заявки; страница может передать свои */
  title?: string
  text?: string
  className?: string
}

/**
 * Форма заявки в CRM — общая для «Оценить объект», «Продать объект»,
 * «Подобрать недвижимость» и «Оставить заявку на поиск». Отправка — POST
 * /api/applications (тип — kind, источник «site»): заявка попадает
 * в «Неразобранное» и адресуется агенту в CRM.
 *
 * У оценки и продажи есть поле адреса объекта, у подбора и поиска — только
 * комментарий: там клиенту важнее описать, что он ищет. Комментарий с
 * адресом уходят в одно поле заявки «Сообщение» — CRM показывает их как
 * есть.
 *
 * Перед кнопкой — обязательная галочка согласия на обработку персональных
 * данных: без отметки кнопка неактивна и форма не отправляется. Согласие на
 * рекламные сообщения — отдельная необязательная галочка, на отправку не
 * влияет.
 */
export const LeadForm: FC<Props> = ({ kind, title, text, className = '' }) => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [budget, setBudget] = useState('')
  const [location, setLocation] = useState('')
  const [comment, setComment] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Оценка и продажа начинаются с объекта: у них есть поле адреса
  const withAddress = kind === 'valuation' || kind === 'sale'
  // Подбор и поиск начинаются с запроса: что ищет клиент (тип недвижимости),
  // на какую сумму (бюджет) и где (район или населённый пункт). Эти же поля
  // есть у заявки в CRM (propertyType, budget, location) — агент видит запрос
  // целиком и не переспрашивает его по телефону
  const withQuery = kind === 'selection' || kind === 'search'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    // Та же проверка, что и у неактивной кнопки: отправка по Enter без отметки
    if (!agreed) {
      setError(t.consent.required)
      return
    }
    setSending(true)
    setError('')
    try {
      // Адрес и комментарий — одной заметкой: в CRM заявка читается как есть
      const message = [withAddress ? address.trim() : '', comment.trim()].filter(Boolean).join('\n')
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: kind,
          clientName: name,
          clientPhone: phone,
          // Запрос подбора: тип недвижимости, бюджет и место поиска — в свои
          // поля заявки (в CRM их видно отдельно от сообщения)
          propertyType: withQuery && propertyType ? propertyType : undefined,
          budget: withQuery && budget ? Number(budget) : undefined,
          location: withQuery && location.trim() ? location.trim() : undefined,
          message,
          marketingConsent: marketing,
          status: 'unsorted',
          source: 'site',
        }),
      })
      if (!res.ok) {
        setError(t.lead.error)
        return
      }
      // Цель Метрики «заявка отправлена» — без персональных данных из формы
      reachGoal('lead_form')
      setSent(true)
    } catch {
      setError(t.lead.error)
    } finally {
      setSending(false)
    }
  }

  const inputCls =
    'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  if (sent) {
    return (
      <div className={`p-6 border border-[var(--n15-green)]/25 bg-[var(--n15-black)] ${className}`}>
        <p className="text-base text-[var(--n15-white)] mb-2">{t.lead.sentTitle}</p>
        <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.lead.sentText}</p>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={`flex flex-col gap-4 ${className}`}>
      {(title || text) && (
        <div>
          {title && (
            <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1">{title}</h3>
          )}
          {text && <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{text}</p>}
        </div>
      )}
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.lead.namePlaceholder}
        className={inputCls}
      />
      <input
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t.lead.phonePlaceholder}
        className={inputCls}
      />
      {withAddress && (
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t.lead.addressPlaceholder}
          className={inputCls}
        />
      )}
      {withQuery && (
        <>
          {/* Тип недвижимости — из тех же категорий, что в каталоге: заявка
              сразу читается как поиск квартиры, дома, участка… */}
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            aria-label={t.lead.propertyTypeLabel}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">{t.lead.propertyTypeLabel}</option>
            {OBJECT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t.lead.budgetPlaceholder}
              aria-label={t.lead.budgetPlaceholder}
              className={`${inputCls} sm:flex-1`}
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t.lead.locationPlaceholder}
              aria-label={t.lead.locationPlaceholder}
              className={`${inputCls} sm:flex-1`}
            />
          </div>
        </>
      )}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t.lead.commentPlaceholder}
        rows={3}
        className={`${inputCls} resize-none`}
      />
      <ConsentCheckbox checked={agreed} onChange={setAgreed} />
      <MarketingConsent checked={marketing} onChange={setMarketing} />
      {!agreed && <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.consent.hint}</p>}
      {error && <p className="text-xs text-[var(--n15-burgundy)]">{error}</p>}
      <Button variant="primary" size="md" disabled={sending || !agreed}>
        {sending ? t.contacts.sending : t.lead.submit}
      </Button>
    </form>
  )
}

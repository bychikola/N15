'use client'

import { useState, type CSSProperties, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardRow } from '@/lib/owner-service'

/**
 * Блок «Подтверждение контакта» в заявке собственника — отдельный этап приёмки.
 *
 * Администратор сам связывается с владельцем: кнопка «Написать в WhatsApp»
 * открывает чат с готовым текстом подтверждения, «Позвонить» — набирает номер.
 * Затем выбирается способ (WhatsApp или телефонный звонок) и нажимается
 * «Контакт подтверждён»: сервис сохраняет дату, способ и администратора
 * (см. confirmOwnerContact). Ниже — отдельное согласие на показ номера:
 * без него и без подтверждённого контакта публикация на доске закрыта.
 * Это единственный способ подтверждения для доски: ни код из SMS, ни вторая
 * ручная отметка «Подтвердить телефон» для публикации объявления не нужны —
 * администратор уже связался с владельцем по этому номеру.
 *
 * Блок один и тот же в списке заявок и в полной карточке: действия выглядят
 * одинаково в обоих местах (см. OwnerApplicationsBoard, OwnerApplicationCard).
 */

interface Props {
  t: Dict
  row: OwnerBoardRow
  /** Признак занятости: блокирует кнопки, пока идёт запрос */
  busy: boolean
  /** Действие администратора; само обращается к /api/crm/owner-applications/action */
  onAction: (action: string, extra?: { method?: string; consent?: boolean }) => void
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
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
}

const inputStyle: CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 12,
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
}

const sectionTitle: CSSProperties = {
  fontSize: 10,
  color: '#817b70',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 8,
}

const dateText = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const methodLabel = (t: Dict, value: string | null): string =>
  value === 'whatsapp'
    ? t.crm.ownContactMethodWhatsApp
    : value === 'call'
      ? t.crm.ownContactMethodCall
      : ''

export const OwnerContactConfirm: FC<Props> = ({ t, row, busy, onAction }) => {
  const [method, setMethod] = useState(row.contactConfirmMethod || 'whatsapp')
  const [consent, setConsent] = useState(row.publishPhoneConsent)

  const confirmed = Boolean(row.contactConfirmedAt)
  const digits = row.ownerPhone.replace(/\D/g, '')
  const telHref = row.ownerPhone ? `tel:${row.ownerPhone.replace(/[^\d+]/g, '')}` : ''
  // Готовый текст подтверждения: обращение по имени и просьба ответить «Да»
  const hello = row.ownerName
    ? t.crm.ownWhatsAppHello.replace('%s', row.ownerName)
    : t.crm.ownWhatsAppHello.replace(', %s', '')
  const whatsappHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(`${hello} ${t.crm.ownWhatsAppBody}`)}`
    : ''

  return (
    <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '12px 14px', marginBottom: 18, background: '#fdfbf7' }}>
      <div style={sectionTitle}>{t.crm.ownContactConfirmTitle}</div>

      {/* Связаться с собственником: чат в WhatsApp с готовым текстом и звонок */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" style={btnStyle}>
            {t.crm.ownWhatsApp}
          </a>
        ) : (
          <span style={{ ...btnStyle, opacity: 0.45, cursor: 'not-allowed' }}>{t.crm.ownWhatsApp}</span>
        )}
        {telHref ? (
          <a href={telHref} style={btnStyle}>
            {t.crm.ownCall}
          </a>
        ) : null}
      </div>

      {/* Способ подтверждения и отметка «контакт подтверждён» */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#817b70' }}>
          {t.crm.ownContactMethod}:
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            aria-label={t.crm.ownContactMethod}
          >
            <option value="whatsapp">{t.crm.ownContactMethodWhatsApp}</option>
            <option value="call">{t.crm.ownContactMethodCall}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => onAction('confirm_contact', { method })}
          disabled={busy}
          style={btnStyle}
        >
          {t.crm.ownConfirmContact}
        </button>
        <span
          style={{
            fontSize: 10,
            color: confirmed ? '#3f6b34' : '#9b4e43',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          {confirmed
            ? [
                t.crm.ownContactConfirmed,
                methodLabel(t, row.contactConfirmMethod),
                row.contactConfirmedAt ? dateText(row.contactConfirmedAt) : '',
                row.contactConfirmedByName || '',
              ]
                .filter(Boolean)
                .join(' · ')
            : t.crm.ownContactNotConfirmed}
        </span>
      </div>

      {/* Отдельное согласие на показ номера — самостоятельное условие публикации */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#25241f' }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          {t.crm.ownPhoneConsent}
        </label>
        <button
          type="button"
          onClick={() => onAction('phone_consent', { consent })}
          disabled={busy || consent === row.publishPhoneConsent}
          style={{
            ...btnStyle,
            opacity: busy || consent === row.publishPhoneConsent ? 0.45 : 1,
            cursor: consent === row.publishPhoneConsent ? 'not-allowed' : 'pointer',
          }}
        >
          {t.crm.ownPhoneConsentSave}
        </button>
        <span
          style={{
            fontSize: 10,
            color: row.publishPhoneConsent ? '#3f6b34' : '#9b4e43',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          {row.publishPhoneConsent
            ? `${t.crm.ownPhoneConsentYes}${row.publishPhoneConsentAt ? ` · ${dateText(row.publishPhoneConsentAt)}` : ''}`
            : t.crm.ownPhoneConsentNo}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#817b70' }}>{t.crm.ownContactHint}</p>
    </div>
  )
}

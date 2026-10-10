'use client'

import { useRef, useState, type CSSProperties, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { OwnerBoardRow } from '@/lib/owner-service'

/**
 * Блок «Личная ссылка управления» в карточке заявки собственника.
 *
 * Собственник не заводит личный кабинет: администратор выдаёт ему персональную
 * ссылку, по которой открывается ровно его объявление. Здесь администратор
 * создаёт ссылку, копирует её и передаёт владельцу, а при необходимости
 * перевыпускает (прежняя гаснет) или отзывает.
 *
 * Ссылку выдаём только после ручного подтверждения контакта собственника
 * (contactConfirmedAt) и только когда объявление уже вышло на доску: иначе
 * неизвестно, что номер принадлежит владельцу. Ограничения те же и на сервере
 * (issueOwnerManageLink в src/lib/owner-manage-link.ts) — кнопка лишь отражает их.
 *
 * Сама ссылка показывается ОДИН раз, сразу после выдачи: в базе хранится только
 * хеш токена, и получить готовый адрес заново нельзя. Поэтому блок несёт кнопку
 * «Скопировать» и текст ссылки; после перезагрузки страницы виден лишь факт
 * «ссылка активна» и срок. Автоматически ссылку никому не отправляем — её
 * передаёт администратор (требование этапа: без SMS и страницы редактирования).
 *
 * Маршрут — /api/board/owner/manage-link (только администратор), см.
 * src/app/api/board/owner/manage-link/route.ts.
 */

interface Props {
  t: Dict
  row: OwnerBoardRow
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
  whiteSpace: 'nowrap',
}

const btnGold: CSSProperties = {
  ...btnStyle,
  border: 0,
  background: '#a7814e',
  color: '#fff',
}

const inputStyle: CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 12,
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
  color: '#25241f',
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

export const OwnerManageLink: FC<Props> = ({ t, row }) => {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Готовая ссылка: держим в памяти только после выдачи — в базе её нет
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const hasBoardAd = Boolean(row.boardAdId)
  const contactConfirmed = Boolean(row.contactConfirmedAt)
  const canIssue = hasBoardAd && contactConfirmed

  // Выдача/перевыпуск (POST) и отзыв (DELETE) — один маршрут, разный метод
  const call = async (method: 'POST' | 'DELETE') => {
    if (busy || !row.boardAdId) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/board/owner/manage-link', {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ boardAdId: row.boardAdId }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; url?: string } | null
      if (!res.ok) {
        setError(data?.error || t.crm.ownManageLinkError)
        return
      }
      if (method === 'POST') {
        setUrl(data?.url || '')
        setCopied(false)
      } else {
        // Отзыв: готовую ссылку из памяти убираем — она больше не работает
        setUrl('')
        setCopied(false)
      }
      router.refresh()
    } catch {
      setError(t.crm.ownManageLinkError)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // http или нет доступа к буферу: выделяем поле — пользователь скопирует сам
      inputRef.current?.select()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Подсказка объясняет, почему кнопка выдачи недоступна
  const hint = !hasBoardAd
    ? t.crm.ownManageLinkNeedBoard
    : !contactConfirmed
      ? t.crm.ownManageLinkNeedContact
      : t.crm.ownManageLinkHint

  return (
    <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '12px 14px', marginBottom: 18, background: '#fdfbf7' }}>
      <div style={sectionTitle}>{t.crm.ownManageLink}</div>

      {error && <p style={{ margin: '0 0 10px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}

      {/* Состояние: активна ли ссылка и до какого срока */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            color: row.manageLinkActive ? '#3f6b34' : '#817b70',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          {row.manageLinkActive ? t.crm.ownManageLinkActive : t.crm.ownManageLinkNone}
          {row.manageLinkActive && row.manageLinkExpiresAt
            ? ` · ${t.crm.ownManageLinkUntil} ${dateText(row.manageLinkExpiresAt)}`
            : ''}
        </span>
        {row.manageLinkActive && (
          <button
            type="button"
            onClick={() => void call('DELETE')}
            disabled={busy}
            style={{ ...btnStyle, color: '#9b4e43' }}
          >
            {t.crm.ownManageLinkRevoke}
          </button>
        )}
      </div>

      {/* Выдача или перевыпуск: активной остаётся только последняя ссылка */}
      <button
        type="button"
        onClick={() => void call('POST')}
        disabled={busy || !canIssue}
        title={!canIssue ? hint : ''}
        style={{
          ...btnGold,
          opacity: busy || !canIssue ? 0.45 : 1,
          cursor: canIssue ? 'pointer' : 'not-allowed',
        }}
      >
        {row.manageLinkActive ? t.crm.ownManageLinkReissue : t.crm.ownManageLinkCreate}
      </button>

      {/* Свежая ссылка: показывается один раз, с кнопкой копирования */}
      {url && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t.crm.ownManageLinkCopy}
              style={{ ...inputStyle, flex: '1 1 320px', minWidth: 220 }}
            />
            <button type="button" onClick={() => void copy()} style={btnStyle}>
              {copied ? t.crm.ownManageLinkCopied : t.crm.ownManageLinkCopy}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8d6b40' }}>{t.crm.ownManageLinkOnce}</p>
        </div>
      )}

      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#817b70' }}>{hint}</p>
    </div>
  )
}

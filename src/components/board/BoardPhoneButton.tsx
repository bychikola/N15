'use client'

import { useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'

/**
 * «Показать телефон» — номер автора объявления.
 *
 * В разметке страницы номера нет: у доски объявления размещают частные лица,
 * и открытый номер — это персональные данные, доступные любому сборщику.
 * Номер приходит ответом на нажатие (маршрут /api/board/ads/phone, с лимитом
 * по IP) и показывается ссылкой tel: — по ней уже звонит сам браузер.
 *
 * Пока номер не запрошен, кнопка ничего не обещает лишнего: подсказка под ней
 * говорит, что номер откроется после нажатия.
 */
export const BoardPhoneButton: FC<{ t: Dict; adId: number }> = ({ t, adId }) => {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reveal = async () => {
    if (busy || phone) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/board/ads/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: adId }),
      })
      const data = (await res.json().catch(() => null)) as { phone?: string; error?: string } | null
      if (!res.ok || !data?.phone) {
        setError(data?.error || t.board.phoneFailed)
        return
      }
      setPhone(data.phone)
    } catch {
      setError(t.board.phoneFailed)
    } finally {
      setBusy(false)
    }
  }

  if (phone) {
    return (
      <div>
        <a
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          className="n15-cta-green flex items-center justify-center gap-2 w-full px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
        >
          {phone}
        </a>
        <p className="mt-2 text-[11px] text-[var(--n15-muted)]">{t.board.phoneHint}</p>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void reveal()}
        disabled={busy}
        className="n15-cta-green w-full px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300 cursor-pointer disabled:opacity-60"
      >
        {busy ? t.board.phoneLoading : t.board.phoneShow}
      </button>
      <p className="mt-2 text-[11px] text-[var(--n15-muted)]">{error || t.board.phonePrivacy}</p>
    </div>
  )
}

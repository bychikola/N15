'use client'

import { useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { telDigits, telHref, waDigits } from '@/lib/call-routing'

/**
 * «Показать телефон» — номер автора объявления.
 *
 * В разметке страницы номера нет: у доски объявления размещают частные лица,
 * и открытый номер — это персональные данные, доступные любому сборщику.
 * Номер приходит ответом на нажатие (маршрут /api/board/ads/phone, с лимитом
 * по IP) и показывается ссылкой tel: — по ней уже звонит сам браузер.
 *
 * Номер всегда принадлежит автору объявления: у объявления собственника это
 * его телефон из заявки, у обычной подачи — телефон с формы. Общий номер Н15
 * сюда не подставляется ни при каких данных — иначе клиент дозвонился бы не
 * тому (см. publishOwnerApplicationToBoard в src/lib/owner-service.ts).
 *
 * После показа номера рядом с ним две кнопки: «Позвонить» (tel:) и «WhatsApp»
 * (wa.me). WhatsApp показываем, только если из номера складывается полный
 * номер: «восьмёрка» превращается в код страны, а обрывок ссылки не даёт —
 * такая кнопка вела бы в пустоту.
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
    // Кнопки ведут на тот же номер, что показан выше: подмены на номер
    // агентства или агента здесь нет (см. telHref/waDigits)
    const callHref = telHref(telDigits(phone))
    const waLink = waDigits(phone)
    return (
      <div>
        <p className="mb-3 text-lg font-semibold tracking-wide text-[var(--heading)]">{phone}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={callHref}
            className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
          >
            {t.board.callBtn}
          </a>
          {waLink.length >= 10 && (
            <a
              href={`https://wa.me/${waLink}`}
              target="_blank"
              rel="noopener noreferrer"
              className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
            >
              {t.board.whatsappBtn}
            </a>
          )}
        </div>
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

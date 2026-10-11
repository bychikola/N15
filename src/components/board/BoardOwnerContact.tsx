import type { FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { officeWaHref, SITE_PHONE, SITE_PHONE_TEL } from '@/lib/call-routing'

/**
 * «Связаться с собственником» — контакт на странице объявления, собранного
 * из заявки собственника (source: 'owner').
 *
 * Номер владельца на сайте не показывается: собственник оставлял его для
 * связи с Н15, а не для открытой доски (см. boardShowsPublicPhone в
 * src/lib/board.ts). Посредник — Н15: покупатель звонит или пишет в агентство,
 * и сотрудник соединяет его с владельцем. Кнопки ведут на общий номер Н15 —
 * тот же, что в шапке, подвале и «Контактах», — а не на номер собственника;
 * сам номер в блоке не выводим, о посреднике говорит подпись под кнопками.
 */
export const BoardOwnerContact: FC<{ t: Dict }> = ({ t }) => {
  const waLink = officeWaHref(SITE_PHONE)
  return (
    <div>
      <p className="mb-3 text-sm text-[var(--n15-gold)]">{t.board.ownerContactTitle}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={SITE_PHONE_TEL}
          className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
        >
          {t.board.ownerCall}
        </a>
        {waLink.length >= 10 && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
          >
            {t.board.ownerWhatsapp}
          </a>
        )}
      </div>
      <p className="mt-2 text-[11px] text-[var(--n15-muted)]">{t.board.ownerContactVia}</p>
    </div>
  )
}

import type { FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { officeWaHref, SITE_PHONE, SITE_PHONE_TEL } from '@/lib/call-routing'

/**
 * «Связаться с собственником через Н15» — контакт на странице объявления,
 * собранного из заявки собственника (source: 'owner').
 *
 * Номер владельца на сайте не показывается: кнопка «Показать телефон» и ссылки
 * tel: и WhatsApp раскрыли бы его любому, а собственник оставлял номер для
 * связи с Н15, а не для открытой доски (см. boardShowsPublicPhone в
 * src/lib/board.ts). Посредник — Н15: покупатель звонит или пишет в агентство,
 * и сотрудник соединяет его с владельцем. Кнопки ведут на общий номер Н15 —
 * тот же, что в шапке, подвале и «Контактах», — а не на номер собственника.
 *
 * Номер телефона виден в разметке: это общий рабочий номер агентства, а не
 * персональные данные частного лица, поэтому прятать его не нужно.
 */
export const BoardOwnerContact: FC<{ t: Dict }> = ({ t }) => {
  const waLink = officeWaHref(SITE_PHONE)
  return (
    <div>
      <p className="mb-2 text-sm text-[var(--n15-gold)]">{t.board.ownerContactTitle}</p>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.board.ownerContactText}</p>
      <p className="mb-3 text-lg font-semibold tracking-wide text-[var(--n15-white)]">{SITE_PHONE}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={SITE_PHONE_TEL}
          className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
        >
          {t.board.ownerCallN15}
        </a>
        {waLink.length >= 10 && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="n15-cta-green flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
          >
            {t.board.ownerWhatsappN15}
          </a>
        )}
      </div>
      <p className="mt-2 text-[11px] text-[var(--n15-muted)]">{t.board.ownerContactPrivacy}</p>
    </div>
  )
}

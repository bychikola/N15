import { GoalLink } from '@/components/analytics/GoalLink'
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  phone?: string
}

export default function ContactSection({ t, phone }: Props) {
  const phoneHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'
  const phoneLabel = phone || '8 958 116-15-15'

  return (
    <section className="lp-contact" id="contact">
      <div>
        <p className="lp-eyebrow">{t.landing.contactEyebrow}</p>
        <h2>
          {t.landing.contactTitle1}
          <br />
          {t.landing.contactTitle2}
        </h2>
      </div>
      <div className="lp-contact-copy">
        <p>{t.landing.contactText}</p>
        {/* Обе ссылки ведут на общий номер: переход не задерживается,
            цель «нажатие Позвонить» уходит в Метрику (номер — нет) */}
        <GoalLink className="lp-contact-phone" href={phoneHref} goal="call_click">{phoneLabel}</GoalLink>
        <GoalLink className="lp-button" href={phoneHref} goal="call_click">
          {t.landing.contactCall} <span aria-hidden="true">→</span>
        </GoalLink>
        <small>{t.landing.contactNote}</small>
      </div>
    </section>
  )
}

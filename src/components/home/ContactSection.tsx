import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  phone?: string
}

export default function ContactSection({ t, phone }: Props) {
  const phoneHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79188374111'
  const phoneLabel = phone || '+7 (918) 837-41-11'

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
        <a className="lp-contact-phone" href={phoneHref}>{phoneLabel}</a>
        <a className="lp-button" href={phoneHref}>
          {t.landing.contactCall} <span aria-hidden="true">→</span>
        </a>
        <small>{t.landing.contactNote}</small>
      </div>
    </section>
  )
}

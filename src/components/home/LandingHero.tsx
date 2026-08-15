import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

export default function LandingHero({ t }: Props) {
  return (
    <section className="lp-section lp-hero" id="top">
      <div className="lp-hero-visual" aria-hidden="true" />
      <div className="lp-hero-overlay" aria-hidden="true" />
      <div className="lp-hero-content">
        <p className="lp-eyebrow lp-eyebrow-light">{t.landing.heroEyebrow}</p>
        <h1>
          {t.landing.heroTitle1}
          <br />
          {t.landing.heroTitle2}
        </h1>
        <p className="lp-hero-copy">{t.landing.heroCopy}</p>
        <a className="lp-button" href="#objects">
          {t.landing.heroCta} <span aria-hidden="true">→</span>
        </a>
      </div>
      <p className="lp-hero-note">{t.landing.heroNote}</p>
    </section>
  )
}

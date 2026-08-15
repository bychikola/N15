import type { Dict } from '@/i18n/dictionaries'

export default function AboutSection({ t }: { t: Dict }) {
  return (
    <section className="lp-about" id="about">
      <div className="lp-about-image" aria-hidden="true">
        <img src="/img/fatima-ossetia.png" alt="" />
      </div>
      <div className="lp-about-copy">
        <p className="lp-eyebrow">{t.landing.aboutEyebrow}</p>
        <h2 className="lp-h2">
          {t.landing.aboutTitle1}
          <br />
          {t.landing.aboutTitle2}
        </h2>
        <p>{t.landing.aboutText}</p>
        <div className="lp-signature">
          <span>{t.landing.aboutSignature}</span>
          <p>{t.landing.aboutSignatureText}</p>
        </div>
        <div className="lp-directions">
          <details>
            <summary>
              {t.landing.aboutDirections} <i>+</i>
            </summary>
            <p>{t.landing.aboutDirectionsText}</p>
          </details>
        </div>
      </div>
    </section>
  )
}

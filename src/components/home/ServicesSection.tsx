import type { Dict } from '@/i18n/dictionaries'

export default function ServicesSection({ t }: { t: Dict }) {
  return (
    <section className="lp-section lp-services" id="design">
      <details className="lp-design-disclosure">
        <summary>
          <h2>
            {t.landing.servicesTitle1}
            <br />
            {t.landing.servicesTitle2}
          </h2>
          <i>+</i>
        </summary>
        <div className="lp-service-list">
          <article className="lp-home-service">
            <span>01</span>
            <h3>{t.landing.serviceDesignTitle}</h3>
            <p>{t.landing.serviceDesignText}</p>
          </article>
          <article className="lp-home-service">
            <span>02</span>
            <h3>{t.landing.serviceRepairTitle}</h3>
            <p>{t.landing.serviceRepairText}</p>
          </article>
        </div>
      </details>
    </section>
  )
}

'use client'

import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import { COUNTRY_AREAS, NEAR_VIK } from './landing-data'

export default function CountryGuide({ t, lang }: { t: Dict; lang: string }) {
  return (
    <section className="lp-country" id="country">
      <div className="lp-country-heading">
        <div>
          <p className="lp-eyebrow lp-eyebrow-light">{t.landing.countryEyebrow}</p>
          <h2 className="lp-h2">
            {t.landing.countryTitle1}
            <br />
            {t.landing.countryTitle2}
          </h2>
        </div>
        <p>{t.landing.countrySubtitle}</p>
      </div>

      <details className="lp-nearby">
        <summary>
          <span>{t.landing.countryNearby}</span>
          <i>+</i>
        </summary>
        <p>{NEAR_VIK.join(' · ')}</p>
      </details>

      <details className="lp-country-disclosure">
        <summary>
          <span>{t.landing.countryDistrictsLabel}</span>
          <i>+</i>
        </summary>
        <div className="lp-districts">
          {COUNTRY_AREAS.map((area, index) => (
            <details key={area.district}>
              <summary>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <Link
                  href={`/${lang}/catalog?district=${encodeURIComponent(area.district)}`}
                  className="lp-district-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {area.district}{index === 0 ? ' — официальный состав' : ''}
                </Link>
                <i>+</i>
              </summary>
              <p>{area.places}</p>
            </details>
          ))}
        </div>
      </details>
    </section>
  )
}

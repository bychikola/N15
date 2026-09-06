'use client'

import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import { COUNTRY_AREAS, NEAR_VIK } from './landing-data'
// Садоводческие товарищества (СНТ/СНО/ДНТ) живут только внутри
// Владикавказского городского округа — не относятся к районам республики
import { VLAV_OKRUG, GARDENING_CATEGORY_ORDER, GARDENING_AREAS } from '@/lib/districts'

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
        {/* Каждый пригород — отдельная ссылка на каталог с фильтром
            по населённому пункту (address.locality), а не общая строка */}
        <div className="lp-nearby-places">
          {NEAR_VIK.map((place) => (
            <Link
              key={place}
              href={`/${lang}/catalog?locality=${encodeURIComponent(place)}`}
              className="lp-place-chip lp-place-chip-nearby"
            >
              {place}
            </Link>
          ))}
        </div>
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
                <strong>{area.district}{index === 0 ? ' — официальный состав' : ''}</strong>
                <i>+</i>
              </summary>
              <div className="lp-places">
                {area.places.split(' · ').map((place) => (
                  <Link
                    key={place}
                    href={`/${lang}/catalog?district=${encodeURIComponent(area.district)}`}
                    className="lp-place-chip"
                  >
                    {place}
                  </Link>
                ))}
              </div>
              {/* Подраздел садовых товариществ — после официальных населённых
                  пунктов и только внутри Владикавказского городского округа:
                  категории СНТ/СНО/ДНТ раскрываются, каждое товарищество —
                  отдельная ссылка на каталог с фильтром по нему (address.snt) */}
              {area.district === VLAV_OKRUG && (
                <div className="lp-snts">
                  <p className="lp-snts-title">{t.landing.countrySntTitle}</p>
                  {GARDENING_CATEGORY_ORDER.map((category) => {
                    const items = GARDENING_AREAS[category]
                    // Пустые категории (например ДНТ без товариществ в справочнике)
                    // не показываем
                    if (!items.length) return null
                    return (
                      <details key={category} className="lp-snt-cat">
                        <summary>
                          <span>{category}</span>
                          <i>+</i>
                        </summary>
                        <div className="lp-places">
                          {items.map((snt) => (
                            <Link
                              key={snt}
                              href={`/${lang}/catalog?snt=${encodeURIComponent(snt)}`}
                              className="lp-place-chip"
                            >
                              {snt}
                            </Link>
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )}
            </details>
          ))}
        </div>
      </details>
    </section>
  )
}

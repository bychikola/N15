import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import { INTERREGIONAL_REGIONS } from '@/lib/interregional'

interface Props {
  t: Dict
  lang: string
  /** Города с опубликованными объектами (address.city), приходят с главной */
  cities: ReadonlySet<string>
}

// Блок «Межрегиональная недвижимость» на главной: строки-регионы
// раскрываются, как районы республики в прежнем справочнике (те же
// разделители и стрелки). Внутри — города, где есть опубликованные
// объекты: каждый город — ссылка на каталог с фильтром по нему
// (/catalog?city=). Городов без объектов в списке нет.
export default function InterregionalGuide({ t, lang, cities }: Props) {
  return (
    <section className="lp-country" id="country">
      <div className="lp-country-heading">
        <div>
          <p className="lp-eyebrow lp-eyebrow-light">{t.landing.countryEyebrow}</p>
          <h2 className="lp-h2">{t.landing.countryTitle}</h2>
        </div>
        <p>{t.landing.countrySubtitle}</p>
      </div>

      <div className="lp-country-disclosure">
        <div className="lp-districts">
          {INTERREGIONAL_REGIONS.map((region, index) => {
            const hasObjects = region.groups.some((group) =>
              group.cities.some((city) => cities.has(city)),
            )
            return (
              <details key={region.title}>
                <summary>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{region.title}</strong>
                  <i>+</i>
                </summary>
                {hasObjects ? (
                  region.groups.map((group) => {
                    const present = group.cities.filter((city) => cities.has(city))
                    if (!present.length) return null
                    return (
                      <div key={group.label ?? group.cities[0]}>
                        {group.label && <p className="lp-region-subtitle">{group.label}</p>}
                        <div className="lp-places">
                          {present.map((city) => (
                            <Link
                              key={city}
                              href={`/${lang}/catalog?city=${encodeURIComponent(city)}`}
                              className="lp-place-chip lp-region-chip"
                            >
                              {city}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  // Городов с объектами в регионе нет — раскрытие показывает
                  // честное сообщение вместо пустого списка
                  <p>{t.landing.countryRegionEmpty}</p>
                )}
              </details>
            )
          })}
        </div>
      </div>
    </section>
  )
}

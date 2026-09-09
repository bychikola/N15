import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import {
  INTERREGIONAL_REGIONS,
  type InterregionalGroup,
  type InterregionalObject,
} from '@/lib/interregional'

interface Props {
  t: Dict
  lang: string
  /** Публикованные объекты по городам справочника: город → объекты Н15,
   *  свежие первыми. Город, которого нет в карте, считается пустым. */
  objectsByCity: ReadonlyMap<string, readonly InterregionalObject[]>
}

/** Сколько предложений города показывается в раскрытой строке (остальные — в каталоге) */
const OBJECTS_PER_CITY = 5

const groupVisible = (group: InterregionalGroup, objectsByCity: ReadonlyMap<string, readonly InterregionalObject[]>) =>
  group.cities.length > 0 || (group.extra ?? []).some((city) => objectsByCity.has(city))

// Блок «Межрегиональная недвижимость» на главной: строки-регионы (01-04)
// раскрываются в города — те же разделители и стрелки, что у районов
// республики в прежнем справочнике. Каждый город — строка: название,
// счётчик объектов и «+»; строка раскрывается в актуальные предложения Н15
// в этом городе (ссылки на карточки объектов) и на каталог города
// (/catalog?city=). Ключевые города видны всегда; в городе без объектов
// строка помечается «Объектов Н15 пока нет» — показываем его в справочнике,
// не выдумывая предложений.
export default function InterregionalGuide({ t, lang, objectsByCity }: Props) {
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
          {INTERREGIONAL_REGIONS.map((region, index) => (
            <details key={region.title}>
              <summary>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{region.title}</strong>
                <i>+</i>
              </summary>
              {region.groups.some((group) => groupVisible(group, objectsByCity)) ? (
                region.groups.map((group) => {
                  if (!groupVisible(group, objectsByCity)) return null
                  const cities = [
                    ...group.cities,
                    // Прочие города справочника: показываем только те,
                    // где реально есть опубликованные объекты
                    ...(group.extra ?? []).filter((city) => objectsByCity.has(city)),
                  ]
                  return (
                    <div key={group.label ?? group.cities[0]}>
                      {group.label && <p className="lp-region-subtitle">{group.label}</p>}
                      <ul className="lp-city-list">
                        {cities.map((city) => (
                          <CityRow
                            key={city}
                            city={city}
                            objects={objectsByCity.get(city)}
                            t={t}
                            lang={lang}
                          />
                        ))}
                      </ul>
                    </div>
                  )
                })
              ) : (
                <p>{t.landing.countryRegionEmpty}</p>
              )}
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CityRow({
  city,
  objects,
  t,
  lang,
}: {
  city: string
  objects: readonly InterregionalObject[] | undefined
  t: Dict
  lang: string
}) {
  const count = objects?.length ?? 0
  return (
    <li>
      <details className="lp-city">
        <summary>
          <span className="lp-city-name">{city}</span>
          {count > 0 ? (
            <em className="lp-city-count">{count}</em>
          ) : (
            <small className="lp-city-none">{t.landing.countryCityNone}</small>
          )}
          <i>+</i>
        </summary>
        {count > 0 ? (
          <div className="lp-city-body">
            <ul className="lp-city-objects">
              {objects!.slice(0, OBJECTS_PER_CITY).map((obj) => (
                <li key={obj.id}>
                  <Link className="lp-city-object" href={`/${lang}/catalog/${obj.slug ?? obj.id}`}>
                    <span className="lp-city-object-title">{obj.title}</span>
                    {(obj.street || obj.house) && (
                      <span className="lp-city-object-addr">
                        {[obj.street, obj.house].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {obj.price != null && (
                      <span className="lp-city-object-price">
                        {obj.price.toLocaleString(t.locale)} {t.common.currency}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <Link className="lp-city-link-all" href={`/${lang}/catalog?city=${encodeURIComponent(city)}`}>
              {t.landing.countryCityAll} — {count}
            </Link>
          </div>
        ) : (
          <p className="lp-city-empty">
            {t.landing.countryCityNone}.{' '}
            <Link className="lp-city-cta" href={`/${lang}/contacts`}>
              {t.landing.countryCityLead}
            </Link>
          </p>
        )}
      </details>
    </li>
  )
}

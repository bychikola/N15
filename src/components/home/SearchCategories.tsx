import type { Dict } from '@/i18n/dictionaries'
import { DISTRICTS, NEAR_VIK, SNT_AREAS, CITIES, COUNTRY_AREAS, PRIORITY } from './landing-data'

interface Props {
  t: Dict
  lang: string
}

function Chips({ items, hrefBuilder }: { items: string[]; hrefBuilder: (item: string) => string }) {
  return (
    <div className="lp-chips">
      {items.map((item) => (
        <a key={item} href={hrefBuilder(item)}>{item}</a>
      ))}
    </div>
  )
}

export default function SearchCategories({ t, lang }: Props) {
  // Фильтрация работает прямо на лендинге: чипы ведут на главную с параметрами,
  // секция «Избранные объекты» (#featured) показывает результат подбора.
  const catalog = (params: string) => `/${lang}?${params}#featured`

  return (
    <section className="lp-section lp-objects" id="objects">
      <div className="lp-objects-heading">
        <div>
          <p className="lp-eyebrow">{t.landing.searchEyebrow}</p>
          <h2 className="lp-h2">{t.landing.searchTitle}</h2>
        </div>
        <p className="lp-muted">{t.landing.searchSubtitle}</p>
      </div>

      <div className="lp-categories">
        {/* 01 Квартиры */}
        <details id="apartments">
          <summary>
            <span>01</span>
            <div>
              <h3>{t.landing.catApartments}</h3>
              <p>{t.landing.catApartmentsDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters">
            <div>
              <small>{t.landing.roomsLabel}</small>
              <Chips
                items={[t.landing.room1, t.landing.room2, t.landing.room3, t.landing.room4]}
                hrefBuilder={(room) => {
                  const rooms = room === t.landing.room4 ? '4' : room === t.landing.room3 ? '3' : room === t.landing.room2 ? '2' : '1'
                  return catalog(`category=apartment&rooms=${rooms}`)
                }}
              />
            </div>
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=apartment&district=${encodeURIComponent(d)}`)} />
            </div>
          </div>
        </details>

        {/* 02 Частные дома */}
        <details id="houses">
          <summary>
            <span>02</span>
            <div>
              <h3>{t.landing.catHouses}</h3>
              <p>{t.landing.catHousesDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters lp-land-filters">
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=house&district=${encodeURIComponent(d)}`)} />
            </div>
            <div>
              <small>{t.landing.countryNearby}</small>
              <Chips items={NEAR_VIK} hrefBuilder={() => catalog('category=house')} />
            </div>
            <div className="lp-settlement-filter">
              <small>Населённые пункты по официальным районам</small>
              <div className="lp-settlement-groups">
                {COUNTRY_AREAS.map((area) => (
                  <details key={area.district} open={area.district === 'Ардонский район' || area.district === 'Дигорский район'}>
                    <summary>
                      {area.district}
                      <span className="lp-settlement-count">{area.places.split(' · ').length}</span>
                      <i>+</i>
                    </summary>
                    <p>{area.places}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="lp-settlement-filter">
              <small>СТ, СНТ, СНО и ДНТ</small>
              <Chips items={SNT_AREAS} hrefBuilder={(snt) => catalog(`category=house&snt=${encodeURIComponent(snt)}`)} />
            </div>
          </div>
        </details>

        {/* 03 Земельные участки */}
        <details id="land">
          <summary>
            <span>03</span>
            <div>
              <h3>{t.landing.catLand}</h3>
              <p>{t.landing.catLandDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters lp-land-filters">
            <div>
              <small>Города</small>
              <Chips items={CITIES} hrefBuilder={() => catalog('category=land')} />
            </div>
            <div>
              <small>{t.landing.countryNearby}</small>
              <Chips items={NEAR_VIK} hrefBuilder={() => catalog('category=land')} />
            </div>
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=land&district=${encodeURIComponent(d)}`)} />
            </div>
            <div className="lp-settlement-filter">
              <small>Населённые пункты по официальным районам</small>
              <div className="lp-settlement-groups">
                {PRIORITY.map((area) => (
                  <details key={area.district}>
                    <summary>
                      {area.district}
                      <span className="lp-settlement-count">{area.places.split(' · ').length}</span>
                      <i>+</i>
                    </summary>
                    <p>{area.places}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="lp-settlement-filter">
              <small>СТ, СНТ, СНО и ДНТ</small>
              <Chips items={SNT_AREAS} hrefBuilder={(snt) => catalog(`category=land&snt=${encodeURIComponent(snt)}`)} />
            </div>
          </div>
        </details>

        {/* 04 Коммерческая */}
        <details id="commercial">
          <summary>
            <span>04</span>
            <div>
              <h3>{t.landing.catCommercial}</h3>
              <p>{t.landing.catCommercialDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters">
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=commercial&district=${encodeURIComponent(d)}`)} />
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

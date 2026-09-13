import type { Dict } from '@/i18n/dictionaries'
import { INTERREGIONAL_REGIONS } from '@/lib/interregional'

interface Props {
  t: Dict
  lang: string
}

// Блок «Межрегиональная недвижимость» на главной — сетка карточек-ссылок
// того же формата, что у категорий недвижимости (см. SearchCategories):
// номер, название региона и стрелка. Карточка целиком ведёт на страницу
// направления «Межрегиональные объекты» — там города регионов и их
// предложения. Названия регионов — справочник src/lib/interregional.ts.
export default function InterregionalGuide({ t, lang }: Props) {
  return (
    <section className="lp-section lp-objects" id="country">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.countryTitle}</h2>
      </div>

      <div className="lp-categories">
        {INTERREGIONAL_REGIONS.map((region, index) => (
          <a className="lp-category-card" key={region.title} href={`/${lang}/interregional`}>
            <span className="lp-category-num">{String(index + 1).padStart(2, '0')}</span>
            <h3>{region.title}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>
    </section>
  )
}

import type { Dict } from '@/i18n/dictionaries'
import type { InterregionalRegion } from '@/lib/interregional'

interface Props {
  t: Dict
  lang: string
  /** Регионы справочника из CRM (см. src/lib/interregional-service.ts) */
  regions: InterregionalRegion[]
}

// Блок «Межрегиональная недвижимость» на главной — сетка карточек-ссылок
// того же формата, что у категорий недвижимости (см. SearchCategories):
// номер, название региона и стрелка. Карточка целиком ведёт на страницу
// направления «Межрегиональные объекты» — там регионы раскрываются в
// населённые пункты. Список регионов приходит из CRM, в компоненте его нет:
// добавленный в CRM регион появляется на главной сам.
export default function InterregionalGuide({ t, lang, regions }: Props) {
  // Справочник пуст (CRM ещё не заполнена) — блока на главной нет,
  // пустой сетки не показываем
  if (regions.length === 0) return null

  return (
    <section className="lp-section lp-objects" id="country">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.countryTitle}</h2>
      </div>

      <div className="lp-categories">
        {regions.map((region, index) => (
          <a
            className="lp-category-card"
            key={region.id}
            href={`/${lang}/interregional#region-${region.slug}`}
          >
            <span className="lp-category-num">{String(index + 1).padStart(2, '0')}</span>
            <h3>{region.title}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>
    </section>
  )
}

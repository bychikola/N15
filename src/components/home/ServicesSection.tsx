import type { Dict } from '@/i18n/dictionaries'

// Шесть карточек блока «Дизайн и ремонт под ключ» — названия услуг
// (ключи designCard1..6 в landing-словаре). Карточка ведёт на описание
// услуги на странице направления /services/design; id якорей те же, что
// у меню «Дизайн интерьера» в шапке (см. Header.tsx)
const ITEMS = [
  { title: 'designCard1', anchor: 'dizayn-proekt' },
  { title: 'designCard2', anchor: 'planirovka' },
  { title: 'designCard3', anchor: 'vizualizaciya' },
  { title: 'designCard4', anchor: 'podbor' },
  { title: 'designCard5', anchor: 'komplektaciya' },
  { title: 'designCard6', anchor: 'nadzor' },
] as const

// Блок «Дизайн и ремонт под ключ» на главной — сетка карточек-ссылок того же
// формата, что у категорий недвижимости (см. SearchCategories): номер,
// название услуги и стрелка
export default function ServicesSection({ t, lang }: { t: Dict; lang: string }) {
  return (
    <section className="lp-section lp-objects" id="design">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">
          {t.landing.servicesTitle1} {t.landing.servicesTitle2}
        </h2>
      </div>

      <div className="lp-categories">
        {ITEMS.map((item, index) => (
          <a
            className="lp-category-card"
            key={item.anchor}
            href={`/${lang}/services/design#${item.anchor}`}
          >
            <span className="lp-category-num">{String(index + 1).padStart(2, '0')}</span>
            <h3>{t.landing[item.title]}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>
    </section>
  )
}

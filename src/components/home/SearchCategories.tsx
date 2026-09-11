import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

export default function SearchCategories({ t, lang }: Props) {
  // Сетка 2×2: четыре категории недвижимости. Карточка целиком — ссылка
  // на каталог с фильтром по категории, справа в каждой — стрелка-указатель
  const catalog = (params: string) => `/${lang}/catalog?${params}`

  const categories = [
    { n: '01', title: t.landing.catApartments, href: catalog('category=apartment') },
    { n: '02', title: t.landing.catHouses, href: catalog('category=house') },
    { n: '03', title: t.landing.catLand, href: catalog('category=land') },
    { n: '04', title: t.landing.catCommercial, href: catalog('category=commercial') },
  ]

  return (
    <section className="lp-section lp-objects" id="objects">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.searchTitle}</h2>
      </div>

      <div className="lp-categories">
        {categories.map((cat) => (
          <a className="lp-category-card" key={cat.n} href={cat.href}>
            <span className="lp-category-num">{cat.n}</span>
            <h3>{cat.title}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>
    </section>
  )
}

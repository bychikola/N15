import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

// «Подберите недвижимость»: быстрый поиск и шесть категорий каталога —
// квартиры, дома, участки, коммерция, комнаты, гаражи (коды категорий —
// src/lib/object-categories.ts). Карточка целиком — ссылка на каталог
// с фильтром по категории, слева номер, справа стрелка-указатель.
// Поиск — обычная GET-форма: запрос уходит в каталог параметром q
// (его читает CatalogContent), клиентский JS для этого не нужен.
export default function SearchCategories({ t, lang }: Props) {
  const catalog = (params: string) => `/${lang}/catalog?${params}`

  const categories = [
    { n: '01', title: t.landing.catApartments, href: catalog('category=apartment') },
    { n: '02', title: t.landing.catHouses, href: catalog('category=house') },
    { n: '03', title: t.landing.catLand, href: catalog('category=land') },
    { n: '04', title: t.landing.catCommercial, href: catalog('category=commercial') },
    { n: '05', title: t.landing.catRooms, href: catalog('category=room') },
    { n: '06', title: t.landing.catGarages, href: catalog('category=garage') },
  ]

  return (
    <section className="lp-section lp-objects" id="objects">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.searchTitle}</h2>
      </div>

      {/* Строка поиска — та же, что над каталогом (.catalog-search) */}
      <form className="catalog-search max-w-xl mb-7" action={`/${lang}/catalog`} method="get" role="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--n15-muted)] shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input type="search" name="q" placeholder={t.catalog.searchPlaceholder} aria-label={t.catalog.searchPlaceholder} />
        <button type="submit" className="lp-search-submit">{t.search.find}</button>
      </form>

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

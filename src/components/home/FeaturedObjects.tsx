import type { Dict } from '@/i18n/dictionaries'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'

interface Props {
  objects: ObjectListItem[]
  t: Dict
  lang: string
  filterSummary?: string
}

// Заглушка при пустой выдаче: та же карточка-каталога, но со статичным
// фото/текстом и ссылкой на каталог (объекта с таким id нет).
function PlaceholderCard({
  lang,
  t,
  img,
  title,
  address,
}: {
  lang: string
  t: Dict
  img: string
  title: string
  address: string
}) {
  return (
    <a href={`/${lang}/catalog`} className="object-card group block flex h-full flex-col bg-[var(--search-bg)]">
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        <img src={img} alt={title} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <span className="object-card__pill">{t.object.sale}</span>
        <div className="object-card__overlay" />
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3 pb-3">
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1">{title}</h3>
        <p className="text-xs text-[var(--n15-muted)]">{address}</p>
      </div>
    </a>
  )
}

export default function FeaturedObjects({ objects, t, lang, filterSummary }: Props) {
  const cards = objects.length
    ? objects.map((o) => <ObjectCard key={o.id} obj={o} lang={lang} t={t} />)
    : [
        <PlaceholderCard
          key="ph1"
          lang={lang}
          t={t}
          img="/img/apartment.png"
          title="Квартира с панорамным видом"
          address="Владикавказ · Иристонский район"
        />,
        <PlaceholderCard
          key="ph2"
          lang={lang}
          t={t}
          img="/img/villa.png"
          title="Современная резиденция"
          address="Владикавказ"
        />,
        <PlaceholderCard
          key="ph3"
          lang={lang}
          t={t}
          img="/img/apartment.png"
          title="Квартира с панорамным видом"
          address="Владикавказ · Иристонский район"
        />,
        <PlaceholderCard
          key="ph4"
          lang={lang}
          t={t}
          img="/img/villa.png"
          title="Современная резиденция"
          address="Владикавказ"
        />,
      ]

  return (
    <section className="lp-section lp-featured" id="featured">
      <div className="lp-featured-title">
        <p className="lp-eyebrow">{filterSummary ? t.landing.featuredFilteredEyebrow : t.landing.featuredEyebrow}</p>
        <h2 className="lp-h2">{filterSummary ? t.landing.featuredFilteredTitle : t.landing.featuredTitle}</h2>
        {filterSummary && (
          <div className="lp-featured-filter">
            <span className="lp-featured-filter-summary">{filterSummary}</span>
            <a className="lp-featured-filter-reset" href={`/${lang}/catalog`}>
              {t.landing.featuredShowAll}
            </a>
          </div>
        )}
      </div>
      {/* Сетка как в каталоге: телефон — 1, планшет — 2, ноутбук — 3,
          компьютер (≥1280px) — 4 одинаковых карточки в ряд */}
      <div className="lp-cards grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
        {cards}
      </div>
    </section>
  )
}

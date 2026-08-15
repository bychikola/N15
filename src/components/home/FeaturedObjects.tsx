import type { Dict } from '@/i18n/dictionaries'

export interface LandingObject {
  id: number
  title: string
  price: number
  category: string
  location?: string
  district?: string
  area?: number
  rooms?: number
  imageUrl?: string
}

interface Props {
  objects: LandingObject[]
  t: Dict
  lang: string
  filterSummary?: string
}

export default function FeaturedObjects({ objects, t, lang, filterSummary }: Props) {
  const details = (o: LandingObject) =>
    [
      o.area ? `${o.area} м²` : null,
      o.rooms ? `${o.rooms} комн.` : null,
    ].filter(Boolean).join(' · ')

  const cards = objects.length
    ? objects.map((o) => (
        <a
          key={o.id}
          href={`/${lang}/catalog/${o.id}`}
          className="lp-property-card"
          style={o.imageUrl ? { backgroundImage: `url(${o.imageUrl})` } : undefined}
        >
          <span className="lp-property-badge">{o.category}</span>
          <div className="lp-property-info">
            <p>{[o.location, o.district].filter(Boolean).join(' · ')}</p>
            <h3>{o.title}</h3>
            <span>{details(o) || o.price.toLocaleString('ru-RU') + ' ₽'}</span>
            <small className="lp-property-open">{t.landing.openObject} →</small>
          </div>
        </a>
      ))
    : [
        <a key="ph1" href="#contact" className="lp-property-card" style={{ backgroundImage: "url('/img/apartment.png')" }}>
          <span className="lp-property-badge">Квартира</span>
          <div className="lp-property-info">
            <p>Владикавказ · Иристонский район</p>
            <h3>Квартира с панорамным видом</h3>
            <span>95 м² · 3 комнаты</span>
          </div>
        </a>,
        <a key="ph2" href="#contact" className="lp-property-card" style={{ backgroundImage: "url('/img/villa.png')" }}>
          <span className="lp-property-badge">Частный дом</span>
          <div className="lp-property-info">
            <p>Владикавказ</p>
            <h3>Современная резиденция</h3>
            <span>284 м² · участок 20 соток</span>
          </div>
        </a>,
      ]

  // Как в прототипе: ≤2 карточки — крупная пара (1.25fr/.75fr), больше — сетка по 3
  const cardsCls = cards.length > 2 ? 'lp-cards' : 'lp-cards lp-cards-duo'

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
      <div className={cardsCls}>{cards}</div>
    </section>
  )
}

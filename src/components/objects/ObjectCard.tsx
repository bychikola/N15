import type { Dict } from '@/i18n/dictionaries'

export interface ObjectListItem {
  id: number
  slug?: string
  title: string
  type: 'sale' | 'rent'
  category: string
  price: number
  area?: number
  rooms?: number
  floor?: number
  totalFloors?: number
  address?: { city?: string; street?: string; house?: string }
  primaryImage?: { url?: string; alt?: string }
  agent?: { name?: string; photo?: { url?: string } }
}

interface ObjectCardProps {
  obj: ObjectListItem
  lang: string
  t: Dict
}

export default function ObjectCard({ obj, lang, t }: ObjectCardProps) {
  const meta = [
    obj.area && `${obj.area} ${t.catalog.sqm}`,
    obj.rooms && `${obj.rooms} ${t.catalog.rooms}`,
    (obj.floor || obj.totalFloors) && `${obj.floor || '?'}/${obj.totalFloors || '?'} ${t.object.floor.toLowerCase()}`,
  ].filter(Boolean).join(' • ')

  const agentInitials = obj.agent?.name
    ? obj.agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : ''

  // Ссылка по id: кириллические slug-сегменты не матчатся роутером этой сборки
  // Next.js (дают 404), числовой id работает всегда. Роут [slug] умеет оба вида.
  const href = `/${lang}/catalog/${obj.id}`

  return (
    <a href={href} className="group block">
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        {obj.primaryImage?.url ? (
          <img
            src={obj.primaryImage.url}
            alt={obj.primaryImage.alt || obj.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity">
              <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
              <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
            </svg>
          </div>
        )}
        <span className="object-card__pill">{obj.type === 'sale' ? t.object.sale : t.object.rent}</span>
        <div className="object-card__overlay" />
        <div className="absolute bottom-3 left-4 right-4 z-10">
          <div className="text-[30px] leading-tight font-[family-name:var(--font-display)] font-semibold text-[var(--card-price-fg)]">
            {obj.price?.toLocaleString(t.locale)} {obj.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}
          </div>
        </div>
      </div>

      <div className="pt-4">
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1.5 group-hover:text-[var(--n15-gold)] transition-colors">
          {obj.title}
        </h3>
        <p className="text-xs text-[var(--n15-muted)] mb-2">
          {[obj.address?.street, obj.address?.house].filter(Boolean).join(', ')}
        </p>
        {meta && <p className="text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-3">{meta}</p>}
        {obj.agent?.name && (
          <div className="flex items-center gap-2">
            {obj.agent.photo?.url ? (
              <img src={obj.agent.photo.url} alt={obj.agent.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center text-[10px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                {agentInitials}
              </span>
            )}
            <span className="text-xs text-[var(--n15-muted)]">{obj.agent.name}</span>
          </div>
        )}
      </div>
    </a>
  )
}

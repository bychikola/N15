import type { Dict } from '@/i18n/dictionaries'
import { areaHuman, type AreaUnit } from '@/lib/area-format'
import { floorHuman } from '@/lib/floor-format'
// Значки вариантов покупки на обложке — «Ипотека», «Семейная ипотека»,
// «Рассрочка», «Военная ипотека» (см. src/lib/purchase-options.ts)
import { purchaseBadges, purchaseOptionsApply } from '@/lib/purchase-options'

export interface ObjectListItem {
  id: number
  slug?: string
  title: string
  type: 'sale' | 'rent'
  category: string
  price: number
  area?: number
  /** Единица, в которой агент вводил площадь участка (are — «6 соток»,
   *  ha — «1,2 га»; у участка площадь объекта и есть площадь участка) */
  areaUnit?: AreaUnit
  /** Земельный участок частного дома, м² — в своей единице (plotAreaUnit) */
  plotArea?: number
  plotAreaUnit?: AreaUnit
  rooms?: number
  floor?: number
  totalFloors?: number
  /** Подтверждённые варианты покупки — коды из src/lib/purchase-options.ts.
   *  На обложке показываются значками (до двух, см. purchaseBadges) */
  purchaseOptions?: string[]
  address?: { city?: string; district?: string; cityDistrict?: string; locality?: string; snt?: string; street?: string; house?: string }
  primaryImage?: {
    url?: string
    alt?: string
    focalPoint?: { x?: number; y?: number }
    // Payload-размеры: карточки грузят маленькую версию, а не оригинал (МБ)
    sizes?: { thumbnail?: { url?: string }; card?: { url?: string } }
  }
  agent?: {
    name?: string
    photo?: { url?: string; focalPoint?: { x?: number; y?: number }; sizes?: { thumbnail?: { url?: string } } }
  }
}

// Фокальная точка из админки (кроп при загрузке) — object-position для object-cover,
// чтобы лицо/важная часть не обрезалась при любом соотношении сторон.
export function focalPosition(f?: { x?: number; y?: number }): React.CSSProperties | undefined {
  if (!f || f.x === undefined || f.y === undefined) return undefined
  return { objectPosition: `${f.x * 100}% ${f.y * 100}%` }
}

interface ObjectCardProps {
  obj: ObjectListItem
  lang: string
  t: Dict
}

export default function ObjectCard({ obj, lang, t }: ObjectCardProps) {
  // Участок, сохранённый в сотках или гектарах, показываем «6 соток» / «1,2 га»
  // (как ввёл агент); м² и остальные категории — как раньше: «600 м²»
  const areaFmt = (n: number) => n.toLocaleString(t.locale, { maximumFractionDigits: 3 })
  const areaWords = { are: t.catalog.areaUnits, ha: t.catalog.hectareUnits }
  const areaLabel = areaHuman(obj.area, obj.areaUnit, areaWords, areaFmt)
  // Дом и таунхаус: площадь дома и площадь участка — разные строки меты
  const isHouse = obj.category === 'house' || obj.category === 'townhouse'
  const plotAreaLabel = areaHuman(obj.plotArea, obj.plotAreaUnit, areaWords, areaFmt)
  // Дом и таунхаус — этажность дома («2 этажа»); у остальных категорий —
  // как раньше: «этаж / всего этажей» (этаж квартиры в доме)
  const floorsLabel = isHouse
    ? floorHuman(obj.totalFloors, t.object.floorUnits, (n) => n.toLocaleString(t.locale))
    : (obj.floor || obj.totalFloors) && `${obj.floor || '?'}/${obj.totalFloors || '?'} ${t.object.floor.toLowerCase()}`
  const meta = [
    areaLabel,
    plotAreaLabel,
    obj.rooms && `${obj.rooms} ${t.catalog.rooms}`,
    floorsLabel,
  ].filter(Boolean).join(' • ')

  // Значки вариантов покупки — рядом с бейджем «Продажа»/«Аренда», не больше
  // двух: при трёх и более вариантах обложка не перегружается, полный список
  // остаётся в карточке объекта (см. purchaseBadges). У аренды и земельных
  // участков вариантов покупки не бывает — значки им не показываем, даже если
  // отметки остались в старых данных (у продажи жилья и коммерции — показываем)
  const badges = (purchaseOptionsApply(obj.type, obj.category) ? purchaseBadges(obj.purchaseOptions) : [])
    .map((key) => t.object.purchaseBadges[key])

  const agentInitials = obj.agent?.name
    ? obj.agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : ''

  // Ссылка по id: кириллические slug-сегменты не матчатся роутером этой сборки
  // Next.js (дают 404), числовой id работает всегда. Роут [slug] умеет оба вида.
  const href = `/${lang}/catalog/${obj.id}`

  // Карточка грузит Payload-размер card/thumbnail, а не оригинал (экономия МБ)
  const primarySrc = obj.primaryImage?.sizes?.card?.url || obj.primaryImage?.sizes?.thumbnail?.url || obj.primaryImage?.url

  return (
    <a href={href} className="object-card group block flex h-full flex-col bg-[var(--search-bg)]">
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        {primarySrc && obj.primaryImage ? (
          <img
            src={primarySrc}
            alt={obj.primaryImage.alt || obj.title}
            loading="lazy"
            style={focalPosition(obj.primaryImage.focalPoint)}
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
        {/* Бейдж сделки и значки вариантов покупки — одной строкой у левого
            верхнего угла фото (см. .object-card__pills в globals.css) */}
        <span className="object-card__pills">
          <span className="object-card__pill">{obj.type === 'sale' ? t.object.sale : t.object.rent}</span>
          {badges.map((badge) => (
            <span key={badge} className="object-card__badge">{badge}</span>
          ))}
        </span>
        <div className="object-card__overlay" />
        <div className="object-card__price-wrap absolute bottom-3 left-4 right-4 z-10">
          <div className="object-card__price text-[30px] leading-tight font-[family-name:var(--font-display)] font-semibold text-[var(--card-price-fg)]">
            {obj.price?.toLocaleString(t.locale)} {obj.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}
          </div>
        </div>
      </div>

      {/* flex-1 + mt-auto: карточки в ряду одной высоты, блок агента прижат к низу.
          Классы-крючки (object-card__body и далее) — для компактного варианта
          карточки в блоке «Актуальные объекты» на главной (см. globals.css) */}
      <div className="object-card__body flex flex-1 flex-col px-4 pt-3 pb-3">
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1 group-hover:text-[var(--n15-gold)] transition-colors">
          {obj.title}
        </h3>
        <p className="object-card__addr text-xs text-[var(--n15-muted)] mb-1.5">
          {[
            obj.address?.snt,
            obj.address?.cityDistrict && `${obj.address.cityDistrict} район`,
            obj.address?.street,
            obj.address?.house,
          ].filter(Boolean).join(', ')}
        </p>
        {meta && <p className="object-card__meta text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-2">{meta}</p>}
        {obj.agent?.name && (
          <div className="object-card__agent flex items-center gap-2 mt-auto pt-2">
            {obj.agent.photo?.url ? (
              <img src={obj.agent.photo.sizes?.thumbnail?.url || obj.agent.photo.url} alt={obj.agent.name} style={focalPosition(obj.agent.photo.focalPoint)} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="object-card__avatar w-7 h-7 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center text-[10px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                {agentInitials}
              </span>
            )}
            <span className="object-card__agent-name text-xs text-[var(--n15-muted)]">{obj.agent.name}</span>
          </div>
        )}
      </div>
    </a>
  )
}

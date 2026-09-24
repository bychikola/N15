import type { FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { BoardListItem } from '@/lib/board-list-item'
import { areaHuman, type AreaUnit } from '@/lib/area-format'
import { floorHuman } from '@/lib/floor-format'
import { isHouseCategoryCode } from '@/lib/object-categories'

/**
 * Карточка объявления в выдаче доски.
 *
 * Оформление — то же, что у карточки каталога (классы .object-card* в
 * globals.css): размер 4/3, бейдж сделки, цена поверх фото, мета строкой.
 * Разница по существу одна: вместо агента показан тот, кто разместил, —
 * «Агентство Н15» или «Частное лицо»; по этой подписи покупатель сразу
 * понимает, с кем имеет дело. Телефон в карточке не показывается вовсе —
 * он отдаётся кнопкой на странице объявления.
 */
interface BoardAdCardProps {
  ad: BoardListItem
  lang: string
  t: Dict
}

export const BoardAdCard: FC<BoardAdCardProps> = ({ ad, lang, t }) => {
  const areaFmt = (n: number) => n.toLocaleString(t.locale, { maximumFractionDigits: 3 })
  const areaWords = { are: t.catalog.areaUnits, ha: t.catalog.hectareUnits }
  const areaLabel = areaHuman(ad.area, ad.areaUnit as AreaUnit, areaWords, areaFmt)
  const plotAreaLabel = areaHuman(ad.plotArea, (ad.plotAreaUnit || undefined) as AreaUnit | undefined, areaWords, areaFmt)

  // Этажность: у дома — «2 этажа», у квартиры — «5/9 этаж» (как в каталоге)
  const isHouse = isHouseCategoryCode(ad.category)
  const floorsLabel = isHouse
    ? ad.totalFloors
      ? floorHuman(ad.totalFloors, t.object.floorUnits, (n) => n.toLocaleString(t.locale))
      : ''
    : ad.floor || ad.totalFloors
      ? `${ad.floor || '?'}/${ad.totalFloors || '?'} ${t.object.floor.toLowerCase()}`
      : ''

  const categoryLabel = t.categoryLabels[ad.category as keyof typeof t.categoryLabels] || ad.category
  const meta = [
    categoryLabel,
    areaLabel,
    plotAreaLabel,
    ad.rooms && `${ad.rooms} ${t.catalog.rooms}`,
    floorsLabel,
  ].filter(Boolean).join(' • ')

  // Обложка — размер card (800px), запасной thumbnail, последним — оригинал
  const photo = ad.photo
  const coverSrc = photo?.sizes?.card?.url || photo?.sizes?.thumbnail?.url || photo?.url
  const isAgency = ad.authorKind === 'agency'

  return (
    <a href={`/${lang}/board/${ad.id}`} className="object-card group block flex h-full flex-col bg-[var(--search-bg)]">
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={photo?.alt || ad.title}
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
        <span className="object-card__pills">
          <span className="object-card__pill">
            {ad.dealType === 'rent' ? t.object.rent : t.object.sale}
          </span>
          {/* Объявления агентства помечаем бронзовым значком — как варианты
              покупки у объектов каталога, тот же класс оформления */}
          {isAgency && <span className="object-card__badge">{t.board.authorAgency}</span>}
        </span>
        <div className="object-card__overlay" />
        <div className="object-card__price-wrap absolute bottom-3 left-4 right-4 z-10">
          <div className="object-card__price text-[30px] leading-tight font-[family-name:var(--font-display)] font-semibold text-[var(--card-price-fg)]">
            {ad.price != null ? ad.price.toLocaleString(t.locale) : '—'}{' '}
            {ad.dealType === 'rent' ? t.catalog.perMonth : t.catalog.currency}
          </div>
        </div>
      </div>

      <div className="object-card__body flex flex-1 flex-col px-4 pt-3 pb-3">
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1 group-hover:text-[var(--n15-gold)] transition-colors">
          {ad.title}
        </h3>
        {/* Адрес без номера дома: на доске его не показываем (безопасность
            частных лиц), номер покупатель уточняет у автора */}
        {ad.address && <p className="object-card__addr text-xs text-[var(--n15-muted)] mb-1.5">{ad.address}</p>}
        {meta && <p className="object-card__meta text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-2">{meta}</p>}
        <div className="object-card__agent flex items-center gap-2 mt-auto pt-2">
          <span className="object-card__avatar w-7 h-7 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center text-[10px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
            {isAgency ? 'Н15' : (ad.authorName || '—').trim().split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </span>
          <span className="object-card__agent-name text-xs text-[var(--n15-muted)]">
            {isAgency ? t.board.authorAgency : t.board.authorPrivate}
          </span>
        </div>
      </div>
    </a>
  )
}

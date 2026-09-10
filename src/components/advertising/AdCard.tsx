import type { FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { SiteAdCard } from '@/lib/advertising-service'

/**
 * Карточка рекламного материала (страница /advertising): пометка «Реклама»,
 * сведения о рекламодателе и данные интернет-рекламы (erid) показываются
 * вместе с материалом всегда — маркировка собирается автоматически при
 * публикации (src/lib/advertising.ts).
 */
export const AdCard: FC<{ ad: SiteAdCard; t: Dict }> = ({ ad, t }) => {
  return (
    <article className="flex flex-col bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15">
      {ad.imageUrl && <img src={ad.imageUrl} alt={ad.imageAlt} loading="lazy" className="w-full h-40 object-cover" />}
      <div className="flex flex-col gap-3 p-5">
        {/* Пометка «Реклама» — отдельным знаком, как требует закон */}
        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]">
          {t.advertising.adLabel}
        </span>
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] leading-snug">
          {ad.title}
        </h3>
        {ad.text && <p className="text-sm leading-relaxed text-[var(--n15-silver)]">{ad.text}</p>}
        {ad.link && (
          // Переход по рекламной ссылке: sponsored + nofollow — search-разметка
          // рекламного материала, новый tab и noopener — безопасность
          <a
            href={ad.link}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] underline-offset-4 hover:underline"
          >
            {ad.linkLabel || t.advertising.adGo} →
          </a>
        )}
        {/* Сведения о рекламодателе и данные интернет-рекламы (erid) */}
        <p className="mt-auto pt-3 text-[10px] leading-relaxed text-[var(--n15-muted)] border-t border-[var(--n15-gold)]/10">
          {ad.markingText}
        </p>
      </div>
    </article>
  )
}

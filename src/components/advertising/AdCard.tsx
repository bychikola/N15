import type { FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { SiteAdCard } from '@/lib/advertising-service'

/**
 * Карточка рекламного материала: пометка «Реклама», сведения о рекламодателе
 * и данные интернет-рекламы (erid) показываются вместе с материалом всегда —
 * маркировка собирается автоматически при публикации (src/lib/advertising.ts).
 *
 * variant: 'landing' — блок «ВАША РЕКЛАМА» на главной (фиксированная светлая
 * палитра лендинга, классы .lp-ad-*), 'page' — страница /advertising (тема сайта).
 */
export const AdCard: FC<{ ad: SiteAdCard; t: Dict; variant?: 'landing' | 'page' }> = ({
  ad,
  t,
  variant = 'page',
}) => {
  const landing = variant === 'landing'
  const cardCls = landing
    ? 'lp-ad-card'
    : 'flex flex-col bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15'
  const bodyCls = landing ? 'lp-ad-card-body' : 'flex flex-col gap-3 p-5'
  const labelCls = landing ? 'lp-ad-label' : 'text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]'
  const titleCls = landing
    ? 'lp-ad-card-title'
    : 'text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] leading-snug'
  const textCls = landing ? 'lp-ad-card-text' : 'text-sm leading-relaxed text-[var(--n15-silver)]'
  const linkCls = landing
    ? 'lp-ad-card-link'
    : 'text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] underline-offset-4 hover:underline'
  const markingCls = landing ? 'lp-ad-marking' : 'mt-auto pt-3 text-[10px] leading-relaxed text-[var(--n15-muted)] border-t border-[var(--n15-gold)]/10'

  return (
    <article className={cardCls}>
      {ad.imageUrl && (
        <img src={ad.imageUrl} alt={ad.imageAlt} loading="lazy" className={landing ? 'lp-ad-card-img' : 'w-full h-40 object-cover'} />
      )}
      <div className={bodyCls}>
        {/* Пометка «Реклама» — отдельным знаком, как требует закон */}
        <span className={labelCls}>{t.advertising.adLabel}</span>
        <h3 className={titleCls}>{ad.title}</h3>
        {ad.text && <p className={textCls}>{ad.text}</p>}
        {ad.link && (
          // Переход по рекламной ссылке: sponsored + nofollow — search-разметка
          // рекламного материала, новый tab и noopener — безопасность
          <a href={ad.link} target="_blank" rel="noopener noreferrer nofollow sponsored" className={linkCls}>
            {ad.linkLabel || t.advertising.adGo} →
          </a>
        )}
        {/* Сведения о рекламодателе и данные интернет-рекламы (erid) */}
        <p className={markingCls}>{ad.markingText}</p>
      </div>
    </article>
  )
}

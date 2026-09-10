import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import type { SiteAdCard } from '@/lib/advertising-service'
import { AdCard } from '@/components/advertising/AdCard'

/**
 * Блок «ВАША РЕКЛАМА» на главной: обращение к рекламодателям и — если что-то
 * размещено прямо сейчас — материалы с маркировкой «Реклама». Материалы
 * приходят уже отфильтрованными (опубликованы, срок идёт, маркировка собрана:
 * см. visibleAdvertisements). Кнопка ведёт на страницу /advertising с формой.
 */
export default function AdvertisingSection({
  t,
  lang,
  ads,
}: {
  t: Dict
  lang: string
  ads: SiteAdCard[]
}) {
  return (
    <section className="lp-advertising" id="advertising">
      <div className="lp-advertising-heading">
        <p className="lp-eyebrow">{t.advertising.eyebrow}</p>
        <h2 className="lp-h2">{t.advertising.blockTitle}</h2>
        <div className="lp-advertising-copy">
          <p>{t.advertising.lead1}</p>
          <p>{t.advertising.lead2}</p>
          <p>{t.advertising.lead3}</p>
        </div>
      </div>

      {ads.length > 0 && (
        <div className="lp-ad-grid">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} t={t} variant="landing" />
          ))}
        </div>
      )}

      <div className="lp-advertising-actions">
        <Link className="lp-button" href={`/${lang}/advertising`}>
          {t.advertising.blockCta} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  )
}

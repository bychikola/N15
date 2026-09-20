import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

// Полоса «Не нашли подходящий объект?» на главной: тот же текст, что под
// выдачей каталога (t.catalog.selectCta*), кнопка ведёт к форме подбора
// в каталоге — LeadForm kind="selection" с якорем #podbor. Заявка из формы
// попадает в CRM с типом недвижимости, бюджетом и районом поиска.
export default function SelectionCta({ t, lang }: Props) {
  return (
    <section className="lp-section lp-selection">
      <div className="lp-selection-inner">
        <div>
          <h2>{t.catalog.selectCtaTitle}</h2>
          <p>{t.catalog.selectCtaText}</p>
        </div>
        <Link className="lp-button" href={`/${lang}/catalog#podbor`}>
          {t.landing.selectionCta} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  )
}

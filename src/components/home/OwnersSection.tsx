import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

// Блок «Выгодные условия» на главной — для собственников: продажа по цене
// и срокам владельца. Заголовок, пояснение и четыре условия берутся со
// страницы направления (/services/owners/vygodnaya-prodazha, словарь
// t.services.owners.salePage) — на главной и на самой странице они одни
// и те же, поэтому тексты не расходятся. Кнопки ведут на условия продажи
// и на оценку объекта.
export default function OwnersSection({ t, lang }: Props) {
  const s = t.services.owners.salePage
  // Четыре условия собственника — цена, сроки, показы, отчётность
  const terms = [s.terms.price, s.terms.timing, s.terms.shows, s.terms.report]

  return (
    <section className="lp-section lp-owners" id="owners">
      <div className="lp-container">
        <p className="lp-eyebrow">{t.landing.ownersEyebrow}</p>
        <h2 className="lp-h2 lp-owners-title">{s.title}</h2>
        <p className="lp-owners-copy">{s.subtitle}</p>

        <ul className="lp-owners-terms">
          {terms.map((term) => (
            <li key={term.title}>
              <h3>{term.title}</h3>
              <p>{term.text}</p>
            </li>
          ))}
        </ul>

        {/* Две кнопки одного оформления (.lp-button, как в герое):
            условия продажи и оценка объекта */}
        <div className="lp-hero-actions">
          <Link className="lp-button" href={`/${lang}/services/owners/vygodnaya-prodazha`}>
            {t.landing.ownersCta} <span aria-hidden="true">→</span>
          </Link>
          <Link className="lp-button" href={`/${lang}/services/valuation`}>
            {t.services.valuation.title} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}

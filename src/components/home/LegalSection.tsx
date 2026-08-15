import type { Dict } from '@/i18n/dictionaries'

const ITEMS = [
  { key: 'legal1', title: 'legal1Title', text: 'legal1Text' },
  { key: 'legal2', title: 'legal2Title', text: 'legal2Text' },
  { key: 'legal3', title: 'legal3Title', text: 'legal3Text' },
  { key: 'legal4', title: 'legal4Title', text: 'legal4Text' },
  { key: 'legal5', title: 'legal5Title', text: 'legal5Text' },
  { key: 'legal6', title: 'legal6Title', text: 'legal6Text' },
] as const

export default function LegalSection({ t }: { t: Dict }) {
  return (
    <section className="lp-legal" id="legal">
      <div className="lp-legal-heading">
        <p className="lp-eyebrow lp-eyebrow-light">{t.landing.legalEyebrow}</p>
        <h2 className="lp-h2">{t.landing.legalTitle}</h2>
        <p>{t.landing.legalSubtitle}</p>
      </div>
      <div className="lp-legal-grid">
        {ITEMS.map((item, i) => (
          <article key={item.key}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <h3>{t.landing[item.title]}</h3>
            <p>{t.landing[item.text]}</p>
          </article>
        ))}
      </div>
      <a className="lp-legal-action" href="#contact">
        {t.landing.legalCta} <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}

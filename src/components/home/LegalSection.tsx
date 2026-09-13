import type { Dict } from '@/i18n/dictionaries'

// Шесть карточек блока «Юридические услуги» — названия направлений
// (ключи legalCard1..6 в landing-словаре). Карточка ведёт на описание
// услуги на странице направления /services/legal (id якорей — как у меню
// «Юридические услуги» в шапке, см. Header.tsx); «Юридическое
// сопровождение» — на страницу целиком: это весь перечень услуг направления
const ITEMS = [
  { title: 'legalCard1', href: '/services/legal#proverka-obekta' },
  { title: 'legalCard2', href: '/services/legal#proverka-riskov' },
  { title: 'legalCard3', href: '/services/legal#soprovozhdenie-sdelki' },
  { title: 'legalCard4', href: '/services/legal' },
  { title: 'legalCard5', href: '/services/legal#nasledstvo' },
  { title: 'legalCard6', href: '/services/legal#privatizaciya' },
] as const

// Блок «Юридические услуги» на главной — сетка карточек-ссылок того же
// формата, что у категорий недвижимости (см. SearchCategories): номер,
// название направления и стрелка. Под сеткой — призыв к консультации
// (ведёт в блок контактов на той же странице)
export default function LegalSection({ t, lang }: { t: Dict; lang: string }) {
  return (
    <section className="lp-section lp-objects" id="legal">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.legalTitle}</h2>
      </div>

      <div className="lp-categories">
        {ITEMS.map((item, index) => (
          <a className="lp-category-card" key={item.href} href={`/${lang}${item.href}`}>
            <span className="lp-category-num">{String(index + 1).padStart(2, '0')}</span>
            <h3>{t.landing[item.title]}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>

      <a className="lp-legal-action" href="#contact">
        {t.landing.legalCta} <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}

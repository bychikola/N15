import type { Dict } from '@/i18n/dictionaries'

// Карточки-гармошки направлений на главной: «Дизайн и ремонт под ключ» и
// «Юридические услуги» стоят рядом в общей сетке прямоугольных блоков — той
// же, что у категорий недвижимости и регионов «Межрегиональной
// недвижимости»: ширина, высота, отступы и кегль у блоков одни и те же (см.
// globals.css, «Прямоугольные блоки главной»). В закрытом виде видна только
// строка заголовка с «плюсом», перечень услуг раскрывается нажатием на
// заголовок и прокручивается внутри карточки: карточка — нативный <details>,
// поэтому раскрытие работает без клиентского JS (как у меню «Межрегиональная
// недвижимость» в шапке), а размер самой карточки и соседней с ней при
// раскрытии не меняется.
//
// Строки перечня — ссылки на описания услуг: у дизайна это якоря страницы
// /services/design, у юридического блока — /services/legal (id якорей те же,
// что у меню «Услуги» в шапке, см. Header.tsx)
const DESIGN_ITEMS = [
  { title: 'designCard1', href: '/services/design#dizayn-proekt' },
  // Ремонт под ключ — работы, а не проект: ведём в направление
  // «Строительство частных домов» на описание «Строительство под ключ»
  { title: 'designCard2', href: '/services/build#pod-klyuch' },
  { title: 'designCard3', href: '/services/design#planirovka' },
  { title: 'designCard4', href: '/services/design#vizualizaciya' },
  { title: 'designCard5', href: '/services/design#podbor' },
  { title: 'designCard6', href: '/services/design#nadzor' },
] as const

// Ипотечного брокера и оценщика в юридическом блоке нет: это отдельные
// направления раздела «Услуги» (страницы /services/broker и /services/valuation)
const LEGAL_ITEMS = [
  { title: 'legalCard1', href: '/services/legal#proverka-obekta' },
  { title: 'legalCard2', href: '/services/legal#proverka-riskov' },
  { title: 'legalCard3', href: '/services/legal#soprovozhdenie-sdelki' },
  // «Юридическое сопровождение» — весь перечень услуг направления
  { title: 'legalCard4', href: '/services/legal' },
  { title: 'legalCard5', href: '/services/legal#pereplanirovki' },
  { title: 'legalCard6', href: '/services/legal#privatizaciya' },
  { title: 'legalCard7', href: '/services/legal#nasledstvo' },
] as const

// Карточка-гармошка: заголовок с «плюсом» раскрытия и перечень услуг во
// внутренних строках; cta — необязательная последняя строка-призыв
// (консультация), ведёт в блок контактов на той же странице
function ServicesCard({
  t,
  lang,
  id,
  title,
  items,
  cta,
}: {
  t: Dict
  lang: string
  id: string
  title: string
  items: readonly { title: keyof Dict['landing']; href: string }[]
  cta?: { label: string; href: string }
}) {
  return (
    <details className="lp-services-card" id={id}>
      <summary className="lp-services-head">
        <h2 className="lp-services-title">{title}</h2>
        <i className="lp-services-arrow" aria-hidden="true">+</i>
      </summary>

      <ul className="lp-services-list">
        {items.map((item) => (
          <li key={item.href}>
            <a className="lp-services-row" href={`/${lang}${item.href}`}>
              <span>{t.landing[item.title]}</span>
              <i aria-hidden="true">→</i>
            </a>
          </li>
        ))}
        {cta ? (
          <li>
            <a className="lp-services-row lp-services-row-cta" href={cta.href}>
              <span>{cta.label}</span>
              <i aria-hidden="true">→</i>
            </a>
          </li>
        ) : null}
      </ul>
    </details>
  )
}

export default function ServicesAccordion({ t, lang }: { t: Dict; lang: string }) {
  return (
    <section className="lp-section lp-services">
      <div className="lp-services-grid">
        <ServicesCard
          t={t}
          lang={lang}
          id="design"
          title={`${t.landing.servicesTitle1} ${t.landing.servicesTitle2}`}
          items={DESIGN_ITEMS}
        />
        <ServicesCard
          t={t}
          lang={lang}
          id="legal"
          title={t.landing.legalTitle}
          items={LEGAL_ITEMS}
          cta={{ label: t.landing.legalCta, href: '#contact' }}
        />
      </div>
    </section>
  )
}

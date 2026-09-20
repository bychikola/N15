import type { Dict } from '@/i18n/dictionaries'

// Карточки-гармошки направлений на главной: «Юридические услуги», «Ипотека» и
// «Дизайн и ремонт под ключ» — три компактных прямоугольника в один ряд, той
// же ширины, высоты, отступов и кегля, что у категорий недвижимости и регионов
// «Межрегиональной недвижимости» (см. globals.css, «Прямоугольные блоки
// главной»). В закрытом виде видна только строка заголовка с «плюсом»; нажатие
// на заголовок раскрывает перечень услуг — карточка растёт по содержимому,
// показывает все строки целиком и не обрезается, а соседние карточки остаются
// компактными и не перекрываются. «Плюс» в открытой карточке становится «×»,
// повторное нажатие закрывает перечень; открытие одной карточки закрывает
// остальные — у всех <details> одно имя (name), это встроенное поведение
// браузера, клиентский JS не нужен (как у меню «Межрегиональная недвижимость»
// в шапке).
//
// Строки перечня — ссылки на описания услуг: у дизайна это якоря страницы
// /services/design, у юридического блока — /services/legal, у ипотеки —
// /services/mortgage (id якорей те же, что у меню «Услуги» в шапке,
// см. Header.tsx)
type ServiceItem = { label: string; href: string }

// Шесть строк перечня карточки «Дизайн и ремонт под ключ»
function designItems(t: Dict): ServiceItem[] {
  return [
    { label: t.landing.designCard1, href: '/services/design#dizayn-proekt' },
    // Ремонт под ключ — работы, а не проект: ведём в направление
    // «Строительство частных домов» на описание «Строительство под ключ»
    { label: t.landing.designCard2, href: '/services/build#pod-klyuch' },
    { label: t.landing.designCard3, href: '/services/design#planirovka' },
    { label: t.landing.designCard4, href: '/services/design#vizualizaciya' },
    { label: t.landing.designCard5, href: '/services/design#podbor' },
    { label: t.landing.designCard6, href: '/services/design#nadzor' },
  ]
}

// Ипотечного брокера и оценщика в юридическом блоке нет: это отдельные
// направления раздела «Услуги» (страницы /services/broker и /services/valuation)
function legalItems(t: Dict): ServiceItem[] {
  return [
    { label: t.landing.legalCard1, href: '/services/legal#proverka-obekta' },
    { label: t.landing.legalCard2, href: '/services/legal#proverka-riskov' },
    { label: t.landing.legalCard3, href: '/services/legal#soprovozhdenie-sdelki' },
    // «Юридическое сопровождение» — весь перечень услуг направления
    { label: t.landing.legalCard4, href: '/services/legal' },
    { label: t.landing.legalCard5, href: '/services/legal#pereplanirovki' },
    { label: t.landing.legalCard6, href: '/services/legal#privatizaciya' },
    { label: t.landing.legalCard7, href: '/services/legal#nasledstvo' },
  ]
}

// Три услуги направления «Ипотека» — те же, что на странице /services/mortgage
// (названия берём из словаря услуг, чтобы не дублировать строки)
function mortgageItems(t: Dict): ServiceItem[] {
  return [
    { label: t.services.mortgage.raschet.title, href: '/services/mortgage#raschet' },
    { label: t.services.mortgage.dokumenty.title, href: '/services/mortgage#dokumenty' },
    { label: t.services.mortgage.zayavka.title, href: '/services/mortgage#zayavka' },
  ]
}

// Карточка-гармошка: заголовок с «плюсом» раскрытия и перечень услуг во
// внутренних строках; cta — необязательная последняя строка-призыв
// (консультация), ведёт в блок контактов на той же странице
function ServicesCard({
  lang,
  id,
  title,
  items,
  cta,
}: {
  lang: string
  id: string
  title: string
  items: readonly ServiceItem[]
  cta?: { label: string; href: string }
}) {
  return (
    // name у всех трёх карточек одно: открытая карточка закрывает соседние
    <details className="lp-services-card" id={id} name="lp-services">
      <summary className="lp-services-head">
        <h2 className="lp-services-title">{title}</h2>
        <i className="lp-services-arrow" aria-hidden="true">+</i>
      </summary>

      <ul className="lp-services-list">
        {items.map((item) => (
          <li key={item.href}>
            <a className="lp-services-row" href={`/${lang}${item.href}`}>
              <span>{item.label}</span>
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
          lang={lang}
          id="legal"
          title={t.landing.legalTitle}
          items={legalItems(t)}
          cta={{ label: t.landing.legalCta, href: '#contact' }}
        />
        {/* Название направления «Ипотека» — то же, что в меню «Услуги» шапки */}
        <ServicesCard
          lang={lang}
          id="mortgage"
          title={t.services.menu.ipoteka}
          items={mortgageItems(t)}
          cta={{ label: t.services.ctaConsult, href: '#contact' }}
        />
        <ServicesCard
          lang={lang}
          id="design"
          title={`${t.landing.servicesTitle1} ${t.landing.servicesTitle2}`}
          items={designItems(t)}
        />
      </div>
    </section>
  )
}

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'
// Временно скрытые направления: «Дизайн интерьера» и «Строительство частных
// домов» не показываются карточками раздела «Услуги» (страницы остаются)
import { isPublicDirectionHidden } from '@/lib/public-directions'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function ServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  // Подразделы по стороне сделки: покупателям, владельцам, арендаторам.
  // У каждого — свой перечень услуг и страница (см. /services/buyers,
  // /services/owners, /services/tenants); у владельцев дополнительно
  // страница «Выгодная продажа недвижимости на ваших условиях»
  const audiences = [
    { title: t.services.buyers.title, desc: t.services.buyers.desc, href: `/${lang}/services/buyers`, accent: 'gold' },
    { title: t.services.owners.title, desc: t.services.owners.desc, href: `/${lang}/services/owners`, accent: 'burgundy' },
    { title: t.services.tenants.title, desc: t.services.tenants.desc, href: `/${lang}/services/tenants`, accent: 'gold' },
  ]

  // Услуги раздела «Услуги» — карточки-ссылки на страницы услуг,
  // где раскрыт полный перечень услуг внутри каждой. Порядок — как в
  // вертикальном списке меню шапки (см. Header.tsx). Покупка, продажа
  // и аренда живут только в разделе «Недвижимость». «Дизайн интерьера» и
  // «Строительство частных домов» временно скрыты (isPublicDirectionHidden)
  const directions = [
    { title: t.services.mortgage.title, desc: t.services.mortgage.desc, href: `/${lang}/services/mortgage`, accent: 'burgundy' },
    { title: t.services.broker.title, desc: t.services.broker.desc, href: `/${lang}/services/broker`, accent: 'gold' },
    { title: t.services.legal.title, desc: t.services.legal.desc, href: `/${lang}/services/legal`, accent: 'burgundy' },
    ...(isPublicDirectionHidden('design')
      ? []
      : [{ title: t.services.design.title, desc: t.services.design.desc, href: `/${lang}/services/design`, accent: 'gold' }]),
    ...(isPublicDirectionHidden('build')
      ? []
      : [{ title: t.services.build.title, desc: t.services.build.desc, href: `/${lang}/services/build`, accent: 'burgundy' }]),
    { title: t.services.valuation.title, desc: t.services.valuation.desc, href: `/${lang}/services/valuation`, accent: 'gold' },
  ]
  // Колонки подбираем по числу карточек: при остатке 1 в ряду из трёх
  // карточка висела бы одна в половине строки — для четырёх карточек
  // ровнее сетка 2×2. Полный набор из шести снова даёт три колонки.
  const directionsColumns = directions.length % 3 === 1 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.services.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-xl">
            {t.services.subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {/* Подразделы по стороне сделки — первыми: с них начинается выбор
              («я покупаю», «я продаю», «я снимаю»), ниже — направления работ */}
          <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
            {t.services.audienceTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
            {audiences.map((s) => (
              <OrnamentBorder key={s.href} cornerOrnament>
                <div className="p-8 group">
                  <div className={`w-12 h-px mb-6 ${s.accent === 'burgundy' ? 'bg-[var(--n15-burgundy)]' : 'bg-[var(--n15-gold)]'}`} />
                  <h3 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 group-hover:text-[var(--n15-gold)] transition-colors">
                    {s.title}
                  </h3>
                  <p className="text-sm text-[var(--n15-muted)] mb-6 leading-relaxed">
                    {s.desc}
                  </p>
                  <Button variant="ghost" size="sm" href={s.href}>
                    {t.services.more}
                  </Button>
                </div>
              </OrnamentBorder>
            ))}
          </div>

          {/* Услуги: 1 колонка на телефоне, 2 на планшете; на десктопе —
              3 колонки (2, если после скрытия направлений остаётся 4) */}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${directionsColumns} gap-6`}>
            {directions.map((s) => (
              <OrnamentBorder key={s.href} cornerOrnament>
                <div className="p-8 group">
                  <div className={`w-12 h-px mb-6 ${s.accent === 'burgundy' ? 'bg-[var(--n15-burgundy)]' : 'bg-[var(--n15-gold)]'}`} />
                  <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 group-hover:text-[var(--n15-gold)] transition-colors">
                    {s.title}
                  </h2>
                  <p className="text-sm text-[var(--n15-muted)] mb-6 leading-relaxed">
                    {s.desc}
                  </p>
                  <Button variant="ghost" size="sm" href={s.href}>
                    {t.services.more}
                  </Button>
                </div>
              </OrnamentBorder>
            ))}
          </div>
          <div className="mt-14 text-center">
            <Button variant="primary" href={`/${lang}/contacts`}>
              {t.services.ctaConsult}
            </Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

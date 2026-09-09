import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function ServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  // Пять направлений раздела «Услуги» — карточки-ссылки на страницы
  // направлений (меню шапки раскрывает каждое направление до услуг).
  // Покупка, продажа и аренда живут в разделе «Недвижимость».
  const directions = [
    { title: t.services.mortgage.title, desc: t.services.mortgage.desc, href: `/${lang}/services/mortgage`, accent: 'burgundy' },
    { title: t.services.legal.title, desc: t.services.legal.desc, href: `/${lang}/services/legal`, accent: 'gold' },
    { title: t.services.design.title, desc: t.services.design.desc, href: `/${lang}/services/design`, accent: 'burgundy' },
    { title: t.services.build.title, desc: t.services.build.desc, href: `/${lang}/services/build`, accent: 'gold' },
    { title: t.services.valuation.title, desc: t.services.valuation.desc, href: `/${lang}/services/valuation`, accent: 'gold' },
  ]

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
          {/* Пять направлений: 1 колонка на телефоне, 2 на планшете, 3 на десктопе */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

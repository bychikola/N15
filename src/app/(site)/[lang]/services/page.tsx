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

  // «Ипотечный брокер» и «Оценка недвижимости» перенесены из юридического
  // блока на главной в общий раздел услуг (см. их страницы broker/valuation)
  const services = [
    { title: t.services.buyTitle, desc: t.services.buyDesc, href: `/${lang}/services/buy`, accent: 'gold' },
    { title: t.services.sellTitle, desc: t.services.sellDesc, href: `/${lang}/services/sell`, accent: 'gold' },
    { title: t.services.rentTitle, desc: t.services.rentDesc, href: `/${lang}/services/rent`, accent: 'gold' },
    { title: t.services.mortgageTitle, desc: t.services.mortgageDesc, href: `/${lang}/services/mortgage`, accent: 'burgundy' },
    { title: t.services.brokerTitle, desc: t.services.brokerDesc, href: `/${lang}/services/broker`, accent: 'burgundy' },
    { title: t.services.valuationTitle, desc: t.services.valuationDesc, href: `/${lang}/services/valuation`, accent: 'gold' },
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
          {/* Шесть услуг: 1 колонка на телефоне, 2 на планшете, 3 на десктопе */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s) => (
              <OrnamentBorder key={s.title} cornerOrnament>
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
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

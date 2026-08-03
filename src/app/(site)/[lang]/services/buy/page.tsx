import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function BuyPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  const steps = [
    { step: '01', title: t.services.buy.step1Title, desc: t.services.buy.step1Desc },
    { step: '02', title: t.services.buy.step2Title, desc: t.services.buy.step2Desc },
    { step: '03', title: t.services.buy.step3Title, desc: t.services.buy.step3Desc },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.services.buy.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {t.services.buy.subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {steps.map((s) => (
              <div key={s.step} className="p-6 border border-[var(--n15-gold)]/10">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">{s.step}</div>
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{s.title}</h3>
                <p className="text-xs text-[var(--n15-muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Button variant="primary" href={`/${lang}/catalog`}>{t.services.buy.cta}</Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

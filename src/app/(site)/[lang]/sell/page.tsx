import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { LeadForm } from '@/components/forms/LeadForm'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function SellPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const sell = t.services.sell

  const steps = [
    { step: '01', title: sell.step1Title, desc: sell.step1Desc },
    { step: '02', title: sell.step2Title, desc: sell.step2Desc },
    { step: '03', title: sell.step3Title, desc: sell.step3Desc },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{sell.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {sell.subtitle}
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
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="primary" href={`/${lang}/contacts`}>{sell.cta}</Button>
            <Button variant="outline" href={`/${lang}/catalog?type=sale`}>{sell.ctaSale}</Button>
          </div>
          {/* Форма «Продать объект» — заявка типа sale в CRM. Ниже ссылка на
              страницу владельцам: там продажа на условиях собственника */}
          <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div className="border border-[var(--n15-gold)]/15 p-6">
              <LeadForm kind="sale" title={t.lead.saleTitle} text={t.lead.saleText} />
            </div>
            <div className="p-6">
              <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
                {t.services.owners.salePage.title}
              </h2>
              <p className="text-sm text-[var(--n15-muted)] leading-relaxed mb-6">
                {t.services.owners.salePage.subtitle}
              </p>
              <Button variant="outline" href={`/${lang}/services/owners/vygodnaya-prodazha`}>
                {t.services.owners.title}
              </Button>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

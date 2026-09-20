import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { LeadForm } from '@/components/forms/LeadForm'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

// «Выгодная продажа недвижимости на ваших условиях» — страница владельцам
// о продаже на условиях собственника: цена, сроки, порядок показов и отчёт
// по этапам (условия), затем шаги продажи и две формы — оценка объекта
// и продажа объекта (заявки valuation и sale попадают в CRM).
export default async function SaleTermsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.services.owners.salePage

  // Четыре условия собственника — цена, сроки, показы, отчётность
  const terms = [s.terms.price, s.terms.timing, s.terms.shows, s.terms.report]
  // Три шага продажи: план, подготовка и показы, сделка
  const steps = [
    { title: s.step1Title, desc: s.step1Desc },
    { title: s.step2Title, desc: s.step2Desc },
    { title: s.step3Title, desc: s.step3Desc },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {s.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">{s.subtitle}</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">
            {s.termsTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {terms.map((term) => (
              <OrnamentBorder key={term.title} cornerOrnament>
                <div className="p-6">
                  <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)] mb-2">
                    {term.title}
                  </h3>
                  <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{term.text}</p>
                </div>
              </OrnamentBorder>
            ))}
          </div>
        </SectionWrapper>

        <SectionWrapper variant="dark">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">
            {s.stepsTitle}
          </h2>
          {/* Три шага продажи — как на страницах направлений: номер, название,
              пояснение */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.title} className="border-t border-[var(--n15-gold)]/20 pt-6">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-3">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {/* Формы продажи: цена объекта (оценка) и старт продажи */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="border border-[var(--n15-gold)]/15 p-6">
              <LeadForm kind="valuation" title={t.lead.valuationTitle} text={t.lead.valuationText} />
            </div>
            <div className="border border-[var(--n15-gold)]/15 p-6">
              <LeadForm kind="sale" title={t.lead.saleTitle} text={t.lead.saleText} />
            </div>
          </div>
          <p className="mt-10 text-center">
            <a className="text-sm text-[var(--n15-gold)] underline" href={`/${lang}/services/owners`}>
              {t.services.owners.title}
            </a>
          </p>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

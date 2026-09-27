import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { PurchaseCalculator } from '@/components/purchase/PurchaseCalculator'
import { PurchaseFaq } from '@/components/purchase/PurchaseFaq'
import { PurchaseLeadForm } from '@/components/purchase/PurchaseLeadForm'
import { MORTGAGE_BANKS } from '@/lib/mortgage-banks'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return {
    title: t.purchase.mortgage.metaTitle,
    description: t.purchase.mortgage.metaDescription,
  }
}

/**
 * Страница /mortgage — «Ипотека и выгодные условия»: программы покупки,
 * калькулятор платежа, банки, шаги сделки, частые вопросы и одна форма
 * заявки (заявка уходит в CRM с типом mortgage и источником «Ипотека»).
 *
 * Ссылки на каталог — с фильтром вариантов покупки (?purchase=код): человек
 * попадает не в общий каталог, а в объекты, где программа подтверждена.
 * Порядок кодов совпадает с порядком программ в словаре
 * (purchase.mortgage.programs). У IT-ипотеки своего кода нет — программу
 * разбираем индивидуально, поэтому ссылки на фильтр у неё нет (null).
 *
 * Ставок и сроков одобрения на странице нет: их называет банк, поэтому
 * калькулятор считает по введённой ставке, а тексты — из словаря, где
 * ни одного обещания по срокам и одобрению не сформулировано.
 */
const programPurchaseCodes: readonly (string | null)[] = [
  'familyMortgage',
  'mortgage',
  'militaryMortgage',
  null,
  'maternityCapital',
  'installment',
  'noDownPayment',
]

export default async function MortgagePage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const m = t.purchase.mortgage
  const steps = t.purchase.common.steps

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[10px] tracking-[0.28em] uppercase text-[var(--n15-gold)] mb-4">{m.eyebrow}</p>
          <h1 className="text-3xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {m.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8 leading-relaxed">{m.subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" href={`/${lang}/mortgage#zayavka`}>
              {t.purchase.common.ctaConsult}
            </Button>
            <Button variant="outline" href={`/${lang}/installment`}>
              {m.ctaToInstallment}
            </Button>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal" id="programs">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {m.programsTitle}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--n15-muted)] max-w-3xl mb-10">{m.programsNote}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {m.programs.map((program, i) => {
              const code = programPurchaseCodes[i]
              // Рассрочка — отдельная страница с условиями застройщиков,
              // остальные программы ведут в каталог с фильтром
              const href =
                code === 'installment' ? `/${lang}/installment` : code ? `/${lang}/catalog?purchase=${code}` : null
              const linkText = code === 'installment' ? m.ctaToInstallment : m.programsCatalog
              return (
                <div
                  key={program.title}
                  className="flex flex-col p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/40"
                >
                  <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-3">{program.title}</h3>
                  <p className="text-xs leading-relaxed text-[var(--n15-muted)]">{program.text}</p>
                  {href && (
                    <Link
                      href={href}
                      className="mt-5 text-[10px] tracking-[0.18em] uppercase text-[var(--n15-gold)] hover:text-[var(--n15-white)] transition-colors"
                    >
                      {linkText} →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </SectionWrapper>

        <SectionWrapper variant="dark" id="calculator">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">
            {t.purchase.common.calc.title}
          </h2>
          <PurchaseCalculator />
        </SectionWrapper>

        <SectionWrapper variant="charcoal" id="banks">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
            {m.banksTitle}
          </h2>
          {/* Банки — те, чьи программы разбираем. Формулировка без слова
              «партнёр»: договоров с банками у агентства нет (см. lib) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {MORTGAGE_BANKS.map((bank) => (
              <div
                key={bank}
                className="px-4 py-5 text-center text-xs tracking-wider text-[var(--n15-silver)] border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/40"
              >
                {bank}
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-[var(--n15-muted)] max-w-3xl">{m.banksNote}</p>
        </SectionWrapper>

        <SectionWrapper variant="dark" ornament="solar" id="steps">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-10">
            {t.purchase.common.stepsTitle}
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <li key={step.title} className="p-6 border border-[var(--n15-gold)]/10">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{step.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--n15-muted)]">{step.text}</p>
              </li>
            ))}
          </ol>
        </SectionWrapper>

        <SectionWrapper variant="charcoal" id="faq">
          <PurchaseFaq title={t.purchase.common.faqTitle} items={m.faq} />
        </SectionWrapper>

        <SectionWrapper variant="dark" id="zayavka">
          <div className="max-w-xl">
            <PurchaseLeadForm kind="mortgage" />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

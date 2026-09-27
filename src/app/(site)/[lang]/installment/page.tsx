import type { Metadata } from 'next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { PurchaseFaq } from '@/components/purchase/PurchaseFaq'
import { PurchaseLeadForm } from '@/components/purchase/PurchaseLeadForm'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return {
    title: t.purchase.installment.metaTitle,
    description: t.purchase.installment.metaDescription,
  }
}

/**
 * Страница /installment — «Рассрочка»: как устроена рассрочка от застройщика
 * (первый взнос, срок, график), переход на ипотеку, честный блок об условиях,
 * шаги сделки, частые вопросы и одна форма заявки (в CRM уходит с типом
 * installment и источником «Рассрочка»).
 *
 * Ни «без процентов», ни «без переплат» по всему каталогу здесь нет:
 * условия называет застройщик по конкретному объекту, поэтому обещаний
 * на всю страницу не формулируем — только то, что подтверждается по объекту.
 * Ссылка в каталог — с фильтром ?purchase=installment: попадают объекты,
 * где рассрочка подтверждена агентом в карточке.
 */
export default async function InstallmentPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const inst = t.purchase.installment
  const steps = t.purchase.common.steps

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[10px] tracking-[0.28em] uppercase text-[var(--n15-gold)] mb-4">{inst.eyebrow}</p>
          <h1 className="text-3xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {inst.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8 leading-relaxed">{inst.subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" href={`/${lang}/installment#zayavka`}>
              {t.purchase.common.ctaConsult}
            </Button>
            <Button variant="outline" href={`/${lang}/catalog?purchase=installment`}>
              {inst.catalogCta}
            </Button>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal" id="terms">
          <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-10">
            {inst.termsTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {inst.terms.map((term) => (
              <div key={term.title} className="p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/40">
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-3">{term.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--n15-muted)]">{term.text}</p>
              </div>
            ))}
          </div>
        </SectionWrapper>

        <SectionWrapper variant="dark" ornament="solar" id="switch">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {inst.switchTitle}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--n15-muted)] mb-6">{inst.switchText}</p>
            <Button variant="outline" href={`/${lang}/mortgage`}>
              {t.purchase.mortgage.title}
            </Button>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal" id="honest">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {inst.honestTitle}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--n15-muted)] mb-6">{inst.honestText}</p>
            <ul className="flex flex-col gap-3">
              {inst.honestPoints.map((point) => (
                <li key={point} className="flex gap-3 text-xs leading-relaxed text-[var(--n15-silver)]">
                  <span className="text-[var(--n15-gold)]" aria-hidden="true">
                    —
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="dark" id="steps">
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
          <PurchaseFaq title={t.purchase.common.faqTitle} items={inst.faq} />
        </SectionWrapper>

        <SectionWrapper variant="dark" id="zayavka">
          <div className="max-w-xl">
            <PurchaseLeadForm kind="installment" />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

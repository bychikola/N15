import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function MortgagePage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.services.mortgage.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {t.services.mortgage.subtitle}
          </p>
        </SectionWrapper>
        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.services.mortgage.banksTitle}</h2>
              <div className="flex flex-wrap gap-3">
                {['Сбербанк', 'ВТБ', 'ДОМ.РФ', 'Альфа-Банк', 'Газпромбанк', 'Россельхозбанк'].map((bank) => (
                  <span key={bank} className="text-xs px-3 py-1.5 border border-[var(--n15-gold)]/20 text-[var(--n15-muted)]">{bank}</span>
                ))}
              </div>
            </div>
            <div className="p-6 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
              <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-4">{t.services.mortgage.calcTitle}</h3>
              <form className="flex flex-col gap-3">
                <input type="number" placeholder={t.services.mortgage.pricePlaceholder} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
                <input type="number" placeholder={t.services.mortgage.downPlaceholder} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
                <input type="number" placeholder={t.services.mortgage.termPlaceholder} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
                <Button variant="primary" size="md">{t.services.mortgage.calculate}</Button>
              </form>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

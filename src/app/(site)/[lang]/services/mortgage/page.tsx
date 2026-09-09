import type { ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { getDictionary, type Dict } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Банки-партнёры: единый список для блока «Мы работаем с банками»
const banks = ['Сбербанк', 'ВТБ', 'ДОМ.РФ', 'Альфа-Банк', 'Газпромбанк', 'Россельхозбанк']

// Расчётный блок услуги «Расчёт ипотечных программ»: банки-партнёры
// и форма калькулятора. Форма без отправки — расчёт в браузере клиента.
function MortgageCalcPanel({ t }: { t: Dict }) {
  const m = t.services.mortgage
  const inputClass =
    'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  return (
    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="p-6 md:p-8 bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/10">
        <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-5">{m.banksTitle}</h3>
        <div className="flex flex-wrap gap-3">
          {banks.map((bank) => (
            <span key={bank} className="text-xs px-3 py-1.5 border border-[var(--n15-gold)]/20 text-[var(--n15-muted)]">
              {bank}
            </span>
          ))}
        </div>
      </div>
      <div className="p-6 md:p-8 bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/10">
        <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-5">{m.calcTitle}</h3>
        <form className="flex flex-col gap-3">
          <input type="number" placeholder={m.pricePlaceholder} className={inputClass} />
          <input type="number" placeholder={m.downPlaceholder} className={inputClass} />
          <input type="number" placeholder={m.termPlaceholder} className={inputClass} />
          <Button variant="primary" size="md">{m.calculate}</Button>
        </form>
      </div>
    </div>
  )
}

export default async function MortgageServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const mortgage = t.services.mortgage

  // Полный перечень услуг внутри «Ипотечного сопровождения» — в порядке
  // пунктов меню шапки (см. Header.tsx). У «Расчёта ипотечных программ»
  // строка дополнена виджетом банков и калькулятора.
  const rows: { id: string; num: string; title: string; text: string; extra?: ReactNode }[] = [
    { id: 'raschet', num: '01', title: mortgage.raschet.title, text: mortgage.raschet.text, extra: <MortgageCalcPanel t={t} /> },
    { id: 'dokumenty', num: '02', title: mortgage.dokumenty.title, text: mortgage.dokumenty.text },
    { id: 'zayavka', num: '03', title: mortgage.zayavka.title, text: mortgage.zayavka.text },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {mortgage.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {mortgage.subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div>
            {rows.map((row) => (
              <div
                key={row.id}
                id={row.id}
                className="scroll-mt-28 border-b border-[var(--n15-gold)]/10 py-10 last:border-0"
              >
                <div className="flex flex-col md:flex-row gap-4 md:gap-10">
                  <div className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 md:w-20 shrink-0">
                    {row.num}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                      {row.title}
                    </h2>
                    <p className="mt-3 text-sm md:text-base leading-relaxed text-[var(--n15-muted)] max-w-3xl">
                      {row.text}
                    </p>
                    {row.extra}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Button variant="primary" href={`/${lang}/contacts`}>
              {t.services.ctaConsult}
            </Button>
            {/* «Ипотечный брокер» — отдельная услуга раздела со своей страницей */}
            <Button variant="outline" href={`/${lang}/services/broker`}>
              {t.services.broker.title}
            </Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

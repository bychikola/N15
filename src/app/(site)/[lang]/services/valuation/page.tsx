import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function ValuationServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const valuation = t.services.valuation

  // id строк — якоря для прямых ссылок на конкретную услугу (например
  // /services/valuation#kvartira)
  const items = [
    { id: 'kvartira', title: valuation.kvartira.title, text: valuation.kvartira.text },
    { id: 'dom', title: valuation.dom.title, text: valuation.dom.text },
    { id: 'uchastok', title: valuation.uchastok.title, text: valuation.uchastok.text },
    { id: 'kommercheskiy', title: valuation.kommercheskiy.title, text: valuation.kommercheskiy.text },
  ]

  // Как проходит оценка: общий порядок работы независимо от типа объекта
  const steps = [
    { step: '01', title: valuation.step1Title, desc: valuation.step1Desc },
    { step: '02', title: valuation.step2Title, desc: valuation.step2Desc },
    { step: '03', title: valuation.step3Title, desc: valuation.step3Desc },
  ]

  return (
    <ServiceDirectionPage
      title={valuation.title}
      subtitle={valuation.subtitle}
      items={items}
      cta={{ label: valuation.cta, href: `/${lang}/contacts` }}
    >
      <div className="mt-14 pt-14 border-t border-[var(--n15-gold)]/10">
        <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">
          {valuation.processTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.step} className="p-6 border border-[var(--n15-gold)]/10">
              <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">{s.step}</div>
              <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{s.title}</h3>
              <p className="text-xs text-[var(--n15-muted)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </ServiceDirectionPage>
  )
}

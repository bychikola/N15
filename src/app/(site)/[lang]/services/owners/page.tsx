import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { LeadForm } from '@/components/forms/LeadForm'
import { getDictionary } from '@/i18n/dictionaries'
import type { ServiceItem } from '@/components/services/ServicesList'

interface PageProps {
  params: Promise<{ lang: string }>
}

// «Владельцам»: путь продажи — оценка по рынку, подготовка объекта,
// фотосъёмка и продвижение, юридическая проверка, сопровождение сделки.
// В конце — ссылка на страницу «Выгодная продажа недвижимости на ваших
// условиях» (/services/owners/vygodnaya-prodazha) и две формы: оценка
// объекта (valuation) и продажа объекта (sale).
export default async function OwnersPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.services.owners

  // Порядок услуг — как в словаре: оценка, подготовка, продвижение,
  // проверка, сделка, затем показы, покупатели из базы, размещение,
  // документы, ипотека покупателя и сделки с долями (11 услуг направления)
  const items: ServiceItem[] = [
    { id: 'ocenka', ...s.items.valuation },
    { id: 'podgotovka', ...s.items.preparation },
    { id: 'prodvizhenie', ...s.items.marketing },
    { id: 'proverka', ...s.items.legal },
    { id: 'sdelka', ...s.items.deal },
    { id: 'pokazy', ...s.items.shows },
    { id: 'pokupateli', ...s.items.buyersBase },
    { id: 'razmeshchenie', ...s.items.advertising },
    { id: 'dokumenty', ...s.items.docs },
    { id: 'ipoteka-pokupatelya', ...s.items.buyerMortgage },
    { id: 'doli', ...s.items.sharedOwnership },
  ]

  return (
    <ServiceDirectionPage
      title={s.title}
      subtitle={s.subtitle}
      items={items}
      cta={{ label: s.salePage.title, href: `/${lang}/services/owners/vygodnaya-prodazha` }}
      ctaSecond={{ label: t.services.valuation.title, href: `/${lang}/services/valuation` }}
    >
      {/* Три формы рядом: оценить объект (клиент хочет понять цену),
          продать объект (клиент готов начинать продажу) и получить
          консультацию (вопрос по продаже, оценке или документам) — на
          широком экране в строку, на телефоне друг под другом */}
      <div className="mt-14 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <div className="border border-[var(--n15-gold)]/15 p-6">
          <LeadForm kind="valuation" title={t.lead.valuationTitle} text={t.lead.valuationText} />
        </div>
        <div className="border border-[var(--n15-gold)]/15 p-6">
          <LeadForm kind="sale" title={t.lead.saleTitle} text={t.lead.saleText} />
        </div>
        <div className="border border-[var(--n15-gold)]/15 p-6 md:col-span-2 xl:col-span-1">
          <LeadForm kind="consultation" title={t.lead.consultationTitle} text={t.lead.consultationText} />
        </div>
      </div>
    </ServiceDirectionPage>
  )
}

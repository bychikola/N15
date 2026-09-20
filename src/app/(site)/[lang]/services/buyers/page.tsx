import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { LeadForm } from '@/components/forms/LeadForm'
import { getDictionary } from '@/i18n/dictionaries'
import type { ServiceItem } from '@/components/services/ServicesList'

interface PageProps {
  params: Promise<{ lang: string }>
}

// «Покупателям»: как Н15 ведёт покупку — от подбора объекта до приёмки.
// В конце страницы — форма «Подобрать недвижимость» (заявка типа selection
// в CRM, см. LeadForm) и ссылка на юридические услуги: проверка документов
// живёт в отдельном направлении.
export default async function BuyersPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.services.buyers

  // Порядок услуг — как в словаре: подбор, проверка, ипотека, сделка, приёмка,
  // затем консультация, новостройки, торг, госпрограммы, бронь, расчёты
  // и дистанционная покупка (12 услуг направления)
  const items: ServiceItem[] = [
    { id: 'podbor', ...s.items.selection },
    { id: 'proverka', ...s.items.check },
    { id: 'ipoteka', ...s.items.mortgage },
    { id: 'sdelka', ...s.items.deal },
    { id: 'priemka', ...s.items.acceptance },
    { id: 'konsultaciya', ...s.items.consultation },
    { id: 'novostroyki', ...s.items.newBuildings },
    { id: 'torg', ...s.items.priceCheck },
    { id: 'gosprogrammy', ...s.items.statePrograms },
    { id: 'bron', ...s.items.deposit },
    { id: 'raschety', ...s.items.safePayments },
    { id: 'distancionno', ...s.items.remote },
  ]

  return (
    <ServiceDirectionPage
      title={s.title}
      subtitle={s.subtitle}
      items={items}
      cta={{ label: s.ctaForm, href: `/${lang}/catalog?type=sale` }}
      ctaSecond={{ label: s.ctaLegal, href: `/${lang}/services/legal` }}
    >
      <div className="mt-14 max-w-lg">
        <LeadForm kind="selection" title={t.lead.selectionTitle} text={t.lead.selectionText} />
      </div>
    </ServiceDirectionPage>
  )
}

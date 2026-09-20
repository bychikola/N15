import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { LeadForm } from '@/components/forms/LeadForm'
import { getDictionary } from '@/i18n/dictionaries'
import type { ServiceItem } from '@/components/services/ServicesList'

interface PageProps {
  params: Promise<{ lang: string }>
}

// «Арендаторам»: подбор объекта в аренду, проверка прав собственника,
// договор, передача и поддержка. Форма в конце — «Подобрать недвижимость»
// (заявка типа selection): в комментарии клиент описывает срок, бюджет
// и район.
export default async function TenantsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.services.tenants

  const items: ServiceItem[] = [
    { id: 'podbor', ...s.items.selection },
    // Аренда по типам объектов — сразу после общего подбора: клиент чаще
    // всего ищет конкретный тип (квартиру, комнату, дом, помещение)
    { id: 'arenda-kvartiry', ...s.items.rentApartment },
    { id: 'arenda-komnaty', ...s.items.rentRoom },
    { id: 'arenda-doma', ...s.items.rentHouse },
    { id: 'arenda-kommercheskogo', ...s.items.rentCommercial },
    { id: 'proverka', ...s.items.check },
    { id: 'dogovor', ...s.items.contract },
    { id: 'peredacha', ...s.items.handover },
    { id: 'podderzhka', ...s.items.support },
  ]

  return (
    <ServiceDirectionPage
      title={s.title}
      subtitle={s.subtitle}
      items={items}
      cta={{ label: s.ctaForm, href: `/${lang}/catalog?type=rent` }}
    >
      <div className="mt-14 max-w-lg">
        <LeadForm kind="selection" title={t.lead.selectionTitle} text={t.lead.selectionText} />
      </div>
    </ServiceDirectionPage>
  )
}

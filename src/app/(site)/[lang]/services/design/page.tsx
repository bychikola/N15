import { notFound } from 'next/navigation'
import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'
import { isPublicDirectionHidden } from '@/lib/public-directions'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function DesignServicesPage({ params }: PageProps) {
  // Направление временно скрыто из публичной части: прямые ссылки отдают 404,
  // тексты и данные остаются в словаре и CRM. Вернуть — убрать ключ design
  // из PUBLIC_HIDDEN_DIRECTIONS (см. src/lib/public-directions.ts)
  if (isPublicDirectionHidden('design')) notFound()
  const { lang } = await params
  const t = getDictionary(lang)
  const design = t.services.design

  // id строк — якоря для прямых ссылок на конкретную услугу (например
  // /services/design#dizayn-proekt)
  const items = [
    { id: 'dizayn-proekt', title: design.proekt.title, text: design.proekt.text },
    { id: 'planirovka', title: design.planirovka.title, text: design.planirovka.text },
    { id: 'vizualizaciya', title: design.vizualizaciya.title, text: design.vizualizaciya.text },
    { id: 'podbor', title: design.podbor.title, text: design.podbor.text },
    { id: 'komplektaciya', title: design.komplektaciya.title, text: design.komplektaciya.text },
    { id: 'nadzor', title: design.nadzor.title, text: design.nadzor.text },
  ]

  return (
    <ServiceDirectionPage
      title={design.title}
      subtitle={design.subtitle}
      items={items}
      cta={{ label: t.services.ctaConsult, href: `/${lang}/contacts` }}
    />
  )
}

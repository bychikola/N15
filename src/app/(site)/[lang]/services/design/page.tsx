import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function DesignServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const design = t.services.design

  // id совпадают с #ссылками пунктов меню «Услуги» в Header.tsx
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

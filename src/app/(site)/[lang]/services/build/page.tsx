import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function BuildServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const build = t.services.build

  // id строк — якоря для прямых ссылок на конкретную услугу (например
  // /services/build#podryadchiki)
  const items = [
    { id: 'proektirovanie', title: build.proektirovanie.title, text: build.proektirovanie.text },
    { id: 'podryadchiki', title: build.podryadchiki.title, text: build.podryadchiki.text },
    { id: 'smeta', title: build.smeta.title, text: build.smeta.text },
    { id: 'pod-klyuch', title: build.podKlyuch.title, text: build.podKlyuch.text },
    { id: 'kommunikacii', title: build.kommunikacii.title, text: build.kommunikacii.text },
    { id: 'otdelka', title: build.otdelka.title, text: build.otdelka.text },
  ]

  return (
    <ServiceDirectionPage
      title={build.title}
      subtitle={build.subtitle}
      items={items}
      cta={{ label: t.services.ctaConsult, href: `/${lang}/contacts` }}
    />
  )
}

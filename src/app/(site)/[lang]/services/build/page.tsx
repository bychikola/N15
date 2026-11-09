import { notFound } from 'next/navigation'
import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'
import { isPublicDirectionHidden } from '@/lib/public-directions'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function BuildServicesPage({ params }: PageProps) {
  // Направление временно скрыто из публичной части: прямые ссылки отдают 404,
  // тексты и данные остаются в словаре и CRM. Вернуть — убрать ключ build
  // из PUBLIC_HIDDEN_DIRECTIONS (см. src/lib/public-directions.ts)
  if (isPublicDirectionHidden('build')) notFound()
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

import { DirectionPage } from '@/components/directions/DirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function NewbuildingsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <DirectionPage
      t={t}
      direction={t.directions.newbuildings}
      primary={{ label: t.services.buy.cta, href: `/${lang}/catalog` }}
      secondary={{ label: t.directions.ctaRequest, href: `/${lang}/contacts` }}
    />
  )
}

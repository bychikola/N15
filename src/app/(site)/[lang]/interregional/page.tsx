import { DirectionPage } from '@/components/directions/DirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function InterregionalPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <DirectionPage
      t={t}
      direction={t.directions.interregional}
      primary={{ label: t.directions.ctaRequest, href: `/${lang}/contacts` }}
    />
  )
}

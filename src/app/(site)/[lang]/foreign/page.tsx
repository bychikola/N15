import { notFound } from 'next/navigation'
import { DirectionPage } from '@/components/directions/DirectionPage'
import { getDictionary } from '@/i18n/dictionaries'
import { isPublicDirectionHidden } from '@/lib/public-directions'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function ForeignPage({ params }: PageProps) {
  // Направление временно скрыто из публичной части: прямые ссылки отдают 404,
  // тексты и данные остаются в словаре и CRM. Вернуть — убрать ключ foreign
  // из PUBLIC_HIDDEN_DIRECTIONS (см. src/lib/public-directions.ts)
  if (isPublicDirectionHidden('foreign')) notFound()
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <DirectionPage
      t={t}
      direction={t.directions.foreign}
      primary={{ label: t.directions.ctaRequest, href: `/${lang}/contacts` }}
    />
  )
}

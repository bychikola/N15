import { getPayload } from 'payload'
import config from '@payload-config'
import { DirectionPage } from '@/components/directions/DirectionPage'
import InterregionalRegions from '@/components/interregional/InterregionalRegions'
import { getDictionary } from '@/i18n/dictionaries'
import { loadInterregionalDirectory } from '@/lib/interregional-service'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Страница читает справочник из CRM при каждом запросе: добавленный в CRM
// населённый пункт появляется сразу, без пересборки сайта
export const dynamic = 'force-dynamic'

/**
 * «Межрегиональные объекты» — направление с полным справочником: регионы
 * раскрываются в населённые пункты, каждый ведёт на страницу с объектами
 * квартир (/interregional/<регион>/<населённый пункт>). Справочник живёт
 * в CRM (коллекции regions и settlements), см. src/lib/interregional-service.ts.
 */
export default async function InterregionalPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { regions, otherCities } = await loadInterregionalDirectory(payload)

  return (
    <DirectionPage
      t={t}
      direction={t.directions.interregional}
      primary={{ label: t.directions.ctaRequest, href: `/${lang}/contacts` }}
    >
      <InterregionalRegions t={t} lang={lang} regions={regions} otherCities={otherCities} />
    </DirectionPage>
  )
}

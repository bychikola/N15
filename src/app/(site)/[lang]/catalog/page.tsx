import { Suspense } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import CatalogContent from '@/components/objects/CatalogContent'
import { getDictionary } from '@/i18n/dictionaries'
import { loadCatalogCityFilter } from '@/lib/interregional-service'

interface PageProps {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Справочник фильтра «Город» (регионы → населённые пункты, счётчики объектов)
// читается из CRM при каждом запросе: заведённый в CRM населённый пункт
// появляется в фильтре сразу, без пересборки сайта
export const dynamic = 'force-dynamic'

/**
 * Каталог объектов: серверная часть — только шапка и иерархия фильтра «Город»
 * (регионы с населёнными пунктами и счётчиками, см. loadCatalogCityFilter);
 * сама выдача и фильтры — клиентские (см. CatalogContent), данные тянутся
 * из /api/objects.
 *
 * Параметр ?developer=<id> переводит каталог в режим «Объекты застройщика»:
 * шапка называет компанию, а выдачу сужает подборка её объектов (клиент
 * спрашивает id у серверного маршрута, см. /api/objects/by-developer).
 * Неопубликованная или архивная компания режим не включает — её страница на
 * сайте не открывается, название показывать нечего.
 */
export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { lang } = await params
  const sp = await searchParams
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { regions: cityRegions, cities: knownCities } = await loadCatalogCityFilter(payload)

  // id компании из адреса: то же правило, что у страницы застройщика — только
  // цифровой id. Скрытую компанию не находим: режим подборки не включается
  const rawDeveloper = Array.isArray(sp.developer) ? sp.developer[0] : sp.developer
  const developerId = rawDeveloper && /^\d+$/.test(rawDeveloper) ? parseInt(rawDeveloper, 10) : null
  let developerName: string | null = null
  if (developerId !== null) {
    const { docs } = await payload.find({
      collection: 'developers',
      where: {
        and: [
          { id: { equals: developerId } },
          { showOnSite: { equals: true } },
          { status: { not_equals: 'archived' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const name = (docs[0] as { name?: string } | undefined)?.name
    developerName = name ? String(name) : null
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
              {developerName ? t.developers.objectsCta : t.catalog.title}
            </h1>
            <p className="text-[var(--n15-muted)] max-w-xl mt-2">
              {developerName ?? t.catalog.subtitle}
            </p>
          </div>
        </section>
        <Suspense fallback={<section className="bg-[var(--n15-charcoal)] py-8"><p className="text-[var(--n15-muted)] text-center py-20">{t.catalog.loading}</p></section>}>
          <CatalogContent cityRegions={cityRegions} knownCities={knownCities} />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

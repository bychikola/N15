import { Suspense } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import CatalogContent from '@/components/objects/CatalogContent'
import { getDictionary } from '@/i18n/dictionaries'
import { loadInterregionalCityOptions } from '@/lib/interregional-service'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Справочник фильтра «Город» читается из CRM при каждом запросе: заведённый
// в CRM населённый пункт появляется в фильтре сразу, без пересборки сайта
export const dynamic = 'force-dynamic'

/**
 * Каталог объектов: серверная часть — только шапка и справочник городов
 * «Межрегиональной недвижимости» из CRM; сама выдача и фильтры — клиентские
 * (см. CatalogContent), данные тянутся из /api/objects.
 */
export default async function CatalogPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { groups: cityGroups, cities: knownCities } = await loadInterregionalCityOptions(payload)

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.catalog.title}</h1>
            <p className="text-[var(--n15-muted)] max-w-xl mt-2">{t.catalog.subtitle}</p>
          </div>
        </section>
        <Suspense fallback={<section className="bg-[var(--n15-charcoal)] py-8"><p className="text-[var(--n15-muted)] text-center py-20">{t.catalog.loading}</p></section>}>
          <CatalogContent cityGroups={cityGroups} knownCities={knownCities} />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

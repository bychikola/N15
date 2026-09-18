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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Справочник фильтра «Город» (регионы → населённые пункты, счётчики объектов)
// читается из CRM при каждом запросе: заведённый в CRM населённый пункт
// появляется в фильтре сразу, без пересборки сайта
export const dynamic = 'force-dynamic'

/**
 * Каталог объектов: серверная часть — только шапка, иерархия фильтра «Город»
 * (регионы с населёнными пунктами и счётчиками, см. loadCatalogCityFilter) и
 * имя агента для фильтра «Объекты агента» (кнопка на странице агентства ведёт
 * в /catalog?agent=…); сама выдача и фильтры — клиентские (см. CatalogContent),
 * данные тянутся из /api/objects.
 */
export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { regions: cityRegions, cities: knownCities } = await loadCatalogCityFilter(payload)

  // Имя агента подписи фильтра: ссылки с карточек команды передают id в
  // параметре agent — читаем его из базы, чтобы показать фамилию в подписи
  const sp = await searchParams
  const agentRaw = sp.agent
  const agentId = Number(Array.isArray(agentRaw) ? agentRaw[0] : agentRaw)
  let agentName: string | undefined
  if (Number.isInteger(agentId) && agentId > 0) {
    try {
      const agent = await payload.findByID({ collection: 'agents', id: agentId, depth: 0 })
      agentName = agent?.name || undefined
    } catch {
      // Агент не найден (или запрос упал) — фильтр просто не показываем
    }
  }

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
          <CatalogContent cityRegions={cityRegions} knownCities={knownCities} agentName={agentName} />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

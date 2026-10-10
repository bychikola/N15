import { Suspense } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import CatalogContent from '@/components/objects/CatalogContent'
import type { ComplexOption, DeveloperOption } from '@/components/objects/CatalogFilters'
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

/** Первое значение параметра адреса: у ссылки он один, массив — запас */
const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ''

/**
 * Каталог объектов: серверная часть — шапка, иерархия фильтра «Город»
 * (регионы с населёнными пунктами и счётчиками, см. loadCatalogCityFilter) и
 * списки застройщиков и ЖК подборки новостроек; сама выдача и фильтры —
 * клиентские (см. CatalogContent), данные тянутся из /api/objects.
 *
 * Параметр ?developer=<id> переводит каталог в режим «Объекты застройщика»:
 * шапка называет компанию, а выдачу сужает подборка её объектов (клиент
 * спрашивает id у серверного маршрута, см. /api/objects/by-developer).
 * Неопубликованная или архивная компания режим не включает — её страница на
 * сайте не открывается, название показывать нечего.
 *
 * Параметр ?market=new открывает подборку «Новостройки» (см. CatalogContent):
 * опубликованные квартиры-новостройки с привязкой к застройщику. Для её
 * фильтров «Застройщик» и «ЖК» страница собирает списки опубликованных
 * компаний и их комплексов — справочники developers и complexes закрыты на
 * чтение для гостя, поэтому списки собирает сервер с overrideAccess, а в
 * разметку уходят только id и названия.
 */
export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { lang } = await params
  const sp = await searchParams
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { regions: cityRegions, cities: knownCities } = await loadCatalogCityFilter(payload)

  const newbuildingsMode = firstParam(sp.market) === 'new'

  // id компании из адреса: то же правило, что у страницы застройщика — только
  // цифровой id. Скрытую компанию не находим: режим подборки не включается
  const rawDeveloper = firstParam(sp.developer)
  const developerId = /^\d+$/.test(rawDeveloper) ? parseInt(rawDeveloper, 10) : null
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

  // Списки фильтров подборки новостроек читаем только в ней самой: в обычном
  // каталоге «Застройщик» и «ЖК» не показываются, и лишние запросы к базе на
  // каждой странице каталога ни к чему. Скрытые компании (без «Показывать на
  // сайте» или в архиве) в список не попадают — их страницы на сайте не
  // открываются, и объектов в подборке у них не будет
  let developers: DeveloperOption[] = []
  let complexes: ComplexOption[] = []
  if (newbuildingsMode) {
    const { docs: devDocs } = await payload.find({
      collection: 'developers',
      where: {
        and: [{ showOnSite: { equals: true } }, { status: { not_equals: 'archived' } }],
      },
      sort: 'name',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    developers = (devDocs as unknown as { id: number; name?: string }[])
      .filter((d) => d.name)
      .map((d) => ({ id: Number(d.id), name: String(d.name) }))
    if (developers.length) {
      const { docs: complexDocs } = await payload.find({
        collection: 'complexes',
        where: { developer: { in: developers.map((d) => d.id) } },
        sort: 'name',
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
      complexes = (complexDocs as unknown as { id: number; name?: string; developer?: unknown }[])
        .filter((c) => c.name)
        .map((c) => ({
          id: Number(c.id),
          name: String(c.name),
          // Застройщик комплекса — связь; при depth 0 это id (или документ,
          // если Payload её развернул) — приводим к числу
          developerId: Number(
            typeof c.developer === 'object' && c.developer !== null
              ? (c.developer as { id?: number }).id
              : c.developer,
          ),
        }))
        .filter((c) => Number.isInteger(c.developerId))
    }
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
              {newbuildingsMode
                ? t.catalog.newbuildingsTitle
                : developerName
                  ? t.developers.objectsCta
                  : t.catalog.title}
            </h1>
            <p className="text-[var(--n15-muted)] max-w-xl mt-2">
              {newbuildingsMode
                ? t.catalog.newbuildingsSubtitle
                : developerName ?? t.catalog.subtitle}
            </p>
          </div>
        </section>
        <Suspense fallback={<section className="bg-[var(--n15-charcoal)] py-8"><p className="text-[var(--n15-muted)] text-center py-20">{t.catalog.loading}</p></section>}>
          <CatalogContent cityRegions={cityRegions} knownCities={knownCities}
            developers={developers} complexes={complexes} />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}


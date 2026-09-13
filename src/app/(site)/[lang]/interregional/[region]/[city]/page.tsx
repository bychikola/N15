import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import ObjectCard from '@/components/objects/ObjectCard'
import { getDictionary } from '@/i18n/dictionaries'
import { settlementCatalogHref } from '@/lib/interregional'
import { loadSettlementPage } from '@/lib/interregional-service'
import { objectToListItem } from '@/lib/object-list-item'

interface PageProps {
  params: Promise<{ lang: string; region: string; city: string }>
}

// Страница читает объекты из CRM при каждом запросе: новый объект в этом
// населённом пункте появляется сразу, без пересборки сайта
export const dynamic = 'force-dynamic'

/**
 * Страница населённого пункта межрегиональной недвижимости: объекты по
 * фильтру, который задан для населённого пункта в CRM (город в адресах,
 * категория — по умолчанию квартиры, тип сделки — по умолчанию продажа).
 * Пока объектов нет, страница не пустует: пометка «Объекты в этом населённом
 * пункте скоро появятся» и кнопка «Оставить заявку».
 */
export default async function SettlementPage({ params }: PageProps) {
  const { lang, region: regionSlug, city: citySlug } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const data = await loadSettlementPage(payload, regionSlug, citySlug)
  if (!data) notFound()

  const { region, settlement, objects, total } = data
  const cards = objects.map(objectToListItem)
  const catalogHref = settlementCatalogHref(lang, settlement)
  // Подпись фильтра страницы: что именно показываем в этом населённом пункте
  const categoryLabel = t.categoryLabels[settlement.category as keyof typeof t.categoryLabels]
  const dealLabel = settlement.dealType === 'any'
    ? ''
    : t.typeLabels[settlement.dealType as keyof typeof t.typeLabels]
  const filterLabel = [categoryLabel, dealLabel].filter(Boolean).join(', ')

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <nav className="text-xs text-[var(--n15-muted)] mb-4" aria-label={t.directions.interregional.title}>
            <Link className="hover:text-[var(--n15-gold)] transition-colors" href={`/${lang}/interregional`}>
              {t.directions.interregional.title}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50">/</span>
            <span>{region.title}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {settlement.name}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">
            {region.title}
            {filterLabel && ` · ${filterLabel}`}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {cards.length > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-8">
                <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                  {t.interregional.objectsTitle}
                </h2>
                <p className="text-xs text-[var(--n15-muted)]">
                  {t.catalog.found} <span className="text-[var(--n15-gold)]">{total}</span> {t.catalog.foundObjects}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
                {cards.map((obj) => (
                  <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />
                ))}
              </div>
              {total > cards.length && (
                <div className="text-center mt-12">
                  <Button variant="outline" href={catalogHref}>{t.catalog.showMore}</Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-14">
              {/* Объектов в базе пока нет — не показываем чужие предложения
                  и не оставляем страницу пустой: пометка и заявка на подбор.
                  Заголовок тут не дублируем — он повторял бы саму пометку */}
              <p className="text-[var(--n15-muted)] text-lg mb-8">{t.interregional.placeEmpty}</p>
              <Button variant="primary" href={`/${lang}/contacts`}>{t.directions.ctaRequest}</Button>
              <p className="mt-8">
                <Link className="text-sm text-[var(--n15-gold)] underline" href={catalogHref}>
                  {t.interregional.catalogAll}
                </Link>
              </p>
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

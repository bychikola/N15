import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import { objectToListItem } from '@/lib/object-list-item'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string; id: string }>
}

/**
 * Документ объекта → карточка каталога для публичной страницы застройщика.
 * Кроме открытых полей карточке нужны имя и фото агента — их и оставляем:
 * телефон и прочие контакты агента на публичную часть не переносим. Точное
 * положение объекта (coordinates) тоже не переносим — на сайте его нет
 * (см. коллекцию Objects, exactAddressAccess).
 */
function publicObjectCard(doc: Record<string, unknown>): ObjectListItem {
  const item = objectToListItem(doc)
  const agent = item.agent
  return {
    ...item,
    coordinates: undefined,
    agent:
      agent && typeof agent === 'object'
        ? {
            name: (agent as { name?: string }).name,
            photo: (agent as { photo?: NonNullable<ObjectListItem['agent']>['photo'] }).photo,
          }
        : undefined,
  }
}

/**
 * Страница компании-застройщика: описание, жилые комплексы и опубликованные
 * объекты. Открывается только для опубликованной компании: гостю доступны
 * карточки с включённым «Показывать на сайте» (showOnSite) и не архивные —
 * остальным отдаём 404, как несуществующей странице.
 *
 * Справочники developers и complexes закрыты на чтение для гостя, поэтому
 * выдачу собирает сервер с overrideAccess; в разметку уходят только открытые
 * поля. Контакты представителя, договоры и комиссии на сайте не показываются.
 */
export default async function DeveloperPage({ params }: PageProps) {
  const { lang, id } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  const devId = /^\d+$/.test(id) ? parseInt(id, 10) : null
  if (devId === null) notFound()

  // Публикацию и статус проверяем в самом запросе: чужая (неопубликованная
  // или архивная) компания по прямой ссылке не открывается
  const { docs: devDocs } = await payload.find({
    collection: 'developers',
    where: {
      and: [
        { id: { equals: devId } },
        { showOnSite: { equals: true } },
        { status: { not_equals: 'archived' } },
      ],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const dev = devDocs[0] as unknown as
    | { id: number; name?: string; description?: string; website?: string; logo?: { url?: string } | null }
    | undefined
  if (!dev || !dev.name) notFound()

  // Жилые комплексы компании: название, населённый пункт и улица — открытые
  // сведения о комплексе (в отличие от точного адреса объекта)
  const { docs: complexDocs } = await payload.find({
    collection: 'complexes',
    where: { developer: { equals: devId } },
    sort: 'name',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const complexes = (
    complexDocs as unknown as { id: number; name?: string; locality?: string; street?: string }[]
  )
    .filter((c) => c.name)
    .map((c) => ({
      id: Number(c.id),
      name: String(c.name || ''),
      place: [c.locality, c.street].filter(Boolean).join(', '),
    }))

  // Опубликованные объекты застройщика — только status=published: черновики и
  // архивные на сайте не показываются (см. src/lib/archive.ts)
  const { docs: objectDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { developer: { equals: devId } },
        { status: { equals: 'published' } },
      ],
    },
    sort: '-createdAt',
    limit: 12,
    depth: 1,
    overrideAccess: true,
  })
  const objects: ObjectListItem[] = (objectDocs as unknown as Record<string, unknown>[]).map(
    publicObjectCard,
  )

  const logoUrl = dev.logo && typeof dev.logo === 'object' ? dev.logo.url || null : null

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          {/* Хлебные крошки: Новостройки → Застройщики → компания */}
          <nav aria-label={t.developers.breadcrumbNewbuildings} className="mb-4 text-[11px] tracking-wider uppercase">
            <Link
              href={`/${lang}/newbuildings`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.developers.breadcrumbNewbuildings}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <Link
              href={`/${lang}/newbuildings/developers`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.developers.title}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <span className="text-[var(--n15-gold)]">{dev.name}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-6">
            {logoUrl && (
              <img src={logoUrl} alt={dev.name} className="max-h-20 max-w-[220px] object-contain" />
            )}
            <div className="min-w-0">
              <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                {dev.name}
              </h1>
              {dev.website && (
                <a
                  href={dev.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
                >
                  {t.developers.website}: {dev.website}
                </a>
              )}
            </div>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="mb-10">
            <Link
              href={`/${lang}/newbuildings/developers`}
              className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              ← {t.developers.backToList}
            </Link>
          </div>

          {/* Описание компании */}
          <section className="mb-14">
            <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {t.developers.aboutTitle}
            </h2>
            {dev.description ? (
              <p className="text-sm text-[var(--n15-muted)] leading-relaxed max-w-3xl whitespace-pre-line">
                {dev.description}
              </p>
            ) : (
              <p className="text-sm text-[var(--n15-muted)]">{t.developers.noDescription}</p>
            )}
          </section>

          {/* Жилые комплексы застройщика */}
          <section className="mb-14">
            <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {t.developers.complexesTitle}
            </h2>
            {complexes.length === 0 ? (
              <p className="text-sm text-[var(--n15-muted)]">{t.developers.complexesEmpty}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {complexes.map((c) => (
                  // Карточка ведёт на страницу комплекса: там описание,
                  // планировки, сроки сдачи, фотоотчёты и форма заявки
                  <Link
                    key={c.id}
                    href={`/${lang}/newbuildings/complexes/${c.id}`}
                    className="group flex flex-col border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-colors duration-300 p-5"
                  >
                    <div className="font-[family-name:var(--font-display)] text-lg text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                      {c.name}
                    </div>
                    {c.place && <div className="mt-2 text-xs text-[var(--n15-muted)]">{c.place}</div>}
                    <span className="mt-3 text-[11px] tracking-wider uppercase text-[var(--n15-gold)]">
                      {t.developers.complexMore} →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Опубликованные объекты застройщика — карточками каталога */}
          <section>
            <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
              {t.developers.objectsTitle}
            </h2>
            {objects.length === 0 ? (
              <div>
                <p className="text-sm text-[var(--n15-muted)] mb-5">{t.developers.objectsEmpty}</p>
                <Button variant="outline" href={`/${lang}/catalog`}>
                  {t.services.buy.cta}
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                  {objects.map((o) => (
                    <ObjectCard key={o.id} obj={o} lang={lang} t={t} />
                  ))}
                </div>
                <div className="mt-10">
                  <Button variant="outline" href={`/${lang}/catalog`}>
                    {t.services.buy.cta}
                  </Button>
                </div>
              </>
            )}
          </section>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

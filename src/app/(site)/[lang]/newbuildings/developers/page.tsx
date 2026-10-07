import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Публичная карточка компании в списке: из документа справочника берём только
// открытые поля. Контакт ответственного представителя — персональные данные,
// на сайт не уходит (его читает лишь администратор, см. коллекцию Developers);
// название комплексов и объектов считает отдельная страница компании.
interface DeveloperCard {
  id: number
  name: string
  description: string
  logoUrl: string | null
}

/**
 * Раздел «Застройщики» (внутри «Новостроек»): список компаний-застройщиков,
 * которые подтвердили работу с Н15. Показываются только опубликованные
 * карточки: переключатель «Показывать на сайте» (поле showOnSite, по умолчанию
 * выключен) включает администратор, архивные компании скрыты независимо от
 * флага.
 *
 * Справочник developers закрыт на чтение для гостя (застройщика выбирают в
 * карточке объекта), поэтому список собирает серверная выдача с overrideAccess
 * — но в разметку уходят только открытые поля: название, описание и логотип.
 * Контакты представителя, договоры и комиссии на публичную часть не попадают.
 */
export default async function DevelopersPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'developers',
    where: {
      and: [
        // Публикация — только по решению администратора
        { showOnSite: { equals: true } },
        // Архивные компании на сайте не показываем
        { status: { not_equals: 'archived' } },
      ],
    },
    sort: 'name',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })

  const developers: DeveloperCard[] = (
    docs as unknown as {
      id: number
      name?: string
      description?: string
      logo?: { url?: string } | null
    }[]
  )
    .filter((d) => d.name)
    .map((d) => ({
      id: Number(d.id),
      name: String(d.name || ''),
      description: String(d.description || ''),
      logoUrl: d.logo && typeof d.logo === 'object' ? d.logo.url || null : null,
    }))

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="floral">
          {/* Хлебные крошки: раздел «Застройщики» живёт внутри «Новостроек» */}
          <nav aria-label={t.developers.breadcrumbNewbuildings} className="mb-4 text-[11px] tracking-wider uppercase">
            <Link
              href={`/${lang}/newbuildings`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.developers.breadcrumbNewbuildings}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <span className="text-[var(--n15-gold)]">{t.developers.title}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.developers.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">{t.developers.subtitle}</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {developers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--n15-white)] text-lg mb-2">{t.developers.empty}</p>
              <p className="text-sm text-[var(--n15-muted)]">{t.developers.emptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {developers.map((d) => (
                <article
                  key={d.id}
                  className="flex flex-col border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-colors duration-300 p-6"
                >
                  {/* Логотип компании: у компаний без логотипа — первая буква
                      названия в фирменном квадрате (как в CRM) */}
                  <div className="h-16 flex items-center mb-4">
                    {d.logoUrl ? (
                      <img
                        src={d.logoUrl}
                        alt={d.name}
                        className="max-h-16 max-w-[180px] object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="w-14 h-14 grid place-items-center bg-[var(--n15-gold)]/15 text-[var(--n15-gold)] font-[family-name:var(--font-display)] text-2xl"
                      >
                        {d.name.trim().charAt(0).toUpperCase() || '—'}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                    {d.name}
                  </h2>
                  {d.description ? (
                    <p className="text-xs text-[var(--n15-muted)] leading-relaxed mb-5 line-clamp-3">
                      {d.description}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--n15-muted)] mb-5">{t.developers.noDescription}</p>
                  )}
                  <div className="mt-auto pt-2">
                    <Button variant="outline" size="sm" href={`/${lang}/newbuildings/developers/${d.id}`}>
                      {t.developers.more}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

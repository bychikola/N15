import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.partners.metaTitle, description: t.partners.metaDescription }
}

/** Карточка стороны сотрудничества: заголовок, пояснение и список возможностей */
function PartnerCard({
  title,
  lead,
  points,
}: {
  title: string
  lead: string
  points: readonly string[]
}) {
  return (
    <article className="h-full flex flex-col p-5 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 hover:border-[var(--n15-gold)]/35 transition-colors duration-300">
      <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1.5">
        {title}
      </h2>
      <p className="text-sm text-[var(--n15-muted)] leading-relaxed mb-4">{lead}</p>
      {/* Возможности — маркер ромбом, как в карточках «Как работает площадка» */}
      <ul className="flex flex-col gap-3">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-xs text-[var(--n15-muted)] leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-1.5 w-1.5 h-1.5 shrink-0 rotate-45 bg-[var(--n15-gold)]/60"
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

/**
 * «Партнёрам» — страница сотрудничества для агентств недвижимости и
 * застройщиков: действующие возможности площадки и кнопка связи с
 * администратором Н15. Отдельный пункт верхнего меню (см. Header).
 */
export default async function PartnersPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.partners

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Первый экран — зелёный, компактный: как у «Как работает площадка»
            и страницы рекламы (класс n15-green-block, см. globals.css) */}
        <section className="n15-green-block n15-section">
          <div className="n15-container">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">
              {s.eyebrow}
            </p>
            <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4 max-w-2xl">
              {s.title}
            </h1>
            <p className="max-w-2xl text-sm md:text-[15px] leading-relaxed text-[var(--n15-silver)]">
              {s.lead}
            </p>
          </div>
        </section>

        {/* Две стороны сотрудничества: агентства и застройщики. На широком
            экране в один ряд, карточки выравниваются по высоте (auto-rows-fr) */}
        <SectionWrapper variant="dark">
          <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4">
            <PartnerCard title={s.agenciesTitle} lead={s.agenciesLead} points={s.agenciesPoints} />
            <PartnerCard
              title={s.developersTitle}
              lead={s.developersLead}
              points={s.developersPoints}
            />
          </div>
        </SectionWrapper>

        {/* Кнопка связи — одна на страницу и ведёт на контакты: там телефоны,
            почта и форма, через которые отвечает администратор Н15 */}
        <SectionWrapper variant="charcoal">
          <OrnamentBorder cornerOrnament>
            <div className="px-6 py-8 text-center">
              <h2 className="text-xl font-[family-name:var(--font-display)] mb-2">{s.ctaTitle}</h2>
              <p className="text-[var(--n15-silver)] mb-5">{s.ctaText}</p>
              <Link
                href={`/${lang}/contacts`}
                className="inline-flex items-center justify-center px-8 py-3 text-sm tracking-wider uppercase rounded-sm border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)] hover:text-[var(--on-accent)] transition-all duration-300"
              >
                {s.cta}
              </Link>
            </div>
          </OrnamentBorder>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

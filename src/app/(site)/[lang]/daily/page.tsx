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
  return { title: t.daily.metaTitle, description: t.daily.metaDescription }
}

/**
 * «Посуточно» — раздел ещё не запущен, поэтому страница честно сообщает
 * «Раздел готовится» и предлагает связаться с Н15 (правило §8: пусто ≠
 * ничего — объясняем состояние и даём, что делать дальше). Отдельный пункт
 * верхнего меню (см. Header).
 */
export default async function DailyPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.daily

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Первый экран — зелёный, как у «Как работает площадка» и «Партнёров» */}
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

        {/* Состояние раздела и единственное действие — связь с Н15 */}
        <SectionWrapper variant="charcoal">
          <OrnamentBorder cornerOrnament>
            <div className="px-6 py-10 text-center">
              <p className="max-w-2xl mx-auto text-[var(--n15-silver)] leading-relaxed mb-6">
                {s.note}
              </p>
              <p className="text-xl font-[family-name:var(--font-display)] mb-2">{s.ctaTitle}</p>
              <p className="max-w-xl mx-auto text-[var(--n15-silver)] mb-6">{s.ctaText}</p>
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

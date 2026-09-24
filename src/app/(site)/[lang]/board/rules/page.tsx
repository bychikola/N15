import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { getDictionary } from '@/i18n/dictionaries'
import { BOARD_LEGAL_UPDATED, BOARD_RULES } from '@/lib/board-legal'

interface PageProps {
  params: Promise<{ lang: string }>
}

export function generateMetadata(): Metadata {
  return { title: BOARD_RULES.title, description: BOARD_RULES.subtitle }
}

/**
 * Правила доски объявлений (/board/rules) — документ второй галочки формы
 * подачи. Текст живёт в коде (src/lib/board-legal.ts): у правил одна редакция
 * и версия, которую форма сохраняет в объявлении, — принятая редакция
 * не меняется задним числом при правке текста.
 *
 * Оформление то же, что у правовых документов рекламы (см.
 * src/components/advertising/LegalDoc.tsx): страница-документ из разделов,
 * с датой редакции и оговоркой, что текст публикуется на русском.
 */
export default async function BoardRulesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">{BOARD_RULES.subtitle}</p>
          <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 max-w-3xl">
            {BOARD_RULES.title}
          </h1>
          <p className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)]">
            {t.board.legalUpdated.replace('%s', BOARD_LEGAL_UPDATED)}
          </p>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.board.rulesLegalNote}</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="max-w-3xl flex flex-col gap-7">
            {BOARD_RULES.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                  {section.title}
                </h2>
                {/* Абзацы документа разделены переводами строк в тексте */}
                {section.text.split('\n').map((line, index) =>
                  line.trim() ? (
                    <p key={index} className="text-sm leading-relaxed text-[var(--n15-silver)] mb-2">
                      {line}
                    </p>
                  ) : null,
                )}
              </section>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-[var(--n15-gold)]/15 flex flex-wrap gap-4">
            <Link
              href={`/${lang}/board/new`}
              className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
            >
              {t.board.title} →
            </Link>
            <Link
              href={`/${lang}/board`}
              className="text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)]"
            >
              {t.board.backToBoard}
            </Link>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

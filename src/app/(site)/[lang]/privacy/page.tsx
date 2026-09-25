import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { DocToolbar } from '@/components/legal/DocToolbar'
import { getDictionary } from '@/i18n/dictionaries'
import { LEGAL_DOCS } from '@/lib/legal-docs'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.privacy.title, description: t.privacy.subtitle }
}

/**
 * Политики обработки персональных данных (/privacy) — документ, на который
 * ссылается согласие на обработку персональных данных в формах сайта (в том
 * числе «Обсудить размещение рекламы» на странице /advertising).
 * Текст — в словаре (ru/os), контакты оператора совпадают с разделом «Контакты».
 *
 * Страница входит в раздел «Документы»: в реестре (src/lib/legal-docs.ts) у неё
 * своя запись с датой и версией, а здесь — кнопки печатной формы. Текст в PDF и
 * DOCX приходит из словаря на языке открытой страницы (см. legal-docs-content).
 */
export default async function PrivacyPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-xs tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-4">
            {t.privacy.subtitle}
          </p>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.privacy.title}
          </h1>
          <p className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">
            {t.privacy.updated} · {t.documents.version.replace('%s', LEGAL_DOCS['privacy-policy'].version)}
          </p>
          <DocToolbar docId="privacy-policy" className="mt-6" />
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="max-w-3xl">
            <p className="text-base leading-relaxed text-[var(--n15-silver)] mb-10">{t.privacy.intro}</p>

            <div className="flex flex-col gap-8">
              {t.privacy.sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                    {section.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-[var(--n15-silver)]">{section.text}</p>
                </section>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-[var(--n15-gold)]/10">
              <p className="text-sm leading-relaxed text-[var(--n15-muted)] mb-6">{t.privacy.consentNote}</p>
              <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                {t.privacy.contactTitle}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--n15-silver)]">{t.privacy.contactText}</p>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
              <Link
                href={`/${lang}/documents`}
                className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] n15-no-print"
              >
                {t.documents.backToDocuments}
              </Link>
              <Link
                href={`/${lang}/documents/personal-data-consent`}
                className="text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] n15-no-print"
              >
                {LEGAL_DOCS['personal-data-consent'].title}
              </Link>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

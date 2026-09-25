import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { DocToolbar } from '@/components/legal/DocToolbar'
import { getDictionary } from '@/i18n/dictionaries'
import { LEGAL_DOC_LIST, legalDocHref } from '@/lib/legal-docs'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.documents.title, description: t.documents.subtitle }
}

/**
 * Раздел «Документы» (/documents) — все правовые документы сайта одним
 * списком: согласия, политика, пользовательское соглашение, оферта, правила.
 *
 * До этого раздела документы были разбросаны по страницам форм: согласие на
 * обработку данных жило только текстом галочки, а печатной формы не было ни у
 * одного документа. Здесь у каждого документа своя страница с полным текстом,
 * датой и версией, а также кнопки «Распечатать», «Скачать PDF» и «Скачать
 * DOCX» — и в списке, и на странице документа.
 *
 * Список берётся из реестра (src/lib/legal-docs.ts), поэтому новый документ
 * появляется здесь одной записью, без правки разметки.
 */
export default async function DocumentsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">{t.documents.subtitle}</p>
          <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4 max-w-3xl">
            {t.documents.title}
          </h1>
          <p className="text-sm leading-relaxed text-[var(--n15-silver)] max-w-3xl">{t.documents.intro}</p>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--n15-muted)] max-w-3xl">{t.documents.legalOnly}</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <ol className="flex flex-col gap-8 max-w-3xl">
            {LEGAL_DOC_LIST.map((doc, index) => (
              <li key={doc.id} className="border-b border-[var(--n15-gold)]/15 pb-7 last:border-b-0 last:pb-0">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-2">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h2 className="text-base font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                  <Link href={legalDocHref(lang, doc)} className="hover:text-[var(--n15-gold-light)] transition-colors">
                    {doc.title}
                  </Link>
                </h2>
                <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-3">{doc.subtitle}</p>
                <p className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)] mb-3">
                  {t.documents.updated.replace('%s', doc.updated)} · {t.documents.version.replace('%s', doc.version)}
                </p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link
                    href={legalDocHref(lang, doc)}
                    className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
                  >
                    {t.documents.read} →
                  </Link>
                  <DocToolbar docId={doc.id} variant="files" />
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-12 max-w-3xl border-t border-[var(--n15-gold)]/15 pt-6 text-xs leading-relaxed text-[var(--n15-muted)]">
            {t.documents.indexNote}
          </p>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

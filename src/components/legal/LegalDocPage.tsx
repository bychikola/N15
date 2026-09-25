import type { FC, ReactNode } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { DocToolbar } from '@/components/legal/DocToolbar'
import { getDictionary } from '@/i18n/dictionaries'
import type { LegalDoc, LegalSection } from '@/lib/legal-docs'

interface Props {
  lang: string
  doc: LegalDoc
  /** Разделы документа: у политики они приходят из словаря (см. legal-docs-content) */
  sections: LegalSection[]
  /** Ссылки под документом: форма, к которой относится документ, и прочее */
  footer?: ReactNode
}

/**
 * Страница правового документа раздела «Документы»: заголовок с редакцией и
 * версией, кнопки печатной формы и полный текст разделов.
 *
 * Один компонент на все документы: разметка одинаковая, различается текст из
 * src/lib/legal-docs.ts. Документы публикуются на русском языке — на странице
 * об этом сказано строкой словаря, — тогда как адрес есть на обоих языках
 * сайта (/ru/… и /os/…), чтобы ссылка из формы не вела на чужой язык.
 */
export const LegalDocPage: FC<Props> = ({ lang, doc, sections, footer }) => {
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">{doc.subtitle}</p>
          <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 max-w-3xl">
            {doc.title}
          </h1>
          <p className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)]">
            {t.documents.updated.replace('%s', doc.updated)} · {t.documents.version.replace('%s', doc.version)}
          </p>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--n15-muted)] max-w-3xl">{t.documents.legalOnly}</p>
          <DocToolbar docId={doc.id} className="mt-6" />
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--n15-muted)] max-w-3xl n15-no-print">
            {t.documents.printHint}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-8 max-w-3xl">{doc.intro}</p>

          <div className="max-w-3xl flex flex-col gap-7">
            {sections.map((section) => (
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

          {doc.sources && doc.sources.length > 0 && (
            <div className="mt-10 max-w-3xl border-t border-[var(--n15-gold)]/15 pt-6">
              <p className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)] mb-3">
                {t.documents.sourcesTitle}
              </p>
              <ul className="flex flex-col gap-1.5">
                {doc.sources.map((source) => (
                  <li key={source} className="text-xs leading-relaxed text-[var(--n15-silver)]">
                    {source}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doc.note && (
            <div className="mt-10 max-w-3xl border border-[var(--n15-gold)]/20 p-5">
              <p className="text-[11px] tracking-wider uppercase text-[var(--n15-gold)] mb-2">
                {t.documents.noteTitle}
              </p>
              <p className="text-xs leading-relaxed text-[var(--n15-silver)]">{doc.note}</p>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-[var(--n15-gold)]/15 flex flex-wrap gap-x-6 gap-y-3 items-center">
            <Link
              href={`/${lang}/documents`}
              className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
            >
              {t.documents.backToDocuments}
            </Link>
            {footer}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

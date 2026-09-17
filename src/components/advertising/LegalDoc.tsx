import type { FC } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { getDictionary } from '@/i18n/dictionaries'
import { AD_LEGAL_UPDATED, adDocHref, type AdLegalDoc } from '@/lib/advertising-legal'

/**
 * Страница правового документа модуля «Ваша реклама»: договор-оферта
 * (/advertising/offer) и правила размещения (/advertising/rules).
 *
 * Один компонент на оба документа: разметка одинаковая, различается только
 * текст из src/lib/advertising-legal.ts. Документы публикуются на русском
 * языке — на странице об этом сказано строкой словаря, — тогда как адрес
 * страницы есть на обоих языках сайта (/ru/… и /os/…), чтобы ссылки из формы
 * не вели на чужой язык.
 */
interface Props {
  lang: string
  doc: AdLegalDoc
}

export const AdvertisingLegalPage: FC<Props> = ({ lang, doc }) => {
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">
            {doc.subtitle}
          </p>
          <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 max-w-3xl">
            {doc.title}
          </h1>
          <p className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)]">
            {t.advertising.legalUpdated.replace('%s', AD_LEGAL_UPDATED)}
          </p>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--n15-muted)]">
            {t.advertising.legalNote}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="max-w-3xl flex flex-col gap-7">
            {doc.sections.map((section) => (
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
              href={adDocHref(lang, '/advertising')}
              className="text-xs tracking-wider uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
            >
              ← {t.advertising.backToForm}
            </Link>
            <Link
              href={adDocHref(lang, '/privacy')}
              className="text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)]"
            >
              {t.advertising.consentPrivacyDoc}
            </Link>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

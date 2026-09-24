import { headers } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BoardAdForm } from '@/components/board/BoardAdForm'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

/**
 * Подача объявления на доску (/board/new).
 *
 * Гостя не отправляем на вход молча (редирект выкинул бы его с формы и потерял
 * то, что он хотел сделать): показываем страницу с объяснением, зачем нужен
 * аккаунт, и кнопкой входа. Так же поступает личный кабинет.
 */
export default async function BoardNewPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <Link
              href={`/${lang}/board`}
              className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              ← {t.board.title}
            </Link>
            <h1 className="mt-4 text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
              {t.board.newTitle}
            </h1>
          </div>
        </section>

        <section className="bg-[var(--n15-charcoal)] py-10">
          <div className="n15-container">
            {user ? (
              <BoardAdForm lang={lang} />
            ) : (
              <div className="max-w-2xl">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                  {t.board.newLoginTitle}
                </h2>
                <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-6">{t.board.newLoginText}</p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href={`/${lang}/login`}
                    className="n15-cta-green px-6 py-3.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
                  >
                    {t.board.newLoginCta}
                  </Link>
                  <Link
                    href={`/${lang}/board/rules`}
                    className="px-6 py-3.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-muted)] hover:text-[var(--n15-silver)] transition-all duration-300"
                  >
                    {t.board.formRulesLink}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

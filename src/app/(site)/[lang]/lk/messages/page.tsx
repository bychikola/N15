import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import Link from 'next/link'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function MessagesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-8">
            <Link href={`/${lang}/lk`} className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              {t.lkMessages.back}
            </Link>
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkMessages.title}</h1>
          <p className="text-[var(--n15-muted)]">{t.lkMessages.empty}</p>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

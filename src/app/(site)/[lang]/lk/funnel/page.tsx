import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { getDictionary } from '@/i18n/dictionaries'
import FunnelBoard from '@/components/lk/FunnelBoard'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function FunnelPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="funnel">
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkFunnel.title}</h1>
          <FunnelBoard lang={lang} />
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

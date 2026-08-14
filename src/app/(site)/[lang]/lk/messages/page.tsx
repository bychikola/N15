import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { getDictionary } from '@/i18n/dictionaries'
import ChatList from '@/components/lk/ChatList'

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
        <LkShell active="messages">
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkMessages.title}</h1>
          <ChatList lang={lang} />
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

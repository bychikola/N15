import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { getDictionary } from '@/i18n/dictionaries'
import ChatThread from '@/components/lk/ChatThread'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ lang: string; applicationId: string }>
}

export default async function ChatPage({ params }: PageProps) {
  const { lang, applicationId } = await params
  const t = getDictionary(lang)
  const id = parseInt(applicationId, 10)
  if (!Number.isFinite(id)) notFound()

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="messages">
          <p className="text-[10px] tracking-[0.25em] uppercase text-[var(--n15-gold)] mb-3">{t.lkMessages.title}</p>
          <ChatThread applicationId={id} lang={lang} />
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

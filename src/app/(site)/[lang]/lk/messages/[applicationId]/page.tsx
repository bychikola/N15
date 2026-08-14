import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import Link from 'next/link'
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
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${lang}/lk/messages`} className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              {t.lkChat.back}
            </Link>
          </div>
          <ChatThread applicationId={id} lang={lang} />
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

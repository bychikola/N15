import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import Link from 'next/link'

export default function MessagesPage() {
  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/lk" className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              ← Личный кабинет
            </Link>
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">Сообщения</h1>
          <p className="text-[var(--n15-muted)]">У вас пока нет сообщений</p>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

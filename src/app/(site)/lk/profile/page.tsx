import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function ProfilePage() {
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
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">Профиль</h1>

          <div className="max-w-lg">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center">
                <span className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">АК</span>
              </div>
              <div>
                <div className="text-sm text-[var(--n15-white)]">Алан Караев</div>
                <div className="text-xs text-[var(--n15-muted)]">al@n15.ru</div>
              </div>
            </div>

            <form className="flex flex-col gap-4">
              <input type="text" defaultValue="Алан" placeholder="Имя" className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
              <input type="tel" defaultValue="+7 (928) 123-45-67" placeholder="Телефон" className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
              <input type="email" defaultValue="al@n15.ru" placeholder="Email" className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
              <Button variant="primary" size="md" className="mt-2">Сохранить</Button>
            </form>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

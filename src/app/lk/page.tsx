import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import Link from 'next/link'

const navItems = [
  { href: '/lk/favorites', label: 'Избранное', icon: '♡' },
  { href: '/lk/applications', label: 'Мои заявки', icon: '📋' },
  { href: '/lk/messages', label: 'Сообщения', icon: '✉' },
  { href: '/lk/profile', label: 'Профиль', icon: '👤' },
]

export default function LKPage() {
  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
            Личный кабинет
          </h1>
          <p className="text-[var(--n15-muted)] mb-10">Добро пожаловать, Алан</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <OrnamentBorder>
                  <div className="p-8 text-center group hover:bg-[var(--n15-gold)]/3 transition-colors duration-300">
                    <div className="text-3xl mb-4">{item.icon}</div>
                    <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                      {item.label}
                    </h3>
                  </div>
                </OrnamentBorder>
              </Link>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

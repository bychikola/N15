'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

const navItems = [
  { href: '/lk/favorites', label: 'Избранное', desc: 'Сохранённые объекты' },
  { href: '/lk/applications', label: 'Мои заявки', desc: 'История обращений' },
  { href: '/lk/messages', label: 'Сообщения', desc: 'Переписка с агентами' },
  { href: '/lk/profile', label: 'Профиль', desc: 'Личные данные' },
]

export default function LKDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user)
        } else {
          router.push('/login')
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    router.push('/')
    router.refresh()
  }

  if (loading) return (
    <>
      <Header />
      <main className="pt-20 min-h-screen flex items-center justify-center">
        <p className="text-[var(--n15-muted)]">Загрузка...</p>
      </main>
    </>
  )

  if (!user) return null

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
              Личный кабинет
            </h1>
            <button onClick={handleLogout} className="text-xs text-[var(--n15-muted)] hover:text-red-400 transition-colors">
              Выйти
            </button>
          </div>
          <p className="text-[var(--n15-muted)] mb-10">
            Добро пожаловать, <span className="text-[var(--n15-white)]">{user.name || user.email}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <OrnamentBorder>
                  <div className="p-8 text-center group hover:bg-[var(--n15-gold)]/3 transition-colors duration-300 min-h-[160px] flex flex-col items-center justify-center">
                    <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                      {item.label}
                    </h3>
                    <p className="text-xs text-[var(--n15-muted)] mt-2">{item.desc}</p>
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

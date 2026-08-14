'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

export default function LKDashboard() {
  const router = useRouter()
  const { lang, t } = useI18n()
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<{ favorites: number; applications: number; unread: number } | null>(null)

  const navItems = [
    { href: `/${lang}/lk/favorites`, label: t.lk.favorites, desc: t.lk.favoritesDesc },
    { href: `/${lang}/lk/applications`, label: t.lk.applications, desc: t.lk.applicationsDesc },
    { href: `/${lang}/lk/messages`, label: t.lk.messages, desc: t.lk.messagesDesc },
    { href: `/${lang}/lk/profile`, label: t.lk.profile, desc: t.lk.profileDesc },
  ]

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/users/me?depth=1', { credentials: 'include' })
      const data = res.ok ? await res.json() : null
      const me = data?.user
      if (!me) {
        router.push(`/${lang}/login`)
        return
      }
      if (cancelled) return
      setUser(me)
      setLoading(false)

      const favCount = Array.isArray(me.favorites) ? me.favorites.length : 0
      const appsRes = await fetch(
        `/api/applications?${new URLSearchParams({ where: JSON.stringify({ user: { equals: me.id } }), limit: '0' })}`,
        { credentials: 'include' },
      )
      const appsData = await appsRes.json()
      const unreadRes = await fetch(
        `/api/messages?${new URLSearchParams({
          where: JSON.stringify({
            and: [
              { 'application.user': { equals: me.id } },
              { read: { equals: false } },
              { 'sender.id': { not_equals: me.id } },
            ],
          }),
          limit: '0',
        })}`,
        { credentials: 'include' },
      )
      const unreadData = await unreadRes.json()
      if (cancelled) return
      setCounts({
        favorites: favCount,
        applications: appsData.totalDocs ?? 0,
        unread: unreadData.totalDocs ?? 0,
      })
    }
    void load().catch(() => router.push(`/${lang}/login`))
    return () => { cancelled = true }
  }, [router, lang])

  const handleLogout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    router.push(`/${lang}`)
    router.refresh()
  }

  if (loading) return (
    <>
      <Header />
      <main className="pt-20 min-h-screen flex items-center justify-center">
        <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
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
              {t.lk.title}
            </h1>
            <button onClick={handleLogout} className="text-xs text-[var(--n15-muted)] hover:text-red-400 transition-colors">
              {t.lk.logout}
            </button>
          </div>
          <p className="text-[var(--n15-muted)] mb-10">
            {t.lk.welcome} <span className="text-[var(--n15-white)]">{user.name || user.email}</span>
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
                    {counts && (
                      <span className="text-xs text-[var(--n15-gold)] mt-1">
                        {item.href.includes('favorites') && counts.favorites > 0 && counts.favorites}
                        {item.href.includes('applications') && counts.applications > 0 && counts.applications}
                        {item.href.includes('messages') && counts.unread > 0 && `${counts.unread} ${t.lk.unread}`}
                      </span>
                    )}
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

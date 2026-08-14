'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

export default function LKDashboard() {
  const router = useRouter()
  const { lang, t } = useI18n()
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)
  const [counts, setCounts] = useState<{ favorites: number; applications: number; unread: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const navItems = [
    { href: `/${lang}/lk/favorites`, icon: 'favorite', label: t.lk.favorites, desc: t.lk.favoritesDesc },
    { href: `/${lang}/lk/applications`, icon: 'article', label: t.lk.applications, desc: t.lk.applicationsDesc },
    { href: `/${lang}/lk/messages`, icon: 'forum', label: t.lk.messages, desc: t.lk.messagesDesc },
    { href: `/${lang}/lk/profile`, icon: 'person', label: t.lk.profile, desc: t.lk.profileDesc },
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
      const [appsRes, unreadRes] = await Promise.all([
        fetch(`/api/applications?${new URLSearchParams({ where: JSON.stringify({ user: { equals: me.id } }), limit: '0' })}`, { credentials: 'include' }),
        fetch(`/api/messages?${new URLSearchParams({
          where: JSON.stringify({
            and: [
              { 'application.user': { equals: me.id } },
              { read: { equals: false } },
              { 'sender.id': { not_equals: me.id } },
            ],
          }),
          limit: '0',
        })}`, { credentials: 'include' }),
      ])
      const appsData = await appsRes.json()
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

  if (loading || !user) return (
    <>
      <Header />
      <main className="pt-20 min-h-screen flex items-center justify-center">
        <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
      </main>
    </>
  )

  const stats = [
    { value: counts?.favorites ?? 0, label: t.lk.favorites, href: `/${lang}/lk/favorites` },
    { value: counts?.applications ?? 0, label: t.lk.applications, href: `/${lang}/lk/applications` },
    { value: counts?.unread ?? 0, label: t.lk.unread, href: `/${lang}/lk/messages` },
  ]

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="home">
          {/* Hero */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
              {t.lk.welcome} {user.name || user.email}
            </h1>
          </div>

          {/* Статистика — крупные цифры на панели */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {stats.map((s) => (
              <Link key={s.href} href={s.href}
                className="block bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-6 hover:border-[var(--n15-gold)]/40 transition-colors group">
                <div className="text-4xl font-[family-name:var(--font-display)] text-[var(--n15-gold)] group-hover:text-[var(--n15-gold-light)] transition-colors">
                  {s.value}
                </div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] mt-2">{s.label}</div>
              </Link>
            ))}
          </div>

          {/* Разделы */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-4 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-6 hover:border-[var(--n15-gold)]/40 transition-colors group">
                <span className="material-symbols-outlined text-2xl text-[var(--n15-gold)]/60 group-hover:text-[var(--n15-gold)] transition-colors" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm tracking-wider uppercase text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                    {item.label}
                  </div>
                  <div className="text-xs text-[var(--n15-muted)] mt-1">{item.desc}</div>
                </div>
                <span className="material-symbols-outlined text-lg text-[var(--n15-muted)] group-hover:text-[var(--n15-gold)] transition-colors" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            ))}
          </div>
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

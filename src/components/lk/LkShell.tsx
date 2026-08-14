'use client'

import { useEffect, useState, type FC, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'

interface NavItem {
  href: string
  icon: string
  label: string
  count?: number
}

/**
 * Каркас личного кабинета: левая навигация + контент.
 * Досье-эстетика: панели на подложках, тонкие золотые рамки, капс-этикетки.
 */
export const LkShell: FC<{ children: ReactNode; active?: string }> = ({ children }) => {
  const { lang, t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)
  const [counts, setCounts] = useState<{ favorites: number; applications: number; unread: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/users/me?depth=1', { credentials: 'include' })
        const data = await res.json()
        const me = data?.user
        if (!me) {
          router.push(`/${lang}/login`)
          return
        }
        if (cancelled) return
        setUser(me)
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
      } catch {
        // остаёмся на странице, данные подтянутся при следующем рендере
      }
    }
    void load()
    return () => { cancelled = true }
  }, [router, lang])

  const handleLogout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    router.push(`/${lang}`)
    router.refresh()
  }

  const navItems: NavItem[] = [
    { href: `/${lang}/lk`, icon: 'dashboard', label: t.lk.home },
    { href: `/${lang}/lk/favorites`, icon: 'favorite', label: t.lk.favorites, count: counts?.favorites },
    { href: `/${lang}/lk/applications`, icon: 'article', label: t.lk.applications, count: counts?.applications },
    { href: `/${lang}/lk/messages`, icon: 'forum', label: t.lk.messages, count: counts?.unread },
    { href: `/${lang}/lk/profile`, icon: 'person', label: t.lk.profile },
  ]

  const isActive = (href: string) => {
    if (href === `/${lang}/lk`) {
      return pathname === `/${lang}/lk`
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="n15-container flex flex-col lg:flex-row gap-8" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
      {/* ── Боковая панель ── */}
      <aside className="lg:w-64 shrink-0">
        <div className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-6 lg:sticky lg:top-24">
          <div className="pb-5 mb-5 border-b border-[var(--n15-gold)]/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 flex items-center justify-center">
                <span className="font-[family-name:var(--font-display)] text-[var(--n15-gold)] text-sm">
                  {user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2) : 'N'}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-sm text-[var(--n15-white)] truncate">{user?.name || user?.email}</div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-[var(--n15-muted)]">{t.lk.cabinetWord}</div>
              </div>
            </div>
            <button onClick={handleLogout}
              className="text-[10px] tracking-[0.15em] uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors cursor-pointer">
              {t.lk.logout} →
            </button>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm whitespace-nowrap transition-colors border-l-2 ${
                  isActive(item.href)
                    ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/6'
                    : 'border-transparent text-[var(--n15-silver)] hover:text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/3'
                }`}>
                <span className="material-symbols-outlined text-lg leading-none" aria-hidden="true">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                    item.icon === 'forum' ? 'bg-[var(--n15-gold)] text-[var(--on-accent)]' : 'bg-[var(--n15-gold)]/12 text-[var(--n15-gold)]'
                  }`}>
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* ── Контент ── */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

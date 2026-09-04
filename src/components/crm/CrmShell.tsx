'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import type { CrmUser } from '@/app/crm/auth'

interface Props {
  user: CrmUser
  t: Dict
  active: string
  children: ReactNode
}

export function CrmShell({ user, t, active, children }: Props) {
  const isAdmin = user.role === 'admin'
  const navItems = [
    { id: 'overview', href: '/crm', label: t.crm.navOverview },
    { id: 'leads', href: '/crm/leads', label: t.crm.navLeads },
    { id: 'messages', href: '/crm/messages', label: t.crm.navMessages },
    { id: 'tasks', href: '/crm/tasks', label: t.crm.navTasks },
    { id: 'customers', href: '/crm/customers', label: t.crm.navCustomers },
    { id: 'objects', href: '/crm/objects', label: t.crm.navObjects },
    { id: 'stats', href: '/crm/stats', label: t.crm.navStats },
    { id: 'mail', href: '/crm/mail', label: t.crm.navMail },
    ...(user.agentAccess ? [{ id: 'agent', href: '/crm/agent', label: t.crm.navAgent }] : []),
  ]

  const signOut = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || 'Н'

  return (
    <main className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <img className="crm-logo" src="/logo.png" alt="Н15" />
          <span>{t.crm.sidebarCaption}</span>
        </div>
        <nav className="crm-nav" aria-label="Разделы CRM">
          {navItems.map((item) => (
            <Link key={item.id} href={item.href} style={active === item.id ? { background: 'rgba(198,160,105,.14)', color: '#e4c89f' } : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="crm-sidebar-bottom">
          <Link className="crm-site-link" href="/">{t.crm.openSite}</Link>
        </div>
      </aside>
      <section className="crm-main" id="overview">
        <header className="crm-topbar">
          <div className="crm-greeting">
            <p>{t.crm.greeting}</p>
            <h1>Добрый день, {user.name}</h1>
          </div>
          <div className="crm-user">
            <span className="crm-avatar">{initial}</span>
            <div>
              <strong>{isAdmin ? t.crm.roleAdmin : t.crm.roleAgent}</strong>
              <span>{user.name}</span>
              <button type="button" className="crm-signout" onClick={() => void signOut()} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                {t.crm.signOut}
              </button>
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  )
}

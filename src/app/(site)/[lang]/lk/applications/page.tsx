'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { useI18n } from '@/i18n/i18n-provider'

interface ApplicationItem {
  id: number
  type: string
  status: string
  createdAt: string
  objectTitle?: string
  agentName?: string
}

const typeKeys: Record<string, string> = {
  viewing: 'Просмотр', callback: 'Обратный звонок', mortgage: 'Ипотека', consultation: 'Консультация',
}

const statusStyles: Record<string, string> = {
  new: 'border-[var(--n15-gold)]/50 text-[var(--n15-gold)]',
  processing: 'border-blue-400/50 text-blue-400',
  completed: 'border-green-400/50 text-green-400',
  cancelled: 'border-[var(--n15-muted)]/40 text-[var(--n15-muted)]',
}

export default function ApplicationsPage() {
  const { lang, t } = useI18n()
  const [items, setItems] = useState<ApplicationItem[]>([])
  const [loading, setLoading] = useState(true)

  const statusLabels: Record<string, string> = {
    new: t.lkApplications.statusNew,
    processing: t.lkApplications.statusProcessing,
    completed: t.lkApplications.statusCompleted,
    cancelled: t.lkApplications.statusCancelled,
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const meRes = await fetch('/api/users/me', { credentials: 'include' })
      const meData = await meRes.json()
      const me = meData?.user
      if (!me) return
      const res = await fetch(
        `/api/applications?${new URLSearchParams({
          where: JSON.stringify({ user: { equals: me.id } }),
          sort: '-createdAt',
          depth: '1',
          limit: '50',
        })}`,
        { credentials: 'include' },
      )
      const data = await res.json()
      if (cancelled) return
      setItems(
        ((data.docs || []) as Record<string, unknown>[]).map((a) => {
          const obj = a.object as Record<string, unknown> | undefined
          const agent = a.agent as Record<string, unknown> | undefined
          return {
            id: a.id as number,
            type: a.type as string,
            status: a.status as string,
            createdAt: a.createdAt as string,
            objectTitle: (obj?.title as string) || undefined,
            agentName: (agent?.name as string) || undefined,
          }
        }),
      )
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="applications">
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkApplications.title}</h1>

          {loading ? (
            <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
          ) : items.length === 0 ? (
            <div className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-10 text-center">
              <span className="material-symbols-outlined text-3xl text-[var(--n15-gold)]/40 mb-3" aria-hidden="true">article</span>
              <p className="text-sm text-[var(--n15-muted)] mb-6">{t.lkApplications.empty}</p>
              <Link href={`/${lang}/catalog`}
                className="inline-block text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-6 py-2.5 hover:bg-[var(--n15-gold)]/8 transition-colors">
                {t.lkApplications.viewCatalog}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((app) => (
                <Link key={app.id} href={`/${lang}/lk/messages/${app.id}`}
                  className="flex items-center justify-between gap-4 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-5 hover:border-[var(--n15-gold)]/40 transition-colors group">
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                      {typeKeys[app.type] || app.type}
                      {app.objectTitle && (
                        <span className="text-[var(--n15-muted)]"> · {app.objectTitle}</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--n15-muted)] mt-1.5">
                      {new Date(app.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                      {app.agentName && ` · ${t.lkApplications.agentLabel}: ${app.agentName}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className={`text-[10px] tracking-[0.15em] uppercase border px-3 py-1.5 ${statusStyles[app.status] || ''}`}>
                      {statusLabels[app.status] || app.status}
                    </span>
                    <span className="material-symbols-outlined text-lg text-[var(--n15-muted)] group-hover:text-[var(--n15-gold)] transition-colors" aria-hidden="true">
                      arrow_forward
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

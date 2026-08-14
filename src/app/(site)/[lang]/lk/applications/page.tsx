'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { useI18n } from '@/i18n/i18n-provider'

interface ApplicationItem {
  id: number
  type: string
  status: string
  createdAt: string
  objectTitle?: string
  objectId?: number
  agentName?: string
}

const typeKeys: Record<string, string> = {
  viewing: 'Просмотр', callback: 'Обратный звонок', mortgage: 'Ипотека', consultation: 'Консультация',
}

const statusColors: Record<string, string> = {
  new: 'text-[var(--n15-gold)]',
  processing: 'text-blue-400',
  completed: 'text-green-400',
  cancelled: 'text-[var(--n15-muted)]',
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
            objectId: (obj?.id as number) || undefined,
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
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-8">
            <Link href={`/${lang}/lk`} className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              {t.lkApplications.back}
            </Link>
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkApplications.title}</h1>

          {loading ? (
            <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
          ) : items.length === 0 ? (
            <div>
              <p className="text-[var(--n15-muted)] mb-6">{t.lkApplications.empty}</p>
              <Link href={`/${lang}/catalog`} className="text-sm text-[var(--n15-gold)] underline">
                {t.lkApplications.viewCatalog}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((app) => (
                <Link key={app.id} href={`/${lang}/lk/messages/${app.id}`}
                  className="flex items-center justify-between p-4 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-colors group">
                  <div>
                    <div className="text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
                      {typeKeys[app.type] || app.type}
                      {app.objectTitle && (
                        <span className="text-[var(--n15-muted)]"> · {app.objectTitle}</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--n15-muted)] mt-0.5">
                      {new Date(app.createdAt).toLocaleDateString(t.locale)}
                      {app.agentName && ` · ${t.lkApplications.agentLabel}: ${app.agentName}`}
                    </div>
                  </div>
                  <span className={`text-xs ${statusColors[app.status] || ''}`}>{statusLabels[app.status] || app.status}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import { useI18n } from '@/i18n/i18n-provider'

export default function FavoritesPage() {
  const { lang, t } = useI18n()
  const [items, setItems] = useState<ObjectListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const meRes = await fetch('/api/users/me?depth=2', { credentials: 'include' })
      const meData = await meRes.json()
      const me = meData?.user
      if (!me) return
      const favs = (me.favorites as Record<string, unknown>[] | undefined) || []
      if (cancelled) return
      setItems(
        favs
          .filter((f) => f && typeof f === 'object')
          .map((f) => ({
            id: f.id as number,
            slug: f.slug as string | undefined,
            title: f.title as string,
            type: f.type as 'sale' | 'rent',
            category: f.category as string,
            price: f.price as number,
            area: f.area as number | undefined,
            rooms: f.rooms as number | undefined,
            floor: f.floor as number | undefined,
            totalFloors: f.totalFloors as number | undefined,
            address: f.address as ObjectListItem['address'],
            primaryImage: f.primaryImage as ObjectListItem['primaryImage'],
            agent: f.agent as ObjectListItem['agent'],
          })),
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
        <LkShell active="favorites">
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkFavorites.title}</h1>

          {loading ? (
            <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
          ) : items.length === 0 ? (
            <div className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-10 text-center">
              <span className="material-symbols-outlined text-3xl text-[var(--n15-gold)]/40 mb-3" aria-hidden="true">favorite</span>
              <p className="text-sm text-[var(--n15-muted)] mb-6">{t.lkFavorites.empty}</p>
              <Link href={`/${lang}/catalog`}
                className="inline-block text-xs uppercase tracking-wider border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] px-6 py-2.5 hover:bg-[var(--n15-gold)]/8 transition-colors">
                {t.lkFavorites.viewCatalog}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-8">
              {items.map((obj) => <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />)}
            </div>
          )}
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

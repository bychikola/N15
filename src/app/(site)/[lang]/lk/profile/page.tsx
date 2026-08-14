'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LkShell } from '@/components/lk/LkShell'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/i18n-provider'

export default function ProfilePage() {
  const { t } = useI18n()
  const [userId, setUserId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/users/me', { credentials: 'include' })
      const data = await res.json()
      const me = data?.user
      if (cancelled || !me) return
      setUserId(me.id as number)
      setName((me.name as string) || '')
      setPhone((me.phone as string) || '')
      setEmail((me.email as string) || '')
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || userId === null) return
    setSaving(true)
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, phone }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const initials = name ? name.split(' ').map((n) => n[0]).join('').slice(0, 2) : '–'
  const inputCls = 'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <LkShell active="profile">
          <p className="text-[10px] tracking-[0.25em] uppercase text-[var(--n15-gold)] mb-3">{t.lk.cabinetWord}</p>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkProfile.title}</h1>

          {loading ? (
            <p className="text-[var(--n15-muted)]">{t.lk.loading}</p>
          ) : (
            <div className="max-w-lg bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 p-8">
              <div className="flex items-center gap-5 mb-8 pb-8 border-b border-[var(--n15-gold)]/10">
                <div className="w-16 h-16 rounded-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/25 flex items-center justify-center">
                  <span className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">{initials}</span>
                </div>
                <div>
                  <div className="text-sm text-[var(--n15-white)]">{name}</div>
                  <div className="text-xs text-[var(--n15-muted)]">{email}</div>
                </div>
              </div>

              <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.lkProfile.name} className={inputCls} />
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.lkProfile.phone} className={inputCls} />
                <input type="email" value={email} readOnly className={`${inputCls} opacity-50 cursor-not-allowed`} />
                <Button variant="primary" size="md" className="mt-2" disabled={saving}>
                  {saved ? `${t.lkProfile.saved} ✓` : saving ? t.lk.loading : t.lkProfile.save}
                </Button>
              </form>
            </div>
          )}
        </LkShell>
      </main>
      <Footer />
    </>
  )
}

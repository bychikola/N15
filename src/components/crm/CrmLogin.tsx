'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'

export const CrmLogin: FC<{ t: Dict }> = ({ t }) => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(t.crm.loginError)
      setLoading(false)
      return
    }
    const role = data?.user?.role
    if (role === 'agent' || role === 'admin') {
      router.push('/crm')
      router.refresh()
      return
    }
    // Клиент — в CRM нельзя
    setError(t.crm.deniedTitle)
    setLoading(false)
  }

  return (
    <main className="crm-login">
      <section className="crm-login-card">
        <div className="crm-login-brand">
          <img className="crm-logo large" src="/logo.png" alt="N15" />
          <span>CRM</span>
        </div>
        <p className="crm-login-kicker">{t.crm.loginKicker}</p>
        <h1>{t.crm.loginTitle}</h1>
        <p>{t.crm.loginText}</p>
        <form className="crm-login-form" onSubmit={(e) => void submit(e)}>
          <label>
            {t.crm.loginEmail}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@n15-realty.ru" />
          </label>
          <label>
            {t.crm.loginPassword}
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="crm-login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '…' : t.crm.loginButton}
          </button>
        </form>
        <Link className="crm-back-link" href="/">{t.crm.backToSite}</Link>
      </section>
    </main>
  )
}

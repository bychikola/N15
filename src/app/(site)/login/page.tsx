'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.errors?.[0]?.message || 'Ошибка входа')
        return
      }

      router.push('/lk')
      router.refresh()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen flex items-center justify-center">
        <SectionWrapper variant="dark" className="w-full">
          <div className="max-w-md mx-auto">
            <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] text-center mb-8">
              Вход в личный кабинет
            </h1>

            <OrnamentBorder>
              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">
                    Пароль
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="••••••••"
                  />
                </div>

                <Button variant="primary" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'Вход...' : 'Войти'}
                </Button>

                <p className="text-xs text-[var(--n15-muted)] text-center mt-2">
                  Нет аккаунта?{' '}
                  <Link href="/register" className="text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]">
                    Зарегистрироваться
                  </Link>
                </p>
              </form>
            </OrnamentBorder>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

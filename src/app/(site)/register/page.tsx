'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, role: 'user' }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.errors?.[0]?.message || 'Ошибка регистрации')
        return
      }

      // Auto-login after registration
      const loginRes = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (loginRes.ok) {
        router.push('/lk')
        router.refresh()
      } else {
        router.push('/login')
      }
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
              Регистрация
            </h1>

            <OrnamentBorder>
              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">Имя</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="Алан" />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="your@email.com" />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">Телефон</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="+7 (928) 123-45-67" />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">Пароль</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="••••••••" />
                </div>

                <Button variant="primary" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'Регистрация...' : 'Создать аккаунт'}
                </Button>

                <p className="text-xs text-[var(--n15-muted)] text-center mt-2">
                  Уже есть аккаунт?{' '}
                  <Link href="/login" className="text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]">Войти</Link>
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

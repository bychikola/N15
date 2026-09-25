'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { ConsentLine } from '@/components/ui/ConsentCheckbox'
import { legalDocLinks } from '@/lib/legal-docs'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

/**
 * Регистрация в личном кабинете. Аккаунт создаётся по номеру телефона
 * (он же логин), почта необязательна.
 *
 * Перед кнопкой — обязательная отметка: аккаунт заводится на персональных
 * данных, поэтому без согласия с пользовательским соглашением и согласием на
 * обработку данных регистрация не проходит (та же проверка на сервере —
 * см. Users.ts). Отметка сохраняется в аккаунте вместе с датой и редакцией
 * документов.
 */
export default function RegisterPage() {
  const router = useRouter()
  const { lang, t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    // Та же проверка, что и у неактивной кнопки: отправка по Enter без отметки
    if (!agreed) {
      setError(t.consent.registerHint)
      return
    }
    setLoading(true)

    try {
      // Логин — номер телефона (username), нормализованный: только цифры и +
      const normPhone = phone.replace(/[^\d+]/g, '')
      if (!normPhone) {
        setError(t.auth.phone + ' — ' + t.auth.phoneLogin)
        setLoading(false)
        return
      }

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // consent — отметка согласия: дату и версию документов проставляет
        // сервер при создании аккаунта (см. Users.ts)
        body: JSON.stringify({ name, email, phone: normPhone, username: normPhone, password, role: 'user', consent: agreed }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.errors?.[0]?.message || t.auth.regError)
        return
      }

      // Auto-login after registration (по номеру телефона или почте)
      const loginRes = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normPhone, password }),
      })

      if (loginRes.ok) {
        router.push(`/${lang}/lk`)
        router.refresh()
      } else {
        router.push(`/${lang}/login`)
      }
    } catch {
      setError(t.auth.connError)
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
              {t.auth.regTitle}
            </h1>

            <OrnamentBorder>
              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">{t.auth.name}</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder={t.auth.namePlaceholder} />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">{t.auth.phoneLogin}</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder={t.auth.phonePlaceholder} />
                  <p className="text-[11px] text-[var(--n15-muted)] mt-1.5">{t.auth.phoneLoginHint}</p>
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">{t.auth.emailOptional}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="адрес@n15-realty.ru" />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-2 block">{t.auth.password}</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                    className="w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    placeholder="••••••••" />
                </div>

                <ConsentLine
                  checked={agreed}
                  onChange={setAgreed}
                  text={t.consent.registerText}
                  docs={legalDocLinks('user-agreement', 'personal-data-consent')}
                  note={t.consent.registerHint}
                />

                <Button variant="primary" size="lg" className="w-full" disabled={loading || !agreed}>
                  {loading ? t.auth.registering : t.auth.createAccount}
                </Button>

                <p className="text-xs text-[var(--n15-muted)] text-center mt-2">
                  {t.auth.haveAccount}{' '}
                  <Link href={`/${lang}/login`} className="text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]">{t.auth.signIn}</Link>
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

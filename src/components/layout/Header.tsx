'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { LangSwitcher } from '@/i18n/lang-switcher'
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher'
import CabinetBadge from '@/components/layout/CabinetBadge'

export const Header: FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { lang, t } = useI18n()

  const navLinks = [
    { href: `/${lang}/catalog`, label: t.nav.catalog },
    { href: `/${lang}/services`, label: t.nav.services },
    { href: `/${lang}/about`, label: t.nav.about },
    { href: `/${lang}/blog`, label: t.nav.blog },
    { href: `/${lang}/contacts`, label: t.nav.contacts },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--n15-black)]/80 backdrop-blur-md border-b border-[var(--n15-gold)]/10">
      <div className="n15-container flex items-center justify-between h-20">
        {/* Logo */}
        <Link href={`/${lang}`} className="flex items-center group" aria-label="N15 — на главную">
          <img
            src="/logo.png"
            alt="N15"
            width={54}
            height={36}
            className="h-9 w-auto transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wider text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors duration-300 uppercase"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={`/${lang}/lk`}
            className="ml-4 px-5 py-2 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 inline-flex items-center"
          >
            {t.nav.cabinet}
            <CabinetBadge />
          </Link>
          <LangSwitcher className="ml-3" />
          <ThemeSwitcher className="ml-3" />
        </nav>

        {/* Mobile hamburger: точный inline-стиль, чтобы крест всегда был ровно по центру кнопки */}
        <button
          className="lg:hidden relative flex items-center justify-center w-10 h-10 shrink-0"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={t.nav.menu}
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
        >
          <span
            className="block bg-[var(--n15-gold)]"
            style={{
              position: 'absolute', width: 24, height: 1, left: 8, top: 19.5,
              transformOrigin: '12px 0.5px',
              transform: isOpen ? 'rotate(45deg)' : 'translateY(-4px)',
              transition: 'transform .3s ease',
            }}
          />
          <span
            className="block bg-[var(--n15-gold)]"
            style={{
              position: 'absolute', width: 24, height: 1, left: 8, top: 19.5,
              opacity: isOpen ? 0 : 1,
              transition: 'opacity .2s ease',
            }}
          />
          <span
            className="block bg-[var(--n15-gold)]"
            style={{
              position: 'absolute', width: 24, height: 1, left: 8, top: 19.5,
              transformOrigin: '12px 0.5px',
              transform: isOpen ? 'rotate(-45deg)' : 'translateY(4px)',
              transition: 'transform .3s ease',
            }}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="lg:hidden bg-[var(--n15-charcoal)] border-b border-[var(--n15-gold)]/10">
          <nav className="n15-container flex flex-col py-6 gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors py-2"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={`/${lang}/lk`}
              className="mt-2 px-5 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] text-center"
              onClick={() => setIsOpen(false)}
            >
              {t.nav.cabinet}
            </Link>
            <div className="flex justify-center items-center gap-3 pt-1">
              <LangSwitcher onNavigate={() => setIsOpen(false)} />
              <ThemeSwitcher />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { LangSwitcher } from '@/i18n/lang-switcher'
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher'

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
        <Link href={`/${lang}`} className="flex items-center gap-3 group">
          <svg
            width="40"
            height="40"
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-500 group-hover:scale-105"
            style={{ color: 'var(--n15-gold)' }}
          >
            <circle cx="256" cy="256" r="240" stroke="currentColor" strokeWidth="8" />
            <circle cx="256" cy="256" r="200" stroke="currentColor" strokeWidth="3" opacity="0.4" />
            <circle cx="256" cy="256" r="80" stroke="currentColor" strokeWidth="3" opacity="0.4" />
            <line x1="256" y1="16" x2="256" y2="496" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <line x1="16" y1="256" x2="496" y2="256" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <line x1="86" y1="86" x2="426" y2="426" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <line x1="426" y1="86" x2="86" y2="426" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180
              const cx = 256 + 220 * Math.cos(rad)
              const cy = 256 + 220 * Math.sin(rad)
              return <circle key={angle} cx={cx} cy={cy} r="10" fill="currentColor" />
            })}
            <circle cx="256" cy="256" r="24" fill="currentColor" />
          </svg>
          <span className="text-xl tracking-[0.2em] text-[var(--n15-white)]" style={{ fontFamily: "'New Standard', serif" }}>
            N15
          </span>
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
            className="ml-4 px-5 py-2 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300"
          >
            {t.nav.cabinet}
          </Link>
          <LangSwitcher className="ml-3" />
          <ThemeSwitcher className="ml-3" />
        </nav>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={t.nav.menu}
        >
          <span className={`block w-6 h-px bg-[var(--n15-gold)] transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-[5px]' : ''}`} />
          <span className={`block w-6 h-px bg-[var(--n15-gold)] transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-px bg-[var(--n15-gold)] transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-[5px]' : ''}`} />
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

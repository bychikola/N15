'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'

const navLinks = [
  { href: '/catalog', label: 'Каталог' },
  { href: '/services', label: 'Услуги' },
  { href: '/about', label: 'Об агентстве' },
  { href: '/blog', label: 'Блог' },
  { href: '/contacts', label: 'Контакты' },
]

export const Header: FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--n15-black)]/80 backdrop-blur-md border-b border-[var(--n15-gold)]/10">
      <div className="n15-container flex items-center justify-between h-20">
        {/* Logo — solar rosette + N15 */}
        <Link href="/" className="flex items-center gap-3 group">
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transition-transform duration-500 group-hover:rotate-90"
          >
            <circle cx="20" cy="20" r="18" stroke="#C8A44E" strokeWidth="1" />
            <circle cx="20" cy="20" r="12" stroke="#C8A44E" strokeWidth="0.5" />
            <circle cx="20" cy="20" r="4" fill="#C8A44E" />
            <line x1="20" y1="2" x2="20" y2="38" stroke="#C8A44E" strokeWidth="0.3" />
            <line x1="2" y1="20" x2="38" y2="20" stroke="#C8A44E" strokeWidth="0.3" />
            <line x1="7" y1="7" x2="33" y2="33" stroke="#C8A44E" strokeWidth="0.3" />
            <line x1="33" y1="7" x2="7" y2="33" stroke="#C8A44E" strokeWidth="0.3" />
          </svg>
          <span className="text-xl tracking-[0.3em] font-[family-name:var(--font-display)] text-[var(--n15-white)]">
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
            href="/lk"
            className="ml-4 px-5 py-2 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300"
          >
            Личный кабинет
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Меню"
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
              href="/lk"
              className="mt-2 px-5 py-3 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] text-center"
              onClick={() => setIsOpen(false)}
            >
              Личный кабинет
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}

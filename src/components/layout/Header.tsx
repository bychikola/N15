'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { LangSwitcher } from '@/i18n/lang-switcher'
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher'
import CabinetBadge from '@/components/layout/CabinetBadge'

export const Header: FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  // Раскрытие раздела «Недвижимость»: на компьютере — по наведению/клику,
  // на телефоне — по нажатию (аккордеон). Состояние общее для обоих
  // вариантов меню, но виден на экране только один из них.
  const [realtyOpen, setRealtyOpen] = useState(false)
  const { lang, t } = useI18n()

  // Раздел «Недвижимость»: общий каталог + направления. Каждый пункт ведёт
  // на свою страницу: каталог с фильтром (Покупка/Аренда) или отдельную
  // страницу направления (Новостройки, Межрегиональные объекты,
  // Зарубежная недвижимость). Один список для десктопа и мобильного меню.
  const realtyLinks = [
    { href: `/${lang}/catalog`, label: t.nav.allObjects },
    { href: `/${lang}/catalog?type=sale`, label: t.nav.buy },
    { href: `/${lang}/catalog?type=rent`, label: t.nav.rent },
    { href: `/${lang}/newbuildings`, label: t.nav.newBuildings },
    { href: `/${lang}/interregional`, label: t.nav.interregional },
    { href: `/${lang}/foreign`, label: t.nav.foreign },
  ]

  // Остальные разделы верхнего меню — плоским списком после «Недвижимости»
  const navLinks = [
    { href: `/${lang}/services`, label: t.nav.services },
    { href: `/${lang}/about`, label: t.nav.about },
    { href: `/${lang}/blog`, label: t.nav.blog },
    { href: `/${lang}/contacts`, label: t.nav.contacts },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--n15-black)]/80 backdrop-blur-md border-b border-[var(--n15-gold)]/10">
      <div className="n15-container flex items-center justify-between h-20">
        {/* Logo */}
        <Link href={`/${lang}`} className="flex items-center group" aria-label="Н15 — на главную">
          <img
            src="/logo.png"
            alt="Н15"
            width={54}
            height={36}
            className="h-9 w-auto transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {/* «Недвижимость»: выпадающий список подразделов по наведению */}
          <div
            className="relative"
            onMouseEnter={() => setRealtyOpen(true)}
            onMouseLeave={() => setRealtyOpen(false)}
          >
            <button
              type="button"
              onClick={() => setRealtyOpen((v) => !v)}
              aria-expanded={realtyOpen}
              aria-haspopup="true"
              className="flex items-center gap-2 text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors duration-300 cursor-pointer"
              style={{ background: 'none', border: 0, cursor: 'pointer' }}
            >
              {t.nav.realty}
              <span
                className={`text-[9px] text-[var(--n15-gold)] transition-transform duration-300 ${realtyOpen ? 'rotate-180' : ''}`}
              >
                ▼
              </span>
            </button>
            {realtyOpen && (
              <div className="absolute top-full left-0 pt-2">
                <div className="min-w-56 py-2 bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 shadow-xl">
                  {realtyLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setRealtyOpen(false)}
                      className="block px-5 py-2.5 text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
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
            {/* «Недвижимость»: подразделы раскрываются по нажатию */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setRealtyOpen((v) => !v)}
                aria-expanded={realtyOpen}
                className="flex items-center justify-between w-full text-sm tracking-wider uppercase text-[var(--n15-silver)] py-2 cursor-pointer"
                style={{ background: 'none', border: 0, cursor: 'pointer' }}
              >
                {t.nav.realty}
                <span
                  className={`text-[9px] text-[var(--n15-gold)] transition-transform duration-300 ${realtyOpen ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>
              {realtyOpen && (
                <div className="flex flex-col gap-1 pl-4 mt-1 border-l border-[var(--n15-gold)]/15">
                  {realtyLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors py-2"
                      onClick={() => {
                        setRealtyOpen(false)
                        setIsOpen(false)
                      }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
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

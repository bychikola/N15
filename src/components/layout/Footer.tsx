'use client'

import Link from 'next/link'
import type { FC } from 'react'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { useI18n } from '@/i18n/i18n-provider'

export const Footer: FC = () => {
  const { lang, t } = useI18n()

  const footerLinks = {
    [t.footer.realty]: [
      { href: `/${lang}/catalog?type=sale`, label: t.footer.buy },
      { href: `/${lang}/catalog?type=rent`, label: t.footer.rent },
      { href: `/${lang}/catalog?category=apartment`, label: t.footer.flats },
      { href: `/${lang}/catalog?category=house`, label: t.footer.houses },
      { href: `/${lang}/catalog?category=land`, label: t.footer.lands },
      { href: `/${lang}/catalog?category=commercial`, label: t.footer.commercial },
    ],
    [t.footer.services]: [
      { href: `/${lang}/services/buy`, label: t.footer.purchase },
      { href: `/${lang}/services/sell`, label: t.footer.sale },
      { href: `/${lang}/services/mortgage`, label: t.footer.mortgage },
      { href: `/${lang}/services/rent`, label: t.footer.rentService },
    ],
    [t.footer.company]: [
      { href: `/${lang}/about`, label: t.footer.about },
      { href: `/${lang}/about/agents`, label: t.footer.agents },
      { href: `/${lang}/blog`, label: t.footer.blog },
      { href: `/${lang}/contacts`, label: t.footer.contacts },
    ],
  }

  return (
    <footer className="bg-[var(--n15-charcoal)] border-t border-[var(--n15-gold)]/10">
      <OrnamentDivider variant="woven" />

      <div className="n15-container" style={{ paddingTop: '4rem', paddingBottom: '2rem' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div>
            <a href={`/${lang}`} className="flex items-center mb-4" aria-label="Н15 — на главную">
              <img
                src="/logo.png"
                alt="Н15"
                width={48}
                height={32}
                className="h-8 w-auto"
              />
            </a>
            <p className="text-sm text-[var(--n15-muted)] leading-relaxed">
              {t.footer.brand1}
              <br />
              {t.footer.brand2}
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-4">
                {title}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#97692d] hover:text-[var(--n15-gold)] transition-colors duration-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-[var(--n15-gold)]/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[var(--n15-muted)]">
            &copy; {new Date().getFullYear()} Н15. {t.footer.rights}
          </p>
          <p className="text-xs text-[var(--n15-muted)]">
            {t.footer.made}
          </p>
        </div>
      </div>
    </footer>
  )
}

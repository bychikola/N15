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

      <div className="n15-container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div>
            <a href={`/${lang}`} className="flex items-center gap-2 mb-4">
              <svg width="32" height="32" viewBox="0 0 512 512" fill="none" style={{ color: 'var(--n15-gold)' }}>
                <circle cx="256" cy="256" r="240" stroke="currentColor" strokeWidth="8" />
                <circle cx="256" cy="256" r="200" stroke="currentColor" strokeWidth="3" opacity="0.4" />
                <circle cx="256" cy="256" r="24" fill="currentColor" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                  const rad = (angle * Math.PI) / 180
                  const cx = 256 + 220 * Math.cos(rad)
                  const cy = 256 + 220 * Math.sin(rad)
                  return <circle key={angle} cx={cx} cy={cy} r="8" fill="currentColor" />
                })}
              </svg>
              <span className="text-lg tracking-[0.2em] text-[var(--n15-white)]" style={{ fontFamily: "'New Standard', serif" }}>N15</span>
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
                      className="text-sm text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors duration-300"
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
            &copy; {new Date().getFullYear()} N15. {t.footer.rights}
          </p>
          <p className="text-xs text-[var(--n15-muted)]">
            {t.footer.made}
          </p>
        </div>
      </div>
    </footer>
  )
}

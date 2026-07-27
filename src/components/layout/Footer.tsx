import Link from 'next/link'
import type { FC } from 'react'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'

const footerLinks = {
  Недвижимость: [
    { href: '/catalog?type=sale', label: 'Купить' },
    { href: '/catalog?type=rent', label: 'Арендовать' },
    { href: '/catalog?category=apartment', label: 'Квартиры' },
    { href: '/catalog?category=house', label: 'Дома' },
  ],
  Услуги: [
    { href: '/services/buy', label: 'Покупка' },
    { href: '/services/sell', label: 'Продажа' },
    { href: '/services/mortgage', label: 'Ипотека' },
    { href: '/services/rent', label: 'Аренда' },
  ],
  Компания: [
    { href: '/about', label: 'Об агентстве' },
    { href: '/about/agents', label: 'Агенты' },
    { href: '/blog', label: 'Блог' },
    { href: '/contacts', label: 'Контакты' },
  ],
}

export const Footer: FC = () => {
  return (
    <footer className="bg-[var(--n15-charcoal)] border-t border-[var(--n15-gold)]/10">
      <OrnamentDivider variant="woven" />

      <div className="n15-container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#C8A44E" strokeWidth="1" />
                <circle cx="20" cy="20" r="4" fill="#C8A44E" />
              </svg>
              <span className="text-lg tracking-[0.25em] font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                N15
              </span>
            </div>
            <p className="text-sm text-[var(--n15-muted)] leading-relaxed">
              Премиальное агентство недвижимости.
              <br />
              Северная Осетия — Алания.
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
            &copy; {new Date().getFullYear()} N15. Все права защищены.
          </p>
          <p className="text-xs text-[var(--n15-muted)]">
            Сделано с осетинским характером &bull; Владикавказ
          </p>
        </div>
      </div>
    </footer>
  )
}

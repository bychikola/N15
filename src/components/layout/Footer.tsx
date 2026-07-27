import Link from 'next/link'
import type { FC } from 'react'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { Logo } from '@/components/ui/Logo'

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
            <Logo size={32} className="mb-4" />
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

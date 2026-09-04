'use client'

import Link from 'next/link'
import type { FC } from 'react'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { useI18n } from '@/i18n/i18n-provider'

// Элемент колонки: у части услуг Н15 нет отдельной страницы, поэтому элемент
// может быть ссылкой, а может — обычным текстом (список остаётся полным).
interface FooterItem {
  href?: string
  label: string
}

export const Footer: FC = () => {
  const { lang, t } = useI18n()

  const realtyItems: FooterItem[] = [
    { href: `/${lang}/catalog?type=sale`, label: t.footer.buy },
    { href: `/${lang}/catalog?type=rent`, label: t.footer.rent },
    { href: `/${lang}/catalog?category=apartment`, label: t.footer.flats },
    { href: `/${lang}/catalog?category=house`, label: t.footer.houses },
    { href: `/${lang}/catalog?category=land`, label: t.footer.lands },
    { href: `/${lang}/catalog?category=commercial`, label: t.footer.commercial },
  ]

  // Полный список услуг Н15 (порядок — по прайсу агентства)
  const serviceItems: FooterItem[] = [
    { href: `/${lang}/services`, label: t.footer.serviceTrade },
    { href: `/${lang}/services/rent`, label: t.footer.rentService },
    { href: `/${lang}/services/mortgage`, label: t.footer.serviceMortgageSupport },
    { label: t.footer.serviceSelection },
    { label: t.footer.serviceDealSupport },
    { label: t.footer.serviceLegalCheck },
    { label: t.footer.serviceLegalSupport },
    { label: t.footer.serviceNewBuildings },
    { label: t.footer.serviceInterregional },
    { label: t.footer.serviceInteriorDesign },
    { label: t.footer.serviceTurnkey },
    { label: t.footer.serviceHouseBuild },
    { label: t.footer.serviceValuation },
    { label: t.footer.serviceBrokerage },
  ]

  const companyItems: FooterItem[] = [
    { href: `/${lang}/about`, label: t.footer.about },
    { href: `/${lang}/about/agents`, label: t.footer.agents },
    { href: `/${lang}/blog`, label: t.footer.blog },
    { href: `/${lang}/contacts`, label: t.footer.contacts },
  ]

  const columns: { title: string; items: FooterItem[] }[] = [
    { title: t.footer.realty, items: realtyItems },
    { title: t.footer.services, items: serviceItems },
    { title: t.footer.company, items: companyItems },
  ]

  return (
    <footer className="w-full bg-[var(--n15-charcoal)] border-t border-[var(--n15-gold)]/10">
      {/* Всё содержимое живёт в общем контейнере сайта: декоративная линия,
          колонки и нижняя строка выровнены по одной сетке и не выходят за
          ширину экрана */}
      <div className="n15-container pb-8">
        <OrnamentDivider variant="woven" className="my-10" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-12 items-start">
          {/* Бренд */}
          <div className="min-w-0">
            <a href={`/${lang}`} className="flex items-center mb-4" aria-label="Н15 — на главную">
              <img
                src="/logo.png"
                alt="Н15"
                width={48}
                height={32}
                className="h-8 w-auto"
              />
            </a>
            <p className="text-sm text-[var(--n15-silver)] leading-relaxed">
              {t.footer.brand1}
              <br />
              {t.footer.brand2}
            </p>
          </div>

          {/* Колонки ссылок и услуг */}
          {columns.map((col) => (
            <div key={col.title} className="min-w-0">
              <h4 className="text-xs tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-4">
                {col.title}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {col.items.map((item) => (
                  <li key={item.label} className="min-w-0">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-block max-w-full text-sm leading-snug text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] hover:underline underline-offset-4 transition-colors duration-300"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="inline-block max-w-full text-sm leading-snug text-[var(--n15-silver)]">
                        {item.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Нижняя строка: переносы включены, чтобы длинные подписи на узких
            экранах не обрезались, а уходили на следующую строку */}
        <div className="mt-12 pt-6 border-t border-[var(--n15-gold)]/10 flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <p className="text-sm text-[var(--n15-silver)]">
            &copy; {new Date().getFullYear()} Н15. {t.footer.rights}
          </p>
          <p className="text-sm text-[var(--n15-silver)]">
            {t.footer.made}
          </p>
        </div>
      </div>
    </footer>
  )
}

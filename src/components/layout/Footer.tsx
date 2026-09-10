'use client'

import Link from 'next/link'
import type { FC } from 'react'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { useI18n } from '@/i18n/i18n-provider'

// Ссылки колонки «Компания»
interface FooterItem {
  href: string
  label: string
}

export const Footer: FC = () => {
  const { lang, t } = useI18n()

  const companyItems: FooterItem[] = [
    { href: `/${lang}/about`, label: t.footer.about },
    { href: `/${lang}/about/agents`, label: t.footer.agents },
    { href: `/${lang}/blog`, label: t.footer.blog },
    { href: `/${lang}/contacts`, label: t.footer.contacts },
    // Страница рекламы: тот же адрес, что у блока «ВАША РЕКЛАМА» на главной
    { href: `/${lang}/advertising`, label: t.footer.advertising },
  ]

  return (
    <footer className="w-full bg-[var(--n15-charcoal)] border-t border-[var(--n15-gold)]/10">
      {/* Всё содержимое живёт в общем контейнере сайта: декоративная линия,
          блоки и нижняя строка выровнены по одной сетке и не выходят за
          ширину экрана */}
      <div className="n15-container pb-8">
        <OrnamentDivider variant="woven" className="my-10" />

        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-x-14 gap-y-12 items-start">
          {/* Блок N15: описание агентства, девиз и строка о работе */}
          <div className="min-w-0">
            <a href={`/${lang}`} className="inline-flex" aria-label="Н15 — на главную">
              <img
                src="/logo.png"
                alt="Н15"
                width={48}
                height={32}
                className="h-9 w-auto"
              />
            </a>
            <p className="mt-6 text-lg leading-relaxed text-[var(--n15-white)]">
              {t.footer.brandTagline}
              <br />
              <span className="text-[var(--n15-muted)]">{t.footer.brandLocation}</span>
            </p>
            <p className="mt-6 max-w-xl text-xl md:text-2xl leading-snug font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
              «{t.footer.brandMotto}»
            </p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--n15-silver)]">
              {t.footer.brandMission}
            </p>
          </div>

          {/* Колонка «Компания» */}
          <div className="min-w-0">
            <h4 className="text-sm tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-6">
              {t.footer.company}
            </h4>
            <ul className="flex flex-col gap-4">
              {companyItems.map((item) => (
                <li key={item.label} className="min-w-0">
                  <Link
                    href={item.href}
                    className="inline-block max-w-full text-base leading-relaxed text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] hover:underline underline-offset-4 transition-colors duration-300"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Нижняя строка: переносы включены, чтобы длинные подписи на узких
            экранах не обрезались, а уходили на следующую строку */}
        <div className="mt-12 pt-6 border-t border-[var(--n15-gold)]/10 flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <p className="text-base text-[var(--n15-silver)]">
            &copy; {new Date().getFullYear()} Н15. {t.footer.rights}
          </p>
          <p className="text-base text-[var(--n15-silver)]">
            {t.footer.made}
          </p>
        </div>
      </div>
    </footer>
  )
}

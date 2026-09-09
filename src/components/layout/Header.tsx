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
  // Раскрытие раздела «Услуги» — те же правила, что у «Недвижимости»
  const [servicesOpen, setServicesOpen] = useState(false)
  const { lang, t } = useI18n()

  // Раздел «Недвижимость»: общий каталог + направления. Каждый пункт ведёт
  // на свою страницу: каталог с фильтром (Покупка/Аренда), направление
  // «Продажа» или отдельную страницу направления (Новостройки,
  // Межрегиональные объекты, Зарубежная недвижимость). Один список для
  // десктопа и мобильного меню.
  const realtyLinks = [
    { href: `/${lang}/catalog`, label: t.nav.allObjects },
    { href: `/${lang}/catalog?type=sale`, label: t.nav.buy },
    { href: `/${lang}/sell`, label: t.nav.sell },
    { href: `/${lang}/catalog?type=rent`, label: t.nav.rent },
    { href: `/${lang}/newbuildings`, label: t.nav.newBuildings },
    { href: `/${lang}/interregional`, label: t.nav.interregional },
    { href: `/${lang}/foreign`, label: t.nav.foreign },
  ]

  // Раздел «Услуги»: пять направлений (Ипотека, Юридические услуги, Дизайн
  // интерьера, Строительство частных домов, Оценка недвижимости). Колонка
  // строго вертикальная: у каждого направления — ссылка на его страницу
  // и список услуг (якоря страницы направления; «Ипотечный брокер» — своя
  // страница). Купля, продажа и аренда живут только в «Недвижимости».
  // Ссылки на якоря должны совпадать с id секций страниц направлений
  // (src/app/(site)/[lang]/services/*/page.tsx).
  const serviceSections = [
    {
      key: 'mortgage',
      href: `/${lang}/services/mortgage`,
      label: t.services.mortgage.title,
      items: [
        { href: `/${lang}/services/mortgage#soprovozhdenie`, label: t.services.mortgage.support.title },
        { href: `/${lang}/services/broker`, label: t.services.broker.title },
        { href: `/${lang}/services/mortgage#raschet`, label: t.services.mortgage.raschet.title },
        { href: `/${lang}/services/mortgage#dokumenty`, label: t.services.mortgage.dokumenty.title },
        { href: `/${lang}/services/mortgage#zayavka`, label: t.services.mortgage.zayavka.title },
      ],
    },
    {
      key: 'legal',
      href: `/${lang}/services/legal`,
      label: t.services.legal.title,
      items: [
        { href: `/${lang}/services/legal#proverka-obekta`, label: t.services.legal.checkObject.title },
        { href: `/${lang}/services/legal#soprovozhdenie-sdelki`, label: t.services.legal.sdelka.title },
        { href: `/${lang}/services/legal#pereplanirovki`, label: t.services.legal.pereplanirovki.title },
        { href: `/${lang}/services/legal#privatizaciya`, label: t.services.legal.privatizaciya.title },
        { href: `/${lang}/services/legal#nasledstvo`, label: t.services.legal.nasledstvo.title },
        { href: `/${lang}/services/legal#proverka-riskov`, label: t.services.legal.risks.title },
      ],
    },
    {
      key: 'design',
      href: `/${lang}/services/design`,
      label: t.services.design.title,
      items: [
        { href: `/${lang}/services/design#dizayn-proekt`, label: t.services.design.proekt.title },
        { href: `/${lang}/services/design#planirovka`, label: t.services.design.planirovka.title },
        { href: `/${lang}/services/design#vizualizaciya`, label: t.services.design.vizualizaciya.title },
        { href: `/${lang}/services/design#podbor`, label: t.services.design.podbor.title },
        { href: `/${lang}/services/design#komplektaciya`, label: t.services.design.komplektaciya.title },
        { href: `/${lang}/services/design#nadzor`, label: t.services.design.nadzor.title },
      ],
    },
    {
      key: 'build',
      href: `/${lang}/services/build`,
      label: t.services.build.title,
      items: [
        { href: `/${lang}/services/build#proektirovanie`, label: t.services.build.proektirovanie.title },
        { href: `/${lang}/services/build#podryadchiki`, label: t.services.build.podryadchiki.title },
        { href: `/${lang}/services/build#smeta`, label: t.services.build.smeta.title },
        { href: `/${lang}/services/build#pod-klyuch`, label: t.services.build.podKlyuch.title },
        { href: `/${lang}/services/build#kommunikacii`, label: t.services.build.kommunikacii.title },
        { href: `/${lang}/services/build#otdelka`, label: t.services.build.otdelka.title },
      ],
    },
    {
      key: 'valuation',
      href: `/${lang}/services/valuation`,
      label: t.services.valuation.title,
      items: [
        { href: `/${lang}/services/valuation#kvartira`, label: t.services.valuation.kvartira.title },
        { href: `/${lang}/services/valuation#dom`, label: t.services.valuation.dom.title },
        { href: `/${lang}/services/valuation#uchastok`, label: t.services.valuation.uchastok.title },
        { href: `/${lang}/services/valuation#kommercheskiy`, label: t.services.valuation.kommercheskiy.title },
      ],
    },
  ]

  // Остальные разделы верхнего меню — плоским списком после выпадающих
  const navLinks = [
    { href: `/${lang}/about`, label: t.nav.about },
    { href: `/${lang}/blog`, label: t.nav.blog },
    { href: `/${lang}/contacts`, label: t.nav.contacts },
  ]

  // Панели «Недвижимость» и «Услуги» не должны быть открыты одновременно
  const openServices = () => {
    setServicesOpen(true)
    setRealtyOpen(false)
  }
  const openRealty = () => {
    setRealtyOpen(true)
    setServicesOpen(false)
  }
  const closePanels = () => {
    setServicesOpen(false)
    setRealtyOpen(false)
  }

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
          {/* «Недвижимость»: выпадающий список подразделов по наведению и клику */}
          <div
            className="relative"
            onMouseEnter={openRealty}
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

          {/* «Услуги»: вертикальная колонка пяти направлений со списками их
              услуг. Открывается по наведению и по клику; каждый пункт —
              активная ссылка (направление — на свою страницу, услуга — на
              якорь страницы направления или на страницу брокера) */}
          <div
            className="relative"
            onMouseEnter={openServices}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button
              type="button"
              onClick={() => setServicesOpen((v) => !v)}
              aria-expanded={servicesOpen}
              aria-haspopup="true"
              className="flex items-center gap-2 text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors duration-300 cursor-pointer"
              style={{ background: 'none', border: 0, cursor: 'pointer' }}
            >
              {t.nav.services}
              <span
                className={`text-[9px] text-[var(--n15-gold)] transition-transform duration-300 ${servicesOpen ? 'rotate-180' : ''}`}
              >
                ▼
              </span>
            </button>
            {servicesOpen && (
              <div className="absolute top-full left-0 pt-2">
                <div className="w-80 max-h-[calc(100vh-5.5rem)] overflow-y-auto py-2 bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 shadow-xl">
                  {serviceSections.map((section) => (
                    <div key={section.key}>
                      <Link
                        href={section.href}
                        onClick={() => setServicesOpen(false)}
                        className="block px-5 pt-3 pb-1 text-[11px] tracking-[0.22em] uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] transition-colors"
                      >
                        {section.label}
                      </Link>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setServicesOpen(false)}
                              className="block px-5 py-1.5 text-[13px] leading-snug text-[var(--n15-silver)] hover:text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-colors"
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <Link
                    href={`/${lang}/services`}
                    onClick={() => setServicesOpen(false)}
                    className="block px-5 pt-3 pb-2 mt-2 border-t border-[var(--n15-gold)]/10 text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors"
                  >
                    {t.services.viewAll} →
                  </Link>
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
                        closePanels()
                        setIsOpen(false)
                      }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* «Услуги»: направления и их услуги раскрываются по нажатию,
                все пункты — активные ссылки */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  setServicesOpen((v) => !v)
                  setRealtyOpen(false)
                }}
                aria-expanded={servicesOpen}
                className="flex items-center justify-between w-full text-sm tracking-wider uppercase text-[var(--n15-silver)] py-2 cursor-pointer"
                style={{ background: 'none', border: 0, cursor: 'pointer' }}
              >
                {t.nav.services}
                <span
                  className={`text-[9px] text-[var(--n15-gold)] transition-transform duration-300 ${servicesOpen ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>
              {servicesOpen && (
                <div className="flex flex-col pl-4 mt-1 border-l border-[var(--n15-gold)]/15">
                  {serviceSections.map((section) => (
                    <div key={section.key} className="flex flex-col">
                      <Link
                        href={section.href}
                        className="pt-3 pb-1 text-xs tracking-[0.18em] uppercase text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] transition-colors"
                        onClick={() => {
                          closePanels()
                          setIsOpen(false)
                        }}
                      >
                        {section.label}
                      </Link>
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="text-sm text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors py-1.5"
                          onClick={() => {
                            closePanels()
                            setIsOpen(false)
                          }}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                  <Link
                    href={`/${lang}/services`}
                    className="py-2 mt-2 text-sm tracking-wider uppercase text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors"
                    onClick={() => {
                      closePanels()
                      setIsOpen(false)
                    }}
                  >
                    {t.services.viewAll} →
                  </Link>
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

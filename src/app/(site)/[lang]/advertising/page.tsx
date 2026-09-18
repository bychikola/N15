import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { AdRequestForm } from '@/components/advertising/AdRequestForm'
import { AdCard } from '@/components/advertising/AdCard'
import { GoalButton, GoalLink } from '@/components/analytics/GoalLink'
import { GoalOnMount } from '@/components/analytics/GoalOnMount'
import { getDictionary } from '@/i18n/dictionaries'
import { AD_OFFER, AD_RULES, adDocHref } from '@/lib/advertising-legal'
import { visibleAdRequestCards, visibleAdvertisements, type SiteAdCard } from '@/lib/advertising-service'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.advertising.metaTitle, description: t.advertising.lead2 }
}

/**
 * Страница /advertising — платное размещение объектов: первый экран на
 * зелёном, «как это работает» и форматы одинаковыми прямоугольными блоками,
 * форма заявки с тремя отдельными согласиями и ссылками на документы.
 *
 * Правовые документы модуля (договор-оферта и правила размещения) живут
 * в коде — src/lib/advertising-legal.ts — и открываются отдельными
 * страницами: /[lang]/advertising/offer и /[lang]/advertising/rules.
 *
 * Блок «Размещаем сейчас» показывается только когда есть что показать:
 * опубликованные рекламные материалы и оплаченные размещения из заявок
 * (у заявок фотографии попадают в media только при публикации, поэтому
 * непроверенные файлы на сайт не выходят). Пустого блока на странице нет.
 */
export default async function AdvertisingPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  let cards: SiteAdCard[] = []
  let phone = ''
  try {
    const payload = await getPayload({ config })
    // Материалы раздела и оплаченные размещения из заявок — одной лентой
    const [ads, placements] = await Promise.all([
      visibleAdvertisements(payload, 12),
      visibleAdRequestCards(payload, 12),
    ])
    cards = [...ads, ...placements].slice(0, 12)
    // Телефон из глобала — для кнопки «Позвонить» (fallback — номер прототипа)
    const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    const sitePhones = ((site as Record<string, unknown>).phones as { phone?: string }[] | undefined) || []
    phone = sitePhones[0]?.phone || ''
  } catch {
    // Без базы страница всё равно открывается: текст и форма важнее списка
  }
  const phoneHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'

  const docs = [
    { href: adDocHref(lang, AD_OFFER.path), title: t.advertising.consentOfferDoc },
    { href: adDocHref(lang, AD_RULES.path), title: t.advertising.consentRulesDoc },
    { href: adDocHref(lang, '/privacy'), title: t.advertising.consentPrivacyDoc },
  ]

  return (
    <>
      <Header />
      {/* Цель Метрики «просмотр страницы рекламы» — один раз на открытие */}
      <GoalOnMount goal="advertising_view" />
      <main className="pt-20">
        {/* Первый экран — зелёный, компактный: заголовок без «плакатного» кегля */}
        <section className="n15-green-block n15-section">
          <div className="n15-container">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">
              {t.advertising.eyebrow}
            </p>
            <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4 max-w-2xl">
              {t.advertising.title}
            </h1>
            <div className="max-w-2xl space-y-2 text-sm md:text-[15px] leading-relaxed text-[var(--n15-silver)]">
              <p>{t.advertising.lead1}</p>
              <p>{t.advertising.lead2}</p>
            </div>

            {/* Кнопки связи: заявка (к форме ниже) и звонок в агентство */}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="primary" size="md" href="#ad-request">
                {t.advertising.discussCta} <span aria-hidden="true">→</span>
              </Button>
              {/* «Позвонить» — ссылка с целью Метрики (номер в аналитику не уходит) */}
              <GoalButton variant="outline" size="md" href={phoneHref} goal="call_click">
                {t.advertising.callCta}
              </GoalButton>
            </div>
          </div>
        </section>

        {/* Как это работает — три одинаковых прямоугольных блока */}
        <SectionWrapper variant="dark">
          <h2 className="text-lg md:text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
            {t.advertising.stepsTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.advertising.steps.map((step, index) => (
              <article
                key={step.title}
                className="h-full p-5 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15"
              >
                <span className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 mb-2 text-base font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--n15-muted)]">{step.text}</p>
              </article>
            ))}
          </div>
        </SectionWrapper>

        {/* Форматы размещения — четыре одинаковых прямоугольных блока */}
        <SectionWrapper variant="charcoal">
          <h2 className="text-lg md:text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
            {t.advertising.formatsTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.advertising.formats.map((format) => (
              <article
                key={format.title}
                className="h-full p-5 bg-[var(--n15-black)] border border-[var(--n15-gold)]/15"
              >
                <h3 className="mb-2 text-base font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                  {format.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--n15-muted)]">{format.text}</p>
              </article>
            ))}
          </div>
        </SectionWrapper>

        {/* id="ad-request" — цель кнопок «Заполнить заявку» */}
        <SectionWrapper variant="dark" id="ad-request">
          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
            <div className="p-6 md:p-8 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15">
              <h2 className="text-lg md:text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                {t.advertising.formTitle}
              </h2>
              <p className="text-sm text-[var(--n15-muted)] leading-relaxed mb-6">{t.advertising.formHint}</p>
              <AdRequestForm lang={lang} />
            </div>

            {/* Сбоку — связь и документы: те же три документа, что и в согласиях */}
            <aside className="flex flex-col gap-4">
              <div className="p-5 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15">
                <h3 className="mb-2 text-base font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                  {t.advertising.helpTitle}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--n15-muted)] mb-4">{t.advertising.helpText}</p>
                <p className="flex flex-col gap-2 text-sm">
                  <GoalLink
                    href={phoneHref}
                    goal="call_click"
                    className="text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
                  >
                    {phone || '+7 958 116-15-15'}
                  </GoalLink>
                  <a
                    href="mailto:info@n15-realty.ru"
                    className="text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)]"
                  >
                    info@n15-realty.ru
                  </a>
                </p>
              </div>

              <div className="p-5 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15">
                <h3 className="mb-3 text-base font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                  {t.advertising.consentsTitle}
                </h3>
                <ul className="flex flex-col gap-2">
                  {docs.map((doc) => (
                    <li key={doc.href}>
                      <Link
                        href={doc.href}
                        className="text-sm text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] underline underline-offset-4"
                      >
                        {doc.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-[var(--n15-muted)]">
                  {t.advertising.legalNote}
                </p>
              </div>
            </aside>
          </div>
        </SectionWrapper>

        {/* Размещённые материалы — блок только при наличии публикаций */}
        {cards.length > 0 && (
          <SectionWrapper variant="charcoal">
            <h2 className="text-lg md:text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
              {t.advertising.partnersTitle}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ключ с индексом: id материалов и заявок нумеруются в своих
                  коллекциях и могут совпасть */}
              {cards.map((ad, index) => (
                <AdCard key={`${index}-${ad.id}`} ad={ad} t={t} />
              ))}
            </div>
          </SectionWrapper>
        )}
      </main>
      <Footer />
    </>
  )
}

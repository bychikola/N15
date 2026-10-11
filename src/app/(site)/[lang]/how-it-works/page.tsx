import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.howItWorks.metaTitle, description: t.howItWorks.metaDescription }
}

/** Пункт списка: обычный текст либо текст со ссылкой (например, на контакты) */
type AudiencePoint = string | { text: string; linkText: string; href: string }

/** Блок страницы: заголовок, короткое пояснение, список шагов и кнопка */
interface AudienceBlock {
  title: string
  lead: string
  points: readonly AudiencePoint[]
  /** Адрес кнопки — собирается здесь, в словаре лежат только тексты */
  href: string
  cta: string
}

/** Карточка стороны сделки: одна на все три блока страницы */
function AudienceCard({ block }: { block: AudienceBlock }) {
  return (
    <article className="h-full flex flex-col p-5 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/15 hover:border-[var(--n15-gold)]/35 transition-colors duration-300">
      <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1.5">
        {block.title}
      </h2>
      <p className="text-sm text-[var(--n15-muted)] leading-relaxed mb-4">{block.lead}</p>
      {/* Шаги — маркер ромбом, как в карточках страницы «Об агентстве» */}
      <ul className="flex flex-col gap-3 mb-5">
        {block.points.map((point) => (
          <li
            key={typeof point === 'string' ? point : point.text}
            className="flex gap-2.5 text-xs text-[var(--n15-muted)] leading-relaxed"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 w-1.5 h-1.5 shrink-0 rotate-45 bg-[var(--n15-gold)]/60"
            />
            <span>
              {typeof point === 'string' ? (
                point
              ) : (
                <>
                  {point.text}{' '}
                  <Link
                    href={point.href}
                    className="text-[var(--n15-gold)] underline underline-offset-2 hover:text-[var(--n15-white)] transition-colors duration-300"
                  >
                    {point.linkText}
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {/* Кнопка прижата к низу: карточки одного размера, кнопки на одной линии */}
      <Link
        href={block.href}
        className="mt-auto inline-flex items-center justify-center px-5 py-2.5 text-sm tracking-wider uppercase border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)] hover:text-[var(--on-accent)] transition-all duration-300"
      >
        {block.cta}
      </Link>
    </article>
  )
}

export default async function HowItWorksPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.howItWorks

  // Три стороны площадки: покупатели, собственники, агентства и застройщики.
  // Тексты — из словаря, адреса ссылок собираются здесь: у покупателя их два
  // (каталог и доска), у собственника — подача объявления, у партнёров — контакты
  const blocks: AudienceBlock[] = [
    {
      title: s.buyersTitle,
      lead: s.buyersLead,
      points: s.buyersPoints,
      href: `/${lang}/catalog`,
      cta: s.buyersCta,
    },
    {
      title: s.ownersTitle,
      lead: s.ownersLead,
      points: s.ownersPoints,
      href: `/${lang}/board/new`,
      cta: s.ownersCta,
    },
    {
      title: s.partnersTitle,
      lead: s.partnersLead,
      // Отдельного раздела «Партнёрам» нет: сотрудничество — через администратора,
      // последний пункт ведёт на страницу контактов
      points: [
        ...s.partnersPoints,
        { text: s.partnersContact, linkText: s.partnersContactLink, href: `/${lang}/contacts` },
      ],
      href: `/${lang}/contacts`,
      cta: s.partnersCta,
    },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Первый экран — зелёный, компактный: как на странице рекламы
            (класс n15-green-block, см. globals.css) */}
        <section className="n15-green-block n15-section">
          <div className="n15-container">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">
              {s.eyebrow}
            </p>
            <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4 max-w-2xl">
              {s.title}
            </h1>
            <p className="max-w-2xl text-sm md:text-[15px] leading-relaxed text-[var(--n15-silver)]">
              {s.lead}
            </p>
          </div>
        </section>

        {/* Три блока — по стороне площадки: покупателям, собственникам,
            агентствам и застройщикам. На широком экране в один ряд, карточки
            выравниваются по высоте (auto-rows-fr) */}
        <SectionWrapper variant="dark">
          <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4">
            {blocks.map((block) => (
              <AudienceCard key={block.title} block={block} />
            ))}
          </div>
        </SectionWrapper>

        {/* Спокойный призыв внизу: обсудить задачу — на странице контактов,
            как и остальные обращения на сайте */}
        <SectionWrapper variant="charcoal">
          <OrnamentBorder cornerOrnament>
            <div className="px-6 py-8 text-center">
              <p className="text-[var(--n15-silver)] mb-5">
                Не нашли ответ на свой вопрос — напишите нам, подскажем с чего начать.
              </p>
              <Link
                href={`/${lang}/contacts`}
                className="inline-flex items-center justify-center px-8 py-3 text-sm tracking-wider uppercase rounded-sm border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)] hover:text-[var(--on-accent)] transition-all duration-300"
              >
                {t.about.discussTask}
              </Link>
            </div>
          </OrnamentBorder>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

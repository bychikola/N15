import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { AdRequestForm } from '@/components/advertising/AdRequestForm'
import { AdCard } from '@/components/advertising/AdCard'
import { getDictionary } from '@/i18n/dictionaries'
import { visibleAdvertisements, type SiteAdCard } from '@/lib/advertising-service'

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
 * Страница /advertising — обращение к рекламодателям, форма «Обсудить
 * размещение рекламы» (имя, компания, телефон, почта, сообщение) с согласием
 * на обработку персональных данных и ссылкой на политику конфиденциальности,
 * а также материалы, размещённые сейчас — всегда с маркировкой «Реклама».
 */
export default async function AdvertisingPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  let ads: SiteAdCard[] = []
  try {
    const payload = await getPayload({ config })
    // limit 12: на отдельной странице помещается больше материалов, чем
    // в блоке на главной
    ads = await visibleAdvertisements(payload, 12)
  } catch {
    // Без базы страница всё равно открывается: текст и форма важнее списка
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <p className="text-xs tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-4">
            {t.advertising.eyebrow}
          </p>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
            {t.advertising.title}
          </h1>
          <div className="max-w-2xl space-y-3 text-[var(--n15-silver)] leading-relaxed">
            <p>{t.advertising.lead1}</p>
            <p>{t.advertising.lead2}</p>
            <p>{t.advertising.lead3}</p>
          </div>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Форма обращения к рекламодателю */}
            <OrnamentBorder cornerOrnament>
              <div className="p-8">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                  {t.advertising.formTitle}
                </h2>
                <p className="text-sm text-[var(--n15-muted)] leading-relaxed mb-6">
                  {t.advertising.formHint}
                </p>
                <AdRequestForm lang={lang} />
              </div>
            </OrnamentBorder>

            {/* Материалы, размещённые сейчас (маркируются автоматически) */}
            <div className="p-8 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
              <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                {t.advertising.partnersTitle}
              </h2>
              {ads.length === 0 ? (
                <p className="text-sm text-[var(--n15-muted)] leading-relaxed">
                  {t.advertising.partnersEmpty}
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {ads.map((ad) => (
                    <AdCard key={ad.id} ad={ad} t={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

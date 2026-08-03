import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function RentPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.services.rent.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {t.services.rent.subtitle}
          </p>
        </SectionWrapper>
        <SectionWrapper variant="charcoal">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-[var(--n15-silver)] leading-relaxed mb-8">
              {t.services.rent.body}
            </p>
            <Button variant="primary" href={`/${lang}/catalog?type=rent`}>{t.services.rent.cta}</Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

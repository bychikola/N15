import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import type { Dict } from '@/i18n/dictionaries'

interface Cta {
  label: string
  href: string
}

interface DirectionPageProps {
  t: Dict
  /** Тексты направления (directions.newbuildings / interregional / foreign) */
  direction: Dict['directions']['newbuildings']
  /** Главная кнопка призыва — на каталог или на заявку */
  primary: Cta
  /** Дополнительная кнопка (необязательно) */
  secondary?: Cta
}

// Страница направления раздела «Недвижимость» (новостройки, межрегиональные
// объекты, зарубежная недвижимость). Единая структура в стиле страниц услуг:
// заголовок, описание направления, шаги подбора и кнопки CTA. Шаги общие
// для всех направлений (t.directions.step*).
export function DirectionPage({ t, direction, primary, secondary }: DirectionPageProps) {
  const steps = [
    { step: '01', title: t.directions.step1Title, desc: t.directions.step1Desc },
    { step: '02', title: t.directions.step2Title, desc: t.directions.step2Desc },
    { step: '03', title: t.directions.step3Title, desc: t.directions.step3Desc },
  ]

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {direction.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {direction.subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {steps.map((s) => (
              <div key={s.step} className="p-6 border border-[var(--n15-gold)]/10">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">{s.step}</div>
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{s.title}</h3>
                <p className="text-xs text-[var(--n15-muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="primary" href={primary.href}>{primary.label}</Button>
            {secondary && (
              <Button variant="outline" href={secondary.href}>{secondary.label}</Button>
            )}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

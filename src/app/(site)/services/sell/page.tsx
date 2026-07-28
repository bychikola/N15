import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'

export default function SellPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Продажа недвижимости</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            Профессиональный подход к продаже: оценка, маркетинг, переговоры
          </p>
        </SectionWrapper>
        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[
              { step: '01', title: 'Оценка', desc: 'Профессиональная оценка рыночной стоимости с учётом всех факторов.' },
              { step: '02', title: 'Маркетинг', desc: 'Фотосъёмка, 3D-туры, продвижение на всех площадках.' },
              { step: '03', title: 'Продажа', desc: 'Организация показов, переговоры, юридическое сопровождение.' },
            ].map((s) => (
              <div key={s.step} className="p-6 border border-[var(--n15-gold)]/10">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">{s.step}</div>
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{s.title}</h3>
                <p className="text-xs text-[var(--n15-muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Button variant="primary" href="/contacts">Оставить заявку</Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

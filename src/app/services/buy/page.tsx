import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'

export default function BuyPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Покупка недвижимости</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            От поиска идеального объекта до получения ключей — полное сопровождение на каждом этапе
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[
              { step: '01', title: 'Консультация', desc: 'Анализ потребностей, бюджета и критериев. Формируем стратегию поиска.' },
              { step: '02', title: 'Подбор объектов', desc: 'Показываем только подходящие варианты. Экономим ваше время.' },
              { step: '03', title: 'Сделка', desc: 'Юридическая проверка, переговоры, договор. Сопровождение до ключей.' },
            ].map((s) => (
              <div key={s.step} className="p-6 border border-[var(--n15-gold)]/10">
                <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 mb-4">{s.step}</div>
                <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">{s.title}</h3>
                <p className="text-xs text-[var(--n15-muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Button variant="primary" href="/catalog">Смотреть каталог</Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'

const services = [
  {
    title: 'Покупка недвижимости',
    desc: 'Поможем найти идеальный объект: от анализа потребностей до получения ключей. Работаем с новостройками и вторичным рынком.',
    href: '/services/buy',
    accent: 'gold',
  },
  {
    title: 'Продажа недвижимости',
    desc: 'Профессиональная оценка, маркетинговая стратегия, профессиональная фотосъёмка и полное юридическое сопровождение.',
    href: '/services/sell',
    accent: 'gold',
  },
  {
    title: 'Аренда',
    desc: 'Долгосрочная и краткосрочная аренда квартир, домов и коммерческих помещений. Проверенные арендаторы и собственники.',
    href: '/services/rent',
    accent: 'gold',
  },
  {
    title: 'Ипотечное кредитование',
    desc: 'Подбор оптимальной ипотечной программы, помощь в сборе документов, сопровождение до получения одобрения.',
    href: '/services/mortgage',
    accent: 'burgundy',
  },
]

export default function ServicesPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            Услуги
          </h1>
          <p className="text-[var(--n15-muted)] max-w-xl">
            Полный спектр услуг на рынке недвижимости — от консультации до сделки под ключ
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((s) => (
              <OrnamentBorder key={s.title} cornerOrnament>
                <div className="p-8 group">
                  <div className={`w-12 h-px mb-6 ${s.accent === 'burgundy' ? 'bg-[var(--n15-burgundy)]' : 'bg-[var(--n15-gold)]'}`} />
                  <h3 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3 group-hover:text-[var(--n15-gold)] transition-colors">
                    {s.title}
                  </h3>
                  <p className="text-sm text-[var(--n15-muted)] mb-6 leading-relaxed">
                    {s.desc}
                  </p>
                  <Button variant="ghost" size="sm" href={s.href}>
                    Подробнее →
                  </Button>
                </div>
              </OrnamentBorder>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

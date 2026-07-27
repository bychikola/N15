import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'

const agents = [
  { name: 'Алан Караев', role: 'Ведущий эксперт', deals: 230, experience: 10, phone: '+7 (928) 123-45-67', initials: 'АК' },
  { name: 'Зарина Тотрова', role: 'Старший агент', deals: 180, experience: 8, phone: '+7 (928) 234-56-78', initials: 'ЗТ' },
  { name: 'Сослан Дзагоев', role: 'Агент по элитной недвижимости', deals: 95, experience: 6, phone: '+7 (928) 345-67-89', initials: 'СД' },
  { name: 'Диана Багаева', role: 'Специалист по ипотеке', deals: 150, experience: 7, phone: '+7 (928) 456-78-90', initials: 'ДБ' },
  { name: 'Аслан Гуриев', role: 'Агент', deals: 75, experience: 4, phone: '+7 (928) 567-89-01', initials: 'АГ' },
  { name: 'Мадина Царикаева', role: 'Агент', deals: 60, experience: 3, phone: '+7 (928) 678-90-12', initials: 'МЦ' },
]

export default function AgentsPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Наши агенты</h1>
          <p className="text-[var(--n15-muted)] max-w-xl">Профессионалы с глубоким знанием рынка и персональным подходом</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <div key={agent.name} className="group p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors">
                  <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">{agent.initials}</span>
                </div>
                <h3 className="text-sm text-[var(--n15-white)] text-center mb-1">{agent.name}</h3>
                <p className="text-xs text-[var(--n15-muted)] text-center mb-3">{agent.role}</p>
                <div className="flex justify-center gap-4 text-xs text-[var(--n15-muted)] mb-4">
                  <span>{agent.deals} сделок</span>
                  <span>{agent.experience} лет</span>
                </div>
                <Button variant="outline" size="sm" className="w-full text-xs">
                  {agent.phone}
                </Button>
              </div>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { Button } from '@/components/ui/Button'

const agents = [
  { name: 'Алан Караев', role: 'Ведущий эксперт', deals: 230, experience: 10, initials: 'АК' },
  { name: 'Зарина Тотрова', role: 'Старший агент', deals: 180, experience: 8, initials: 'ЗТ' },
  { name: 'Сослан Дзагоев', role: 'Агент по элитной недвижимости', deals: 95, experience: 6, initials: 'СД' },
  { name: 'Диана Багаева', role: 'Специалист по ипотеке', deals: 150, experience: 7, initials: 'ДБ' },
]

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            Об агентстве
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">
            N15 — это премиальное агентство недвижимости с осетинским характером.
            Мы работаем с 2014 года и за это время провели более 850 успешных сделок.
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                Почему выбирают N15
              </h2>
              <div className="space-y-5">
                {[
                  { title: 'Экспертиза рынка', desc: 'Знаем каждый район, каждую улицу. 12 лет на рынке недвижимости Северной Осетии.' },
                  { title: 'Полное сопровождение', desc: 'От поиска до подписания договора. Юридическая проверка, оценка, переговоры.' },
                  { title: 'Премиум-сервис', desc: 'Индивидуальный подход к каждому клиенту. Конфиденциальность и безупречный сервис.' },
                ].map((p) => (
                  <div key={p.title} className="flex gap-4">
                    <div className="flex-shrink-0 w-1 bg-[var(--n15-gold)]/40" />
                    <div>
                      <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-1">{p.title}</h3>
                      <p className="text-sm text-[var(--n15-muted)]">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <OrnamentBorder cornerOrnament>
              <div className="p-8">
                <div className="grid grid-cols-2 gap-8">
                  {[
                    { value: '12', label: 'Лет на рынке' },
                    { value: '850+', label: 'Сделок' },
                    { value: '15', label: 'Экспертов' },
                    { value: '98%', label: 'Довольных клиентов' },
                  ].map((s) => (
                    <div key={s.label} className="text-center py-4">
                      <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">{s.value}</div>
                      <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mt-2">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </OrnamentBorder>
          </div>
        </SectionWrapper>

        <OrnamentDivider variant="woven" />

        {/* Agents section */}
        <SectionWrapper variant="dark">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              Наша команда
            </h2>
            <p className="text-[var(--n15-muted)] max-w-xl mx-auto">
              Эксперты с глубоким знанием рынка и индивидуальным подходом
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {agents.map((agent) => (
              <div key={agent.name} className="group text-center p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors">
                  <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                    {agent.initials}
                  </span>
                </div>
                <h3 className="text-sm text-[var(--n15-white)] mb-1">{agent.name}</h3>
                <p className="text-xs text-[var(--n15-muted)] mb-3">{agent.role}</p>
                <div className="flex justify-center gap-4 text-xs text-[var(--n15-muted)]">
                  <span>{agent.deals} сделок</span>
                  <span>{agent.experience} лет</span>
                </div>
              </div>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

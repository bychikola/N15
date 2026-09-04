import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { Button } from '@/components/ui/Button'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

interface AboutData {
  heroTitle: string
  heroDescription: string
  whyTitle: string
  whyItems: { title: string; description: string; id?: string }[]
  stats: { value: string; label: string; id?: string }[]
  teamTitle: string
  teamDescription: string
  agents: { name: string; position?: string; objectsSold?: number; experience?: number; initials: string; photoUrl?: string }[]
}

async function getAboutData(): Promise<AboutData & { agents: { name: string; position?: string; objectsSold?: number; experience?: number; initials: string }[] }> {
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'site-settings' })

  const about = (settings as Record<string, unknown>).aboutPage as Record<string, unknown> | undefined

  // Fetch real agents
  const { docs: agents } = await payload.find({
    collection: 'agents',
    where: { isActive: { equals: true } },
    sort: 'sortOrder',
    limit: 8,
    depth: 1,
  })

  const agentList = (agents as unknown as { name: string; position?: string; objectsSold?: number; experience?: number; photo?: { url?: string; alt?: string } }[])
    .map((a) => ({
      name: a.name,
      position: a.position,
      objectsSold: a.objectsSold,
      experience: a.experience,
      photoUrl: a.photo?.url,
      initials: a.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
    }))
    // Агенты в алфавитном порядке по имени (локализованное сравнение для кириллицы)
    .sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'ru'))

  return {
    heroTitle: (about?.heroTitle as string) || 'Об агентстве',
    heroDescription: (about?.heroDescription as string) || 'N15 — это премиальное агентство недвижимости с осетинским характером. Мы работаем с 2014 года и за это время провели более 850 успешных сделок.',
    whyTitle: (about?.whyTitle as string) || 'Почему выбирают N15',
    whyItems: (about?.whyItems as { title: string; description: string; id?: string }[]) || [
      { title: 'Экспертиза рынка', description: 'Знаем каждый район, каждую улицу. 12 лет на рынке недвижимости Северной Осетии.' },
      { title: 'Полное сопровождение', description: 'От поиска до подписания договора. Юридическая проверка, оценка, переговоры.' },
      { title: 'Премиум-сервис', description: 'Индивидуальный подход к каждому клиенту. Конфиденциальность и безупречный сервис.' },
    ],
    stats: (about?.stats as { value: string; label: string; id?: string }[]) || [
      { value: '12', label: 'Лет на рынке' },
      { value: '850+', label: 'Сделок' },
      { value: '15', label: 'Экспертов' },
      { value: '98%', label: 'Довольных клиентов' },
    ],
    teamTitle: (about?.teamTitle as string) || 'Наша команда',
    teamDescription: (about?.teamDescription as string) || 'Эксперты с глубоким знанием рынка и индивидуальным подходом',
    agents: agentList,
  }
}

export default async function AboutPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  let data: AboutData

  try {
    data = await getAboutData()
  } catch {
    data = {
      heroTitle: 'Об агентстве',
      heroDescription: 'N15 — это премиальное агентство недвижимости с осетинским характером.',
      whyTitle: 'Почему выбирают N15',
      whyItems: [
        { title: 'Экспертиза рынка', description: 'Знаем каждый район, каждую улицу.' },
        { title: 'Полное сопровождение', description: 'От поиска до подписания договора.' },
        { title: 'Премиум-сервис', description: 'Индивидуальный подход к каждому клиенту.' },
      ],
      stats: [
        { value: '12', label: 'Лет на рынке' },
        { value: '850+', label: 'Сделок' },
        { value: '15', label: 'Экспертов' },
        { value: '98%', label: 'Довольных клиентов' },
      ],
      teamTitle: 'Наша команда',
      teamDescription: 'Эксперты с глубоким знанием рынка и индивидуальным подходом',
      agents: [],
    }
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {data.heroTitle}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">
            {data.heroDescription}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                {data.whyTitle}
              </h2>
              <div className="space-y-5">
                {data.whyItems.filter((p) => p.title).map((p) => (
                  <div key={p.id || p.title} className="flex gap-4">
                    <div className="flex-shrink-0 w-1 bg-[var(--n15-gold)]/40" />
                    <div>
                      <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-1">{p.title}</h3>
                      <p className="text-sm text-[var(--n15-muted)]">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <OrnamentBorder cornerOrnament>
              <div className="p-8 flex items-center justify-center">
                <div className="grid grid-cols-2 gap-8 place-items-center">
                  {data.stats.filter((s) => s.value && s.label).map((s) => (
                    <div key={s.id || s.label} className="text-center py-4">
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

        {/* Team section */}
        <SectionWrapper variant="dark">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {data.teamTitle}
            </h2>
            <p className="text-[var(--n15-muted)] max-w-xl mx-auto">
              {data.teamDescription}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {data.agents.map((agent) => (
              <div key={agent.name} className="group text-center p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors overflow-hidden">
                  {agent.photoUrl ? (
                    <img src={agent.photoUrl} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                      {agent.initials}
                    </span>
                  )}
                </div>
                <h3 className="text-sm text-[var(--n15-white)] mb-1">{agent.name}</h3>
                {agent.position && <p className="text-xs text-[var(--n15-muted)] mb-3">{agent.position}</p>}
                <div className="flex justify-center gap-4 text-xs text-[var(--n15-muted)]">
                  {agent.objectsSold != null && <span>{agent.objectsSold} {t.about.deals}</span>}
                  {agent.experience != null && <span>{agent.experience} {t.about.years}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button variant="outline" href={`/${lang}/about/agents`}>
              {t.about.allAgents}
            </Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

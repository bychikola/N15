import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { AgentContactButtons } from '@/components/ui/AgentContactButtons'
import { getDictionary } from '@/i18n/dictionaries'
import { sortAgents } from '@/lib/agents-sort'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function AgentsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { docs: agents } = await payload.find({
    collection: 'agents',
    where: { isActive: { equals: true } },
    sort: 'sortOrder',
    depth: 1,
  })

  // Агенты в алфавитном порядке по фамилии (все разделы сайта и CRM — один порядок)
  const agentsList = sortAgents((agents as unknown as {
    id: number; name: string; position?: string
    objectsSold?: number; experience?: number
    photo?: { url?: string; alt?: string }
  }[]).map((a) => ({
    ...a,
    initials: a.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
  })))

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.agents.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-xl">{t.agents.subtitle}</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {agentsList.filter((a) => a.name && a.name.trim()).map((agent) => (
              <div key={agent.id} className="group p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors overflow-hidden">
                  {agent.photo?.url ? (
                    <img src={agent.photo.url} alt={agent.photo.alt || agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                      {agent.initials}
                    </span>
                  )}
                </div>
                <h3 className="text-sm text-[var(--n15-white)] text-center mb-1">{agent.name}</h3>
                {agent.position && <p className="text-xs text-[var(--n15-muted)] text-center mb-3">{agent.position}</p>}
                <div className="flex justify-center gap-4 text-xs text-[var(--n15-muted)] mb-4">
                  {agent.objectsSold != null && <span>{agent.objectsSold} {t.agents.deals}</span>}
                  {agent.experience != null && <span>{agent.experience} {t.agents.years}</span>}
                </div>
                {/* Контакты агента: только «Позвонить» и «WhatsApp» — номера
                    телефонов клиентам не показываются (см. AgentContactButtons) */}
                <AgentContactButtons
                  agentId={agent.id}
                  callLabel={t.agents.call}
                  className="flex flex-col gap-2"
                />
              </div>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

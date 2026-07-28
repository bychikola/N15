import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const payload = await getPayload({ config })
  const { docs: agents } = await payload.find({
    collection: 'agents',
    where: { isActive: { equals: true } },
    sort: 'sortOrder',
    depth: 1,
  })

  const agentsList = agents as unknown as {
    id: number; name: string; position?: string; phone?: string
    objectsSold?: number; experience?: number
  }[]

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
            {agentsList.map((agent) => (
              <div key={agent.id} className="group p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors">
                  <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                    {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <h3 className="text-sm text-[var(--n15-white)] text-center mb-1">{agent.name}</h3>
                {agent.position && <p className="text-xs text-[var(--n15-muted)] text-center mb-3">{agent.position}</p>}
                <div className="flex justify-center gap-4 text-xs text-[var(--n15-muted)] mb-4">
                  {agent.objectsSold != null && <span>{agent.objectsSold} сделок</span>}
                  {agent.experience != null && <span>{agent.experience} лет</span>}
                </div>
                {agent.phone && <Button variant="outline" size="sm" className="w-full text-xs">{agent.phone}</Button>}
              </div>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

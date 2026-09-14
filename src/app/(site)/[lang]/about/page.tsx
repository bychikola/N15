import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { getDictionary } from '@/i18n/dictionaries'
import { compareAgents } from '@/lib/agents-sort'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

/** Компактный блок о работе агентства: заголовок, описание и декоративный
 *  номер — держит четыре блока в одной сетке, без крупных отступов */
interface AboutBlock {
  title: string
  text: string
}

// Короткие блоки под первым экраном. Заменяют прежнюю рубрику «Почему
// выбирают Н15»: её смысл (сопровождение сделки, проверка документов) здесь
// разложен по блокам, без повторов и лишних отступов
const ABOUT_BLOCKS: AboutBlock[] = [
  {
    title: 'О нас',
    text: 'N15 — агентство недвижимости с осетинским характером и внимательным отношением к каждому клиенту.',
  },
  {
    title: 'Чем мы занимаемся',
    text: 'Продажа и покупка квартир, домов, земельных участков, коммерческой и межрегиональной недвижимости.',
  },
  {
    title: 'Наш подход',
    text: 'Проверяем объект, помогаем оценить риски, сопровождаем переговоры и сделку до завершения.',
  },
  {
    title: 'Как проходит работа',
    text: 'Заявка → подбор вариантов → просмотр → проверка документов → сделка.',
  },
]

const DEFAULT_HERO_DESCRIPTION =
  'Н15 — премиальное агентство недвижимости в Северной Осетии: продажа, покупка и аренда квартир, домов и коммерческих объектов.'

// Единственный показатель на странице — срок работы на рынке
const DEFAULT_STATS = [{ value: 'Более 10', label: 'Лет на рынке' }]

interface AboutData {
  heroTitle: string
  heroDescription: string
  stats: { value: string; label: string }[]
  teamTitle: string
  teamDescription: string
  agents: {
    id?: number
    name: string
    position?: string
    initials: string
    photoUrl?: string
  }[]
}

async function getAboutData(): Promise<AboutData> {
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

  const agentList = (agents as unknown as { id: number; name: string; position?: string; photo?: { url?: string; alt?: string } }[])
    .map((a) => ({
      id: a.id,
      name: a.name,
      position: a.position,
      photoUrl: a.photo?.url,
      initials: a.name.split(' ').map((n) => n[0]).join('').slice(0, 2),
    }))
    // Агенты в алфавитном порядке по фамилии (единый порядок со страницей «Наши агенты» и CRM)
    .sort(compareAgents)

  const stats = (about?.stats as { value?: string; label?: string }[] | undefined) || DEFAULT_STATS

  return {
    heroTitle: (about?.heroTitle as string) || 'Об агентстве',
    heroDescription: (about?.heroDescription as string) || DEFAULT_HERO_DESCRIPTION,
    stats: stats.filter((s) => s.value && s.label) as { value: string; label: string }[],
    teamTitle: (about?.teamTitle as string) || 'Наша команда',
    teamDescription:
      (about?.teamDescription as string) ||
      'Агенты, которые знают рынок и сопровождают сделку до завершения',
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
      heroDescription: DEFAULT_HERO_DESCRIPTION,
      stats: DEFAULT_STATS,
      teamTitle: 'Наша команда',
      teamDescription: 'Агенты, которые знают рынок и сопровождают сделку до завершения',
      agents: [],
    }
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Первый экран: заголовок, короткое описание и единственный
            показатель — срок работы на рынке */}
        <SectionWrapper variant="dark" ornament="solar">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {data.heroTitle}
            </h1>
            <p className="text-[var(--n15-silver)] leading-relaxed">{data.heroDescription}</p>
          </div>

          {data.stats.map((s) => (
            <div
              key={`${s.value}-${s.label}`}
              className="inline-flex items-baseline gap-3 mt-6 px-5 py-3 border border-[var(--n15-gold)]/25 bg-[var(--n15-charcoal)]"
            >
              <span className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                {s.value}
              </span>
              <span className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">{s.label}</span>
            </div>
          ))}
        </SectionWrapper>

        {/* Компактные блоки о работе агентства — по два в ряд, без крупных
            отступов между секциями */}
        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ABOUT_BLOCKS.map((block, i) => (
              <div
                key={block.title}
                className="relative overflow-hidden p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-3 right-4 text-5xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/10 select-none"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
                  {block.title}
                </h2>
                <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{block.text}</p>
              </div>
            ))}
          </div>
        </SectionWrapper>

        {/* Команда: компактные карточки — фото, имя, должность и переход
            к объектам агента (каталог с фильтром ?agent=<id>) */}
        <SectionWrapper variant="dark">
          <div className="mb-6">
            <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
              {data.teamTitle}
            </h2>
            <p className="text-sm text-[var(--n15-muted)] max-w-xl">{data.teamDescription}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.agents.map((agent) => (
              <div
                key={agent.id ?? agent.name}
                className="group flex flex-col items-center text-center p-5 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300"
              >
                <div className="w-16 h-16 mb-3 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center group-hover:border-[var(--n15-gold)]/50 transition-colors overflow-hidden">
                  {agent.photoUrl ? (
                    <img src={agent.photoUrl} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                      {agent.initials}
                    </span>
                  )}
                </div>
                <h3 className="text-sm text-[var(--n15-white)] mb-1">{agent.name}</h3>
                {agent.position && <p className="text-xs text-[var(--n15-muted)] mb-3">{agent.position}</p>}
                {agent.id && (
                  <a
                    href={`/${lang}/catalog?agent=${agent.id}`}
                    className="mt-auto text-xs tracking-wider uppercase text-[var(--n15-gold)] border-b border-[var(--n15-gold)]/30 pb-0.5 hover:border-[var(--n15-gold)] transition-colors"
                  >
                    {t.about.viewObjects}
                  </a>
                )}
              </div>
            ))}
          </div>
        </SectionWrapper>

        {/* Спокойный призыв внизу страницы: обсудить задачу — на страницу
            контактов, как и остальные обращения на сайте */}
        <SectionWrapper variant="charcoal">
          <OrnamentBorder cornerOrnament>
            <div className="px-6 py-8 text-center">
              <p className="text-[var(--n15-silver)] mb-5">
                Расскажите о задаче — подберём объекты и подскажем, с чего начать.
              </p>
              <a
                href={`/${lang}/contacts`}
                className="inline-flex items-center justify-center px-8 py-3 text-sm tracking-wider uppercase rounded-sm border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)] hover:text-[var(--on-accent)] transition-all duration-300"
              >
                {t.about.discussTask}
              </a>
            </div>
          </OrnamentBorder>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

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

/** Пункт раздела: название и одна спокойная строка пояснения */
interface AboutItem {
  title: string
  text: string
}

// Чем занимается агентство — восемь направлений. В сетке из четырёх колонок
// они ложатся ровно как 4 + 4: блок остаётся компактным и не вытягивается вниз
const SERVICES: AboutItem[] = [
  {
    title: 'Подбор объектов',
    text: 'Показываем варианты, которые подходят по бюджету, району и задаче.',
  },
  {
    title: 'Продажа и покупка',
    text: 'Ведём сделки с квартирами, домами, участками и коммерческими объектами.',
  },
  {
    title: 'Аренда',
    text: 'Подбираем жильё и площади под аренду — от квартиры до помещения.',
  },
  {
    title: 'Межрегиональные сделки',
    text: 'Работаем с покупателями и объектами из других регионов.',
  },
  {
    title: 'Юридическая проверка',
    text: 'Проверяем документы и историю объекта до сделки.',
  },
  {
    title: 'Оценка объекта',
    text: 'Определяем рыночную стоимость, чтобы цена была обоснованной.',
  },
  {
    title: 'Сопровождение сделки',
    text: 'Ведём клиента от заявки до передачи ключей.',
  },
  {
    title: 'Новостройки и ипотека',
    text: 'Подберём квартиру напрямую от застройщика с возможностью оформления семейной, военной и других доступных ипотечных программ.',
  },
]

// Как проходит работа — пять шагов; на широком экране они идут одной строкой
// и соединяются бронзовыми стрелками
const STEPS: AboutItem[] = [
  { title: 'Заявка', text: 'Обсуждаем задачу и бюджет.' },
  { title: 'Подбор вариантов', text: 'Готовим подходящие объекты.' },
  { title: 'Переговоры', text: 'Согласуем условия с продавцом.' },
  { title: 'Проверка документов', text: 'Проверяем объект и историю.' },
  { title: 'Сделка', text: 'Подписываем документы и передаём ключи.' },
]

// Преимущества — четыре пункта: опыт команды, знание республики, персональная
// работа и сопровождение до конца сделки
const ADVANTAGES: AboutItem[] = [
  {
    title: 'Опытная команда',
    text: 'Специалисты с опытом более 10 лет на рынке недвижимости.',
  },
  {
    title: 'Знание местного рынка',
    text: 'Знаем районы, цены и особенности Северной Осетии.',
  },
  {
    title: 'Персональный подход',
    text: 'Разбираемся в каждом запросе и подбираем варианты под него.',
  },
  {
    title: 'Сопровождение до завершения сделки',
    text: 'Остаёмся на связи на всех этапах — до передачи ключей.',
  },
]

// Описание под заголовком: агентство новое, опыт — у команды
const DEFAULT_HERO_DESCRIPTION =
  'Н15 — новое агентство недвижимости с командой специалистов, которые более 10 лет работают на рынке недвижимости и знают особенности Северной Осетии.\n' +
  'Мы сопровождаем клиентов при покупке, продаже и аренде квартир, частных домов, земельных участков и коммерческой недвижимости.'

// Компактные факты под первым экраном: опыт команды, имя агентства,
// специализация. Цифр по сделкам здесь нет — они не подтверждены
const DEFAULT_STATS = [
  { value: '10+ лет', label: 'Опыт команды' },
  { value: 'Н15', label: 'Новое имя' },
  { value: 'Северная Осетия', label: 'Наша специализация' },
]

// Описание в CMS — обычная текстовая область: перенос строки разделяет
// абзацы, поэтому длинный текст читается спокойно, без «простыни»
const toParagraphs = (text: string) =>
  text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

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

/** Заголовок раздела: спокойный кегль — как у блока команды, без крупных надписей */
function SectionHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
        {title}
      </h2>
      <p className="text-sm text-[var(--n15-muted)] max-w-2xl">{text}</p>
    </div>
  )
}

/** Карточка пункта — одна на все разделы страницы: бронзовый маркер (ромб или
 *  номер шага), название и короткая строка. Высоту выравнивает сетка
 *  (auto-rows-fr), поэтому карточки всегда одного размера */
function InfoCard({ title, text, badge }: { title: string; text: string; badge?: string }) {
  return (
    <div className="h-full p-5 border border-[var(--n15-gold)]/15 hover:border-[var(--n15-gold)]/35 transition-colors duration-300">
      {badge ? (
        <span className="block text-xs tracking-widest text-[var(--n15-gold)] mb-3">{badge}</span>
      ) : (
        <span aria-hidden="true" className="block w-1.5 h-1.5 mb-3 rotate-45 bg-[var(--n15-gold)]/60" />
      )}
      <h3 className="text-sm text-[var(--n15-white)] mb-1.5">{title}</h3>
      <p className="text-xs text-[var(--n15-muted)] leading-relaxed">{text}</p>
    </div>
  )
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
        {/* Первый экран: заголовок, описание в два абзаца и три компактных
            факта на фирменном зелёном — плитки одного размера */}
        <SectionWrapper variant="dark" ornament="solar">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {data.heroTitle}
            </h1>
            <div className="space-y-3">
              {toParagraphs(data.heroDescription).map((paragraph) => (
                <p key={paragraph} className="text-[var(--n15-silver)] leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 auto-rows-fr gap-3 mt-8 max-w-3xl">
            {data.stats.map((s) => (
              <div
                key={`${s.value}-${s.label}`}
                className="h-full px-5 py-4 bg-[var(--n15-green)] border border-[var(--n15-green-gold)]/25"
              >
                <p className="text-lg leading-snug font-[family-name:var(--font-display)] text-[var(--n15-green-gold)]">
                  {s.value}
                </p>
                <p className="mt-1 text-[11px] tracking-wider uppercase text-[var(--n15-on-green-muted)]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </SectionWrapper>

        {/* Чем занимается агентство: восемь карточек одного размера — в четырёх
            колонках они ложатся ровно как 4 + 4, без крупных отступов */}
        <SectionWrapper variant="charcoal">
          <SectionHeading
            title="Чем занимается агентство"
            text="Полный цикл: от подбора объекта до передачи ключей."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-3">
            {SERVICES.map((item) => (
              <InfoCard key={item.title} title={item.title} text={item.text} />
            ))}
          </div>
        </SectionWrapper>

        {/* Как проходит работа: пять шагов одной строкой, между ними —
            бронзовые стрелки; на телефоне шаги идут по два в ряд */}
        <SectionWrapper variant="dark">
          <SectionHeading title="Как проходит работа" text="Пять шагов — от заявки до сделки." />
          <div className="grid grid-cols-2 md:grid-cols-5 auto-rows-fr gap-3 md:gap-6">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative h-full">
                <InfoCard
                  title={step.title}
                  text={step.text}
                  badge={String(i + 1).padStart(2, '0')}
                />
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="hidden md:block absolute left-full top-1/2 ml-1 -translate-y-1/2 text-sm text-[var(--n15-gold)]/50"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </SectionWrapper>

        {/* Преимущества: четыре карточки в один ряд */}
        <SectionWrapper variant="charcoal">
          <SectionHeading title="Преимущества" text="На что опираемся в работе." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-3">
            {ADVANTAGES.map((item) => (
              <InfoCard key={item.title} title={item.title} text={item.text} />
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

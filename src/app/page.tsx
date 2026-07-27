import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from '@/components/home/HeroSection'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'

// Temporary mock data until Payload CMS is connected
const premiumObjects = [
  {
    id: 1,
    title: 'Просторная квартира в центре',
    price: 8500000,
    area: 95,
    rooms: 3,
    floor: 5,
    totalFloors: 9,
    address: 'ул. Коста Хетагурова, 42',
    image: null,
    isPremium: true,
  },
  {
    id: 2,
    title: 'Дом с видом на горы',
    price: 25000000,
    area: 180,
    rooms: 5,
    floor: 2,
    totalFloors: 2,
    address: 'пос. Верхний Фиагдон',
    image: null,
    isPremium: true,
  },
  {
    id: 3,
    title: 'Студия в новостройке',
    price: 4200000,
    area: 38,
    rooms: 1,
    floor: 12,
    totalFloors: 18,
    address: 'пр. Мира, 15',
    image: null,
    isPremium: false,
  },
]

const blogPosts = [
  { id: 1, title: 'Как выбрать квартиру в новостройке: полный гид', date: '15.07.2026', category: 'Советы' },
  { id: 2, title: 'Ипотека 2026: что изменилось и как получить лучшую ставку', date: '02.07.2026', category: 'Финансы' },
  { id: 3, title: 'Районы Владикавказа: где лучше всего жить', date: '20.06.2026', category: 'Обзоры' },
]

export default function Home() {
  return (
    <>
      <Header />

      <main>
        {/* ── Hero ──────────────────────────── */}
        <HeroSection />

        {/* ── Premium Objects ───────────────── */}
        <SectionWrapper variant="charcoal" ornament="solar">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              Премиум-объекты
            </h2>
            <p className="text-[var(--n15-muted)] max-w-xl mx-auto">
              Лучшие предложения от N15 — тщательно отобранные объекты
              для самых взыскательных клиентов
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {premiumObjects.map((obj) => (
              <OrnamentBorder key={obj.id} cornerOrnament={obj.isPremium}>
                <div className="p-6 group cursor-pointer">
                  {/* Placeholder image */}
                  <div className="aspect-[4/3] bg-[var(--n15-black)] mb-4 flex items-center justify-center overflow-hidden">
                    {obj.image ? (
                      <img src={obj.image} alt={obj.title} className="w-full h-full object-cover" />
                    ) : (
                      <svg
                        width="64"
                        height="64"
                        viewBox="0 0 64 64"
                        fill="none"
                        className="opacity-20 group-hover:opacity-40 transition-opacity duration-500"
                      >
                        <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
                        <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
                        <circle cx="44" cy="22" r="4" stroke="#C8A44E" strokeWidth="1" />
                      </svg>
                    )}
                  </div>

                  {obj.isPremium && (
                    <span className="inline-block text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-2 py-0.5 mb-3">
                      Premium
                    </span>
                  )}

                  <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2 group-hover:text-[var(--n15-gold)] transition-colors duration-300">
                    {obj.title}
                  </h3>

                  <p className="text-xs text-[var(--n15-muted)] mb-3">{obj.address}</p>

                  <div className="flex items-center justify-between">
                    <span className="text-lg text-[var(--n15-gold)] font-medium">
                      {obj.price.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-xs text-[var(--n15-muted)]">
                      {obj.area} м² &bull; {obj.rooms} комн.
                    </span>
                  </div>
                </div>
              </OrnamentBorder>
            ))}
          </div>

          <div className="text-center mt-10">
            <Button variant="outline" href="/catalog">
              Смотреть все объекты
            </Button>
          </div>
        </SectionWrapper>

        <OrnamentDivider variant="solar" />

        {/* ── About Preview ──────────────────── */}
        <SectionWrapper variant="dark">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                Агентство с{' '}
                <span className="text-[var(--n15-gold)]">осетинским</span>
                {' '}характером
              </h2>
              <p className="text-[var(--n15-muted)] leading-relaxed mb-6">
                N15 — это не просто агентство недвижимости. Мы строим мост между
                традицией и современностью, между горами Кавказа и миром больших
                возможностей. Каждая сделка для нас — это вопрос чести.
              </p>
              <div className="grid grid-cols-3 gap-8 mt-10">
                {[
                  { value: '12', label: 'Лет опыта' },
                  { value: '850+', label: 'Сделок' },
                  { value: '15', label: 'Экспертов' },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                      {s.value}
                    </div>
                    <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="primary" href="/about" className="mt-8">
                Узнать больше
              </Button>
            </div>

            <OrnamentBorder cornerOrnament>
              <div className="aspect-[4/5] bg-[var(--n15-charcoal)] flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="opacity-30">
                  <circle cx="60" cy="60" r="50" stroke="#C8A44E" strokeWidth="1.5" />
                  <circle cx="60" cy="60" r="30" stroke="#C8A44E" strokeWidth="1" />
                  <circle cx="60" cy="60" r="10" fill="#C8A44E" />
                  {[0, 45, 90, 135].map((a) => (
                    <line
                      key={a}
                      x1="60"
                      y1="60"
                      x2={60 + 50 * Math.cos((a * Math.PI) / 180)}
                      y2={60 + 50 * Math.sin((a * Math.PI) / 180)}
                      stroke="#C8A44E"
                      strokeWidth="0.5"
                    />
                  ))}
                </svg>
              </div>
            </OrnamentBorder>
          </div>
        </SectionWrapper>

        <OrnamentDivider variant="woven" />

        {/* ── Blog Preview ───────────────────── */}
        <SectionWrapper variant="charcoal">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              Полезные статьи
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <a
                key={post.id}
                href={`/blog/${post.id}`}
                className="group p-6 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300"
              >
                <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">
                  {post.category}
                </span>
                <h3 className="text-base text-[var(--n15-white)] mt-2 mb-3 group-hover:text-[var(--n15-gold)] transition-colors">
                  {post.title}
                </h3>
                <span className="text-xs text-[var(--n15-muted)]">{post.date}</span>
              </a>
            ))}
          </div>
        </SectionWrapper>
      </main>

      <Footer />
    </>
  )
}

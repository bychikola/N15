import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'

// Mock data — будет заменено на Payload CMS запросы
const objects = [
  {
    id: 1, title: 'Просторная квартира в центре', type: 'sale', category: 'apartment',
    price: 8500000, area: 95, rooms: 3, floor: 5, totalFloors: 9,
    address: 'ул. Коста Хетагурова, 42', isPremium: true,
  },
  {
    id: 2, title: 'Дом с видом на горы', type: 'sale', category: 'house',
    price: 25000000, area: 180, rooms: 5, floor: 2, totalFloors: 2,
    address: 'пос. Верхний Фиагдон', isPremium: true,
  },
  {
    id: 3, title: 'Студия в новостройке', type: 'sale', category: 'apartment',
    price: 4200000, area: 38, rooms: 1, floor: 12, totalFloors: 18,
    address: 'пр. Мира, 15', isPremium: false,
  },
  {
    id: 4, title: '2-комнатная с ремонтом', type: 'sale', category: 'apartment',
    price: 6200000, area: 65, rooms: 2, floor: 3, totalFloors: 5,
    address: 'ул. Горького, 8', isPremium: false,
  },
  {
    id: 5, title: 'Коммерческое помещение', type: 'rent', category: 'commercial',
    price: 120000, area: 120, rooms: 1, floor: 1, totalFloors: 3,
    address: 'пр. Коста, 55', isPremium: false,
  },
  {
    id: 6, title: 'Участок в центре', type: 'sale', category: 'land',
    price: 3500000, area: 600, rooms: 0, floor: 0, totalFloors: 0,
    address: 'ул. Тамаева, 12', isPremium: false,
  },
]

const typeLabels: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' }
const categoryLabels: Record<string, string> = {
  apartment: 'Квартира', house: 'Дом', townhouse: 'Таунхаус',
  commercial: 'Коммерческая', land: 'Участок',
}

export default function CatalogPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            Каталог объектов
          </h1>
          <p className="text-[var(--n15-muted)] max-w-xl">
            Найдите свой идеальный дом или инвестицию. От квартир в центре
            Владикавказа до домов с видом на Кавказский хребет.
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {/* Filters bar */}
          <div className="flex flex-wrap gap-3 mb-10 p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
            {['sale', 'rent'].map((t) => (
              <button
                key={t}
                className="px-5 py-2 text-sm tracking-wider uppercase border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/50 hover:text-[var(--n15-gold)] transition-all duration-300"
              >
                {typeLabels[t]}
              </button>
            ))}
            <div className="w-px bg-[var(--n15-gold)]/20 mx-2" />
            {Object.entries(categoryLabels).map(([k, v]) => (
              <button
                key={k}
                className="px-4 py-2 text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors duration-300"
              >
                {v}
              </button>
            ))}
          </div>

          {/* Object grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {objects.map((obj) => (
              <a key={obj.id} href={`/catalog/${obj.id}`}>
                <OrnamentBorder cornerOrnament={obj.isPremium}>
                  <div className="p-6 group">
                    <div className="aspect-[4/3] bg-[var(--n15-black)] mb-4 flex items-center justify-center overflow-hidden">
                      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity duration-500">
                        <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
                        <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
                      </svg>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {obj.isPremium && (
                        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-2 py-0.5">
                          Premium
                        </span>
                      )}
                      <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">
                        {typeLabels[obj.type]}
                      </span>
                      <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">
                        {categoryLabels[obj.category]}
                      </span>
                    </div>

                    <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2 group-hover:text-[var(--n15-gold)] transition-colors duration-300">
                      {obj.title}
                    </h3>
                    <p className="text-xs text-[var(--n15-muted)] mb-3">{obj.address}</p>

                    <div className="flex items-center justify-between">
                      <span className="text-lg text-[var(--n15-gold)] font-medium">
                        {obj.price.toLocaleString('ru-RU')} {obj.type === 'rent' ? '₽/мес' : '₽'}
                      </span>
                      <span className="text-xs text-[var(--n15-muted)]">
                        {obj.area} м² {obj.rooms > 0 && `• ${obj.rooms} комн.`}
                      </span>
                    </div>
                  </div>
                </OrnamentBorder>
              </a>
            ))}
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

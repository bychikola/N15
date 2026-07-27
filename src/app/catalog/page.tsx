'use client'

import { Suspense, useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'

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
  {
    id: 7, title: 'Коттедж в горах', type: 'rent', category: 'house',
    price: 80000, area: 150, rooms: 4, floor: 2, totalFloors: 2,
    address: 'пос. Цей', isPremium: false,
  },
  {
    id: 8, title: 'Таунхаус у реки', type: 'sale', category: 'townhouse',
    price: 12000000, area: 130, rooms: 3, floor: 2, totalFloors: 2,
    address: 'ул. Набережная, 3', isPremium: false,
  },
  {
    id: 9, title: 'Офис в бизнес-центре', type: 'rent', category: 'commercial',
    price: 65000, area: 55, rooms: 2, floor: 4, totalFloors: 7,
    address: 'пр. Коста, 70', isPremium: false,
  },
]

const typeLabels: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' }
const categoryLabels: Record<string, string> = {
  apartment: 'Квартира', house: 'Дом', townhouse: 'Таунхаус',
  commercial: 'Коммерческая', land: 'Участок',
}

function CatalogContent() {
  const searchParams = useSearchParams()

  const [activeType, setActiveType] = useState<string>('')
  const [activeCategory, setActiveCategory] = useState<string>('')

  // Read URL params on mount
  useEffect(() => {
    const type = searchParams.get('type')
    const category = searchParams.get('category')
    if (type) setActiveType(type)
    if (category) setActiveCategory(category)
  }, [searchParams])

  const filtered = useMemo(() => {
    return objects.filter((obj) => {
      if (activeType && obj.type !== activeType) return false
      if (activeCategory && obj.category !== activeCategory) return false
      return true
    })
  }, [activeType, activeCategory])

  const baseBtn = 'px-4 py-2 text-xs tracking-wider uppercase transition-all duration-300 cursor-pointer'
  const btnActive = 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
  const btnInactive = 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'

  return (
    <SectionWrapper variant="charcoal">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-10 p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] self-center mr-2">
          Сделка:
        </span>
        <button
          onClick={() => setActiveType('')}
          className={`${baseBtn} border ${activeType === '' ? btnActive : btnInactive}`}
        >
          Все
        </button>
        {['sale', 'rent'].map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(activeType === t ? '' : t)}
            className={`${baseBtn} border ${activeType === t ? btnActive : btnInactive}`}
          >
            {typeLabels[t]}
          </button>
        ))}

        <div className="w-px bg-[var(--n15-gold)]/20 mx-3 self-stretch" />

        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] self-center mr-2">
          Тип:
        </span>
        <button
          onClick={() => setActiveCategory('')}
          className={`${baseBtn} border ${activeCategory === '' ? btnActive : btnInactive}`}
        >
          Все
        </button>
        {Object.entries(categoryLabels).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setActiveCategory(activeCategory === k ? '' : k)}
            className={`${baseBtn} border ${activeCategory === k ? btnActive : btnInactive}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--n15-muted)] mb-6">
        Найдено: <span className="text-[var(--n15-gold)]">{filtered.length}</span> объектов
        {(activeType || activeCategory) && (
          <button
            onClick={() => { setActiveType(''); setActiveCategory('') }}
            className="ml-4 text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] underline"
          >
            Сбросить фильтры
          </button>
        )}
      </p>

      {/* Object grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((obj) => (
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
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--n15-muted)] text-lg mb-4">Ничего не найдено</p>
          <button
            onClick={() => { setActiveType(''); setActiveCategory('') }}
            className="text-sm text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] underline"
          >
            Сбросить все фильтры
          </button>
        </div>
      )}
    </SectionWrapper>
  )
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

        <Suspense fallback={
          <SectionWrapper variant="charcoal">
            <p className="text-[var(--n15-muted)] text-center py-20">Загрузка каталога...</p>
          </SectionWrapper>
        }>
          <CatalogContent />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

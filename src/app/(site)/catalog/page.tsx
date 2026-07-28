'use client'

import { Suspense, useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'

interface ObjectItem {
  id: number
  title: string
  type: 'sale' | 'rent'
  category: string
  price: number
  area?: number
  rooms?: number
  address?: { city?: string; street?: string; house?: string }
  isPremium?: boolean
  primaryImage?: { url?: string; alt?: string }
  images?: { url?: string }[]
}

const typeLabels: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' }
const categoryLabels: Record<string, string> = {
  apartment: 'Квартира', house: 'Дом', townhouse: 'Таунхаус',
  commercial: 'Коммерческая', land: 'Участок',
}

const baseBtn = 'px-4 py-2 text-xs tracking-wider uppercase transition-all duration-300 cursor-pointer'
const btnActive = 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
const btnInactive = 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'

function CatalogContent() {
  const searchParams = useSearchParams()
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('')
  const [activeCategory, setActiveCategory] = useState('')

  useEffect(() => {
    const type = searchParams.get('type')
    const category = searchParams.get('category')
    if (type) setActiveType(type)
    if (category) setActiveCategory(category)
  }, [searchParams])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50', depth: '2' })
    if (activeType) params.set('where', JSON.stringify({ type: { equals: activeType } }))
    fetch(`/api/objects?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const docs = (data.docs || []).map((d: Record<string, unknown>) => ({
          ...d,
          primaryImage: typeof d.primaryImage === 'object' ? d.primaryImage : null,
          images: Array.isArray(d.images) ? d.images.filter((i: unknown) => typeof i === 'object') : [],
        }))
        setObjects(docs)
      })
      .catch(() => setObjects([]))
      .finally(() => setLoading(false))
  }, [activeType])

  const filtered = useMemo(() => {
    return objects.filter((obj) => {
      if (activeCategory && obj.category !== activeCategory) return false
      return true
    })
  }, [objects, activeCategory])

  return (
    <SectionWrapper variant="charcoal">
      <div className="flex flex-wrap gap-2 mb-10 p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] self-center mr-2">Сделка:</span>
        <button onClick={() => setActiveType('')} className={`${baseBtn} border ${activeType === '' ? btnActive : btnInactive}`}>Все</button>
        {['sale', 'rent'].map((t) => (
          <button key={t} onClick={() => setActiveType(activeType === t ? '' : t)} className={`${baseBtn} border ${activeType === t ? btnActive : btnInactive}`}>{typeLabels[t]}</button>
        ))}
        <div className="w-px bg-[var(--n15-gold)]/20 mx-3 self-stretch" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] self-center mr-2">Тип:</span>
        <button onClick={() => setActiveCategory('')} className={`${baseBtn} border ${activeCategory === '' ? btnActive : btnInactive}`}>Все</button>
        {Object.entries(categoryLabels).map(([k, v]) => (
          <button key={k} onClick={() => setActiveCategory(activeCategory === k ? '' : k)} className={`${baseBtn} border ${activeCategory === k ? btnActive : btnInactive}`}>{v}</button>
        ))}
      </div>

      <p className="text-xs text-[var(--n15-muted)] mb-6">
        Найдено: <span className="text-[var(--n15-gold)]">{loading ? '...' : filtered.length}</span> объектов
        {(activeType || activeCategory) && (
          <button onClick={() => { setActiveType(''); setActiveCategory('') }} className="ml-4 text-[var(--n15-gold)] underline">Сбросить фильтры</button>
        )}
      </p>

      {loading ? (
        <p className="text-center py-20 text-[var(--n15-muted)]">Загрузка...</p>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((obj) => (
            <a key={obj.id} href={`/catalog/${obj.id}`}>
              <OrnamentBorder cornerOrnament={obj.isPremium}>
                <div className="p-6 group">
                  <div className="aspect-[4/3] bg-[var(--n15-black)] mb-4 flex items-center justify-center overflow-hidden">
                    {obj.primaryImage?.url ? (
                      <img src={obj.primaryImage.url} alt={obj.title} className="w-full h-full object-cover" />
                    ) : (
                      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity">
                        <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
                        <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {obj.isPremium && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-2 py-0.5">Premium</span>}
                    <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">{typeLabels[obj.type]}</span>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">{categoryLabels[obj.category] || obj.category}</span>
                  </div>
                  <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2 group-hover:text-[var(--n15-gold)] transition-colors">{obj.title}</h3>
                  <p className="text-xs text-[var(--n15-muted)] mb-3">{obj.address ? [obj.address.street, obj.address.house].filter(Boolean).join(', ') : ''}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-[var(--n15-gold)] font-medium">{obj.price?.toLocaleString('ru-RU')} {obj.type === 'rent' ? '₽/мес' : '₽'}</span>
                    <span className="text-xs text-[var(--n15-muted)]">{obj.area && `${obj.area} м²`}{obj.rooms ? ` • ${obj.rooms} комн.` : ''}</span>
                  </div>
                </div>
              </OrnamentBorder>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--n15-muted)] text-lg mb-4">Ничего не найдено</p>
          <button onClick={() => { setActiveType(''); setActiveCategory('') }} className="text-sm text-[var(--n15-gold)] underline">Сбросить все фильтры</button>
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
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Каталог объектов</h1>
          <p className="text-[var(--n15-muted)] max-w-xl">Найдите свой идеальный дом или инвестицию.</p>
        </SectionWrapper>
        <Suspense fallback={<SectionWrapper variant="charcoal"><p className="text-[var(--n15-muted)] text-center py-20">Загрузка...</p></SectionWrapper>}>
          <CatalogContent />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

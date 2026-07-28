import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import Link from 'next/link'

const favorites = [
  { id: 1, title: 'Просторная квартира в центре', price: 8500000, area: 95, rooms: 3, address: 'ул. Коста Хетагурова, 42' },
  { id: 2, title: 'Дом с видом на горы', price: 25000000, area: 180, rooms: 5, address: 'пос. Верхний Фиагдон' },
]

export default function FavoritesPage() {
  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/lk" className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              ← Личный кабинет
            </Link>
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">Избранное</h1>

          {favorites.length === 0 ? (
            <p className="text-[var(--n15-muted)]">У вас пока нет избранных объектов</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.map((obj) => (
                <Link key={obj.id} href={`/catalog/${obj.id}`}>
                  <OrnamentBorder>
                    <div className="p-6 group">
                      <div className="aspect-[4/3] bg-[var(--n15-black)] mb-4 flex items-center justify-center">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity">
                          <rect x="3" y="9" width="42" height="33" stroke="#C8A44E" strokeWidth="1" />
                          <path d="M3 27 L18 15 L30 24 L45 9" stroke="#C8A44E" strokeWidth="1" />
                        </svg>
                      </div>
                      <h3 className="text-sm text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">{obj.title}</h3>
                      <p className="text-xs text-[var(--n15-muted)] mt-1 mb-2">{obj.address}</p>
                      <span className="text-sm text-[var(--n15-gold)]">{obj.price.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  </OrnamentBorder>
                </Link>
              ))}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

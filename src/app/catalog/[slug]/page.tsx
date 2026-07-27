import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'

// Mock data for object detail
const object = {
  id: 1,
  title: 'Просторная квартира в центре',
  type: 'sale',
  category: 'apartment',
  price: 8500000,
  area: 95,
  livingArea: 62,
  kitchenArea: 14,
  rooms: 3,
  floor: 5,
  totalFloors: 9,
  buildingType: 'brick',
  condition: 'excellent',
  heating: 'central',
  balcony: 'loggia',
  address: {
    city: 'Владикавказ',
    district: 'Центральный',
    street: 'ул. Коста Хетагурова',
    house: '42',
    apartment: '15',
  },
  description: `
    Просторная трёхкомнатная квартира в историческом центре Владикавказа.
    Высокие потолки 3.2 м, панорамные окна с видом на Кавказский хребет.
    Дизайнерский ремонт с использованием натуральных материалов.`,
  features: [
    'Панорамные окна',
    'Дизайнерский ремонт',
    'Гардеробная',
    'Кондиционер',
    'Подземный паркинг',
    'Охраняемая территория',
  ],
  isPremium: true,
  isExclusive: true,
}

const buildingTypeLabels: Record<string, string> = {
  brick: 'Кирпичный', monolith: 'Монолитный', panel: 'Панельный',
  stalin: 'Сталинский', historic: 'Исторический',
}
const conditionLabels: Record<string, string> = {
  new: 'Новостройка', excellent: 'Отличное', good: 'Хорошее',
  needsRepair: 'Требует ремонта', shell: 'Свободная планировка',
}

export default function ObjectPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Gallery placeholder */}
        <SectionWrapper variant="dark">
          <div className="aspect-[21/9] bg-[var(--n15-charcoal)] flex items-center justify-center mb-8 border border-[var(--n15-gold)]/10">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="opacity-20">
              <rect x="6" y="16" width="68" height="54" stroke="#C8A44E" strokeWidth="1" />
              <path d="M6 46 L30 26 L50 40 L74 16" stroke="#C8A44E" strokeWidth="1" />
              <circle cx="54" cy="28" r="5" stroke="#C8A44E" strokeWidth="1" />
            </svg>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Main content */}
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {object.isPremium && (
                  <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-3 py-1">
                    Premium
                  </span>
                )}
                {object.isExclusive && (
                  <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-burgundy)] border border-[var(--n15-burgundy)]/30 px-3 py-1">
                    Эксклюзив
                  </span>
                )}
                <span className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">
                  Продажа • Квартира
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                {object.title}
              </h1>
              <p className="text-[var(--n15-muted)] mb-6">
                {object.address.city}, {object.address.district} район, {object.address.street}, {object.address.house}
              </p>

              <div className="text-3xl text-[var(--n15-gold)] font-[family-name:var(--font-display)] mb-8">
                {object.price.toLocaleString('ru-RU')} ₽
                <span className="text-sm text-[var(--n15-muted)] ml-2">
                  ({Math.round(object.price / object.area).toLocaleString('ru-RU')} ₽/м²)
                </span>
              </div>

              <OrnamentDivider variant="simple" />

              {/* Features grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 my-10">
                {[
                  { label: 'Площадь', value: `${object.area} м²` },
                  { label: 'Жилая', value: `${object.livingArea} м²` },
                  { label: 'Кухня', value: `${object.kitchenArea} м²` },
                  { label: 'Комнат', value: object.rooms.toString() },
                  { label: 'Этаж', value: `${object.floor} / ${object.totalFloors}` },
                  { label: 'Тип дома', value: buildingTypeLabels[object.buildingType] },
                  { label: 'Состояние', value: conditionLabels[object.condition] },
                  { label: 'Балкон', value: object.balcony === 'loggia' ? 'Лоджия' : 'Балкон' },
                ].map((f) => (
                  <div key={f.label}>
                    <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-1">
                      {f.label}
                    </div>
                    <div className="text-sm text-[var(--n15-white)]">{f.value}</div>
                  </div>
                ))}
              </div>

              <OrnamentDivider variant="simple" />

              {/* Description */}
              <div className="my-10">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
                  Описание
                </h2>
                <p className="text-[var(--n15-silver)] leading-relaxed whitespace-pre-line">
                  {object.description}
                </p>
              </div>

              {/* Features list */}
              <div className="mb-10">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
                  Особенности
                </h2>
                <div className="flex flex-wrap gap-2">
                  {object.features.map((f) => (
                    <span
                      key={f}
                      className="text-xs px-3 py-1.5 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                {/* Agent card */}
                <OrnamentBorder cornerOrnament>
                  <div className="p-6">
                    <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-4">
                      Ваш агент
                    </h3>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center">
                        <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                          АК
                        </span>
                      </div>
                      <div>
                        <div className="text-sm text-[var(--n15-white)]">Алан Караев</div>
                        <div className="text-xs text-[var(--n15-muted)]">Ведущий эксперт</div>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" className="w-full mb-2">
                      +7 (8672) 12-34-56
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      Написать в WhatsApp
                    </Button>
                  </div>
                </OrnamentBorder>

                {/* Request form */}
                <div className="mt-6 p-6 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
                  <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-4">
                    Записаться на просмотр
                  </h3>
                  <form className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Ваше имя"
                      className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    />
                    <input
                      type="tel"
                      placeholder="Телефон"
                      className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                    />
                    <textarea
                      placeholder="Сообщение (необязательно)"
                      rows={3}
                      className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50 resize-none"
                    />
                    <Button variant="primary" size="md" className="w-full">
                      Отправить заявку
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

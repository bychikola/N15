import type { FC } from 'react'
import { Button } from '@/components/ui/Button'

export const HeroSection: FC = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[var(--n15-black)]">
      {/* Solar rosette watermark */}
      <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center" style={{ opacity: 0.04 }}>
        <svg width="800" height="800" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="400" cy="400" r="380" stroke="#C8A44E" strokeWidth="1" />
          <circle cx="400" cy="400" r="300" stroke="#C8A44E" strokeWidth="0.7" />
          <circle cx="400" cy="400" r="200" stroke="#C8A44E" strokeWidth="0.5" />
          <circle cx="400" cy="400" r="80" stroke="#C8A44E" strokeWidth="0.3" />
          {/* Radial beams */}
          {[0, 45, 90, 135].map((angle) => (
            <line
              key={angle}
              x1="400"
              y1="400"
              x2={400 + 380 * Math.cos((angle * Math.PI) / 180)}
              y2={400 + 380 * Math.sin((angle * Math.PI) / 180)}
              stroke="#C8A44E"
              strokeWidth="0.5"
            />
          ))}
          {/* Inner rosette petals */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * 45 * Math.PI) / 180
            const cx = 400 + 140 * Math.cos(a)
            const cy = 400 + 140 * Math.sin(a)
            return (
              <circle key={i} cx={cx} cy={cy} r="40" stroke="#C8A44E" strokeWidth="0.4" fill="none" />
            )
          })}
        </svg>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--n15-black)]/20 via-transparent to-[var(--n15-black)] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6 leading-tight tracking-tight">
          Ваш дом —{' '}
          <span className="text-[var(--n15-gold)]">
            наша забота
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-[var(--n15-muted)] max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          N15 — премиальное агентство недвижимости. Мы находим исключительные
          объекты и сопровождаем сделку от поиска до ключей.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="primary" size="lg" href="/catalog">
            Смотреть объекты
          </Button>
          <Button variant="outline" size="lg" href="/contacts">
            Связаться с нами
          </Button>
        </div>

        {/* Stats row */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: '12+', label: 'Лет опыта' },
            { value: '850+', label: 'Сделок' },
            { value: '200+', label: 'Объектов' },
            { value: '98%', label: 'Довольных клиентов' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-gold)] mb-1">
                {stat.value}
              </div>
              <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 animate-bounce">
        <span className="text-[10px] tracking-[0.3em] uppercase text-[var(--n15-gold)]/50">
          Листай вниз
        </span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--n15-gold)]/40">
          <path d="M3 7 L10 14 L17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[var(--n15-black)] to-transparent pointer-events-none" />
    </section>
  )
}

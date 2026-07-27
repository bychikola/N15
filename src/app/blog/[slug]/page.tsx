import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'

export default function BlogPostPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark">
          <div className="max-w-3xl mx-auto">
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">
              Советы
            </span>
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-2 mb-4">
              Как выбрать квартиру в новостройке: полный гид
            </h1>
            <div className="flex items-center gap-4 text-xs text-[var(--n15-muted)] mb-8">
              <span>15 июля 2026</span>
              <span>•</span>
              <span>Алан Караев</span>
              <span>•</span>
              <span>5 мин. чтения</span>
            </div>

            <div className="aspect-[21/9] bg-[var(--n15-charcoal)] mb-10 flex items-center justify-center border border-[var(--n15-gold)]/10">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20">
                <rect x="4" y="8" width="56" height="48" stroke="#C8A44E" strokeWidth="1" />
                <line x1="16" y1="28" x2="48" y2="28" stroke="#C8A44E" strokeWidth="0.5" />
                <line x1="16" y1="36" x2="42" y2="36" stroke="#C8A44E" strokeWidth="0.5" />
              </svg>
            </div>

            <div className="prose prose-invert prose-gold max-w-none">
              <p className="text-[var(--n15-silver)] leading-relaxed mb-6">
                Покупка квартиры в новостройке — ответственный шаг, который требует
                тщательной подготовки. В этом гайде мы разберём все этапы: от выбора
                застройщика до приёмки квартиры.
              </p>

              <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-10 mb-4">
                1. Выбор застройщика
              </h2>
              <p className="text-[var(--n15-silver)] leading-relaxed mb-6">
                Первое, на что стоит обратить внимание — репутация застройщика.
                Изучите его портфолио, почитайте отзывы дольщиков, проверьте
                финансовую отчётность. Надёжный застройщик — основа успешной сделки.
              </p>

              <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-10 mb-4">
                2. Юридическая проверка
              </h2>
              <p className="text-[var(--n15-silver)] leading-relaxed mb-6">
                Проверьте разрешительную документацию, договор долевого участия,
                проектную декларацию. Лучше привлечь независимого юриста —
                это сэкономит вам деньги и нервы в будущем.
              </p>
            </div>

            <OrnamentDivider variant="solar" />

            <div className="text-center">
              <p className="text-[var(--n15-muted)] text-sm mb-4">Понравилась статья? Поделитесь:</p>
              <div className="flex justify-center gap-4">
                {['Telegram', 'WhatsApp', 'VK'].map((s) => (
                  <span key={s} className="text-xs text-[var(--n15-gold)] hover:text-[var(--n15-gold-light)] cursor-pointer transition-colors">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

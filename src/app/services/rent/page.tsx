import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'

export default function RentPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Аренда</h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            Долгосрочная и краткосрочная аренда квартир, домов и коммерческих помещений
          </p>
        </SectionWrapper>
        <SectionWrapper variant="charcoal">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-[var(--n15-silver)] leading-relaxed mb-8">
              Мы работаем только с проверенными собственниками и арендаторами. Проводим юридическую
              проверку договоров аренды и обеспечиваем безопасность сделки для обеих сторон.
            </p>
            <Button variant="primary" href="/catalog?type=rent">Смотреть объекты в аренду</Button>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

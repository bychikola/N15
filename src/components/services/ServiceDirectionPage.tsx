import type { ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { ServicesList, type ServiceItem } from '@/components/services/ServicesList'

interface Cta {
  label: string
  href: string
}

interface ServiceDirectionPageProps {
  title: string
  subtitle: string
  /** Услуги направления — вертикальный список строк с якорями меню шапки */
  items: ServiceItem[]
  /** Дополнительный контент между списком услуг и призывом (шаги и т.п.) */
  children?: ReactNode
  /** Кнопка призыва в конце страницы */
  cta?: Cta
  /** Вторая кнопка рядом с призывом (необязательно) */
  ctaSecond?: Cta
}

// Страница направления раздела «Услуги» (юридические услуги, дизайн
// интерьера, строительство частных домов, оценка): приветствие, список
// услуг направления — каждая строка якорь пункта меню шапки, — затем
// необязательный дополнительный блок и призыв к консультации.
export function ServiceDirectionPage({
  title,
  subtitle,
  items,
  children,
  cta,
  ctaSecond,
}: ServiceDirectionPageProps) {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl mb-8">
            {subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <ServicesList items={items} />
          {children}
          {(cta || ctaSecond) && (
            <div className="mt-12 flex flex-wrap justify-center gap-4">
              {cta && (
                <Button variant="primary" href={cta.href}>{cta.label}</Button>
              )}
              {ctaSecond && (
                <Button variant="outline" href={ctaSecond.href}>{ctaSecond.label}</Button>
              )}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

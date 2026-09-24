import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

/**
 * «Доска объявлений» — новый раздел сайта, ссылка на него стоит в шапке
 * после «Контактов» (см. navLinks в src/components/layout/Header.tsx).
 *
 * Страница заведена пустой: пока это только заголовок в общем оформлении
 * сайта — шапка, первый экран и футер. Содержимое раздела (сами объявления,
 * фильтры, подача) добавим отдельной задачей, чтобы не выдумывать структуру
 * заранее.
 */
export default async function BoardPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.nav.board}
          </h1>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}

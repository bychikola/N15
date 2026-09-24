import { Suspense } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BoardContent } from '@/components/board/BoardContent'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

/**
 * «Доска объявлений» — объявления частных лиц и агентства Н15.
 *
 * Раздел отдельный от каталога объектов: у доски своя база (board-ads),
 * свой маршрут выдачи и своя модерация — каталог агентства не смешивается
 * с объявлениями пользователей (см. src/lib/board.ts).
 *
 * Оболочка страницы простая, как у каталога: заголовок, кнопка «Разместить
 * объявление» и клиентская выдача ниже. Сама выдача — в BoardContent: она
 * живёт в браузере, потому что фильтры держатся в адресе страницы, а данные
 * подгружаются по мере листания.
 */
export default async function BoardPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                {t.board.title}
              </h1>
              <p className="text-[var(--n15-muted)] max-w-xl mt-2">{t.board.subtitle}</p>
            </div>
            <Link
              href={`/${lang}/board/new`}
              className="n15-cta-green inline-flex items-center px-4 py-2.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
            >
              {t.board.placeCta}
            </Link>
          </div>
        </section>
        <section className="bg-[var(--n15-charcoal)] py-8">
          <div className="n15-container">
            {/* BoardContent читает параметры адреса (фильтры, поиск) —
                Suspense нужен, как и в каталоге объектов */}
            <Suspense fallback={<p className="py-20 text-center text-[var(--n15-muted)]">{t.catalog.loading}</p>}>
              <BoardContent />
            </Suspense>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { ReviewsSection } from '@/components/reviews/ReviewsSection'
import { getDictionary } from '@/i18n/dictionaries'
import { loadPublishedReviews } from '@/lib/review-service'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

/**
 * Публичная страница «Отзывы клиентов».
 *
 * Показывает только опубликованные отзывы: всё, что пришло с сайта, сначала
 * ждёт проверки модератором (см. src/lib/reviews.ts), и до решения оно на
 * страницу не попадает. loadPublishedReviews отдаёт уже открытые карточки —
 * имя, оценка, текст, услуга и дата; IP и заметки модератора наружу не уходят.
 *
 * Отсюда же открывается форма «Оставить отзыв»: она собирает минимум данных
 * (имя, оценка, текст и необязательная услуга) и требует согласия на обработку
 * персональных данных.
 */
export default async function ReviewsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const { reviews, stats } = await loadPublishedReviews(payload)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="floral">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.reviews.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-2xl">{t.reviews.pageSubtitle}</p>
        </SectionWrapper>

        {/* Список, сводка и кнопка «Оставить отзыв» — один блок с главной:
            заголовок здесь уже есть в шапке раздела, поэтому не дублируем */}
        <ReviewsSection reviews={reviews} stats={stats} />
      </main>
      <Footer />
    </>
  )
}

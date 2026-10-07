'use client'

import { useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import { reviewsCountLabel } from '@/lib/reviews'
import type { PublicReview, ReviewStats } from '@/lib/review-service'
import { ReviewCard } from './ReviewCard'
import { ReviewForm } from './ReviewForm'

/**
 * Блок «Отзывы клиентов»: сводка (средняя оценка и число отзывов), плитки
 * отзывов и кнопка «Оставить отзыв».
 *
 * Один и тот же блок стоит на главной и на странице /reviews — отличается
 * только тем, сколько отзывов показывать (limit) и давать ли ссылку «Все
 * отзывы» (allHref). Заголовок рисуется, только если его передали: на
 * странице /reviews он уже есть в шапке раздела, дублировать не нужно.
 *
 * Сводку считает сервер по всей опубликованной выдаче (см.
 * loadPublishedReviews), поэтому средняя оценка не зависит от того, сколько
 * карточек попало в блок. Отзывы приходят уже открытыми карточками — ни IP,
 * ни заметок модератора в разметке нет.
 */
export const ReviewsSection: FC<{
  reviews: PublicReview[]
  stats: ReviewStats
  /** Сколько карточек показать (блок на главной); без него — все */
  limit?: number
  /** Ссылка «Все отзывы» — с главной ведёт на страницу раздела */
  allHref?: string
  /** Заголовок блока: на главной — «Отзывы клиентов», на странице — пусто */
  heading?: string
  /** Пояснение под заголовком */
  lead?: string
  /** Оценка «звёздами» в сводке читается вслух этой строкой */
  averageAria?: string
}> = ({ reviews, stats, limit, allHref, heading, lead, averageAria }) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const list = typeof limit === 'number' ? reviews.slice(0, limit) : reviews
  const average = stats.average

  return (
    <section className="n15-section" style={{ background: 'var(--n15-black)' }}>
      <div className="n15-container">
        {heading ? (
          <>
            <h2 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
              {heading}
            </h2>
            {lead ? <p className="max-w-2xl text-[var(--n15-muted)]">{lead}</p> : null}
          </>
        ) : null}

        {/* Сводка: средняя оценка и число отзывов. Показываем, только когда
            есть что считать — пустая «0.0» выглядит как ошибка */}
        {stats.count > 0 && average !== null ? (
          <div className="review-summary">
            <span className="review-summary__score">{average.toFixed(1)}</span>
            <span
              className="review-stars"
              role="img"
              aria-label={(averageAria || t.reviews.averageAria).replace('%s', average.toFixed(1))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={n <= Math.round(average) ? 'review-star review-star--on' : 'review-star'}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </span>
            <span className="review-summary__meta">
              {stats.count} {reviewsCountLabel(stats.count)}
            </span>
          </div>
        ) : null}

        {list.length === 0 ? (
          <div className="review-empty">
            <strong>{t.reviews.empty}</strong>
            <p>{t.reviews.emptyHint}</p>
          </div>
        ) : (
          <div className="review-grid">
            {list.map((review) => (
              <ReviewCard key={review.id} review={review} starAria={t.reviews.starAria} />
            ))}
          </div>
        )}

        <div className="review-actions">
          <Button variant="primary" size="md" onClick={() => setOpen(true)}>
            {t.reviews.leave}
          </Button>
          {allHref ? (
            <Link
              href={allHref}
              className="inline-flex items-center px-5 py-3 text-xs tracking-wider uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/35 hover:border-[var(--n15-gold)] transition-colors"
            >
              {t.reviews.all}
            </Link>
          ) : null}
        </div>
      </div>

      <ReviewForm open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

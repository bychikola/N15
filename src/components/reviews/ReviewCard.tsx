import type { FC } from 'react'
import type { PublicReview } from '@/lib/review-service'
import { ReviewStars } from './ReviewStars'

/**
 * Карточка отзыва на сайте: имя, оценка, текст, дата и — при наличии — подпись
 * услуги («Покупка квартиры», «Продажа дома», «Аренда»). Вёрстка на классах
 * .review-card* из globals.css: плитки блока на главной и списка на странице
 * /reviews выглядят одинаково (§0 ux-ui-rules.md). Персональных данных сверх
 * имени в карточке нет — телефон и адрес форма не собирает.
 */
export const ReviewCard: FC<{ review: PublicReview; starAria?: string }> = ({ review, starAria }) => (
  <article className="review-card">
    <div className="review-card__top">
      <div>
        <ReviewStars value={review.rating} ariaLabel={starAria?.replace('%d', String(review.rating))} />
        <p className="review-card__name">{review.name}</p>
        {review.service ? <span className="review-card__service">{review.service}</span> : null}
      </div>
      {review.date ? (
        <time className="review-card__date" dateTime={review.iso}>
          {review.date}
        </time>
      ) : null}
    </div>
    <p className="review-card__text">{review.text}</p>
  </article>
)

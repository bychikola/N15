import type { FC } from 'react'

/**
 * Оценка звёздами — общий вид для карточки отзыва и формы. Числа нет только
 * у формы до выбора. Смысл передаётся не одним цветом: у ряда стоит
 * aria-label «Оценка N из 5», а звёзды читаются как значки (§6, §13
 * ux-ui-rules.md). Компонент без состояния — годится и в серверной разметке,
 * и в клиентской форме.
 */
export const ReviewStars: FC<{ value: number; className?: string; ariaLabel?: string }> = ({
  value,
  className = '',
  ariaLabel,
}) => (
  <span
    className={`review-stars ${className}`.trim()}
    role="img"
    aria-label={ariaLabel || `Оценка ${value} из 5`}
  >
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={n <= value ? 'review-star review-star--on' : 'review-star'} aria-hidden="true">
        ★
      </span>
    ))}
  </span>
)

'use client'

import type { FC, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { reachGoal, type MetrikaGoal } from '@/lib/metrika'

/**
 * Ссылка с целью Метрики: цель уходит по нажатию, а переход начинается сразу
 * и от аналитики не зависит. Нужна там, где страница — серверный компонент
 * и обработчик на ссылку повесить негде (контакты, реклама, главная).
 */
export const GoalLink: FC<{
  href: string
  goal: MetrikaGoal
  className?: string
  children: ReactNode
}> = ({ href, goal, className, children }) => (
  <a href={href} className={className} onClick={() => reachGoal(goal)}>
    {children}
  </a>
)

/** То же, но во внешнем виде кнопки сайта — кнопка «Позвонить» на /advertising */
export const GoalButton: FC<{
  href: string
  goal: MetrikaGoal
  className?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}> = ({ href, goal, className, variant, size, children }) => (
  <Button href={href} variant={variant} size={size} className={className} onClick={() => reachGoal(goal)}>
    {children}
  </Button>
)

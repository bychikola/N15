'use client'

import { useEffect } from 'react'
import { reachGoal, type MetrikaGoal } from '@/lib/metrika'

/**
 * Цель «страница открыта»: срабатывает при появлении страницы перед
 * посетителем — просмотр /advertising и открытие карточки объекта.
 * Предзагрузка соседних страниц Next'ом компонент не монтирует, поэтому
 * цель не срабатывает на переходах, которых посетитель не видел.
 */
export function GoalOnMount({ goal }: { goal: MetrikaGoal }) {
  useEffect(() => {
    reachGoal(goal)
  }, [goal])

  return null
}

'use client'

import type { FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { OBJECT_CATEGORY_VALUES } from '@/lib/object-categories'

interface Props {
  /** Выбранная категория ('' — «Все»), см. FiltersState.category */
  value: string
  /** Нажатие чипа ставит фильтр по категории */
  onChange: (category: string) => void
}

/**
 * Полоса категорий над выдачей каталога: нажатие ставит фильтр по категории,
 * «Все» — снимает его.
 *
 * Количества объектов у чипов нет намеренно: общее число объектов компании
 * на публичном сайте не показываем. Раньше каталог считал его отдельными
 * запросами к /api/objects (limit=0) на каждую категорию — вместе со счётчиком
 * ушли и эти запросы.
 *
 * Коды категорий берём из общего справочника (src/lib/object-categories.ts),
 * подписи — из словаря (t.categoryLabels): на сайте категории локализованы.
 */
export const CategoryChips: FC<Props> = ({ value, onChange }) => {
  const { t } = useI18n()
  const labels = t.categoryLabels as unknown as Record<string, string>
  // «Все» — первым чипом, дальше категории в порядке справочника (он же
  // порядок enum в базе, см. object-categories.ts)
  const chips = ['', ...OBJECT_CATEGORY_VALUES]

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((code) => {
        const active = value === code
        const label = code === '' ? t.catalog.categoriesAll : labels[code] || code
        return (
          <button
            key={code || 'all'}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className={`inline-flex items-center px-3 py-1.5 text-xs border transition-colors cursor-pointer ${
              active
                ? 'border-[var(--n15-gold)] text-[var(--n15-black)] bg-[var(--n15-gold)]'
                : 'border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)] hover:text-[var(--n15-gold)]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default CategoryChips

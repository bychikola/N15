'use client'

import type { FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { OBJECT_CATEGORY_VALUES } from '@/lib/object-categories'

interface Props {
  /** Выбранная категория ('' — «Все»), см. FiltersState.category */
  value: string
  /** Счётчики объектов по коду категории; all — вся выдача без фильтра
   *  по категории. Считает каталог теми же фильтрами (см. CatalogContent) */
  counts: Record<string, number>
  /** Счётчики пересчитываются — цифры прошлой выдачи не показываем */
  loading: boolean
  /** Нажатие чипа ставит фильтр по категории */
  onChange: (category: string) => void
}

/**
 * Полоса категорий над выдачей каталога: у каждой категории — количество
 * объектов, которые подходят под остальные фильтры (район, цена, комнаты…).
 * Нажатие ставит фильтр по категории, «Все» — снимает его.
 *
 * Коды категорий берём из общего справочника (src/lib/object-categories.ts),
 * подписи — из словаря (t.categoryLabels): на сайте категории локализованы.
 * Категория без объектов показывается приглушённо, но остаётся кликабельной:
 * пустую выдачу объясняет сама страница, а не пропавший чип.
 */
export const CategoryChips: FC<Props> = ({ value, counts, loading, onChange }) => {
  const { t } = useI18n()
  const labels = t.categoryLabels as unknown as Record<string, string>
  // «Все» — первым чипом, дальше категории в порядке справочника (он же
  // порядок enum в базе, см. object-categories.ts)
  const chips = ['', ...OBJECT_CATEGORY_VALUES]

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((code) => {
        const active = value === code
        const count = loading ? null : counts[code || 'all']
        const label = code === '' ? t.catalog.categoriesAll : labels[code] || code
        return (
          <button
            key={code || 'all'}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs border transition-colors cursor-pointer ${
              active
                ? 'border-[var(--n15-gold)] text-[var(--n15-black)] bg-[var(--n15-gold)]'
                : count === 0
                  ? 'border-[var(--n15-gold)]/15 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40'
                  : 'border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)] hover:text-[var(--n15-gold)]'
            }`}
          >
            <span>{label}</span>
            <span className={active ? 'text-[var(--n15-black)]/70' : 'text-[var(--n15-gold)]'}>{count ?? '…'}</span>
          </button>
        )
      })}
    </div>
  )
}

export default CategoryChips

import type { FC } from 'react'

interface Props {
  /** Заголовок блока — из словаря (purchase.common.faqTitle) */
  title: string
  /** Вопросы и ответы страницы: { q, a } */
  items: readonly { q: string; a: string }[]
}

/**
 * Блок «Частые вопросы» страниц «Ипотека и выгодные условия» и «Рассрочка».
 * Раскрывающиеся строки на <details> — как в остальных аккордеонах сайта
 * (см. ServicesAccordion, AboutSection): работает без JavaScript, состояние
 * не нужно хранить, а поисковик видит ответы прямо в разметке.
 *
 * Отвечаем по существу и без обещаний: сроки и ставки называет банк,
 * условия рассрочки — застройщик по конкретному объекту.
 */
export const PurchaseFaq: FC<Props> = ({ title, items }) => (
  <div>
    <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
      {title}
    </h2>
    <div className="border-t border-[var(--n15-gold)]/10">
      {items.map((item) => (
        <details key={item.q} className="group border-b border-[var(--n15-gold)]/10">
          <summary className="flex items-start justify-between gap-4 py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm md:text-base leading-relaxed text-[var(--n15-white)] group-hover:text-[var(--n15-gold)] transition-colors">
              {item.q}
            </h3>
            {/* Плюс поворачивается в крестик у раскрытого вопроса —
                тот же приём, что у аккордеонов на других страницах сайта */}
            <span
              className="mt-0.5 shrink-0 text-base leading-none text-[var(--n15-gold)] transition-transform duration-300 group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <p className="pb-5 pr-8 text-sm leading-relaxed text-[var(--n15-muted)]">{item.a}</p>
        </details>
      ))}
    </div>
  </div>
)

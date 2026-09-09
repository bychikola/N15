// Вертикальный список услуг направления раздела «Услуги». Каждая услуга —
// отдельная строка с якорем: пункты выпадающего меню шапки ссылаются на id
// строки (см. Header.tsx), и страница прокручивается к нужной услуге.
// ВАЖНО: id строки должен совпадать с #ссылкой соответствующего пункта меню.

export interface ServiceItem {
  id: string
  title: string
  text: string
}

interface ServicesListProps {
  items: ServiceItem[]
}

export function ServicesList({ items }: ServicesListProps) {
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={item.id}
          id={item.id}
          className="scroll-mt-28 border-b border-[var(--n15-gold)]/10 py-10 last:border-0"
        >
          <div className="flex flex-col md:flex-row gap-4 md:gap-10">
            <div className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-gold)]/30 md:w-20 shrink-0">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm md:text-base leading-relaxed text-[var(--n15-muted)] max-w-3xl">
                {item.text}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

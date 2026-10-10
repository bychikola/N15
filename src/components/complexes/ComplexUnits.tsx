'use client'

import { useState } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

/**
 * Объекты новостройки в карточке ЖК: машино-места (категория «гараж») и
 * коммерческие помещения. Кнопки «Паркинг» и «Коммерческие помещения»
 * показывают только объекты своего типа, привязанные к этому комплексу
 * (подборку готовит страница комплекса, см. complexes/[id]/page.tsx:
 * коллекция objects, поле complex). Реализованные («Реализован») на страницу
 * не попадают вовсе — в подборке только доступные и забронированные.
 *
 * Если у типа ещё нет объектов, показываем «Предложения скоро появятся» —
 * в общий каталог не отправляем: подборка была бы чужой. Карточки ведут на
 * публичную страницу объекта (slug), где есть полная карточка и планировка.
 */
export interface ComplexUnit {
  id: number
  slug?: string
  title: string
  /** Категория объекта: 'garage' (машино-место) или 'commercial' */
  category: string
  area?: number
  price: number
  /** Варианты покупки (коды, см. src/lib/purchase-options.ts) */
  purchaseOptions?: string[]
  /** Условия оплаты свободным текстом (первоначальный взнос, рассрочка…) */
  paymentTerms?: string
  /** Статус готовности (коды, см. src/lib/complex-units.ts) */
  unitStatus?: string
  /** Фото: card-размер для плитки, alt — подпись */
  photo?: { url: string; alt: string }
  /** Планировка: картинка или PDF (тогда pdf = true) */
  floorPlan?: { url: string; full: string; pdf: boolean }
}

interface Props {
  parking: ComplexUnit[]
  commercial: ComplexUnit[]
  /** Показывать ли кнопку типа: помечен в комплексе или уже есть объекты */
  parkingVisible: boolean
  commercialVisible: boolean
}

/** Плитка-заглушка, когда у объекта нет фото (как в карточке каталога) */
function PhotoPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20 transition-opacity group-hover:opacity-40" aria-hidden="true">
        <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
        <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
      </svg>
    </div>
  )
}

/**
 * Карточка объекта новостройки: фото, статус и цена на обложке; ниже —
 * площадь, способы и условия оплаты и планировка. Классы `.object-card*`
 * общие с плитками каталога и доски, поэтому карточка выглядит как своя
 * (§0 ux-ui-rules).
 */
function UnitCard({ unit, lang }: { unit: ComplexUnit; lang: string }) {
  const { t } = useI18n()
  // Статус: неизвестный код (или пусто) показываем как «Доступен» — объект
  // попал в подборку, значит он не реализован (см. фильтр на странице ЖК)
  const statusKey =
    unit.unitStatus === 'reserved' ? 'reserved' : unit.unitStatus === 'sold' ? 'sold' : 'available'
  const statusLabel = t.units.statuses[statusKey]
  const areaLabel = unit.area
    ? `${unit.area.toLocaleString(t.locale, { maximumFractionDigits: 3 })} ${t.catalog.sqm}`
    : ''
  // Способы оплаты — полными подписями (на обложке каталога им тесно,
  // здесь места достаточно); чужие коды старых записей отбрасываем
  const payments = (unit.purchaseOptions || [])
    .filter((o): o is keyof typeof t.object.purchaseOptions => o in t.object.purchaseOptions)
    .map((o) => t.object.purchaseOptions[o])
  const href = unit.slug ? `/${lang}/catalog/${unit.slug}` : null

  const card = (
    <>
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        {unit.photo ? (
          <img
            src={unit.photo.url}
            alt={unit.photo.alt || unit.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <PhotoPlaceholder />
        )}
        <span className="object-card__pills">
          <span className="object-card__pill">{statusLabel}</span>
        </span>
        <div className="object-card__overlay" />
        <div className="object-card__price-wrap absolute bottom-3 left-4 right-4 z-10">
          <div className="object-card__price text-[30px] leading-tight font-[family-name:var(--font-display)] font-semibold text-[var(--card-price-fg)]">
            {unit.price.toLocaleString(t.locale)} {t.catalog.currency}
          </div>
        </div>
      </div>

      <div className="object-card__body flex flex-1 flex-col px-4 pb-3 pt-3">
        <h3 className="mb-1 text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] transition-colors group-hover:text-[var(--n15-gold)]">
          {unit.title}
        </h3>
        {areaLabel && (
          <p className="object-card__meta mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]">
            {t.units.area}: {areaLabel}
          </p>
        )}
        {payments.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]">
              {t.units.payments}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {payments.map((label) => (
                <span
                  key={label}
                  className="border border-[var(--n15-gold)]/20 px-2 py-1 text-[11px] text-[var(--n15-silver)]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
        {unit.paymentTerms && (
          <p className="mb-2 text-xs leading-relaxed text-[var(--n15-muted)]">
            <span className="text-[var(--n15-gold)]">{t.units.terms}:</span> {unit.paymentTerms}
          </p>
        )}
        {/* Планировка — превью прямо в карточке. Своей ссылкой не оборачиваем:
            вся карточка уже ссылка на страницу объекта, а вложенная ссылка
            внутри ссылки недопустима (полный план и PDF — на странице объекта) */}
        {unit.floorPlan && (
          <div className="mt-auto pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]">
              {unit.floorPlan.pdf ? t.units.planningPdf : t.units.planning}
            </div>
            {!unit.floorPlan.pdf && (
              <img
                src={unit.floorPlan.url}
                alt={`${unit.title} — ${t.units.planning}`}
                loading="lazy"
                className="h-24 w-full border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30 object-contain"
              />
            )}
          </div>
        )}
      </div>
    </>
  )

  // Без slug карточка не открывается — в общий каталог не отправляем,
  // показываем те же сведения некликабельной плиткой
  if (!href) {
    return <div className="object-card group flex h-full flex-col bg-[var(--search-bg)]">{card}</div>
  }
  return (
    <a href={href} className="object-card group flex h-full flex-col bg-[var(--search-bg)]">
      {card}
    </a>
  )
}

/**
 * Раздел объектов новостройки на странице ЖК: переключатель типов (если типов
 * два) и сетка карточек активного типа. Пустой тип показывает строку
 * ожидания вместо сетки. Если показывать нечего и типов нет — раздел не
 * рендерится вовсе (родитель его и не вызовет).
 */
export default function ComplexUnits({ parking, commercial, parkingVisible, commercialVisible }: Props) {
  const { lang, t } = useI18n()
  // Кнопки типов: показываем только те, что заданы (флаг комплекса или
  // наличие объектов), в порядке «паркинг → коммерция»
  const tabs: { key: 'parking' | 'commercial'; label: string; items: ComplexUnit[] }[] = []
  if (parkingVisible) tabs.push({ key: 'parking', label: t.units.parking, items: parking })
  if (commercialVisible) tabs.push({ key: 'commercial', label: t.units.commercial, items: commercial })

  // Активный тип: по умолчанию паркинг, если он есть в списке кнопок
  const [active, setActive] = useState<'parking' | 'commercial'>(parkingVisible ? 'parking' : 'commercial')
  if (tabs.length === 0) return null

  const current = tabs.find((tab) => tab.key === active) || tabs[0]
  const manyTabs = tabs.length > 1
  // Заголовок: при одном типе называем его самого, при двух — раздел целиком
  const title = manyTabs ? t.units.title : tabs[0].label

  return (
    <section className="mb-14">
      <h2 className="mb-4 text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
        {title}
      </h2>

      {manyTabs && (
        <div className="mb-6 inline-flex border border-[var(--n15-gold)]/20">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-pressed={current.key === tab.key}
              className={`cursor-pointer px-4 py-3 text-xs uppercase tracking-wider transition-colors ${
                current.key === tab.key
                  ? 'bg-[var(--n15-gold)] text-[var(--n15-black)]'
                  : 'text-[var(--n15-muted)] hover:text-[var(--n15-gold)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {current.items.length === 0 ? (
        <p className="text-sm text-[var(--n15-muted)]">{t.units.soon}</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {current.items.map((unit) => (
            <UnitCard key={unit.id} unit={unit} lang={lang} />
          ))}
        </div>
      )}
    </section>
  )
}

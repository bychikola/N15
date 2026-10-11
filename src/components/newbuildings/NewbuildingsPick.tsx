'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/i18n-provider'
import type { Dict } from '@/i18n/dictionaries'
import type { NewbuildingRow } from '@/lib/newbuildings-selection'

/**
 * Подбор квартир от застройщиков в разделе «Новостройки»: кнопка «Подбор»
 * раскрывает таблицу. Строки готовит сервер (см. src/lib/newbuildings-selection.ts)
 * — сюда приходят только открытые сведения, связи застройщика и ЖК уже
 * развёрнуты в названия.
 *
 * Столбцы: застройщик, ЖК, дом/корпус, комнатность, площадь, этаж, стоимость,
 * способы оплаты и наличие. Фильтры — по этим же параметрам (главные сразу,
 * диапазоны и оплата — под «Ещё фильтры»). Фильтрация клиентская: подборка
 * невелика и приходит целиком, поэтому пересчёт мгновенный, без запросов.
 *
 * Нажатие на строку открывает карточку квартиры на сайте (slug). Квартиры без
 * slug в подборке остаются, но строкой не открываются — как карточки ЖК
 * (см. ComplexUnits).
 *
 * Мобильная версия — не таблица, а карточки: девять столбцов на 390 px не
 * читаются (§11 ux-ui-rules). Значения полей подписаны теми же ярлыками, что
 * заголовки столбцов.
 */

interface Props {
  rows: NewbuildingRow[]
  /** Спокойная кнопка рядом с «Подбором» — заявка на подбор у агентства */
  secondary?: { label: string; href: string }
}

interface Filters {
  developer: string
  complex: string
  rooms: string
  availability: string
  payment: string
  areaMin: string
  areaMax: string
  floorMin: string
  floorMax: string
  priceMin: string
  priceMax: string
}

const emptyFilters: Filters = {
  developer: '',
  complex: '',
  rooms: '',
  availability: '',
  payment: '',
  areaMin: '',
  areaMax: '',
  floorMin: '',
  floorMax: '',
  priceMin: '',
  priceMax: '',
}

/** Поле фильтра — общий вид каталога (см. CatalogFilters) */
const labelCls = 'mb-1 block text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]'
const inputCls =
  'w-full min-w-0 px-3 py-2 text-base sm:text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

/** Число из поля ввода: пусто и мусор — null (граница не задана) */
const toNum = (value: string): number | null => {
  const n = Number(value.replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(n) ? n : null
}

type PurchaseKey = keyof Dict['object']['purchaseOptions']

export default function NewbuildingsPick({ rows, secondary }: Props) {
  const { lang, t } = useI18n()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [f, setF] = useState<Filters>(emptyFilters)

  const set = (key: keyof Filters, value: string): void =>
    setF((prev) => ({ ...prev, [key]: value }))

  // Справочники фильтров собираем из самих строк: предлагаем только то, что
  // реально есть в подборке (пустых вариантов не показываем)
  const developers = useMemo(() => {
    const map = new Map<number, string>()
    rows.forEach((r) => map.set(r.developerId, r.developerName))
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const complexes = useMemo(() => {
    const map = new Map<number, string>()
    rows.forEach((r) => {
      if (r.complexId !== null) map.set(r.complexId, r.complexName)
    })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const roomsOptions = useMemo(() => {
    const set = new Set<number>()
    rows.forEach((r) => {
      if (r.rooms !== null) set.add(r.rooms)
    })
    return [...set].sort((a, b) => a - b)
  }, [rows])

  const payments = useMemo(() => {
    const set = new Set<PurchaseKey>()
    rows.forEach((r) =>
      r.purchaseOptions.forEach((p) => {
        if (p in t.object.purchaseOptions) set.add(p as PurchaseKey)
      }),
    )
    return [...set]
  }, [rows, t.object.purchaseOptions])

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (f.developer && String(r.developerId) !== f.developer) return false
        if (f.complex && String(r.complexId) !== f.complex) return false
        if (f.rooms && String(r.rooms) !== f.rooms) return false
        if (f.availability && r.unitStatus !== f.availability) return false
        if (f.payment && !r.purchaseOptions.includes(f.payment)) return false
        const areaMin = toNum(f.areaMin)
        if (areaMin !== null && (r.area ?? -1) < areaMin) return false
        const areaMax = toNum(f.areaMax)
        if (areaMax !== null && (r.area ?? Infinity) > areaMax) return false
        const floorMin = toNum(f.floorMin)
        if (floorMin !== null && (r.floor ?? -1) < floorMin) return false
        const floorMax = toNum(f.floorMax)
        if (floorMax !== null && (r.floor ?? Infinity) > floorMax) return false
        const priceMin = toNum(f.priceMin)
        if (priceMin !== null && r.price < priceMin) return false
        const priceMax = toNum(f.priceMax)
        if (priceMax !== null && r.price > priceMax) return false
        return true
      }),
    [rows, f],
  )

  const isActive = Object.values(f).some((v) => v !== '')
  const pick = t.newbuildingsPick

  const fmt = (n: number): string => n.toLocaleString(t.locale)
  const roomsLabel = (r: NewbuildingRow): string =>
    r.rooms === null ? pick.nope : r.rooms === 0 ? pick.studio : `${r.rooms} ${pick.roomsSuffix}`
  const areaLabel = (r: NewbuildingRow): string =>
    r.area === null ? pick.nope : `${fmt(r.area)} ${t.catalog.sqm}`
  const floorLabel = (r: NewbuildingRow): string => {
    if (r.floor === null && r.totalFloors === null) return pick.nope
    if (r.floor !== null && r.totalFloors !== null) return `${r.floor} ${pick.of} ${r.totalFloors}`
    return String(r.floor ?? r.totalFloors)
  }
  const priceLabel = (r: NewbuildingRow): string => `${fmt(r.price)} ${t.catalog.currency}`
  const paymentLabel = (r: NewbuildingRow): string => {
    const labels = r.purchaseOptions
      .filter((p): p is PurchaseKey => p in t.object.purchaseOptions)
      .map((p) => t.object.purchaseOptions[p])
    return labels.length ? labels.join(', ') : pick.nope
  }
  const availabilityLabel = (r: NewbuildingRow): string => t.units.statuses[r.unitStatus]

  return (
    <div className="w-full">
      <div className="flex flex-wrap justify-center gap-4">
        <Button
          variant="primary"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="newbuildings-pick"
        >
          {pick.cta}
        </Button>
        {secondary && (
          <Button variant="outline" href={secondary.href}>
            {secondary.label}
          </Button>
        )}
      </div>

      {open && (
        <section
          id="newbuildings-pick"
          className="mt-10 text-left"
          aria-label={pick.title}
        >
          <h2 className="mb-2 text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
            {pick.title}
          </h2>
          <p className="mb-6 max-w-3xl text-sm text-[var(--n15-muted)]">{pick.lead}</p>

          {/* Панель фильтров: главные поля сразу, диапазоны и оплата — под
              «Ещё фильтры» (в первом ряду не больше 4–5 полей, §1 ux-ui-rules) */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="pick-developer">
                {pick.developer}
              </label>
              <select
                id="pick-developer"
                className={inputCls}
                value={f.developer}
                onChange={(e) => setF((prev) => ({ ...prev, developer: e.target.value, complex: '' }))}
              >
                <option value="">{pick.any}</option>
                {developers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pick-complex">
                {pick.complex}
              </label>
              <select
                id="pick-complex"
                className={inputCls}
                value={f.complex}
                onChange={(e) => set('complex', e.target.value)}
              >
                <option value="">{pick.any}</option>
                {complexes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pick-rooms">
                {pick.rooms}
              </label>
              <select
                id="pick-rooms"
                className={inputCls}
                value={f.rooms}
                onChange={(e) => set('rooms', e.target.value)}
              >
                <option value="">{pick.any}</option>
                {roomsOptions.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? pick.studio : `${n} ${pick.roomsSuffix}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pick-availability">
                {pick.availability}
              </label>
              <select
                id="pick-availability"
                className={inputCls}
                value={f.availability}
                onChange={(e) => set('availability', e.target.value)}
              >
                <option value="">{pick.any}</option>
                <option value="available">{t.units.statuses.available}</option>
                <option value="reserved">{t.units.statuses.reserved}</option>
              </select>
            </div>
          </div>

          {showMore && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className={labelCls}>{pick.areaRange}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={inputCls}
                    value={f.areaMin}
                    onChange={(e) => set('areaMin', e.target.value)}
                    placeholder={pick.from}
                    aria-label={`${pick.areaRange}: ${pick.from}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    className={inputCls}
                    value={f.areaMax}
                    onChange={(e) => set('areaMax', e.target.value)}
                    placeholder={pick.to}
                    aria-label={`${pick.areaRange}: ${pick.to}`}
                  />
                </div>
              </div>
              <div>
                <span className={labelCls}>{pick.floorRange}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    value={f.floorMin}
                    onChange={(e) => set('floorMin', e.target.value)}
                    placeholder={pick.from}
                    aria-label={`${pick.floorRange}: ${pick.from}`}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    value={f.floorMax}
                    onChange={(e) => set('floorMax', e.target.value)}
                    placeholder={pick.to}
                    aria-label={`${pick.floorRange}: ${pick.to}`}
                  />
                </div>
              </div>
              <div>
                <span className={labelCls}>{pick.priceRange}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    value={f.priceMin}
                    onChange={(e) => set('priceMin', e.target.value)}
                    placeholder={pick.from}
                    aria-label={`${pick.priceRange}: ${pick.from}`}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    value={f.priceMax}
                    onChange={(e) => set('priceMax', e.target.value)}
                    placeholder={pick.to}
                    aria-label={`${pick.priceRange}: ${pick.to}`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="pick-payment">
                  {pick.payment}
                </label>
                <select
                  id="pick-payment"
                  className={inputCls}
                  value={f.payment}
                  onChange={(e) => set('payment', e.target.value)}
                >
                  <option value="">{pick.any}</option>
                  {payments.map((p) => (
                    <option key={p} value={p}>
                      {t.object.purchaseOptions[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="cursor-pointer text-xs uppercase tracking-wider text-[var(--n15-gold)] transition-colors hover:text-[var(--n15-gold)]/80"
            >
              {showMore ? pick.less : pick.more}
            </button>
            {isActive && (
              <button
                type="button"
                onClick={() => setF(emptyFilters)}
                className="cursor-pointer text-xs uppercase tracking-wider text-[var(--n15-muted)] transition-colors hover:text-[var(--n15-gold)]"
              >
                {pick.reset}
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="border border-[var(--n15-gold)]/10 p-8 text-center">
              <p className="text-[var(--n15-white)]">{pick.empty}</p>
              <p className="mt-2 text-sm text-[var(--n15-muted)]">{pick.emptyHint}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-[var(--n15-gold)]/10 p-8 text-center">
              <p className="text-[var(--n15-white)]">{pick.emptyFiltered}</p>
              <p className="mt-2 text-sm text-[var(--n15-muted)]">{pick.emptyFilteredHint}</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-[var(--n15-muted)]">
                {pick.found.replace('%d', String(filtered.length))}
              </p>

              {/* Десктоп — таблица; на телефоне — карточки (ниже) */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{pick.title}</caption>
                  <thead>
                    <tr className="border-b border-[var(--n15-gold)]/20 text-left">
                      {[
                        pick.columns.developer,
                        pick.columns.complex,
                        pick.columns.building,
                        pick.columns.rooms,
                        pick.columns.area,
                        pick.columns.floor,
                        pick.columns.price,
                        pick.columns.payment,
                        pick.columns.availability,
                      ].map((head) => (
                        <th
                          key={head}
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]"
                        >
                          {head}
                        </th>
                      ))}
                      <th scope="col" className="w-px px-3 py-3">
                        <span className="sr-only">{pick.open}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const href = r.slug ? `/${lang}/catalog/${r.slug}` : null
                      return (
                        <tr
                          key={r.id}
                          onClick={href ? () => router.push(href) : undefined}
                          className={`border-b border-[var(--n15-gold)]/10 align-top transition-colors ${
                            href ? 'cursor-pointer hover:bg-[var(--n15-gold)]/5' : ''
                          }`}
                        >
                          <td className="px-3 py-3 text-[var(--n15-silver)]">{r.developerName}</td>
                          <td className="px-3 py-3 text-[var(--n15-white)]">
                            {r.complexName || pick.nope}
                          </td>
                          <td className="px-3 py-3 text-[var(--n15-silver)]">{r.building || pick.nope}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[var(--n15-silver)]">{roomsLabel(r)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[var(--n15-silver)]">{areaLabel(r)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[var(--n15-silver)]">{floorLabel(r)}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                            {priceLabel(r)}
                          </td>
                          <td className="px-3 py-3 text-[var(--n15-silver)]">{paymentLabel(r)}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className="text-[var(--n15-gold)]">{availabilityLabel(r)}</span>
                          </td>
                          <td className="px-3 py-3">
                            {href && (
                              <Link
                                href={href}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`${pick.open}: ${r.title}`}
                                className="text-[var(--n15-gold)] transition-colors hover:text-[var(--n15-gold)]/70"
                              >
                                →
                              </Link>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Телефон: карточка на квартиру, вся карточка — ссылка */}
              <div className="flex flex-col gap-3 md:hidden">
                {filtered.map((r) => {
                  const href = r.slug ? `/${lang}/catalog/${r.slug}` : null
                  const fields: [string, string][] = [
                    [pick.columns.developer, r.developerName],
                    [pick.columns.complex, r.complexName || pick.nope],
                    [pick.columns.building, r.building || pick.nope],
                    [pick.columns.rooms, roomsLabel(r)],
                    [pick.columns.area, areaLabel(r)],
                    [pick.columns.floor, floorLabel(r)],
                    [pick.columns.price, priceLabel(r)],
                    [pick.columns.payment, paymentLabel(r)],
                    [pick.columns.availability, availabilityLabel(r)],
                  ]
                  const body = (
                    <>
                      <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg text-[var(--n15-white)]">
                        {r.title || r.complexName || r.developerName}
                      </h3>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                        {fields.map(([label, value]) => (
                          <div key={label} className="contents">
                            <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--n15-muted)]">
                              {label}
                            </dt>
                            <dd className="text-[var(--n15-silver)]">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )
                  return href ? (
                    <Link
                      key={r.id}
                      href={href}
                      className="block border border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/20 p-4 transition-colors hover:border-[var(--n15-gold)]/40"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={r.id} className="border border-[var(--n15-gold)]/15 bg-[var(--n15-black)]/20 p-4">
                      {body}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}

'use client'

import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useI18n } from '@/i18n/i18n-provider'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import CatalogFilters, { buildWhere, emptyFilters, type FiltersState } from '@/components/objects/CatalogFilters'

const PAGE_SIZE = 12

// Имена URL-параметров фильтров. Цены и площади — отдельные ключи
// (price_min, area_max…), по которым фильтры читаются и внешними ссылками
// (футер, разделы главной), поэтому пишем в URL те же имена, что читаем.
const URL_PARAM: Record<keyof FiltersState, string> = {
  type: 'type',
  category: 'category',
  rooms: 'rooms',
  priceMin: 'price_min',
  priceMax: 'price_max',
  areaMin: 'area_min',
  areaMax: 'area_max',
  areaUnit: 'area_unit',
  district: 'district',
  cityDistrict: 'cityDistrict',
  locality: 'locality',
  snt: 'snt',
}

const filtersFromParams = (sp: URLSearchParams): FiltersState => ({
  type: sp.get('type') ?? '',
  category: sp.get('category') ?? '',
  rooms: sp.get('rooms') ?? '',
  priceMin: sp.get('price_min') ?? '',
  priceMax: sp.get('price_max') ?? '',
  areaMin: sp.get('area_min') ?? '',
  areaMax: sp.get('area_max') ?? '',
  areaUnit: sp.get('area_unit') === 'are' ? 'are' : sp.get('area_unit') === 'sqm' ? 'sqm' : '',
  district: sp.get('district') ?? '',
  cityDistrict: sp.get('cityDistrict') ?? '',
  locality: sp.get('locality') ?? '',
  snt: sp.get('snt') ?? '',
})

function CatalogContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang, t } = useI18n()

  const [objects, setObjects] = useState<ObjectListItem[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? '')
  const [filters, setFilters] = useState<FiltersState>(() => filtersFromParams(searchParams))

  const where = useMemo(() => buildWhere(filters, q), [filters, q])
  const sortParam = sort || '-createdAt'

  // Debounced search: write q to URL after 300ms (only q — filters/sort handled below)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q) {
        params.set('q', q)
      } else {
        params.delete('q')
      }
      params.delete('page')
      router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [q, lang, router, searchParams])

  // Sync filter/sort changes to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(filters).forEach(([k, v]) => {
      const param = URL_PARAM[k as keyof FiltersState]
      if (v) {
        params.set(param, v)
      } else {
        params.delete(param)
      }
    })
    if (sort) {
      params.set('sort', sort)
    } else {
      params.delete('sort')
    }
    params.delete('page')
    router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
  }, [filters, sort, lang, router, searchParams])

  // Чтение изменений URL извне (ссылки футера «Купить/Квартиры/…», шаринг-ссылки).
  // Паттерн React «adjusting state when props change» — setState во время рендера,
  // а не в эффекте (правило react-hooks/set-state-in-effect).
  // q не трогаем: он живёт в state и пишется в URL с debounce — иначе ввод ломается.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams)
  if (prevSearchParams !== searchParams) {
    setPrevSearchParams(searchParams)
    const next: FiltersState = filtersFromParams(searchParams)
    setFilters((prev) =>
      Object.entries(next).every(([k, v]) => prev[k as keyof FiltersState] === v)
        ? prev
        : next,
    )
    const nextSort = searchParams.get('sort') ?? ''
    setSort((prev) => (prev === nextSort ? prev : nextSort))
  }

  const mapDocs = (d: Record<string, unknown>): ObjectListItem => ({
    id: d.id as number,
    title: d.title as string,
    type: d.type as 'sale' | 'rent',
    category: d.category as string,
    price: d.price as number,
    slug: d.slug as string | undefined,
    area: d.area as number | undefined,
    areaUnit: d.areaUnit as ObjectListItem['areaUnit'],
    rooms: d.rooms as number | undefined,
    floor: d.floor as number | undefined,
    totalFloors: d.totalFloors as number | undefined,
    address: d.address as ObjectListItem['address'],
    primaryImage: (d.primaryImage && typeof d.primaryImage === 'object'
      ? d.primaryImage
      : undefined) as ObjectListItem['primaryImage'],
    agent: d.agent as ObjectListItem['agent'],
  })

  // (re)load first page on filter/sort/search change.
  // All setState calls happen after await, so no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: '1', depth: '2', sort: sortParam })
        if (Object.keys(where).length) params.set('where', JSON.stringify(where))
        const res = await fetch(`/api/objects?${params}`, { credentials: 'include' })
        const data = await res.json()
        if (cancelled) return
        setObjects((data.docs || []).map(mapDocs))
        setTotalDocs(data.totalDocs ?? 0)
        setPage(1)
      } catch {
        if (!cancelled) setObjects([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [where, sortParam])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page + 1), depth: '2', sort: sortParam })
      if (Object.keys(where).length) params.set('where', JSON.stringify(where))
      const res = await fetch(`/api/objects?${params}`, { credentials: 'include' })
      const data = await res.json()
      setObjects((prev) => [...prev, ...(data.docs || []).map(mapDocs)])
      setTotalDocs(data.totalDocs ?? 0)
      setPage(page + 1)
    } finally {
      setLoadingMore(false)
    }
  }, [where, sortParam, page])

  const onChangeFilters = useCallback((patch: Partial<FiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setLoading(true)
  }, [])

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean) || q !== '', [filters, q])
  const showMore = objects.length < totalDocs

  return (
    <section className="bg-[var(--n15-charcoal)] py-8">
      <div className="n15-container">
      {/* Search pill */}
      <div className="catalog-search max-w-xl mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--n15-muted)] shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setLoading(true) }}
          placeholder={t.catalog.searchPlaceholder}
          aria-label={t.catalog.searchPlaceholder}
        />
      </div>

      <CatalogFilters state={filters} onChange={onChangeFilters} t={t} />

      {/* Count + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 my-4">
        <p className="text-xs text-[var(--n15-muted)]">
          {t.catalog.found} <span className="text-[var(--n15-gold)]">{loading ? '...' : totalDocs}</span> {t.catalog.foundObjects}
          {hasFilters && (
            <button onClick={() => { setFilters(emptyFilters); setQ(''); setSort('') }}
              className="ml-4 text-[var(--n15-gold)] underline">
              {t.catalog.resetFilters}
            </button>
          )}
        </p>
        <label className="text-xs text-[var(--n15-muted)] flex items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] uppercase">{t.catalog.sortDefault.split(':')[0]}:</span>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setLoading(true) }}
            className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 px-3 py-2 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50"
          >
            <option value="">{t.catalog.sortDefault}</option>
            <option value="price">{t.catalog.sortPriceAsc}</option>
            <option value="-price">{t.catalog.sortPriceDesc}</option>
            <option value="-area">{t.catalog.sortAreaDesc}</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-center py-20 text-[var(--n15-muted)]">{t.catalog.loading}</p>
      ) : objects.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
            {objects.map((obj) => <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />)}
          </div>
          {showMore && (
            <div className="text-center mt-12">
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-6 py-3 text-sm uppercase tracking-wider border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loadingMore ? t.common.loading : t.catalog.showMore}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--n15-muted)] text-lg mb-4">{t.catalog.nothingFound}</p>
          <button onClick={() => { setFilters(emptyFilters); setQ(''); setSort('') }}
            className="text-sm text-[var(--n15-gold)] underline">
            {t.catalog.resetAll}
          </button>
        </div>
      )}
      </div>
    </section>
  )
}

export default function CatalogPage() {
  const { t } = useI18n()
  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.catalog.title}</h1>
            <p className="text-[var(--n15-muted)] max-w-xl mt-2">{t.catalog.subtitle}</p>
          </div>
        </section>
        <Suspense fallback={<section className="bg-[var(--n15-charcoal)] py-8"><p className="text-[var(--n15-muted)] text-center py-20">{t.catalog.loading}</p></section>}>
          <CatalogContent />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

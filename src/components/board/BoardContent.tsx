'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import { BoardAdCard } from '@/components/board/BoardAdCard'
import {
  BoardFilters,
  emptyBoardFilters,
  hasBoardFilters,
  type BoardFiltersState,
} from '@/components/board/BoardFilters'
import type { BoardListItem } from '@/lib/board-list-item'

/**
 * Выдача доски объявлений: поиск, фильтры, карточки и подгрузка следующих
 * страниц.
 *
 * Устроено как каталог объектов (см. src/components/objects/CatalogContent.tsx):
 * состояние фильтров живёт в адресе страницы, поэтому ссылкой можно поделиться;
 * поиск пишется в адрес с задержкой 300 мс; следующая страница — кнопкой
 * «Показать ещё». Отличие одно: у доски свои имена параметров и свой маршрут
 * (/api/board/ads), который собирает where на сервере — в браузере условий
 * запроса не видно вовсе, потому что в объявлении лежит телефон автора.
 */

const PAGE_SIZE = 12
const SORTS = ['new', 'cheap', 'expensive'] as const

/** Фильтры из адреса страницы: чужие значения молча отбрасываем */
function filtersFromParams(sp: URLSearchParams): BoardFiltersState {
  const districtParam = sp.get('city_district') || ''
  const repParam = sp.get('district') || ''
  const author = sp.get('author') || ''
  return {
    type: ['sale', 'rent'].includes(sp.get('type') || '') ? (sp.get('type') as string) : '',
    category: sp.get('category') || '',
    rooms: sp.get('rooms') || '',
    priceMin: sp.get('price_min') || '',
    priceMax: sp.get('price_max') || '',
    areaMin: sp.get('area_min') || '',
    areaMax: sp.get('area_max') || '',
    floorMin: sp.get('floor_min') || '',
    floorMax: sp.get('floor_max') || '',
    // Район в списке один, а параметров два: городской и район республики.
    // Префикс в состоянии (city: / rep:) показывает, куда его писать
    district: districtParam ? `city:${districtParam}` : repParam ? `rep:${repParam}` : '',
    authorKind: ['private', 'agency'].includes(author) ? author : '',
  }
}

/** Параметры запроса к /api/board/ads из состояния фильтров */
function queryParams(f: BoardFiltersState, q: string, sort: string, page: number): string {
  const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
  if (f.type) p.set('type', f.type)
  if (f.category) p.set('category', f.category)
  if (f.rooms) p.set('rooms', f.rooms)
  if (f.priceMin) p.set('price_min', f.priceMin)
  if (f.priceMax) p.set('price_max', f.priceMax)
  if (f.areaMin) p.set('area_min', f.areaMin)
  if (f.areaMax) p.set('area_max', f.areaMax)
  if (f.floorMin) p.set('floor_min', f.floorMin)
  if (f.floorMax) p.set('floor_max', f.floorMax)
  if (f.district.startsWith('city:')) p.set('city_district', f.district.slice(5))
  else if (f.district.startsWith('rep:')) p.set('district', f.district.slice(4))
  if (f.authorKind) p.set('author', f.authorKind)
  if (q.trim()) p.set('q', q.trim())
  if (sort) p.set('sort', sort)
  return p.toString()
}

interface BoardContentProps {
  /** Сколько объявлений на доске — для пустого состояния «пока ничего нет» */
  initialTotal?: number
}

export function BoardContent({ initialTotal = 0 }: BoardContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang, t } = useI18n()

  const [ads, setAds] = useState<BoardListItem[]>([])
  const [totalDocs, setTotalDocs] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [sort, setSort] = useState(() => {
    const v = searchParams.get('sort') ?? 'new'
    return (SORTS as readonly string[]).includes(v) ? v : 'new'
  })
  const [filters, setFilters] = useState<BoardFiltersState>(() => filtersFromParams(searchParams))
  const [openId, setOpenId] = useState('')

  // Поиск пишем в адрес с задержкой: текст вводят посимвольно
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q) params.set('q', q)
      else params.delete('q')
      params.delete('page')
      router.replace(`/${lang}/board?${params.toString()}`, { scroll: false })
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [q, lang, router, searchParams])

  // Фильтры и сортировка — в адрес сразу: их выбирают одним нажатием.
  // Район пишем в один из двух параметров, второй убираем — иначе в ссылке
  // остался бы прежний район
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, param] of Object.entries({
      type: 'type',
      category: 'category',
      rooms: 'rooms',
      priceMin: 'price_min',
      priceMax: 'price_max',
      areaMin: 'area_min',
      areaMax: 'area_max',
      floorMin: 'floor_min',
      floorMax: 'floor_max',
      authorKind: 'author',
    })) {
      const v = filters[key as keyof BoardFiltersState]
      if (v) params.set(param, v)
      else params.delete(param)
    }
    params.delete('city_district')
    params.delete('district')
    if (filters.district.startsWith('city:')) params.set('city_district', filters.district.slice(5))
    else if (filters.district.startsWith('rep:')) params.set('district', filters.district.slice(4))
    if (sort) params.set('sort', sort)
    else params.delete('sort')
    params.delete('page')
    router.replace(`/${lang}/board?${params.toString()}`, { scroll: false })
  }, [filters, sort, lang, router, searchParams])

  // Изменения адреса извне (ссылка с фильтрами) — читаем в состояние.
  // Паттерн React «adjusting state when props change»: setState во время
  // рендера, а не в эффекте. q не трогаем — он уже в состоянии и пишется
  // в адрес с задержкой, иначе ввод ломался бы
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams)
  if (prevSearchParams !== searchParams) {
    setPrevSearchParams(searchParams)
    const next = filtersFromParams(searchParams)
    setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    const rawSort = searchParams.get('sort') ?? 'new'
    const nextSort = (SORTS as readonly string[]).includes(rawSort) ? rawSort : 'new'
    setSort((prev) => (prev === nextSort ? prev : nextSort))
  }

  // Фильтры или поиск поменялись — грузим первую страницу заново.
  // Состояния здесь не выставляем синхронно (правило
  // react-hooks/set-state-in-effect): «идёт загрузка» показывают обработчики
  // фильтров и поиска, а тут состояние меняется только после ответа сервера
  useEffect(() => {
    let cancelled = false
    fetch(`/api/board/ads?${queryParams(filters, q, sort, 1)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setAds(Array.isArray(data?.docs) ? data.docs : [])
        setTotalDocs(Number(data?.totalDocs) || 0)
        setPage(1)
      })
      .catch(() => {
        if (!cancelled) setAds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, q, sort])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const data = await fetch(`/api/board/ads?${queryParams(filters, q, sort, page + 1)}`).then((r) => r.json())
      setAds((prev) => [...prev, ...(Array.isArray(data?.docs) ? data.docs : [])])
      setTotalDocs(Number(data?.totalDocs) || 0)
      setPage((p) => p + 1)
    } catch {
      // Не удалось — кнопка останется, человек попробует ещё раз
    } finally {
      setLoadingMore(false)
    }
  }, [filters, q, sort, page])

  const showMore = ads.length < totalDocs
  const filtersActive = hasBoardFilters(filters) || Boolean(q.trim())

  // «Идёт загрузка» показываем сразу при смене условий — иначе на экране
  // секунду висела бы прошлая выдача (см. комментарий у эффекта выше)
  const applyFilters = (next: BoardFiltersState) => {
    setLoading(true)
    setFilters(next)
  }
  const applyQuery = (value: string) => {
    setLoading(true)
    setQ(value)
  }
  const applySort = (value: string) => {
    setLoading(true)
    setSort(value)
  }

  return (
    <div>
      {/* Поиск, сортировка и счётчик найденного */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => applyQuery(e.target.value)}
          placeholder={t.board.searchPlaceholder}
          className="catalog-search flex-1 min-w-[260px] px-4 py-2.5 text-sm bg-[var(--search-bg)] text-[var(--n15-white)] placeholder:text-[var(--n15-muted)] outline-none"
        />
        <select
          value={sort}
          onChange={(e) => applySort(e.target.value)}
          aria-label={t.board.sortLabel}
          className="px-3 py-2.5 text-xs tracking-wider uppercase bg-[var(--n15-charcoal)] text-[var(--n15-silver)] border border-[var(--n15-gold)]/20 outline-none cursor-pointer"
        >
          <option value="new">{t.board.sortNew}</option>
          <option value="cheap">{t.board.sortCheap}</option>
          <option value="expensive">{t.board.sortExpensive}</option>
        </select>
        <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)]">
          {t.board.found.replace('%d', String(totalDocs))}
        </span>
      </div>

      <div className="mb-6">
        <BoardFilters
          t={t}
          state={filters}
          onChange={applyFilters}
          openId={openId}
          onOpen={setOpenId}
          onClose={() => setOpenId('')}
        />
      </div>

      {loading ? (
        <p className="py-20 text-center text-[var(--n15-muted)]">{t.catalog.loading}</p>
      ) : !ads.length ? (
        <div className="py-20 text-center">
          <p className="text-[var(--n15-muted)] mb-4">{filtersActive ? t.catalog.nothingFound : t.board.empty}</p>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                applyFilters(emptyBoardFilters)
                applyQuery('')
              }}
              className="px-4 py-2.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer"
            >
              {t.catalog.resetAll}
            </button>
          ) : (
            <p className="text-sm text-[var(--n15-muted)] max-w-xl mx-auto leading-relaxed">{t.board.emptyText}</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
            {ads.map((ad) => (
              <BoardAdCard key={ad.id} ad={ad} lang={lang} t={t} />
            ))}
          </div>

          {showMore && (
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-6 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? t.catalog.loading : t.catalog.showMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

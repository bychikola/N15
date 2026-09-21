'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import CatalogFilters, { buildWhere, cityValuesFor, regionValuesFor, emptyFilters, purchaseValues, AGENT_URL_PARAM, OBJECT_TYPES, OBJECT_CATEGORIES, OBJECT_HEATING, OBJECT_ROOMS, OBJECT_BUILDING, OBJECT_GAS, type FiltersState } from '@/components/objects/CatalogFilters'
import { HOUSE_TYPE_VALUES, houseTypeCategory } from '@/lib/object-categories'
import { COMMERCIAL_TYPE_VALUES } from '@/lib/commercial-types'
import CategoryChips from '@/components/objects/CategoryChips'
import CatalogMap from '@/components/objects/CatalogMap'
import { LeadForm } from '@/components/forms/LeadForm'
// Справочники допустимых значений локаций — те же, что в фильтрах каталога
import { DISTRICT_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
import { SNT_AREAS } from '@/components/home/landing-data'
// Иерархия фильтра «Город»: регионы с населёнными пунктами (см. city-filter.ts)
import type { CityFilterRegion } from '@/lib/city-filter'
import { objectToListItem } from '@/lib/object-list-item'

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
  city: 'city',
  cityRegion: 'city_region',
  floorMin: 'floor_min',
  floorMax: 'floor_max',
  floorsMin: 'floors_min',
  floorsMax: 'floors_max',
  heating: 'heating',
  // Характеристики объекта (второй ряд панели фильтров): улица, жилая площадь,
  // площадь кухни, материал дома, газ и признаки «есть»
  street: 'street',
  livingAreaMin: 'living_area_min',
  livingAreaMax: 'living_area_max',
  kitchenAreaMin: 'kitchen_area_min',
  kitchenAreaMax: 'kitchen_area_max',
  building: 'building',
  gas: 'gas',
  individualHeating: 'individual_heating',
  elevator: 'elevator',
  closedYard: 'closed_yard',
  // Подкатегории: тип дома и тип коммерции (см. object-categories, commercial-types)
  houseType: 'house_type',
  commercialType: 'commercial_type',
  // Кадастровый номер участка (см. cadastral в FiltersState)
  cadastral: 'cadastral',
  agent: AGENT_URL_PARAM,
  purchase: 'purchase',
}

// Значения select-фильтров сверяем с опциями полей (списки и зачем — см.
// CatalogFilters): чужие значения устаревших ссылок отбрасываем при чтении.
// Города межрегионального справочника приходят из CRM (knownCities);
// у участков список городов свой — только Владикавказ (cityValuesFor).
const isKnown = (v: string, options: readonly string[]) => options.includes(v)

/** Единицы площади фильтра участков: м², сотки, гектары (см. area-format) */
const AREA_UNITS = ['sqm', 'are', 'ha'] as const

/** Варианты сортировки выдачи: пустое значение — порядок подборки
 *  («Актуальные объекты»), оно же выбранное явно «По дате публикации»
 *  (каталог сортирует по -createdAt, см. sortParam). Сортировок по цене и
 *  площади в списке больше нет — чужие значения устаревших ссылок
 *  отбрасываем, как у прочих select-фильтров */
const SORT_VALUES = ['', '-createdAt'] as const

function filtersFromParams(sp: URLSearchParams, cityRegions: readonly CityFilterRegion[], knownCities: readonly string[]): FiltersState {
  // Район города (Иристонский и др.) старые ссылки могли передавать
  // в параметре district — такой параметр направляем в cityDistrict
  const districtParam = sp.get('district') ?? ''
  const cityDistrictParam = sp.get('cityDistrict') ?? ''
  const legacyCityDistrict = !cityDistrictParam && isKnown(districtParam, CITY_DISTRICT_OPTIONS)
  // Категория нужна раньше города: её список городов зависит от категории
  const rawCategory = isKnown(sp.get('category') ?? '', OBJECT_CATEGORIES) ? (sp.get('category') as string) : ''
  // Подкатегория дома категорию и задаёт (та же очерёдность, что в buildWhere):
  // ссылка «Дачи» открывает каталог с категорией «Дача», а не с пустым «Типом»
  const houseType = isKnown(sp.get(URL_PARAM.houseType) ?? '', HOUSE_TYPE_VALUES) ? (sp.get(URL_PARAM.houseType) as string) : ''
  const category = houseType ? (houseTypeCategory(houseType) ?? rawCategory) : rawCategory
  // Тип коммерции: у объектов других категорий поля нет (там его фильтр молча
  // ничего не находит) — чужое значение отбрасываем, а пустую категорию он
  // задаёт сам
  const commercialParam = sp.get(URL_PARAM.commercialType) ?? ''
  const commercialType = isKnown(commercialParam, COMMERCIAL_TYPE_VALUES) && (!category || category === 'commercial') ? commercialParam : ''
  const resolvedCategory = commercialType && !category ? 'commercial' : category
  const cityParam = sp.get('city') ?? ''
  // Регион фильтра «Город» («все населённые пункты региона») — отдельный
  // параметр: в city лежит город или населённый пункт, здесь — ключ региона
  const cityRegionParam = sp.get(URL_PARAM.cityRegion) ?? ''
  return {
    type: isKnown(sp.get('type') ?? '', OBJECT_TYPES) ? (sp.get('type') as string) : '',
    category: resolvedCategory,
    houseType,
    commercialType,
    rooms: isKnown(sp.get('rooms') ?? '', OBJECT_ROOMS) ? (sp.get('rooms') as string) : '',
    priceMin: sp.get('price_min') ?? '',
    priceMax: sp.get('price_max') ?? '',
    areaMin: sp.get('area_min') ?? '',
    areaMax: sp.get('area_max') ?? '',
    // Единица площади участка: '' — не выбрана (м²), иначе м²/сотки/га;
    // чужие значения устаревших ссылок отбрасываем, как у прочих select-фильтров
    areaUnit: isKnown(sp.get('area_unit') ?? '', AREA_UNITS) ? (sp.get('area_unit') as FiltersState['areaUnit']) : '',
    district: !legacyCityDistrict && isKnown(districtParam, DISTRICT_OPTIONS) ? districtParam : '',
    cityDistrict: legacyCityDistrict
      ? districtParam
      : isKnown(cityDistrictParam, CITY_DISTRICT_OPTIONS)
        ? cityDistrictParam
        : '',
    locality: sp.get('locality') ?? '',
    // Этаж, этажность и отопление — диапазоны числами и список значений;
    // приводим к числу и отбрасываем мусор устаревших ссылок (см. buildWhere)
    floorMin: sp.get('floor_min') ?? '',
    floorMax: sp.get('floor_max') ?? '',
    floorsMin: sp.get('floors_min') ?? '',
    floorsMax: sp.get('floors_max') ?? '',
    heating: isKnown(sp.get('heating') ?? '', OBJECT_HEATING) ? (sp.get('heating') as string) : '',
    // Характеристики объекта: улица и площади — свободный ввод и числа
    // (мусор отбрасывает buildWhere), материал дома и газ — списки значений,
    // признаки «есть» — только '1' или пусто
    street: sp.get(URL_PARAM.street) ?? '',
    // Кадастровый номер — свободный ввод: формат сверяет серверный маршрут,
    // чужое значение даёт пустую выдачу, а не ошибку (см. buildWhere)
    cadastral: sp.get(URL_PARAM.cadastral) ?? '',
    livingAreaMin: sp.get(URL_PARAM.livingAreaMin) ?? '',
    livingAreaMax: sp.get(URL_PARAM.livingAreaMax) ?? '',
    kitchenAreaMin: sp.get(URL_PARAM.kitchenAreaMin) ?? '',
    kitchenAreaMax: sp.get(URL_PARAM.kitchenAreaMax) ?? '',
    building: isKnown(sp.get(URL_PARAM.building) ?? '', OBJECT_BUILDING) ? (sp.get(URL_PARAM.building) as string) : '',
    gas: isKnown(sp.get(URL_PARAM.gas) ?? '', OBJECT_GAS) ? (sp.get(URL_PARAM.gas) as string) : '',
    individualHeating: sp.get(URL_PARAM.individualHeating) === '1' ? '1' : '',
    elevator: sp.get(URL_PARAM.elevator) === '1' ? '1' : '',
    closedYard: sp.get(URL_PARAM.closedYard) === '1' ? '1' : '',
    snt: isKnown(sp.get('snt') ?? '', SNT_AREAS) ? (sp.get('snt') as string) : '',
    city: isKnown(cityParam, cityValuesFor(category, knownCities)) ? cityParam : '',
    // Регион фильтра «Город» («все населённые пункты»): ключ сверяем со списком
    // регионов для категории — у участков регионов, кроме Осетии, нет
    cityRegion: isKnown(cityRegionParam, regionValuesFor(category, cityRegions)) ? cityRegionParam : '',
    // Фильтр «Объекты агента» приходит только ссылкой (карточки команды,
    // страница агентства) — допустимость id проверяет buildWhere
    agent: sp.get(AGENT_URL_PARAM) ?? '',
    // Варианты покупки — множественный выбор: в ссылке коды через запятую.
    // Чужие значения отбрасываем, порядок приводим к порядку списка (см.
    // purchaseValues) — ссылка с теми же отметками читается одинаково
    purchase: purchaseValues(sp.get('purchase') ?? '').join(','),
  }
}

interface CatalogContentProps {
  /** Регионы фильтра «Город» — иерархия регион → населённые пункты со
   *  счётчиками объектов (см. loadCatalogCityFilter) */
  cityRegions: CityFilterRegion[]
  /** Допустимые значения фильтра «Город» — для сверки ссылок */
  knownCities: string[]
  /** Имя агента для чипа «Объекты агента» (читает серверная страница
   *  каталога из параметра agent, см. catalog/page.tsx) */
  agentName?: string
}

/** Выдача каталога: поиск, фильтры, карточки объектов и подгрузка следующих
 *  страниц. Данные — клиентские запросы к /api/objects; справочник фильтра
 *  «Город» приходит с сервера (см. страницу каталога) */
export default function CatalogContent({ cityRegions, knownCities, agentName }: CatalogContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang, t } = useI18n()

  const [objects, setObjects] = useState<ObjectListItem[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [sort, setSort] = useState(() => {
    const v = searchParams.get('sort') ?? ''
    return isKnown(v, SORT_VALUES) ? v : ''
  })
  // Вид выдачи: список карточек или карта с метками (см. CatalogMap)
  const [view, setView] = useState(searchParams.get('view') ?? '')
  const [filters, setFilters] = useState<FiltersState>(() => filtersFromParams(searchParams, cityRegions, knownCities))

  // Кадастровый номер участка: поле закрыто для посетителей — публичный API
  // его не отдаёт и не принимает в where, поэтому номер ищет серверный
  // маршрут (/api/objects/by-cadastral), а каталог фильтрует выдачу по id
  // найденных объектов. Здесь хранится результат поиска вместе с номером,
  // по которому он получен: пока они не совпадают с полем фильтра, номер
  // ещё ищется (ids = null), и выдачу не грузим — иначе каталог на секунду
  // показал бы «ничего не найдено» по недописанному номеру
  const [cadastral, setCadastral] = useState<{ number: string; ids: number[] } | null>(null)
  const cadastralNumber = filters.cadastral.trim()
  const cadastralPending = cadastralNumber !== '' && cadastral?.number !== cadastralNumber

  const where = useMemo(
    () => buildWhere(filters, q, cityRegions, knownCities, cadastralNumber ? (cadastral?.ids ?? null) : null),
    [filters, q, cityRegions, knownCities, cadastralNumber, cadastral],
  )
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
    if (view) {
      params.set('view', view)
    } else {
      params.delete('view')
    }
    params.delete('page')
    router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
  }, [filters, sort, view, lang, router, searchParams])

  // Чтение изменений URL извне (ссылки футера «Купить/Квартиры/…», шаринг-ссылки).
  // Паттерн React «adjusting state when props change» — setState во время рендера,
  // а не в эффекте (правило react-hooks/set-state-in-effect).
  // q не трогаем: он живёт в state и пишется в URL с debounce — иначе ввод ломается.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams)
  if (prevSearchParams !== searchParams) {
    setPrevSearchParams(searchParams)
    const next: FiltersState = filtersFromParams(searchParams, cityRegions, knownCities)
    setFilters((prev) =>
      Object.entries(next).every(([k, v]) => prev[k as keyof FiltersState] === v)
        ? prev
        : next,
    )
    const rawSort = searchParams.get('sort') ?? ''
    const nextSort = isKnown(rawSort, SORT_VALUES) ? rawSort : ''
    setSort((prev) => (prev === nextSort ? prev : nextSort))
    const nextView = searchParams.get('view') ?? ''
    setView((prev) => (prev === nextView ? prev : nextView))
  }

  // Счётчиков объектов в каталоге нет намеренно: общее количество объектов
  // компании на публичном сайте не показываем — ни строкой «Найдено» над
  // выдачей, ни числами у категорий и населённых пунктов (см. CatalogFilters),
  // ни числами на карте (см. CatalogMap).
  //
  // Поиск по кадастровому номеру: спрашиваем сервер, какие участки подходят.
  // С задержкой — номер вводят посимвольно, и запрос на каждую цифру был бы
  // и лишней работой, и перебором с точки зрения лимита маршрута (он считает
  // обращения с одного адреса). Пустое поле — поиск не нужен, результат
  // прошлого номера просто не используется
  useEffect(() => {
    if (!cadastralNumber) return
    const controller = new AbortController()
    // setState — внутри таймера, а не в теле эффекта (правило
    // react-hooks/set-state-in-effect, см. чтение URL выше)
    const timer = setTimeout(() => {
      fetch(`/api/objects/by-cadastral?number=${encodeURIComponent(cadastralNumber)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setCadastral({ number: cadastralNumber, ids: Array.isArray(data?.ids) ? data.ids : [] }))
        // Поиск не удался (лимит запросов, сеть) — считаем, что не найдено:
        // повторять запрос молча нельзя, клиент увидит пустую выдачу
        .catch(() => { if (!controller.signal.aborted) setCadastral({ number: cadastralNumber, ids: [] }) })
    }, 500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [cadastralNumber])

  // (re)load first page on filter/sort/search change.
  // All setState calls happen after await, so no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false
    async function run() {
      // Номер ещё ищется — выдачу не грузим: условие по нему в where ещё не
      // собрано (см. cadastralPending). Загрузка уже показана (setLoading в
      // onChangeFilters), поэтому экран не «моргает» прошлой выдачей
      if (cadastralPending) return
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: '1', depth: '2', sort: sortParam })
        if (Object.keys(where).length) params.set('where', JSON.stringify(where))
        const res = await fetch(`/api/objects?${params}`, { credentials: 'include' })
        const data = await res.json()
        if (cancelled) return
        setObjects((data.docs || []).map((d: Record<string, unknown>) => objectToListItem(d)))
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
    // cadastralPending — в зависимостях наравне с where: поиск номера может
    // закончиться «ничего не найдено», и дерево условий при этом не изменится
    // (в обоих случаях один и тот же несуществующий id) — без этой зависимости
    // выдача осталась бы в состоянии загрузки навсегда
  }, [where, sortParam, cadastralPending])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page + 1), depth: '2', sort: sortParam })
      if (Object.keys(where).length) params.set('where', JSON.stringify(where))
      const res = await fetch(`/api/objects?${params}`, { credentials: 'include' })
      const data = await res.json()
      setObjects((prev) => [...prev, ...(data.docs || []).map((d: Record<string, unknown>) => objectToListItem(d))])
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

  // Выдача начинается здесь: «Подобрать» и «Показать на карте» в панели
  // фильтров прокручивают к ней страницу (фильтры применяются сразу при
  // изменении — кнопки показывают результат, а не собирают его)
  const resultsRef = useRef<HTMLDivElement>(null)
  const scrollToResults = useCallback(() => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  // «Показать на карте»: тот же вид выдачи, что у переключателя над списком
  const showMap = useCallback(() => {
    setView('map')
    scrollToResults()
  }, [scrollToResults])

  // Разделы каталога со своими страницами: новостройки, межрегиональная
  // и зарубежная недвижимость. В полосе категорий их нет — там только
  // категории объектов одного города, поэтому ссылки стоят под выдачей
  const sections = [
    { href: `/${lang}/newbuildings`, label: t.nav.newBuildings },
    { href: `/${lang}/interregional`, label: t.nav.interregional },
    { href: `/${lang}/foreign`, label: t.nav.foreign },
  ]

  // Фильтр «Объекты агента»: ссылка с карточек команды (см. about/page.tsx).
  // Панель фильтров его не показывает — снимается чипом над выдачей, поэтому
  // сброс «всех фильтров» удаляет и его (удалить одиночный параметр из URL
  // надёжнее, чем собрать ссылку из состояния: в URL могут быть легаси-ключи)
  const removeAgent = useCallback(() => {
    setFilters((prev) => ({ ...prev, agent: '' }))
    setLoading(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete(AGENT_URL_PARAM)
    router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
  }, [lang, router, searchParams])

  const clearAll = useCallback(() => {
    setFilters(emptyFilters)
    setQ('')
    setSort('')
    removeAgent()
  }, [removeAgent])

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

      {/* Полоса категорий — над фильтрами: категория это первый выбор
          клиента, остальные фильтры её уточняют */}
      <CategoryChips
        value={filters.category}
        onChange={(category) => { onChangeFilters({ category }); }}
      />

      <CatalogFilters state={filters} onChange={onChangeFilters} t={t}
        cityRegions={cityRegions} knownCities={knownCities}
        onSubmit={scrollToResults} onShowMap={showMap} />

      {/* Фильтр, пришедший ссылкой с карточек команды (страница агентства):
          у остальных фильтров есть поля в панели, у этого — только чип */}
      {filters.agent && agentName && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--n15-silver)] border border-[var(--n15-gold)]/30 bg-[var(--n15-black)]/40">
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">
              {t.catalog.agentFilterLabel}
            </span>
            {agentName}
            <button type="button" onClick={removeAgent}
              className="text-[var(--n15-gold)] hover:text-[var(--n15-white)] transition-colors cursor-pointer"
              aria-label={t.catalog.resetFilters}
              title={t.catalog.resetFilters}>
              ×
            </button>
          </span>
        </div>
      )}

      {/* Сброс фильтров + вид выдачи и сортировка. Числа найденных объектов
          здесь нет: общее количество объектов компании на сайте не показываем */}
      <div ref={resultsRef} className="flex flex-wrap items-center justify-between gap-3 my-4 scroll-mt-24">
        {hasFilters ? (
          <button onClick={clearAll} className="text-xs text-[var(--n15-gold)] underline">
            {t.catalog.resetFilters}
          </button>
        ) : <span />}
        <div className="flex flex-wrap items-center gap-3">
          {/* Вид выдачи: список или карта с метками объектов */}
          <div className="inline-flex border border-[var(--n15-gold)]/20">
            {[
              { value: '', label: t.catalog.viewList },
              { value: 'map', label: t.catalog.viewMap },
            ].map((v) => (
              <button
                key={v.value || 'list'}
                type="button"
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                className={`px-3 py-2 text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  view === v.value
                    ? 'bg-[var(--n15-gold)] text-[var(--n15-black)]'
                    : 'text-[var(--n15-muted)] hover:text-[var(--n15-gold)]'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-[var(--n15-muted)] flex items-center gap-2">
            <span className="text-[10px] tracking-[0.2em] uppercase">{t.catalog.sortDefault.split(':')[0]}:</span>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setLoading(true) }}
              className="bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 px-3 py-2 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50"
            >
              {/* Два варианта (см. SORT_VALUES): порядок подборки и он же,
                  выбранный явно, — по дате публикации */}
              <option value="">{t.catalog.sortActual}</option>
              <option value="-createdAt">{t.catalog.sortDate}</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-20 text-[var(--n15-muted)]">{t.catalog.loading}</p>
      ) : objects.length > 0 ? (
        <>
          {view === 'map' ? (
            // Карте передаём условия выдачи, а не загруженную страницу
            // карточек: режим «На карте» показывает все объекты выдачи
            // (точки отдаёт /api/objects/map, см. CatalogMap)
            <CatalogMap where={where} lang={lang} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
              {objects.map((obj) => <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />)}
            </div>
          )}
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
        <div className="py-12">
          {/* Подбор по конкретному нас. пункту, региону или межрегиональному
              городу пуст — сообщение понятнее общего «ничего не найдено».
              Регион и город без объектов — это «пока подбираются»: вместо
              пустого списка предлагаем оставить заявку (см. nothingInRegion) */}
          <p className="text-center text-[var(--n15-muted)] text-lg mb-4">
            {filters.city || filters.cityRegion
              ? t.catalog.nothingInRegion
              : filters.locality
                ? t.catalog.nothingInLocality
                : t.catalog.nothingFound}
          </p>
          <p className="text-center mb-8">
            <button onClick={clearAll}
              className="text-sm text-[var(--n15-gold)] underline">
              {t.catalog.resetAll}
            </button>
          </p>
          {/* Подходящего объекта нет — предлагаем заявку на поиск: заявка
              с типом search попадает в CRM и адресуется агенту */}
          <div className="max-w-lg mx-auto border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 p-6">
            <LeadForm kind="search" title={t.lead.searchTitle} text={t.lead.searchText} />
          </div>
        </div>
      )}

      {/* Подвал выдачи: разделы со своими страницами и заявка на подбор,
          если среди найденного подходящего объекта не оказалось. В пустом
          состоянии заявку уже предлагает блок выше — здесь не повторяем */}
      {!loading && objects.length > 0 && (
        <div id="podbor" className="mt-14 pt-8 border-t border-[var(--n15-gold)]/10 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">
              {t.catalog.sectionsTitle}
            </span>
            {sections.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="px-3 py-2 text-xs uppercase tracking-wider border border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:text-[var(--n15-gold)] hover:border-[var(--n15-gold)]/50 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </div>
          <div className="max-w-lg mx-auto border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 p-6">
            <LeadForm kind="selection" title={t.catalog.selectCtaTitle} text={t.catalog.selectCtaText} />
          </div>
        </div>
      )}
      </div>
    </section>
  )
}

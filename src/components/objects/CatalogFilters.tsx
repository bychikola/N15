'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
// Садовые товарищества (СНТ/СНО/ДНТ) — те же справочники, что в подразделе
// лендинга: категории из GARDENING_AREAS, всё внутри Владикавказского округа
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS, GARDENING_CATEGORY_ORDER, GARDENING_AREAS, LAND_CITY_OPTIONS } from '@/lib/districts'
import { SNT_AREAS } from '@/components/home/landing-data'
// Иерархия фильтра «Город» — регионы с населёнными пунктами и счётчиками —
// приходит готовой с сервера (см. loadCatalogCityFilter в
// src/lib/interregional-service.ts): здесь только показ и выбор, списков в
// клиентском компоненте нет
import type { CityFilterField, CityFilterPlace, CityFilterRegion } from '@/lib/city-filter'
// Конвертация площади участков: 1 сотка = 100 м², 1 га = 10000 м²
// (те же хелперы, что в форме CRM, — см. src/lib/area-format.ts)
import { SQM_PER_UNIT, areaNumberText, areaUnitOf, parseAreaNumber, sqmToUnit, unitToSqm, type AreaUnit } from '@/lib/area-format'

// Допустимые значения select-фильтров — опции одноимённых полей объекта
// (src/payload/collections/Objects.ts). Где-запрос к /api/objects с чужим
// значением (мусорный или устаревший параметр URL) падает серверной
// ошибкой, поэтому такие значения отбрасываем, а не отправляем.
export const OBJECT_TYPES = ['sale', 'rent']
export const OBJECT_CATEGORIES = ['apartment', 'house', 'townhouse', 'commercial', 'land']
export const OBJECT_ROOMS = ['1', '2', '3', '4']
const isKnown = (v: string, options: readonly string[]) => options.includes(v)

/** Имя URL-параметра фильтра «Объекты агента» — ссылки с карточек команды
 *  на странице агентства ведут в /catalog?agent=<id> */
export const AGENT_URL_PARAM = 'agent'

export interface FiltersState {
  type: string
  category: string
  rooms: string
  priceMin: string
  priceMax: string
  areaMin: string
  areaMax: string
  /** Единица площади в фильтре: '' — не выбрана (= м²), 'are' — сотки,
   *  'ha' — гектары. Имеет смысл только для категории «участок»; у остальных
   *  категорий площадь всегда в м². */
  areaUnit: '' | AreaUnit
  district: string
  cityDistrict: string
  locality: string
  snt: string
  /** Город вне Северной Осетии (межрегиональные объекты) либо Владикавказ
   *  у участков (межрегиональных направлений у земли нет). Взаимоисключается
   *  с осетинскими адресными фильтрами: район/нас. пункт/товарищество —
   *  кроме участков, где город — часть той же структуры поиска.
   *  Населённые пункты Осетии из фильтра «Город» живут в locality: это то же
   *  поле адреса, что у фильтра «Населённый пункт» (см. city-filter.ts) */
  city: string
  /** «Все населённые пункты региона» — ключ региона фильтра «Город»
   *  (см. CityFilterRegion.key). Взаимоисключается с выбранным городом и
   *  населённым пунктом: фильтр «Город» выбирает что-то одно */
  cityRegion: string
  /** id агента: показываем только его объекты. Постоянного поля в панели
   *  фильтров у него нет — фильтр приходит ссылкой с карточек команды,
   *  а снимается чипом «Объекты агента» над выдачей */
  agent: string
}

export const emptyFilters: FiltersState = {
  type: '', category: '', rooms: '', priceMin: '', priceMax: '', areaMin: '', areaMax: '', areaUnit: '', district: '', cityDistrict: '', locality: '', snt: '', city: '', cityRegion: '', agent: '',
}

// Число из фильтра: позволяет и «600», и «11,5» (запятая — как вводят вручную)
const numOf = (v: string): number | null => parseAreaNumber(v)

/**
 * Допустимые значения фильтра «Город» для категории: у участков — только
 * Владикавказ (земля Н15 вне межрегиональных направлений, см. districts.ts),
 * у остальных категорий — города межрегионального справочника из CRM.
 * Чужое значение отбрасываем: where по несуществующему городу молча даёт
 * пустую выдачу, а ссылка с ним живёт в закладках.
 */
export const cityValuesFor = (category: string, knownCities: readonly string[]): readonly string[] =>
  category === 'land' ? LAND_CITY_OPTIONS : knownCities

/**
 * Допустимые ключи регионов фильтра «Город» для категории: у участков — только
 * Осетия (межрегиональных направлений у земли нет), у остальных категорий — всё
 * дерево регионов. Чужой ключ из ссылки отбрасываем, как и чужой город.
 * Регион без населённых пунктов (пустые «Другие регионы») в списке не значится:
 * выбрать его нельзя, а ссылка с ним ничего не фильтрует — снимаем ключ, чтобы
 * в поле не оставался выбор без действия.
 */
export const regionValuesFor = (category: string, regions: readonly CityFilterRegion[]): readonly string[] =>
  (category === 'land' ? regions.filter((r) => r.ossetian) : regions)
    .filter((r) => r.match.length > 0)
    .map((r) => r.key)

/**
 * Значения адреса для пункта фильтра: каноническое название и написания из
 * базы (адреса агенты вводят руками, см. city-filter.ts). Для значения,
 * которого в справочнике нет (старая ссылка на скрытый населённый пункт), —
 * само значение: фильтр по нему ищет точным совпадением, как раньше.
 */
const placeValues = (regions: readonly CityFilterRegion[], field: CityFilterField, value: string): string[] =>
  regions.flatMap((r) => r.places).find((p) => p.field === field && p.value === value)?.values ?? [value]

export function buildWhere(
  f: FiltersState,
  q: string,
  regions: readonly CityFilterRegion[],
  knownCities: readonly string[],
): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  // На сайте показываем только опубликованные (черновики и архив скрыты)
  conds.push({ status: { equals: 'published' } })
  // Select-поля фильтруем только значениями из их опций (см. isKnown выше)
  if (f.type && isKnown(f.type, OBJECT_TYPES)) conds.push({ type: { equals: f.type } })
  if (f.category && isKnown(f.category, OBJECT_CATEGORIES)) conds.push({ category: { equals: f.category } })
  if (f.district && isKnown(f.district, DISTRICT_OPTIONS)) conds.push({ 'address.district': { equals: f.district } })
  if (f.cityDistrict && isKnown(f.cityDistrict, CITY_DISTRICT_OPTIONS)) conds.push({ 'address.cityDistrict': { equals: f.cityDistrict } })
  // Населённый пункт Осетии — это address.locality. Рядом с каноническим
  // названием шлём написания из базы (city-filter.ts): объект находится, как
  // бы агент ни записал адрес
  if (f.locality) conds.push({ 'address.locality': { in: placeValues(regions, 'locality', f.locality) } })
  if (f.snt && isKnown(f.snt, SNT_AREAS)) conds.push({ 'address.snt': { equals: f.snt } })
  // Города: у участков список свой (только Владикавказ), у остальных — CRM
  if (f.city && isKnown(f.city, cityValuesFor(f.category, knownCities))) {
    conds.push({ 'address.city': { in: placeValues(regions, 'city', f.city) } })
  }
  // «Все населённые пункты региона»: условие региона из справочника — по
  // одному или нескольким полям адреса (у Осетии это город и населённый пункт)
  if (f.cityRegion) {
    const region = regions.find((r) => r.key === f.cityRegion)
    if (region?.match.length) {
      conds.push({ or: region.match.map((m) => ({ [`address.${m.field}`]: { in: m.values } })) })
    }
  }
  if (isKnown(f.rooms, OBJECT_ROOMS)) {
    conds.push(f.rooms === '4'
      ? { rooms: { greater_than_equal: 4 } }
      : { rooms: { equals: parseInt(f.rooms, 10) } })
  }
  const priceMin = parseInt(f.priceMin, 10)
  if (f.priceMin && Number.isFinite(priceMin)) conds.push({ price: { greater_than_equal: priceMin } })
  const priceMax = parseInt(f.priceMax, 10)
  if (f.priceMax && Number.isFinite(priceMax)) conds.push({ price: { less_than_equal: priceMax } })
  // Площадь в базе всегда в м²; выбраны сотки/гектары — переводим
  // (1 сотка = 100 м², 1 га = 10000 м²). У не-участков единица не действует
  const areaMul = f.category === 'land' ? SQM_PER_UNIT[areaUnitOf(f.areaUnit)] : 1
  if (f.areaMin) {
    const min = numOf(f.areaMin)
    if (min != null && Number.isFinite(min)) conds.push({ area: { greater_than_equal: Math.round(min * areaMul * 100) / 100 } })
  }
  if (f.areaMax) {
    const max = numOf(f.areaMax)
    if (max != null && Number.isFinite(max)) conds.push({ area: { less_than_equal: Math.round(max * areaMul * 100) / 100 } })
  }
  const agent = agentId(f.agent)
  if (agent != null) conds.push({ agent: { equals: agent } })
  if (q) conds.push({ or: [{ title: { contains: q } }, { 'address.street': { contains: q } }] })
  return conds.length ? { and: conds } : {}
}

// id агента: только целое положительное число (в базе они такие). Мусорные
// значения из ссылки отбрасываем — серверный where с нецелым id падает
function agentId(v: string): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

// Подписи фильтров — до двух строк: длинная подпись («Садоводческие
// товарищества») переносится на вторую строку, а не выходит за рамку кнопки.
// Слот подписи у всех фильтров одинаковый — высота двух строк (min-height),
// поэтому прямоугольники остаются одного размера, а подписи и строки значений
// («Любой») стоят на одних линиях. Для длинных подписей (например «Населённый
// пункт» и «Садоводческие товарищества») — компактный вариант с меньшим кеглем.
const labelCls = (compact = false) =>
  `${compact ? 'text-[9px] tracking-[0.15em]' : 'text-[10px] tracking-[0.2em]'} uppercase leading-[1.5] min-h-[30px] text-[var(--n15-muted)]`
const ddBtnCls = 'flex items-center justify-between gap-3 w-full px-4 py-2.5 text-sm text-[var(--n15-silver)] border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 hover:border-[var(--n15-gold)]/40 transition-colors'

/** Одна строка раскрытого списка: заголовок группы (СНТ/СНО/ДНТ — не
 *  выбирается) или пункт с названием товарищества/нас. пункта */
type DropdownEntry =
  | { kind: 'header'; label: string }
  | { kind: 'option'; value: string; label: string }

/** Стрелка выпадающего списка: у открытого — вверх, у закрытого — вниз.
 *  Все списки панели (сделка, тип, город, район…) и строки регионов внутри
 *  фильтра «Город» показывают её одинаково (кегль и цвет задаёт className) */
function DdArrow({ open, className = 'text-[10px]' }: { open: boolean; className?: string }) {
  return (
    <span className={`shrink-0 transition-transform ${className} ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
  )
}

/** Счётчик объектов в строке списка. Ноль не показываем: в справочнике
 *  регионов населённые пункты видны и без объектов (см. placesOf в
 *  src/lib/interregional-service.ts), и ноль рядом с каждым названием читался
 *  бы как пустой список */
function PlaceCount({ n }: { n: number }) {
  if (n <= 0) return null
  return <span className="shrink-0 text-xs tabular-nums text-[var(--n15-muted)]">{n}</span>
}

/** Выпадающий список панели фильтров. Открытым его держит родитель (см.
 *  openId в CatalogFilters): одновременно открыт ровно один список, поэтому
 *  состояние «открыт» приходит пропом, а не живёт внутри */
function Dropdown({ label, value, options, groups, onSelect, compactLabel, open, onToggle, onClose }: {
  label: string
  value: string
  /** Простые пункты без групп (сделка, тип, район…) */
  options?: { value: string; label: string }[]
  /** Группы с заголовками — например категории СНТ/СНО/ДНТ садовых
   *  товариществ. Если заданы, options не используется */
  groups?: { label: string; options: { value: string; label: string }[] }[]
  onSelect: (v: string) => void
  compactLabel?: boolean
  /** Открыт ли список (открытым держит панель фильтров) */
  open: boolean
  /** Нажатие на кнопку: открыть список или свернуть открытый */
  onToggle: () => void
  /** Закрыть список: выбор пункта, Escape, клик вне панели */
  onClose: () => void
}) {
  const entries: DropdownEntry[] = groups
    ? groups.flatMap((g) => [
        { kind: 'header', label: g.label },
        ...g.options.map((o) => ({ kind: 'option' as const, ...o })),
      ])
    : (options ?? []).map((o) => ({ kind: 'option' as const, ...o }))
  const current = entries.find((e): e is Extract<DropdownEntry, { kind: 'option' }> => e.kind === 'option' && e.value === value)
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={ddBtnCls} aria-expanded={open} aria-haspopup="listbox">
        {/* min-w-0 — колонка подписи сжимается под ширину кнопки, подпись и
            значение переносятся по словам (break-words) и не выходят за рамку */}
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(compactLabel) + ' break-words'}>{label}</span>
          <span className="break-words">{current?.label ?? 'Любой'}</span>
        </span>
        <DdArrow open={open} />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 py-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg">
          <button type="button" onClick={() => { onSelect(''); onClose() }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === '' ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
            Любой
          </button>
          {entries.map((e, i) => (
            e.kind === 'header' ? (
              /* Заголовок категории в списке — раздел сам не выбирается */
              <div key={`${e.label}-${i}`} className="px-4 pt-2 pb-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--n15-muted)]">
                {e.label}
              </div>
            ) : (
              <button key={e.value} type="button" onClick={() => { onSelect(e.value); onClose() }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === e.value ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                {e.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

/** Ключ сравнения названий (регистр, «ё», лишние пробелы) — тот же cityKey, что
 *  в справочнике (src/lib/interregional.ts): поиск не зависит от написания */
const nameKey = (v: string): string => v.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

/** Строка списка: у всех одна высота (min-h-9) и одинаковые отступы. Отступ
 *  слева задаётся отдельно (cityRowTop/cityRowSub): в одной строке классов не
 *  должно быть двух значений padding-left — какой из них победит, решает
 *  порядок правил в таблице стилей, а не порядок классов */
const cityRowCls = 'flex items-center gap-3 w-full min-h-9 pr-3 py-1.5 text-left text-sm transition-colors cursor-pointer'
/** Строка верхнего уровня: регион, «Любой», найденный населённый пункт */
const cityRowTop = `${cityRowCls} pl-4`
/** Строка внутри раскрытого региона: населённые пункты и строка «весь регион» */
const cityRowSub = `${cityRowCls} pl-9`

/**
 * Фильтр «Город»: иерархия регион → населённые пункты. При открытии — только
 * регионы; населённые пункты региона показываются по стрелке: раскрыт может
 * быть только один регион, повторное нажатие на открытый его сворачивает.
 * У строки — счётчик опубликованных объектов (у пунктов без объектов счётчика
 * нет). Последняя строка раскрытого региона — «Все населённые пункты региона»:
 * фильтр по региону целиком. Поиск ищет населённые пункты во всех регионах
 * сразу и подписывает, из какого они региона — плоский список городов при этом
 * не возвращается: без запроса в списке только регионы.
 *
 * Список прокручивается внутри себя (max-h): на телефоне, где фильтры стоят
 * столбцом, он не растягивает страницу и не уходит за пределы экрана.
 * Открытым фильтр держит панель (см. openId в CatalogFilters): нажатие на
 * другой фильтр, клик вне панели и Escape закрывают список.
 */
function CityDropdown({ label, regions, place, regionKey, onPlace, onRegion, onClear, t, open, onToggle, onClose }: {
  label: string
  /** Регионы фильтра в порядке показа (см. CityFilterRegion) */
  regions: CityFilterRegion[]
  /** Выбранный населённый пункт (значение фильтра) либо '' */
  place: string
  /** Выбранный регион «все населённые пункты» либо '' */
  regionKey: string
  onPlace: (place: CityFilterPlace) => void
  onRegion: (region: CityFilterRegion) => void
  onClear: () => void
  t: Dict
  /** Открыт ли список (открытым держит панель фильтров) */
  open: boolean
  /** Нажатие на кнопку: открыть список или свернуть открытый */
  onToggle: () => void
  /** Закрыть список: выбор пункта, Escape, клик вне панели */
  onClose: () => void
}) {
  const currentPlace = place ? regions.flatMap((r) => r.places).find((p) => p.value === place) : undefined
  const currentRegion = regionKey ? regions.find((r) => r.key === regionKey) : undefined
  // Значение фильтра может быть и не из списка (ссылка на скрытый населённый
  // пункт) — показываем его как есть, чтобы выбор не выглядел потерянным
  const currentLabel = currentPlace?.label || currentRegion?.label || place || 'Любой'

  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={ddBtnCls} aria-expanded={open}
        aria-haspopup="listbox">
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(true) + ' break-words'}>{label}</span>
          <span className="break-words">{currentLabel}</span>
        </span>
        <DdArrow open={open} />
      </button>
      {/* Список живёт, пока открыт: закрытие (выбор пункта, повторное нажатие,
          Escape, клик вне панели) размонтирует его, и раскрытый регион вместе
          с поиском сбрасываются сами — фильтр открывается списком регионов */}
      {open && (
        <CityList label={label} regions={regions} place={place} regionKey={regionKey}
          onPlace={onPlace} onRegion={onRegion} onClear={onClear} onClose={onClose} t={t} />
      )}
    </div>
  )
}

/** Раскрытый список фильтра «Город»: поиск и регионы. Запрос и раскрытый
 *  регион живут здесь и пропадают вместе со списком (см. CityDropdown) */
function CityList({ label, regions, place, regionKey, onPlace, onRegion, onClear, onClose, t }: {
  label: string
  regions: CityFilterRegion[]
  place: string
  regionKey: string
  onPlace: (place: CityFilterPlace) => void
  onRegion: (region: CityFilterRegion) => void
  onClear: () => void
  onClose: () => void
  t: Dict
}) {
  const [query, setQuery] = useState('')
  // Раскрыт один регион, а не список: открытие другого сворачивает прежний,
  // повторное нажатие на открытый — сворачивает его самого
  const [expanded, setExpanded] = useState<string | null>(null)
  const q = nameKey(query)
  const matches = useMemo(
    () => (q
      ? regions.flatMap((region) => region.places
          .filter((p) => nameKey(p.label).includes(q))
          .map((p) => ({ region, place: p })))
      : []),
    [q, regions],
  )

  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key))
  const pick = (p: CityFilterPlace) => { onPlace(p); onClose() }
  const pickRegion = (r: CityFilterRegion) => { onRegion(r); onClose() }
  const clear = () => { onClear(); onClose() }

  return (
    <div
      className="absolute z-30 top-full left-0 right-0 mt-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain"
      role="group" aria-label={label}
    >
      {/* Поиск по названию населённого пункта: sticky — список под полем
          прокручивается, а поле остаётся на виду */}
      <div className="sticky top-0 z-10 p-2 bg-[var(--n15-charcoal)] border-b border-[var(--n15-gold)]/10">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t.catalog.citySearch} aria-label={t.catalog.citySearch}
          className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
      </div>
      <button type="button" onClick={clear}
        className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${!place && !regionKey ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
        Любой
      </button>
      {q ? (
        /* Поиск: найденные населённые пункты всех регионов, с подписью региона */
        matches.length ? (
          matches.map(({ region, place: found }) => (
            <button key={`${region.key}-${found.value}`} type="button" onClick={() => pick(found)}
              className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${found.value === place ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
              <span className="min-w-0 flex-1">
                <span className="block break-words">{found.label}</span>
                <span className="block text-[10px] text-[var(--n15-muted)]">{region.label}</span>
              </span>
              <PlaceCount n={found.count} />
            </button>
          ))
        ) : (
          <p className="px-4 py-3 text-sm text-[var(--n15-muted)]">{t.catalog.nothingFound}</p>
        )
      ) : (
        regions.map((region) => {
          const isOpen = expanded === region.key
          return (
            <div key={region.key}>
              {/* Регион: нажатие раскрывает вложенный список населённых пунктов,
                  повторное — сворачивает его */}
              <button type="button" onClick={() => toggle(region.key)} aria-expanded={isOpen}
                className={`${cityRowTop} hover:bg-[var(--n15-gold)]/8 ${regionKey === region.key ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                <DdArrow open={isOpen} className="text-[9px] text-[var(--n15-gold)]" />
                <span className="min-w-0 flex-1 break-words">{region.label}</span>
                <PlaceCount n={region.count} />
              </button>
              {isOpen && (
                <div className="pb-1">
                  {region.places.map((p) => (
                    <button key={p.value} type="button" onClick={() => pick(p)}
                      className={`${cityRowSub} hover:bg-[var(--n15-gold)]/8 ${p.value === place ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
                      <span className="min-w-0 flex-1 break-words">{p.label}</span>
                      <PlaceCount n={p.count} />
                    </button>
                  ))}
                  {/* Региона без населённых пунктов (пустые «Другие регионы»)
                      эта строка не касается: фильтровать не по чему */}
                  {region.match.length > 0 && (
                    <button type="button" onClick={() => pickRegion(region)}
                      className={`${cityRowSub} hover:bg-[var(--n15-gold)]/8 ${regionKey === region.key ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-gold)]/80'}`}>
                      <span className="min-w-0 flex-1 break-words">{t.catalog.allRegionPlaces}</span>
                      <PlaceCount n={region.count} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

interface CatalogFiltersProps {
  state: FiltersState
  onChange: (patch: Partial<FiltersState>) => void
  t: Dict
  /** Регионы фильтра «Город» — иерархия регион → населённые пункты со
   *  счётчиками объектов (см. loadCatalogCityFilter) */
  cityRegions: CityFilterRegion[]
  /** Допустимые значения фильтра «Город» — для сверки городов из ссылок */
  knownCities: readonly string[]
}

/** Ключи выпадающих списков панели — по одному на фильтр. Открытым может быть
 *  только один: ключ лежит в openId, остальные списки закрыты */
type DropdownId = 'type' | 'category' | 'city' | 'district' | 'cityDistrict' | 'locality' | 'snt'

export default function CatalogFilters({ state, onChange, t, cityRegions, knownCities }: CatalogFiltersProps) {
  // Открытый выпадающий список панели. Один на все фильтры: открытие нового
  // закрывает прежний, повторное нажатие на кнопку — закрывает открытый.
  // Списки рисуются поверх друг друга, и несколько открытых окон сразу
  // перекрывали бы фильтры под ними
  const [openId, setOpenId] = useState<DropdownId | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggle = (id: DropdownId) => setOpenId((prev) => (prev === id ? null : id))
  const close = () => setOpenId(null)

  // Закрытие открытого списка по Escape и по клику вне панели фильтров:
  // слушатели висят на документе, пока список открыт (клик по элементам
  // самого списка и по кнопкам фильтров панель считает своими)
  useEffect(() => {
    if (!openId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current
      if (panel && e.target instanceof Node && panel.contains(e.target)) return
      setOpenId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [openId])

  const typeOptions = Object.entries(t.typeLabels).map(([value, label]) => ({ value, label }))
  const categoryOptions = Object.entries(t.categoryLabels).map(([value, label]) => ({ value, label }))
  // Пункты зависят от выбранного района: показываем только его нас. пункты
  const localityOptions = state.district
    ? (LOCALITIES_BY_DISTRICT[state.district] || []).map((l) => ({ value: l, label: l }))
    : LOCALITY_OPTIONS.map((l) => ({ value: l, label: l }))
  // Единица площади действует только для участков; не выбрана — подразумеваются м²
  const isLand = state.category === 'land'
  const areaUnit: AreaUnit = isLand ? areaUnitOf(state.areaUnit) : 'sqm'
  const hasFilters = state.type || state.category || state.rooms || state.priceMin || state.priceMax || state.areaMin || state.areaMax || state.district || state.cityDistrict || state.locality || state.snt || state.city || state.cityRegion
  // У участков регионов, кроме Осетии, нет: межрегиональных направлений у
  // земли не бывает (см. regionValuesFor)
  const shownRegions = useMemo(
    () => (isLand ? cityRegions.filter((r) => r.ossetian) : cityRegions),
    [isLand, cityRegions],
  )
  // Значение фильтра «Город» на кнопке: межрегиональный город лежит в city, а
  // населённый пункт Осетии — в locality (это то же поле адреса, что у фильтра
  // «Населённый пункт», см. city-filter.ts)
  const cityPlace = state.city || state.locality

  // Межрегиональный город (Москва, Химки…) и осетинские адресные фильтры
  // взаимоисключающие: выбран один — снимается другой. У участков город один —
  // Владикавказ, и он не спорит с районом, населённым пунктом и товариществом
  // (структура поиска участков: Владикавказ → населённые пункты →
  // товарищества) — такие фильтры рядом с ним остаются
  const dropInterregionalCity = (v: string): Partial<FiltersState> => (v && !isLand ? { city: '' } : {})

  /**
   * Район для населённого пункта Осетии: если пункт входит в выбранный район —
   * район не трогаем; если он лежит в одном районе республики — ставим его
   * (каскад, как в форме CRM); если в нескольких (одноимённые сёла) — снимаем,
   * чтобы фильтр не противоречил сам себе и не давал пустую выдачу.
   */
  const districtFor = (locality: string): Partial<FiltersState> => {
    if (state.district && (LOCALITIES_BY_DISTRICT[state.district] || []).includes(locality)) return {}
    const owners = DISTRICT_OPTIONS.filter((d) => (LOCALITIES_BY_DISTRICT[d] || []).includes(locality))
    return { district: owners.length === 1 ? owners[0] : '' }
  }

  /**
   * Выбор населённого пункта в фильтре «Город». Значение ложится в то поле
   * адреса, где оно живёт: межрегиональный город — в city, населённый пункт
   * Осетии — в locality. Остальные фильтры (сделка, тип, цена, комнаты,
   * площадь) не трогаются: меняется только место поиска.
   */
  const pickPlace = (place: CityFilterPlace) => {
    if (place.field === 'city') {
      // Межрегиональный город: осетинские адресные фильтры снимаются — они
      // взаимоисключающие
      apply({ city: place.value, cityRegion: '', district: '', cityDistrict: '', locality: '', snt: '' })
      return
    }
    apply({
      locality: place.value,
      city: '',
      cityRegion: '',
      cityDistrict: '',
      snt: '',
      ...districtFor(place.value),
    })
  }

  /**
   * «Все населённые пункты региона»: место поиска — регион целиком, поэтому
   * район, нас. пункт, товарищество и город снимаются (выбор в фильтре «Город»
   * один), а сделка, тип, цена и остальные фильтры остаются как были.
   */
  const pickRegion = (region: CityFilterRegion) =>
    apply({ cityRegion: region.key, city: '', district: '', cityDistrict: '', locality: '', snt: '' })

  /** «Любой» в фильтре «Город»: снимаем и город, и регион, и нас. пункт Осетии */
  const clearCity = () => apply({ city: '', cityRegion: '', locality: '' })

  /**
   * Смена единицы площади (кнопки «м²/сотки/га»): числа в полях «от/до»
   * пересчитываются, чтобы фильтр сохранял тот же диапазон площади —
   * 600 м² становятся 6 соток или 0,06 га, и наоборот. Вне участков
   * единица всегда м². Дробные значения — норма («5,5», «1,2»).
   */
  const convertArea = (text: string, from: AreaUnit, to: AreaUnit): string => {
    const v = parseAreaNumber(text)
    if (v == null) return text
    return areaNumberText(from === to ? v : sqmToUnit(unitToSqm(v, from), to))
  }

  const apply = (patch: Partial<FiltersState>) => {
    const out: Partial<FiltersState> = { ...patch }
    // Смена единицы: переводим уже введённые от/до в новую единицу
    if (patch.areaUnit && patch.areaUnit !== areaUnit) {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, areaUnit, patch.areaUnit) : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, areaUnit, patch.areaUnit) : state.areaMax
    }
    // Категория сменилась с участков: числа были в сотках/гектарах — вернём
    // в м², чтобы при следующем входе в «участки» они читались однозначно
    if (patch.category !== undefined && patch.category !== 'land' && areaUnit !== 'sqm') {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, areaUnit, 'sqm') : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, areaUnit, 'sqm') : state.areaMax
      out.areaUnit = 'sqm'
    }
    // Категория сменилась: у новой категории свой список городов и регионов
    // (у участков — только Владикавказ и Осетия), и прежний выбор в нём может
    // не значиться. Сбрасываем его, иначе в поле остаётся чужое значение, а
    // фильтр по нему молча ничего не находит. Остальные фильтры не трогаем
    if (patch.category !== undefined && patch.category !== state.category) {
      if (state.city && !cityValuesFor(patch.category, knownCities).includes(state.city)) out.city = ''
      if (state.cityRegion && !regionValuesFor(patch.category, cityRegions).includes(state.cityRegion)) {
        out.cityRegion = ''
      }
    }
    onChange(out)
  }

  /** Название единицы площади: подписи полей и плейсхолдеры «от, сотки» */
  const unitName = areaUnit === 'are' ? t.catalog.areName : areaUnit === 'ha' ? t.catalog.hectareName : t.catalog.sqm
  const areaPh = (edge: 'от' | 'до') => `${edge}, ${unitName}`
  // Участок: площадь объекта — это и есть площадь участка, поэтому подпись
  // «Площадь участка, сотки/га/м²» (у остальных категорий — просто «Площадь»)
  const areaLabel = isLand ? `${t.catalog.plotAreaLabel}, ${unitName}` : t.catalog.areaLabel
  const unitBtn = (u: AreaUnit) =>
    `px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
      areaUnit === u
        ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
        : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
    }`

  return (
    <div ref={panelRef} className="flex flex-wrap items-end gap-3 p-4 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
      <div className="w-48">
        <Dropdown label={t.catalog.dealLabel} value={state.type} options={typeOptions}
          open={openId === 'type'} onToggle={() => toggle('type')} onClose={close}
          onSelect={(v) => apply({ type: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.typeLabel} value={state.category} options={categoryOptions}
          open={openId === 'category'} onToggle={() => toggle('category')} onClose={close}
          onSelect={(v) => apply({ category: v })} />
      </div>
      {/* «Город» — иерархия регионов: Осетия и межрегиональные направления Н15
          (Москва, Краснодарский край…). При открытии — только регионы, их
          населённые пункты показываются по стрелке, у каждого — счётчик
          объектов и строка «Все населённые пункты региона». Выбор города или
          региона снимает осетинские адресные фильтры — и наоборот. У участков
          межрегиональных направлений нет: в списке только Осетия (см.
          regionValuesFor), а район, населённые пункты и товарищества рядом с
          ней остаются — это и есть структура поиска участков */}
      <div className="w-full sm:w-64">
        <CityDropdown label={t.catalog.cityLabel} regions={shownRegions} place={cityPlace}
          regionKey={state.cityRegion} onPlace={pickPlace} onRegion={pickRegion} onClear={clearCity} t={t}
          open={openId === 'city'} onToggle={() => toggle('city')} onClose={close} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.districtLabel} value={state.district}
          options={DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
          open={openId === 'district'} onToggle={() => toggle('district')} onClose={close}
          onSelect={(v) => {
            const patch: Partial<FiltersState> = { district: v }
            // Если выбранный пункт не входит в новый район — сбрасываем его
            if (v && state.locality && !(LOCALITIES_BY_DISTRICT[v] || []).includes(state.locality)) {
              patch.locality = ''
            }
            apply({ ...patch, ...dropInterregionalCity(v) })
          }} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.cityDistrictLabel} value={state.cityDistrict}
          options={CITY_DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
          open={openId === 'cityDistrict'} onToggle={() => toggle('cityDistrict')} onClose={close}
          onSelect={(v) => apply({ cityDistrict: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-48">
        {/* «Населённый пункт» — длинная подпись: компактный шрифт, чтобы помещалась в одну строку */}
        <Dropdown label={t.catalog.localityLabel} value={state.locality}
          options={localityOptions} compactLabel
          open={openId === 'locality'} onToggle={() => toggle('locality')} onClose={close}
          onSelect={(v) => apply({ locality: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-56">
        {/* Садоводческие товарищества: список сгруппирован по категориям
            СНТ/СНО/ДНТ — товарищества живут только внутри Владикавказского
            городского округа и не относятся к районам республики */}
        <Dropdown label={t.catalog.sntLabel} value={state.snt} compactLabel
          groups={GARDENING_CATEGORY_ORDER
            .filter((c) => GARDENING_AREAS[c].length > 0)
            .map((c) => ({ label: c, options: GARDENING_AREAS[c].map((s) => ({ value: s, label: s })) }))}
          open={openId === 'snt'} onToggle={() => toggle('snt')} onClose={close}
          onSelect={(v) => apply({ snt: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-48">
        <div className={labelCls() + ' mb-1'}>{t.catalog.priceLabel}</div>
        <div className="flex gap-2">
          <input type="number" min="0" placeholder="от" value={state.priceMin}
            onChange={(e) => apply({ priceMin: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
          <input type="number" min="0" placeholder="до" value={state.priceMax}
            onChange={(e) => apply({ priceMax: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
        </div>
      </div>
      <div className="w-52">
        {/* Площадь: диапазон «от/до». У участков это «Площадь участка» и
            единицу можно переключить на сотки или гектары (в базе площадь
            всё равно в м² — пересчитывает buildWhere), дробные значения
            разрешены. У остальных категорий — всегда м², кнопок нет. */}
        <div className={labelCls() + ' mb-1'}>{areaLabel}</div>
        <div className="flex gap-2">
          <input type="number" min="0" step="any" placeholder={areaPh('от')} value={state.areaMin}
            onChange={(e) => apply({ areaMin: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
          <input type="number" min="0" step="any" placeholder={areaPh('до')} value={state.areaMax}
            onChange={(e) => apply({ areaMax: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
        </div>
        {isLand && (
          <div className="flex gap-1 mt-2">
            <button type="button" onClick={() => apply({ areaUnit: 'sqm' })} className={unitBtn('sqm')}>
              {t.catalog.sqm}
            </button>
            <button type="button" onClick={() => apply({ areaUnit: 'are' })} className={unitBtn('are')}>
              {t.catalog.areName}
            </button>
            <button type="button" onClick={() => apply({ areaUnit: 'ha' })} className={unitBtn('ha')}>
              {t.catalog.hectareName}
            </button>
          </div>
        )}
      </div>
      <div>
        <div className={labelCls() + ' mb-1'}>{t.catalog.roomsLabel}</div>
        <div className="flex gap-1">
          {['', '1', '2', '3', '4'].map((r) => (
            <button key={r} type="button" onClick={() => apply({ rooms: state.rooms === r ? '' : r })}
              className={`px-3 py-2 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
                state.rooms === r
                  ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
                  : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
              }`}>
              {r === '' ? t.common.all : r === '4' ? '4+' : r}
            </button>
          ))}
        </div>
      </div>
      {hasFilters && (
        <button type="button" onClick={() => onChange(emptyFilters)}
          className="ml-auto text-xs text-[var(--n15-gold)] underline uppercase tracking-wider">
          {t.catalog.resetFilters}
        </button>
      )}
    </div>
  )
}

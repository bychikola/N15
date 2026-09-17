'use client'

import { useMemo, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
// Садовые товарищества (СНТ/СНО/ДНТ) — те же справочники, что в подразделе
// лендинга: категории из GARDENING_AREAS, всё внутри Владикавказского округа
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS, GARDENING_CATEGORY_ORDER, GARDENING_AREAS, LAND_CITY_OPTIONS } from '@/lib/districts'
import { SNT_AREAS } from '@/components/home/landing-data'
// Города «Межрегиональной недвижимости» приходят готовыми группами из CRM
// (см. src/lib/interregional-service.ts) — в клиентском компоненте списка нет
// Конвертация площади участков: 1 сотка = 100 м² (см. также хелперы ввода)
import { SQM_PER_ARE, areaNumberText, parseAreaNumber } from '@/lib/area-format'

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
  /** Единица площади в фильтре: '' — не выбрана (= м²), 'are' — сотки.
   *  Имеет смысл только для категории «участок»; у остальных категорий
   *  площадь всегда в м². */
  areaUnit: '' | 'sqm' | 'are'
  district: string
  cityDistrict: string
  locality: string
  snt: string
  /** Город вне Северной Осетии (межрегиональные объекты) либо Владикавказ
   *  у участков (межрегиональных направлений у земли нет). Взаимоисключается
   *  с осетинскими адресными фильтрами: район/нас. пункт/товарищество —
   *  кроме участков, где город — часть той же структуры поиска. */
  city: string
  /** id агента: показываем только его объекты. Постоянного поля в панели
   *  фильтров у него нет — фильтр приходит ссылкой с карточек команды,
   *  а снимается чипом «Объекты агента» над выдачей */
  agent: string
}

export const emptyFilters: FiltersState = {
  type: '', category: '', rooms: '', priceMin: '', priceMax: '', areaMin: '', areaMax: '', areaUnit: '', district: '', cityDistrict: '', locality: '', snt: '', city: '', agent: '',
}

// Число из фильтра: позволяет и «600», и «11,5» (запятая — как вводят вручную)
const numOf = (v: string): number | null => parseAreaNumber(v)

/**
 * Группы фильтра «Город» (межрегиональные объекты): населённые пункты по
 * регионам. Подгруппа с названием (Московская область, Ленинградская
 * область…) становится отдельной группой, чтобы города разных регионов не
 * смешивались. Список приходит из CRM (см. src/lib/interregional-service.ts).
 */
export type CityGroup = { label: string; options: { value: string; label: string }[] }

/**
 * Допустимые значения фильтра «Город» для категории: у участков — только
 * Владикавказ (земля Н15 вне межрегиональных направлений, см. districts.ts),
 * у остальных категорий — города межрегионального справочника из CRM.
 * Чужое значение отбрасываем: where по несуществующему городу молча даёт
 * пустую выдачу, а ссылка с ним живёт в закладках.
 */
export const cityValuesFor = (category: string, knownCities: readonly string[]): readonly string[] =>
  category === 'land' ? LAND_CITY_OPTIONS : knownCities

export function buildWhere(f: FiltersState, q: string, knownCities: readonly string[]): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  // На сайте показываем только опубликованные (черновики и архив скрыты)
  conds.push({ status: { equals: 'published' } })
  // Select-поля фильтруем только значениями из их опций (см. isKnown выше)
  if (f.type && isKnown(f.type, OBJECT_TYPES)) conds.push({ type: { equals: f.type } })
  if (f.category && isKnown(f.category, OBJECT_CATEGORIES)) conds.push({ category: { equals: f.category } })
  if (f.district && isKnown(f.district, DISTRICT_OPTIONS)) conds.push({ 'address.district': { equals: f.district } })
  if (f.cityDistrict && isKnown(f.cityDistrict, CITY_DISTRICT_OPTIONS)) conds.push({ 'address.cityDistrict': { equals: f.cityDistrict } })
  if (f.locality) conds.push({ 'address.locality': { equals: f.locality } })
  if (f.snt && isKnown(f.snt, SNT_AREAS)) conds.push({ 'address.snt': { equals: f.snt } })
  // Города: у участков список свой (только Владикавказ), у остальных — CRM
  if (f.city && isKnown(f.city, cityValuesFor(f.category, knownCities))) {
    conds.push({ 'address.city': { equals: f.city } })
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
  // Площадь в базе всегда в м²; «сотки» выбраны — переводим (1 сотка = 100 м²)
  const areaMul = f.category === 'land' && f.areaUnit === 'are' ? SQM_PER_ARE : 1
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

function Dropdown({ label, value, options, groups, onSelect, compactLabel }: {
  label: string
  value: string
  /** Простые пункты без групп (сделка, тип, район…) */
  options?: { value: string; label: string }[]
  /** Группы с заголовками — например категории СНТ/СНО/ДНТ садовых
   *  товариществ. Если заданы, options не используется */
  groups?: { label: string; options: { value: string; label: string }[] }[]
  onSelect: (v: string) => void
  compactLabel?: boolean
}) {
  const [open, setOpen] = useState(false)
  const entries: DropdownEntry[] = groups
    ? groups.flatMap((g) => [
        { kind: 'header', label: g.label },
        ...g.options.map((o) => ({ kind: 'option' as const, ...o })),
      ])
    : (options ?? []).map((o) => ({ kind: 'option' as const, ...o }))
  const current = entries.find((e): e is Extract<DropdownEntry, { kind: 'option' }> => e.kind === 'option' && e.value === value)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={ddBtnCls} aria-expanded={open}>
        {/* min-w-0 — колонка подписи сжимается под ширину кнопки, подпись и
            значение переносятся по словам (break-words) и не выходят за рамку */}
        <span className="flex flex-col items-start min-w-0">
          <span className={labelCls(compactLabel) + ' break-words'}>{label}</span>
          <span className="break-words">{current?.label ?? 'Любой'}</span>
        </span>
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 py-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg">
          <button type="button" onClick={() => { onSelect(''); setOpen(false) }}
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
              <button key={e.value} type="button" onClick={() => { onSelect(e.value); setOpen(false) }}
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

interface CatalogFiltersProps {
  state: FiltersState
  onChange: (patch: Partial<FiltersState>) => void
  t: Dict
  /** Группы фильтра «Город» — населённые пункты межрегионального справочника
   *  из CRM. У участков не используются: там города — LAND_CITY_OPTIONS */
  cityGroups: CityGroup[]
}

export default function CatalogFilters({ state, onChange, t, cityGroups }: CatalogFiltersProps) {
  const typeOptions = Object.entries(t.typeLabels).map(([value, label]) => ({ value, label }))
  const categoryOptions = Object.entries(t.categoryLabels).map(([value, label]) => ({ value, label }))
  // Пункты зависят от выбранного района: показываем только его нас. пункты
  const localityOptions = state.district
    ? (LOCALITIES_BY_DISTRICT[state.district] || []).map((l) => ({ value: l, label: l }))
    : LOCALITY_OPTIONS.map((l) => ({ value: l, label: l }))
  // Единица площади действует только для участков; не выбрана — подразумеваются м²
  const isLand = state.category === 'land'
  const areaUnit = isLand && state.areaUnit === 'are' ? 'are' : 'sqm'
  const hasFilters = state.type || state.category || state.rooms || state.priceMin || state.priceMax || state.areaMin || state.areaMax || state.district || state.cityDistrict || state.locality || state.snt || state.city
  // Города фильтра «Город» для текущей категории: у участков — только
  // Владикавказ, у остальных — справочник CRM (см. cityValuesFor)
  const knownCities = useMemo(() => cityGroups.flatMap((g) => g.options.map((o) => o.value)), [cityGroups])

  // Межрегиональный город (Москва, Химки…) и осетинские адресные фильтры
  // взаимоисключающие: выбран один — снимается другой. У участков город один —
  // Владикавказ, и он не спорит с районом, населённым пунктом и товариществом
  // (структура поиска участков: Владикавказ → населённые пункты →
  // товарищества) — такие фильтры рядом с ним остаются
  const dropInterregionalCity = (v: string): Partial<FiltersState> => (v && !isLand ? { city: '' } : {})

  /**
   * Смена единицы площади (кнопки «м²/сотки»): числа в полях «от/до»
   * пересчитываются, чтобы фильтр сохранял тот же диапазон площади —
   * 600 м² становятся 6, и наоборот. Вне участков единица всегда м².
   */
  const convertArea = (text: string, from: 'sqm' | 'are', to: 'sqm' | 'are'): string => {
    const v = parseAreaNumber(text)
    if (v == null) return text
    return areaNumberText(from === to ? v : to === 'are' ? v / SQM_PER_ARE : v * SQM_PER_ARE)
  }

  const apply = (patch: Partial<FiltersState>) => {
    const out: Partial<FiltersState> = { ...patch }
    // Смена единицы: переводим уже введённые от/до в новую единицу
    if (patch.areaUnit && patch.areaUnit !== areaUnit) {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, areaUnit, patch.areaUnit) : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, areaUnit, patch.areaUnit) : state.areaMax
    }
    // Категория сменилась с участков: числа были в сотках — вернём в м²,
    // чтобы при следующем входе в «участки» они читались однозначно
    if (patch.category !== undefined && patch.category !== 'land' && areaUnit === 'are') {
      out.areaMin = state.areaMin ? convertArea(state.areaMin, 'are', 'sqm') : state.areaMin
      out.areaMax = state.areaMax ? convertArea(state.areaMax, 'are', 'sqm') : state.areaMax
      out.areaUnit = 'sqm'
    }
    // Категория сменилась: у новой категории свой список городов (у участков —
    // только Владикавказ), и город из прежнего в нём может не значиться.
    // Сбрасываем его, иначе в поле остаётся чужое значение, а фильтр по нему
    // молча ничего не находит
    if (patch.category !== undefined && patch.category !== state.category && state.city
      && !cityValuesFor(patch.category, knownCities).includes(state.city)) {
      out.city = ''
    }
    onChange(out)
  }

  const areaPh = (edge: 'от' | 'до') =>
    `${edge}, ${areaUnit === 'are' ? t.catalog.areName : t.catalog.sqm}`
  const areaLabel = areaUnit === 'are' ? t.catalog.areaLabelAre : t.catalog.areaLabel
  const unitBtn = (u: 'sqm' | 'are') =>
    `px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-all duration-300 cursor-pointer ${
      areaUnit === u
        ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
        : 'border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)]'
    }`

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
      <div className="w-48">
        <Dropdown label={t.catalog.dealLabel} value={state.type} options={typeOptions}
          onSelect={(v) => apply({ type: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.typeLabel} value={state.category} options={categoryOptions}
          onSelect={(v) => apply({ category: v })} />
      </div>
      <div className="w-48">
        {/* «Город» — объекты за пределами Северной Осетии (межрегиональные
            направления Н15): города сгруппированы по регионам справочника.
            Выбор города снимает осетинские адресные фильтры — и наоборот.
            У участков межрегиональных направлений нет: в поле только «Любой»
            и «Владикавказ» (см. districts.ts), рядом с ним район, населённые
            пункты и товарищества остаются — это и есть структура поиска
            участков */}
        <Dropdown label={t.catalog.cityLabel} value={state.city} compactLabel
          options={isLand ? LAND_CITY_OPTIONS.map((c) => ({ value: c, label: c })) : undefined}
          groups={isLand ? undefined : cityGroups}
          onSelect={(v) => apply(v && !isLand
            ? { city: v, district: '', cityDistrict: '', locality: '', snt: '' }
            : { city: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.districtLabel} value={state.district}
          options={DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
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
          onSelect={(v) => apply({ cityDistrict: v, ...dropInterregionalCity(v) })} />
      </div>
      <div className="w-48">
        {/* «Населённый пункт» — длинная подпись: компактный шрифт, чтобы помещалась в одну строку */}
        <Dropdown label={t.catalog.localityLabel} value={state.locality}
          options={localityOptions} compactLabel
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
        {/* Площадь: диапазон «от/до». У участков единицу можно переключить
            на сотки (в базе площадь всё равно в м² — пересчитывает buildWhere).
            У остальных категорий — всегда м², кнопок нет. */}
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

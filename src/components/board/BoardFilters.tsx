'use client'

import type { Dict } from '@/i18n/dictionaries'
import { Dropdown, RangeInputs } from '@/components/objects/CatalogFilters'
import { OBJECT_CATEGORY_VALUES, categoryLabel } from '@/lib/object-categories'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from '@/lib/districts'

/**
 * Панель фильтров доски объявлений.
 *
 * Устроена проще каталога объектов: на доске нет характеристик вроде отопления
 * и кадастровых номеров — объявления подают частные лица, и спрашивать с них
 * столько же, сколько с агента, нельзя. Осталось то, по чему объявления
 * действительно выбирают: сделка, категория, комнаты, цена, площадь, этаж,
 * район и кто разместил.
 *
 * Примитивы (Dropdown, RangeInputs) взяты из фильтров каталога — те же кнопки
 * и списки, что на странице объектов, чтобы доска читалась как часть сайта.
 */

/** Состояние фильтров доски: пустая строка — «не выбрано» */
export interface BoardFiltersState {
  type: string
  category: string
  rooms: string
  priceMin: string
  priceMax: string
  areaMin: string
  areaMax: string
  floorMin: string
  floorMax: string
  district: string
  authorKind: string
}

export const emptyBoardFilters: BoardFiltersState = {
  type: '',
  category: '',
  rooms: '',
  priceMin: '',
  priceMax: '',
  areaMin: '',
  areaMax: '',
  floorMin: '',
  floorMax: '',
  district: '',
  authorKind: '',
}

/** Имена фильтров в адресе страницы — те же, что читает серверная выдача */
export const BOARD_URL_PARAM: Record<keyof BoardFiltersState, string> = {
  type: 'type',
  category: 'category',
  rooms: 'rooms',
  priceMin: 'price_min',
  priceMax: 'price_max',
  areaMin: 'area_min',
  areaMax: 'area_max',
  floorMin: 'floor_min',
  floorMax: 'floor_max',
  cityDistrict: 'city_district',
  district: 'district',
  authorKind: 'author',
} as Record<keyof BoardFiltersState, string>

/** Есть ли что сбрасывать — для кнопки «Сбросить фильтры» */
export const hasBoardFilters = (f: BoardFiltersState): boolean =>
  Object.values(f).some((v) => Boolean(v))

interface BoardFiltersProps {
  t: Dict
  state: BoardFiltersState
  onChange: (next: BoardFiltersState) => void
  /** Какой список раскрыт: открытым держится только один (как в каталоге) */
  openId: string
  onOpen: (id: string) => void
  onClose: () => void
}

export function BoardFilters({ t, state, onChange, openId, onOpen, onClose }: BoardFiltersProps) {
  const set = (key: keyof BoardFiltersState, value: string) => onChange({ ...state, [key]: value })

  // Район одним списком с двумя группами: сначала районы Владикавказа,
  // потом районы республики — так человек ищет «где», а не «какой справочник»
  const districtGroups = [
    {
      label: t.board.vladikavkaz,
      options: CITY_DISTRICT_OPTIONS.map((d) => ({ value: `city:${d}`, label: d })),
    },
    {
      label: t.catalog.districtLabel,
      options: DISTRICT_OPTIONS.map((d) => ({ value: `rep:${d}`, label: d })),
    },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        label={t.board.dealLabel}
        value={state.type}
        options={[
          { value: 'sale', label: t.object.sale },
          { value: 'rent', label: t.object.rent },
        ]}
        onSelect={(v) => set('type', v === state.type ? '' : v)}
        open={openId === 'type'}
        onToggle={() => (openId === 'type' ? onClose() : onOpen('type'))}
        onClose={onClose}
      />

      <Dropdown
        label={t.board.categoryLabel}
        value={state.category ? categoryLabel(state.category) : ''}
        options={OBJECT_CATEGORY_VALUES.map((c) => ({ value: c, label: categoryLabel(c) }))}
        onSelect={(v) => set('category', v === state.category ? '' : v)}
        open={openId === 'category'}
        onToggle={() => (openId === 'category' ? onClose() : onOpen('category'))}
        onClose={onClose}
      />

      <Dropdown
        label={t.catalog.roomsLabel}
        value={state.rooms ? `${state.rooms}+` : ''}
        options={[
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '4', label: `4+` },
        ]}
        onSelect={(v) => set('rooms', v === state.rooms ? '' : v)}
        open={openId === 'rooms'}
        onToggle={() => (openId === 'rooms' ? onClose() : onOpen('rooms'))}
        onClose={onClose}
      />

      <Dropdown
        label={t.board.districtLabel}
        value={state.district ? state.district.replace(/^(city|rep):/, '') : ''}
        groups={districtGroups}
        onSelect={(v) => set('district', v === state.district ? '' : v)}
        open={openId === 'district'}
        onToggle={() => (openId === 'district' ? onClose() : onOpen('district'))}
        onClose={onClose}
      />

      <Dropdown
        label={t.board.authorLabel}
        value={
          state.authorKind === 'private'
            ? t.board.authorPrivate
            : state.authorKind === 'agency'
              ? t.board.authorAgency
              : ''
        }
        options={[
          { value: 'private', label: t.board.authorPrivate },
          { value: 'agency', label: t.board.authorAgency },
        ]}
        onSelect={(v) => set('authorKind', v === state.authorKind ? '' : v)}
        open={openId === 'author'}
        onToggle={() => (openId === 'author' ? onClose() : onOpen('author'))}
        onClose={onClose}
      />

      {/* Диапазоны — «от» и «до» в одной строке, как в каталоге */}
      <RangeInputs
        from={state.priceMin}
        to={state.priceMax}
        onFrom={(v) => set('priceMin', v)}
        onTo={(v) => set('priceMax', v)}
        fromHint={t.board.priceFrom}
        toHint={t.board.priceTo}
      />
      <RangeInputs
        from={state.areaMin}
        to={state.areaMax}
        onFrom={(v) => set('areaMin', v)}
        onTo={(v) => set('areaMax', v)}
        fromHint={t.board.areaFrom}
        toHint={t.board.areaTo}
      />
      <RangeInputs
        from={state.floorMin}
        to={state.floorMax}
        onFrom={(v) => set('floorMin', v)}
        onTo={(v) => set('floorMax', v)}
        step="1"
        min="1"
        fromHint={t.board.floorFrom}
        toHint={t.board.floorTo}
      />

      {hasBoardFilters(state) && (
        <button
          type="button"
          onClick={() => onChange(emptyBoardFilters)}
          className="px-3 py-2 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/20 text-[var(--n15-muted)] hover:border-[var(--n15-gold)]/40 hover:text-[var(--n15-silver)] transition-all duration-300 cursor-pointer"
        >
          {t.catalog.resetFilters}
        </button>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
// Садовые товарищества — тот же справочник, что в разделах СТ/СНТ/СНО на главной
import { SNT_AREAS } from '@/components/home/landing-data'

export interface FiltersState {
  type: string
  category: string
  rooms: string
  priceMin: string
  priceMax: string
  areaMin: string
  district: string
  cityDistrict: string
  locality: string
  snt: string
}

export const emptyFilters: FiltersState = {
  type: '', category: '', rooms: '', priceMin: '', priceMax: '', areaMin: '', district: '', cityDistrict: '', locality: '', snt: '',
}

export function buildWhere(f: FiltersState, q: string): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  // На сайте показываем только опубликованные (черновики и архив скрыты)
  conds.push({ status: { equals: 'published' } })
  if (f.type) conds.push({ type: { equals: f.type } })
  if (f.category) conds.push({ category: { equals: f.category } })
  if (f.district) conds.push({ 'address.district': { equals: f.district } })
  if (f.cityDistrict) conds.push({ 'address.cityDistrict': { equals: f.cityDistrict } })
  if (f.locality) conds.push({ 'address.locality': { equals: f.locality } })
  if (f.snt) conds.push({ 'address.snt': { equals: f.snt } })
  if (f.rooms) {
    conds.push(f.rooms === '4'
      ? { rooms: { greater_than_equal: 4 } }
      : { rooms: { equals: parseInt(f.rooms, 10) } })
  }
  if (f.priceMin) conds.push({ price: { greater_than_equal: parseInt(f.priceMin, 10) } })
  if (f.priceMax) conds.push({ price: { less_than_equal: parseInt(f.priceMax, 10) } })
  if (f.areaMin) conds.push({ area: { greater_than_equal: parseInt(f.areaMin, 10) } })
  if (q) conds.push({ or: [{ title: { contains: q } }, { 'address.street': { contains: q } }] })
  return conds.length ? { and: conds } : {}
}

const labelCls = 'text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]'
const ddBtnCls = 'flex items-center justify-between gap-3 w-full px-4 py-2.5 text-sm text-[var(--n15-silver)] border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 hover:border-[var(--n15-gold)]/40 transition-colors'

function Dropdown({ label, value, options, onSelect }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onSelect: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={ddBtnCls} aria-expanded={open}>
        <span className="flex flex-col items-start">
          <span className={labelCls}>{label}</span>
          <span>{current?.label ?? 'Любой'}</span>
        </span>
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 py-1 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 shadow-lg">
          <button type="button" onClick={() => { onSelect(''); setOpen(false) }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === '' ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
            Любой
          </button>
          {options.map((o) => (
            <button key={o.value} type="button" onClick={() => { onSelect(o.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--n15-gold)]/8 ${value === o.value ? 'text-[var(--n15-gold)]' : 'text-[var(--n15-silver)]'}`}>
              {o.label}
            </button>
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
}

export default function CatalogFilters({ state, onChange, t }: CatalogFiltersProps) {
  const typeOptions = Object.entries(t.typeLabels).map(([value, label]) => ({ value, label }))
  const categoryOptions = Object.entries(t.categoryLabels).map(([value, label]) => ({ value, label }))
  // Пункты зависят от выбранного района: показываем только его нас. пункты
  const localityOptions = state.district
    ? (LOCALITIES_BY_DISTRICT[state.district] || []).map((l) => ({ value: l, label: l }))
    : LOCALITY_OPTIONS.map((l) => ({ value: l, label: l }))
  const hasFilters = state.type || state.category || state.rooms || state.priceMin || state.priceMax || state.areaMin || state.district || state.cityDistrict || state.locality || state.snt

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
      <div className="w-48">
        <Dropdown label={t.catalog.dealLabel} value={state.type} options={typeOptions}
          onSelect={(v) => onChange({ type: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.typeLabel} value={state.category} options={categoryOptions}
          onSelect={(v) => onChange({ category: v })} />
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
            onChange(patch)
          }} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.cityDistrictLabel} value={state.cityDistrict}
          options={CITY_DISTRICT_OPTIONS.map((d) => ({ value: d, label: d }))}
          onSelect={(v) => onChange({ cityDistrict: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.localityLabel} value={state.locality}
          options={localityOptions}
          onSelect={(v) => onChange({ locality: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.sntLabel} value={state.snt}
          options={SNT_AREAS.map((s) => ({ value: s, label: s }))}
          onSelect={(v) => onChange({ snt: v })} />
      </div>
      <div className="w-48">
        <div className={labelCls + ' mb-1'}>{t.catalog.priceLabel}</div>
        <div className="flex gap-2">
          <input type="number" min="0" placeholder="от" value={state.priceMin}
            onChange={(e) => onChange({ priceMin: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
          <input type="number" min="0" placeholder="до" value={state.priceMax}
            onChange={(e) => onChange({ priceMax: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
        </div>
      </div>
      <div className="w-40">
        <div className={labelCls + ' mb-1'}>{t.catalog.areaLabel}</div>
        <input type="number" min="0" placeholder="от, м²" value={state.areaMin}
          onChange={(e) => onChange({ areaMin: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[var(--n15-black)]/40 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
      </div>
      <div>
        <div className={labelCls + ' mb-1'}>{t.catalog.roomsLabel}</div>
        <div className="flex gap-1">
          {['', '1', '2', '3', '4'].map((r) => (
            <button key={r} type="button" onClick={() => onChange({ rooms: state.rooms === r ? '' : r })}
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

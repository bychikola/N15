# Гибридный редизайн каталога N15 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать каталог объектов N15 по паттернам alaniadom.ru в фирменных красках N15 (бургунди-градиент для цены на фото, пилюли, поиск, dropdown-фильтры, сортировка, «ПОКАЗАТЬ ЕЩЁ»), доработать страницу объекта.

**Architecture:** Клиентский список (как сейчас) с расширенными параметрами Payload REST (`where`/`sort`/`page`/`limit`); серверная страница объекта остаётся серверным компонентом. Новые компоненты: `ObjectCard` (чистый рендер, работает и в RSC) и `CatalogFilters` (клиентский). Палитра — CSS-переменные в обеих темах.

**Tech Stack:** Next.js 16 (Turbopack), Tailwind 4, Payload CMS REST `/api/objects`, TypeScript, i18n (ru/os).

**Спека:** `docs/superpowers/specs/2026-08-11-catalog-hybrid-design.md`

## Global Constraints

- Тестовый фреймворк в проекте отсутствует — проверка каждой задачи: `npx tsc --noEmit` + `npm run lint` + визуальная проверка на dev-сервере (http://localhost:3000, уже запущен)
- Углы острые (0) — база; пилюли (999px) — только поиск и бейджи; капс-лейблы с трекингом — интерфейс
- Все UI-строки — только через словари i18n; os-словарь типизирован как `typeof ru` — пропущенный ключ ломает сборку
- Палитра — через CSS-переменные, работает в обеих темах (светлая по умолчанию, тёмная `html[data-theme='dark']`)
- Ссылки на объекты: `/${lang}/catalog/${obj.slug || obj.id}` — роут `[slug]` парсит `parseInt(slug)`
- Не трогаем: Header/Footer, ThemeSwitcher, ObjectMap, ImageSlider, схемы Payload, /api/objects
- Не добавляем: тест-фреймворк, скидки, избранное (нет механики)

---

### Task 1: Токены гибрида и базовые классы в globals.css

**Files:**
- Modify: `src/app/globals.css` — блок токенов в `:root` и `html[data-theme='dark']`, классы карточки

**Interfaces:**
- Produces: CSS-переменные `--card-gradient`, `--card-price-fg`, `--pill-bg`, `--pill-fg`, `--search-bg`, `--search-border` (обе темы) и классы `.object-card__overlay`, `.object-card__pill`, `.catalog-search` — используются в Task 3 и Task 5

- [ ] **Step 1: Добавить токены в `:root`**

В `src/app/globals.css`, внутри блока `:root` (после `--font-body`), добавить:

```css
  /* Hybrid catalog tokens */
  --card-gradient: linear-gradient(to top, rgba(114, 47, 55, .92), transparent 72%);
  --card-price-fg: #F6F2E9;
  --pill-bg: rgba(246, 242, 233, .92);
  --pill-fg: #722F37;
  --search-bg: rgba(255, 255, 255, .6);
  --search-border: rgba(176, 141, 62, .35);
```

- [ ] **Step 2: Добавить те же токены в тёмную тему**

В `html[data-theme='dark']` (после `--font-body`):

```css
  /* Hybrid catalog tokens */
  --card-gradient: linear-gradient(to top, rgba(114, 47, 55, .92), transparent 72%);
  --card-price-fg: #F5F5F7;
  --pill-bg: rgba(245, 245, 247, .92);
  --pill-fg: #722F37;
  --search-bg: rgba(26, 26, 30, .6);
  --search-border: rgba(200, 164, 78, .35);
```

- [ ] **Step 3: Добавить классы компонентов** (в конец globals.css, после секции Utility Classes)

```css
/* ── Hybrid catalog components ─────────────────── */

.object-card__media {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}
.object-card__overlay {
  position: absolute;
  inset: auto 0 0 0;
  height: 55%;
  background: var(--card-gradient);
  pointer-events: none;
}
.object-card__pill {
  position: absolute;
  top: .75rem;
  left: .75rem;
  background: var(--pill-bg);
  color: var(--pill-fg);
  font-size: 10px;
  letter-spacing: .2em;
  text-transform: uppercase;
  padding: .35rem .8rem;
  border-radius: 999px;
  font-weight: 600;
}
.catalog-search {
  display: flex;
  align-items: center;
  gap: .5rem;
  background: var(--search-bg);
  border: 1px solid var(--search-border);
  border-radius: 999px;
  padding: .6rem 1rem;
}
.catalog-search input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  color: var(--foreground);
}
.catalog-search input::placeholder {
  color: var(--muted);
}
```

- [ ] **Step 4: Проверить**

Run: `npx tsc --noEmit`
Expected: PASS (0 ошибок)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): add hybrid catalog tokens (burgundy gradient, pills, search)"
```

---

### Task 2: Новые ключи словарей i18n (ru + os)

**Files:**
- Modify: `src/i18n/dictionaries.ts` — `ru.catalog`, `ru.object` (строки 105-160), зеркально `os.catalog`, `os.object` (строки ~438-494)

**Interfaces:**
- Produces: ключи `catalog.searchPlaceholder`, `catalog.sortDefault`, `catalog.sortPriceAsc`, `catalog.sortPriceDesc`, `catalog.sortAreaDesc`, `catalog.showMore`, `catalog.roomsLabel`, `catalog.priceLabel`, `catalog.areaLabel`, `object.breadcrumbCatalog`, `object.similarTitle`, `object.allCatalog`, `object.balcony`, `object.balconyOptions`, `object.phone`, `object.telegram`, `object.whatsapp` — используются в Task 3-6

- [ ] **Step 1: Добавить ключи в `ru.catalog`** (внутри объекта `catalog: { ... }`, после `premium`)

```ts
    searchPlaceholder: 'Поиск по объявлениям…',
    sortDefault: 'Подобрали для вас',
    sortPriceAsc: 'Цена: по возрастанию',
    sortPriceDesc: 'Цена: по убыванию',
    sortAreaDesc: 'Площадь: по убыванию',
    showMore: 'Показать ещё',
    roomsLabel: 'Комнаты',
    priceLabel: 'Цена, ₽',
    areaLabel: 'Площадь, м²',
```

- [ ] **Step 2: Добавить ключи в `ru.object`** (после `leadingExpert`)

```ts
    breadcrumbCatalog: 'Каталог',
    similarTitle: 'Ещё в каталоге',
    allCatalog: 'Весь каталог',
    balcony: 'Балкон',
    balconyOptions: {
      none: 'Нет',
      balcony: 'Балкон',
      loggia: 'Лоджия',
      several: 'Несколько',
    },
    phone: 'Позвонить',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
```

- [ ] **Step 3: Добавить те же ключи в `os`** (зеркально, внутри `os.catalog` после `premium`, `os.object` после `leadingExpert`)

```ts
    searchPlaceholder: 'Агъæппæрæнтæм рагæс…',
    sortDefault: 'Дæ цæстытыл фæзынд',
    sortPriceAsc: 'Аргъ: ацылæй стырмæ',
    sortPriceDesc: 'Аргъ: стырæй чысылмæ',
    sortAreaDesc: 'Фæзуат: стырæй чысылмæ',
    showMore: 'Маддæр æвдисын',
    roomsLabel: 'Уаттæ',
    priceLabel: 'Аргъ, ₽',
    areaLabel: 'Фæзуат, м²',
```

```ts
    breadcrumbCatalog: 'Каталог',
    similarTitle: 'Маддæр каталогы',
    allCatalog: 'Æппæт каталог',
    balcony: 'Балкон',
    balconyOptions: {
      none: 'Нæй',
      balcony: 'Балкон',
      loggia: 'Лоджи',
      several: 'Цалдæр',
    },
    phone: 'Фæндыгон кæнын',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
```

- [ ] **Step 4: Проверить**

Run: `npx tsc --noEmit`
Expected: PASS — если в os пропущен ключ, будет ошибка типа (это фича типизации)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries.ts
git commit -m "feat(i18n): add catalog search/sort/pagination and object balcony/agent keys (ru+os)"
```

---

### Task 3: Компонент карточки ObjectCard

**Files:**
- Create: `src/components/objects/ObjectCard.tsx`

**Interfaces:**
- Consumes: `t: Dict` (тип из `@/i18n/dictionaries`), токены из Task 1
- Produces: `ObjectCard({ obj, lang, t }: { obj: ObjectListItem; lang: string; t: Dict })` — чистый рендер без хуков (работает в RSC), используется в Task 5 (клиент) и Task 6 (сервер)
- Тип `ObjectListItem` — экспортируется из этого файла, используется в Task 4/5:

```ts
export interface ObjectListItem {
  id: number
  slug?: string
  title: string
  type: 'sale' | 'rent'
  category: string
  price: number
  area?: number
  rooms?: number
  floor?: number
  totalFloors?: number
  address?: { city?: string; street?: string; house?: string }
  primaryImage?: { url?: string; alt?: string }
  agent?: { name?: string; photo?: { url?: string } }
}
```

- [ ] **Step 1: Создать файл**

`src/components/objects/ObjectCard.tsx`:

```tsx
import type { Dict } from '@/i18n/dictionaries'

export interface ObjectListItem {
  id: number
  slug?: string
  title: string
  type: 'sale' | 'rent'
  category: string
  price: number
  area?: number
  rooms?: number
  floor?: number
  totalFloors?: number
  address?: { city?: string; street?: string; house?: string }
  primaryImage?: { url?: string; alt?: string }
  agent?: { name?: string; photo?: { url?: string } }
}

interface ObjectCardProps {
  obj: ObjectListItem
  lang: string
  t: Dict
}

export default function ObjectCard({ obj, lang, t }: ObjectCardProps) {
  const meta = [
    obj.area && `${obj.area} ${t.catalog.sqm}`,
    obj.rooms && `${obj.rooms} ${t.catalog.rooms}`,
    (obj.floor || obj.totalFloors) && `${obj.floor || '?'}/${obj.totalFloors || '?'} ${t.object.floor.toLowerCase()}`,
  ].filter(Boolean).join(' • ')

  const agentInitials = obj.agent?.name
    ? obj.agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : ''

  const href = `/${lang}/catalog/${obj.slug || obj.id}`

  return (
    <a href={href} className="group block">
      <div className="object-card__media bg-[var(--n15-charcoal)]">
        {obj.primaryImage?.url ? (
          <img
            src={obj.primaryImage.url}
            alt={obj.primaryImage.alt || obj.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity">
              <rect x="4" y="12" width="56" height="44" stroke="#C8A44E" strokeWidth="1" />
              <path d="M4 36 L24 20 L40 32 L60 12" stroke="#C8A44E" strokeWidth="1" />
            </svg>
          </div>
        )}
        <span className="object-card__pill">{obj.type === 'sale' ? t.object.sale : t.object.rent}</span>
        <div className="object-card__overlay" />
        <div className="absolute bottom-3 left-4 right-4 z-10">
          <div className="text-[22px] leading-tight font-[family-name:var(--font-display)] font-semibold text-[var(--card-price-fg)]">
            {obj.price?.toLocaleString(t.locale)} {obj.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}
          </div>
        </div>
      </div>

      <div className="pt-4">
        <h3 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-1.5 group-hover:text-[var(--n15-gold)] transition-colors">
          {obj.title}
        </h3>
        <p className="text-xs text-[var(--n15-muted)] mb-2">
          {[obj.address?.street, obj.address?.house].filter(Boolean).join(', ')}
        </p>
        {meta && <p className="text-[10px] tracking-[0.18em] uppercase text-[var(--n15-muted)] mb-3">{meta}</p>}
        {obj.agent?.name && (
          <div className="flex items-center gap-2">
            {obj.agent.photo?.url ? (
              <img src={obj.agent.photo.url} alt={obj.agent.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center text-[10px] font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                {agentInitials}
              </span>
            )}
            <span className="text-xs text-[var(--n15-muted)]">{obj.agent.name}</span>
          </div>
        )}
      </div>
    </a>
  )
}
```

- [ ] **Step 2: Проверить**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/objects/ObjectCard.tsx
git commit -m "feat(objects): add ObjectCard component (photo + price on burgundy gradient)"
```

---

### Task 4: Компонент фильтров CatalogFilters

**Files:**
- Create: `src/components/objects/CatalogFilters.tsx`

**Interfaces:**
- Consumes: `t: Dict` из Task 2 (ключи `roomsLabel`, `priceLabel`, `areaLabel`, `resetFilters`, `dealLabel`, `typeLabel`, `typeLabels`, `categoryLabels`)
- Produces:
  - `export interface FiltersState { type: string; category: string; rooms: string; priceMin: string; priceMax: string; areaMin: string }`
  - `export function buildWhere(f: FiltersState, q: string): Record<string, unknown>` — чистый билдер Payload `where` (используется в Task 5)
  - `export const emptyFilters: FiltersState`
  - `CatalogFilters({ state, onChange, t }: { state: FiltersState; onChange: (patch: Partial<FiltersState>) => void; t: Dict })` — рендер 3 dropdown (тип, категория, цена-площадь) + чипы комнат + кнопка сброса

- [ ] **Step 1: Создать файл**

`src/components/objects/CatalogFilters.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'

export interface FiltersState {
  type: string
  category: string
  rooms: string
  priceMin: string
  priceMax: string
  areaMin: string
}

export const emptyFilters: FiltersState = {
  type: '', category: '', rooms: '', priceMin: '', priceMax: '', areaMin: '',
}

export function buildWhere(f: FiltersState, q: string): Record<string, unknown> {
  const conds: Record<string, unknown>[] = []
  if (f.type) conds.push({ type: { equals: f.type } })
  if (f.category) conds.push({ category: { equals: f.category } })
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
  const hasFilters = state.type || state.category || state.rooms || state.priceMin || state.priceMax || state.areaMin

  return (
    <div className="flex flex-wrap items-end gap-4 p-6 border border-[var(--n15-gold)]/10 bg-[var(--n15-black)]/30">
      <div className="w-48">
        <Dropdown label={t.catalog.dealLabel} value={state.type} options={typeOptions}
          onSelect={(v) => onChange({ type: v })} />
      </div>
      <div className="w-48">
        <Dropdown label={t.catalog.typeLabel} value={state.category} options={categoryOptions}
          onSelect={(v) => onChange({ category: v })} />
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
```

- [ ] **Step 2: Проверить**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/objects/CatalogFilters.tsx
git commit -m "feat(objects): add CatalogFilters dropdowns and Payload where builder"
```

---

### Task 5: Каталог — поиск, сортировка, пагинация, URL-состояние

**Files:**
- Modify: `src/app/(site)/[lang]/catalog/page.tsx` (весь файл, 158 строк — переписать)

**Interfaces:**
- Consumes: `ObjectCard`, `ObjectListItem` (Task 3), `CatalogFilters`, `FiltersState`, `buildWhere`, `emptyFilters` (Task 4), ключи словаря Task 2
- Produces: обновлённая страница каталога: hero + поиск-пилюля + фильтры + счётчик/сортировка + сетка карточек + «ПОКАЗАТЬ ЕЩЁ»

- [ ] **Step 1: Переписать `src/app/(site)/[lang]/catalog/page.tsx`**

Полный файл (заменяет существующий):

```tsx
'use client'

import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { useI18n } from '@/i18n/i18n-provider'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import CatalogFilters, { buildWhere, emptyFilters, type FiltersState } from '@/components/objects/CatalogFilters'

const PAGE_SIZE = 12

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
  const [filters, setFilters] = useState<FiltersState>(() => ({
    type: searchParams.get('type') ?? '',
    category: searchParams.get('category') ?? '',
    rooms: searchParams.get('rooms') ?? '',
    priceMin: searchParams.get('price_min') ?? '',
    priceMax: searchParams.get('price_max') ?? '',
    areaMin: searchParams.get('area_min') ?? '',
  }))

  const where = useMemo(() => buildWhere(filters, q), [filters, q])
  const sortParam = sort || '-createdAt'

  // Debounced search: write q to URL after 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q) params.set('q', q) else params.delete('q')
      params.delete('page')
      router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [q, lang, router, searchParams])

  // Sync filter/sort changes to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v) else params.delete(k)
    })
    if (sort) params.set('sort', sort) else params.delete('sort')
    if (!q) params.delete('q')
    params.delete('page')
    router.replace(`/${lang}/catalog?${params.toString()}`, { scroll: false })
  }, [filters, sort, lang, router, searchParams])

  const loadPage = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true) else setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(p), depth: '2', sort: sortParam })
      if (Object.keys(where).length) params.set('where', JSON.stringify(where))
      const res = await fetch(`/api/objects?${params}`, { credentials: 'include' })
      const data = await res.json()
      const docs: ObjectListItem[] = (data.docs || []).map((d: Record<string, unknown>) => ({
        ...d,
        primaryImage: typeof d.primaryImage === 'object' ? d.primaryImage : null,
        images: undefined,
      }))
      setObjects((prev) => (append ? [...prev, ...docs] : docs))
      setTotalDocs(data.totalDocs ?? 0)
      setPage(p)
    } catch {
      if (!append) setObjects([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [where, sortParam])

  // (re)load on filter/sort/search change
  useEffect(() => {
    void loadPage(1, false)
  }, [loadPage])

  const onChangeFilters = useCallback((patch: Partial<FiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }, [])

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean) || q !== '', [filters, q])
  const showMore = objects.length < totalDocs

  return (
    <SectionWrapper variant="charcoal">
      {/* Search pill */}
      <div className="catalog-search max-w-xl mb-6">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--n15-muted)] shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.catalog.searchPlaceholder}
          aria-label={t.catalog.searchPlaceholder}
        />
      </div>

      <CatalogFilters state={filters} onChange={onChangeFilters} t={t} />

      {/* Count + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 my-6">
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
            onChange={(e) => setSort(e.target.value)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {objects.map((obj) => <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />)}
          </div>
          {showMore && (
            <div className="text-center mt-12">
              <button
                onClick={() => void loadPage(page + 1, true)}
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
    </SectionWrapper>
  )
}

export default function CatalogPage() {
  const { t } = useI18n()
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.catalog.title}</h1>
          <p className="text-[var(--n15-muted)] max-w-xl">{t.catalog.subtitle}</p>
        </SectionWrapper>
        <Suspense fallback={<SectionWrapper variant="charcoal"><p className="text-[var(--n15-muted)] text-center py-20">{t.catalog.loading}</p></SectionWrapper>}>
          <CatalogContent />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
```

Примечания для исполнителя:
- `searchParams` — дефолт всех параметров при монтировании (сохраняет шаринг-ссылки)
- Кнопка «ПОКАЗАТЬ ЕЩЁ» догружает следующую страницу без сброса списка; при смене фильтров список перезагружается с page 1
- Старый тип данных `ObjectItem` с `isPremium` — заменён на `ObjectListItem`; бейдж Premium в списке не рисуем (остался на странице объекта)

- [ ] **Step 2: Проверить типы и линт**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 3: Визуальная проверка на dev-сервере**

- Открыть http://localhost:3000/ru/catalog
- Проверить: поиск (ввести «квартира» — список отфильтруется через ~300 мс, URL получит `q=`), dropdown-фильтры, чипы комнат, сортировка, «ПОКАЗАТЬ ЕЩЁ» (43 объекта / 12 = 4 клика, потом кнопка исчезает), счётчик «Найдено: N»
- Проверить обе темы (ThemeSwitcher в шапке)
- Проверить, что URL-ссылки на объекты ведут на `/ru/catalog/<id>` и страница открывается

- [ ] **Step 4: Commit**

```bash
git add src/app/'(site)'/'[lang]'/catalog/page.tsx
git commit -m "feat(catalog): search pill, dropdown filters, sort, show-more pagination"
```

---

### Task 6: Страница объекта — крошки, цена, агент из схемы, похожие, балкон

**Files:**
- Modify: `src/app/(site)/[lang]/catalog/[slug]/page.tsx` (193 строки)

**Interfaces:**
- Consumes: `ObjectCard`, `ObjectListItem` (Task 3), ключи словаря Task 2, `payload.find` (уже используется)
- Produces: обновлённая серверная страница объекта

- [ ] **Step 1: Заменить хлебные крошки + перенести цену в hero + бейджи-пилюли**

В `ObjectPage`, в `<div className="lg:col-span-2">`, заменить блок бейджей/H1/адреса (строки 95-104) на:

```tsx
              {/* Breadcrumbs */}
              <nav aria-label="Breadcrumb" className="mb-4">
                <a href={`/${lang}/catalog`} className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
                  {t.object.breadcrumbCatalog}
                </a>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] mx-2">/</span>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)]">{obj.title}</span>
              </nav>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {obj.isPremium && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-3 py-1">{t.catalog.premium}</span>}
                {obj.isExclusive && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-burgundy)] border border-[var(--n15-burgundy)]/30 px-3 py-1">{t.object.exclusive}</span>}
                <span className="object-card__pill relative top-0 left-0">{obj.type === 'sale' ? t.object.sale : t.object.rent}</span>
              </div>

              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">{obj.title}</h1>
              <p className="text-[var(--n15-muted)] mb-4">
                {[obj.address?.city, obj.address?.district, obj.address?.street, obj.address?.house].filter(Boolean).join(', ')}
              </p>

              {/* Hero price */}
              <div className="text-[32px] leading-tight text-[var(--n15-gold)] font-[family-name:var(--font-display)] font-semibold mb-8">
                {obj.price.toLocaleString(t.locale)} {obj.type === 'rent' ? t.object.perMonth : t.object.currency}
                {pricePerMeter && <span className="text-sm text-[var(--n15-muted)] ml-2">({pricePerMeter.toLocaleString(t.locale)} {t.object.perMeter})</span>}
              </div>
```

Затем удалить старый блок цены (строки 113-116: `<div className="text-3xl text-[var(--n15-gold)] ... mb-8">`) — теперь цена в hero.

- [ ] **Step 2: Добавить балкон в параметры**

В массив параметров (строка ~121-129), после `{ label: t.object.heating, value: obj.heating }`, добавить:

```tsx
                  { label: t.object.balcony, value: obj.balcony ? t.object.balconyOptions[obj.balcony as keyof typeof t.object.balconyOptions] : undefined },
```

(фильтр `f.value` в map отсеет undefined)

- [ ] **Step 3: Агент из схемы — заменить блок агента**

Заменить блок `{obj.agent && (...)}` (строки 155-174) на:

```tsx
                {obj.agent && (
                  <OrnamentBorder cornerOrnament>
                    <div className="p-6">
                      <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-4">{t.object.yourAgent}</h3>
                      <div className="flex items-center gap-4 mb-4">
                        {obj.agent.photo?.url ? (
                          <img src={obj.agent.photo.url} alt={obj.agent.name || ''} className="w-14 h-14 rounded-full object-cover border border-[var(--n15-gold)]/20" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center">
                            <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                              {obj.agent.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'АК'}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-[var(--n15-white)]">{obj.agent.name}</div>
                          <div className="text-xs text-[var(--n15-muted)]">{obj.agent.position || t.object.leadingExpert}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {obj.agent.phone && (
                          <Button variant="primary" size="sm" className="w-full" asChild>
                            <a href={`tel:${obj.agent.phone.replace(/\s+/g, '')}`}>{obj.agent.phone}</a>
                          </Button>
                        )}
                        {obj.agent.telegram && (
                          <Button variant="outline" size="sm" className="w-full" asChild>
                            <a href={obj.agent.telegram.startsWith('http') ? obj.agent.telegram : `https://t.me/${obj.agent.telegram}`}>{t.object.telegram}</a>
                          </Button>
                        )}
                        {obj.agent.whatsapp && (
                          <Button variant="outline" size="sm" className="w-full" asChild>
                            <a href={obj.agent.whatsapp.startsWith('http') ? obj.agent.whatsapp : `https://wa.me/${obj.agent.whatsapp.replace(/\D/g, '')}`}>{t.object.whatsapp}</a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </OrnamentBorder>
                )}
```

⚠️ **Проверить `Button` перед использованием `asChild`:** открыть `src/components/ui/Button.tsx`. Если проп `asChild` нет — вместо `<Button asChild><a>` использовать обычные `<a>` с классами `btn btn-primary`/`btn btn-outline` (см. текущий код строк 170-171, где уже так: `<Button variant="primary" size="sm" className="w-full mb-2">` — там текст внутри Button). Если `asChild` отсутствует, использовать: `<a href="tel:..." className="btn btn-primary w-full text-center block py-2.5 text-sm mb-2">{phone}</a>`.

Расширить тип агента в `obj` (строки 55-56): заменить `agent?: { id: number; name?: string }` на:

```ts
    agent?: {
      id: number
      name?: string
      position?: string
      phone?: string
      telegram?: string
      whatsapp?: string
      photo?: { url?: string }
    }
```

- [ ] **Step 4: Похожие объекты — добавить блок перед закрытием `</main>`-контента**

После `</div>` сетки `lg:grid-cols-3` (после строки 187, перед закрывающим `</SectionWrapper>`), добавить запрос в начале компонента — после строки с `const allSlides` (строка ~71):

```tsx
  // Similar objects: same category, exclude current, limit 3
  const { docs: similarDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { category: { equals: obj.category } },
        { id: { not_equals: obj.id } },
        { status: { equals: 'published' } },
      ],
    },
    limit: 3,
    depth: 1,
  })
  const similar = (similarDocs || []).map((d) => ({
    id: d.id as number,
    slug: (d as Record<string, unknown>).slug as string | undefined,
    title: d.title as string,
    type: d.type as 'sale' | 'rent',
    category: d.category as string,
    price: d.price as number,
    area: d.area as number | undefined,
    rooms: d.rooms as number | undefined,
    floor: d.floor as number | undefined,
    totalFloors: d.totalFloors as number | undefined,
    address: d.address as ObjectListItem['address'],
    primaryImage: d.primaryImage as ObjectListItem['primaryImage'],
    agent: d.agent as ObjectListItem['agent'],
  }))
```

И в JSX, после закрывающей `</div>` колонок (перед `</SectionWrapper>`):

```tsx
              {similar.length > 0 && (
                <div className="mt-16">
                  <div className="flex items-end justify-between mb-6">
                    <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.object.similarTitle}</h2>
                    <a href={`/${lang}/catalog`} className="text-sm text-[var(--n15-gold)] hover:underline">{t.object.allCatalog} →</a>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                    {similar.map((s) => <ObjectCard key={s.id} obj={s} lang={lang} t={t} />)}
                  </div>
                </div>
              )}
```

Добавить импорт: `import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'` и `t` уже есть (`getDictionary(lang)` возвращает `Dict`).

- [ ] **Step 5: Проверить**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 6: Визуальная проверка**

- Открыть http://localhost:3000/ru/catalog/<id> (взять id из списка)
- Проверить: крошки, цена в hero, бейджи-пилюли, блок агента (телефон из схемы — если у агента заполнен; если нет — кнопки скрыты), «Ещё в каталоге» с 3 карточками
- Обе темы

- [ ] **Step 7: Commit**

```bash
git add src/app/'(site)'/'[lang]'/catalog/'[slug]'/page.tsx
git commit -m "feat(object): breadcrumbs, hero price, schema-driven agent, similar objects, balcony"
```

---

### Task 7: Финальная верификация

- [ ] **Step 1: Полные проверки**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 2: Сквозной прогон на dev-сервере**

- http://localhost:3000/ru/catalog — поиск «квартира» (URL получает `q=`), фильтр категория «Дом» + комнаты «2», сортировка «Цена ↑», «ПОКАЗАТЬ ЕЩЁ» до конца (43 объекта), «СБРОСИТЬ ФИЛЬТРЫ»
- Открыть объект из списка → проверить крошки/цену/агента/похожие
- Переключить тему (светлая/тёмная) на обеих страницах — контраст пилюль и цены на градиенте
- Проверить осетинский: http://localhost:3000/os/catalog (переключатель языка)

- [ ] **Step 3: Скриншоты до/после** (опционально, для отчёта)

- `scrape/screens/` — сохранить новые скриншоты каталога и объекта в обеих темах

- [ ] **Step 4: Итоговый коммит** (если появились незакоммиченные правки)

```bash
git status && git add -A && git commit -m "chore(catalog): final review fixes" || echo "nothing to commit"
```

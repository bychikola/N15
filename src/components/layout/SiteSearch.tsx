'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { SEARCH_MIN_QUERY, type SearchResult } from '@/lib/site-search'

// Иконка поиска — контурная, цвет берёт из currentColor (золотой акцент
// шапки), как у телефона, калькулятора и кабинета: кнопка не выбивается из
// ряда. Подпись остаётся для скринридеров (aria-label) и подсказки (title).
const searchIcon = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

/** Состояние запроса: покой (подсказка), загрузка, ошибка, готовый результат */
type SearchState = 'idle' | 'loading' | 'error' | 'done'

interface Props {
  /** desktop — иконка в правом блоке шапки; mobile — строка в мобильном меню */
  variant?: 'desktop' | 'mobile'
  /** Закрыть мобильное меню при переходе к результату */
  onNavigate?: () => void
}

/**
 * Поиск по сайту в шапке: по слову или части слова без учёта регистра ищет
 * среди опубликованных объектов, ЖК, застройщиков, услуг и статей (см.
 * /api/search). Результат — название, вид материала, короткий фрагмент и
 * ссылка. Черновики, архив и закрытые данные CRM в выдачу не попадают — это
 * обеспечивает серверная часть, здесь только показ.
 *
 * Панель закрывается крестиком (повторное нажатие кнопки), Esc и кликом вне
 * неё. Запрос уходит с задержкой 300 мс (правило §12 ux-ui-rules), у списка
 * четыре состояния: подсказка, скелетон загрузки, ошибка и результаты.
 */
export const SiteSearch: FC<Props> = ({ variant = 'desktop', onNavigate }) => {
  const { lang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [state, setState] = useState<SearchState>('idle')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Слишком короткий запрос (одна буква) базу не трогает: в эффекте только
  // ранний выход, без setState — иначе лишний рендер (правило
  // react-hooks/set-state-in-effect); состояние покоя даёт производная ниже
  const query = q.trim()
  const active = open && query.length >= SEARCH_MIN_QUERY

  // Запрос с дебаунсом 300 мс: не дёргаем базу на каждую букву. Отмена
  // предыдущего запроса — AbortController, чтобы поздний ответ не перебил
  // актуальный
  useEffect(() => {
    if (!open) return
    const query = q.trim()
    if (query.length < SEARCH_MIN_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&lang=${lang}`,
          { signal: controller.signal },
        )
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as { results?: SearchResult[] }
        setResults(Array.isArray(data.results) ? data.results : [])
        setState('done')
      } catch (error) {
        // Отменённый запрос — не ошибка: пользователь продолжает печатать
        if ((error as { name?: string }).name !== 'AbortError') setState('error')
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, lang, open])

  // Фокус в поле при открытии: на компьютере человек сразу печатает
  useEffect(() => {
    if (open && variant === 'desktop') inputRef.current?.focus()
  }, [open, variant])

  // Закрытие по Esc и клику вне панели (как у выпадающих меню шапки)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (variant === 'desktop' && !wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, variant])

  const close = () => {
    setOpen(false)
    onNavigate?.()
  }

  // Пока запрос короче двух символов, показываем подсказку и пустой список —
  // без сброса состояния в эффекте: значение производное от q
  const viewState: SearchState = active ? state : 'idle'
  const viewResults = active ? results : []

  // Смена строки — событие ввода: здесь уместно сразу перевести список в
  // загрузку (эффект только ходит в /api/search)
  const onQueryChange = (value: string) => {
    setQ(value)
    setState(value.trim().length < SEARCH_MIN_QUERY ? 'idle' : 'loading')
  }

  const typeLabel = (type: SearchResult['type']): string => t.siteSearch.types[type]

  // Тело панели: поле ввода и одно из четырёх состояний списка
  const panel = (
    <div role="search" className="flex flex-col">
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => onQueryChange(e.target.value)}
        // aria-label вместо видимой метки: это поисковая строка, не поле формы.
        // 16px — чтобы iOS не увеличивал страницу при фокусе (§5 ux-ui-rules)
        aria-label={t.siteSearch.open}
        placeholder={t.siteSearch.placeholder}
        autoComplete="off"
        className="w-full border border-[var(--n15-gold)]/30 bg-transparent px-3 py-2.5 text-[16px] text-[var(--n15-white)] placeholder:text-[var(--n15-muted)] focus:border-[var(--n15-gold)]/70 focus:outline-none"
      />

      <div className="mt-2 max-h-[60vh] overflow-y-auto">
        {viewState === 'idle' && (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-[var(--n15-muted)]">{t.siteSearch.hint}</p>
        )}

        {viewState === 'loading' && (
          // Скелетон вместо спиннера: сохраняет высоту списка, нет прыжка (§8)
          <div className="flex flex-col gap-2 py-2 motion-reduce:animate-none" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse motion-reduce:animate-none">
                <div className="h-3 w-1/3 bg-[var(--n15-gold)]/15" />
                <div className="mt-2 h-2.5 w-3/4 bg-[var(--n15-gold)]/10" />
              </div>
            ))}
          </div>
        )}

        {viewState === 'error' && (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-[var(--n15-gold)]">{t.siteSearch.error}</p>
        )}

        {viewState === 'done' && viewResults.length === 0 && (
          <div className="px-1 py-2">
            <p className="text-[12px] text-[var(--n15-white)]">{t.siteSearch.empty}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--n15-muted)]">{t.siteSearch.emptyHint}</p>
          </div>
        )}

        {viewState === 'done' && viewResults.length > 0 && (
          <ul className="flex flex-col">
            {viewResults.map((result) => (
              <li key={`${result.type}-${result.href}-${result.title}`}>
                <Link
                  href={result.href}
                  onClick={close}
                  className="block border-b border-[var(--n15-gold)]/10 px-1 py-2.5 transition-colors last:border-b-0 hover:bg-[var(--n15-gold)]/8 focus-visible:bg-[var(--n15-gold)]/8 focus-visible:outline-none"
                >
                  <span className="text-[10px] uppercase tracking-wider text-[var(--n15-gold)]">
                    {typeLabel(result.type)}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-[var(--n15-white)]">
                    {result.title}
                  </span>
                  {result.snippet && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--n15-muted)]">
                      {result.snippet}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  if (variant === 'mobile') {
    return (
      <div className="flex w-full flex-col">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={t.siteSearch.open}
          className="flex w-full items-center justify-center gap-2 border border-[var(--n15-gold)]/30 px-5 py-3 text-sm uppercase tracking-wider text-[var(--n15-gold)] transition-colors hover:bg-[var(--n15-gold)]/8"
        >
          {searchIcon}
          {t.siteSearch.open}
        </button>
        {open && <div className="mt-3 border border-[var(--n15-gold)]/15 p-3">{panel}</div>}
      </div>
    )
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t.siteSearch.open}
        title={t.siteSearch.open}
        className="inline-flex items-center border border-[var(--n15-gold)]/30 px-2.5 py-2.5 text-[var(--n15-gold)] transition-all duration-300 hover:bg-[var(--n15-gold)]/8"
      >
        {searchIcon}
      </button>
      {open && (
        <div className="n15-menu-panel absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] border border-[var(--n15-gold)]/15 p-3 shadow-xl">
          {panel}
        </div>
      )}
    </div>
  )
}

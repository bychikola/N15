'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

/**
 * Планировка ЖК для компактной кнопки и крупного просмотра. Подпись кнопки
 * («1-комнатная · 44,5 м²») собирает страница комплекса, здесь она только
 * показывается. `thumb` — card-размер для ленты миниатюр, `full` — оригинал
 * для крупного просмотра с увеличением. PDF увеличения не требует и
 * открывается в новой вкладке.
 */
export interface ComplexPlanning {
  label: string
  name: string
  rooms: string
  area: string
  building: string
  thumb: string
  full: string
  alt: string
  pdf: boolean
}

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_MS = 300
const SWIPE_MIN = 40

interface View {
  scale: number
  x: number
  y: number
}

const IDENTITY: View = { scale: 1, x: 0, y: 0 }

/**
 * Планировочные решения на странице ЖК: вместо открытых миниатюр — компактные
 * кнопки «1-комнатная · 44,5 м²». Нажатие открывает планировку крупно в
 * полноэкранном просмотре с увеличением (кнопки, колесо, двойной тап, щипок),
 * перелистыванием стрелками/свайпом и закрытием крестиком, Esc и кликом по
 * подложке (§10 ux-ui-rules). PDF открывается в новой вкладке — как раньше.
 */
export default function ComplexPlannings({ items }: { items: ComplexPlanning[] }) {
  const { t } = useI18n()
  // Лайтбокс листает только изображения: PDF в него не попадает
  const images = items.filter((item) => !item.pdf)

  const [open, setOpen] = useState<number | null>(null)
  const [view, setView] = useState<View>(IDENTITY)
  const [gesturing, setGesturing] = useState(false)

  const viewRef = useRef<View>(IDENTITY)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const tapStart = useRef<{ x: number; y: number } | null>(null)
  const lastTap = useRef(0)
  const moved = useRef(false)

  const applyView = useCallback((next: View) => {
    viewRef.current = next
    setView(next)
  }, [])

  // Не даём увести картинку за край: смещение ограничено её запасом по ширине
  // и высоте. При масштабе 1 смещения нет вовсе.
  const clampView = useCallback((next: View): View => {
    if (next.scale <= MIN_SCALE) return IDENTITY
    const el = stageRef.current
    if (!el) return next
    const rect = el.getBoundingClientRect()
    const maxX = (rect.width * (next.scale - 1)) / 2
    const maxY = (rect.height * (next.scale - 1)) / 2
    return {
      scale: next.scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }, [])

  const zoomTo = useCallback(
    (scale: number) => {
      const current = viewRef.current
      applyView(clampView({ scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)), x: current.x, y: current.y }))
    },
    [applyView, clampView],
  )
  const zoomBy = useCallback((factor: number) => zoomTo(viewRef.current.scale * factor), [zoomTo])

  const goTo = useCallback(
    (delta: number) => {
      if (images.length < 2) return
      setOpen((cur) => (cur === null ? cur : (cur + delta + images.length) % images.length))
      applyView(IDENTITY)
    },
    [images.length, applyView],
  )

  const openAt = useCallback(
    (index: number) => {
      applyView(IDENTITY)
      setOpen(index)
    },
    [applyView],
  )

  const close = useCallback(() => {
    applyView(IDENTITY)
    setOpen(null)
  }, [applyView])

  // Блокируем прокрутку фона и убираем шапку — как в остальных лайтбоксах сайта
  useEffect(() => {
    if (open === null) return
    document.body.style.overflow = 'hidden'
    const header = document.querySelector('header')
    if (header) (header as HTMLElement).style.display = 'none'
    return () => {
      document.body.style.overflow = ''
      if (header) (header as HTMLElement).style.display = ''
    }
  }, [open])

  // Клавиатура: Esc — закрыть, стрелки — листать, «+»/«−» — масштаб
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowLeft') { goTo(-1); return }
      if (e.key === 'ArrowRight') { goTo(1); return }
      if (e.key === '+' || e.key === '=') { zoomBy(1.25); return }
      if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.25) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, goTo, zoomBy])

  // Колесо мыши: увеличивает к точке курсора. Нативный слушатель с
  // passive: false — иначе preventDefault не сработает
  useEffect(() => {
    const el = stageRef.current
    if (open === null || !el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = viewRef.current
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
      if (scale <= MIN_SCALE) { applyView(IDENTITY); return }
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      const k = scale / current.scale
      applyView(clampView({ scale, x: cx - (cx - current.x) * k, y: cy - (cy - current.y) * k }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, applyView, clampView])

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    setGesturing(true)
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }
      swipeStart.current = { x: e.clientX, y: e.clientY }
      tapStart.current = { x: e.clientX, y: e.clientY }
    } else if (pointers.current.size === 2) {
      // Второй палец — жест щипка: свайп и тап уже не считаем
      dragStart.current = null
      swipeStart.current = null
      tapStart.current = null
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: viewRef.current.scale }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = pointers.current
    if (pts.size >= 2 && pinchStart.current) {
      const [a, b] = [...pts.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (pinchStart.current.scale * dist) / pinchStart.current.dist))
      moved.current = true
      if (scale <= MIN_SCALE) { applyView(IDENTITY); return }
      const el = stageRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = (a.x + b.x) / 2 - rect.left - rect.width / 2
      const cy = (a.y + b.y) / 2 - rect.top - rect.height / 2
      const current = viewRef.current
      const k = scale / current.scale
      applyView(clampView({ scale, x: cx - (cx - current.x) * k, y: cy - (cy - current.y) * k }))
      return
    }
    if (pts.size === 1 && dragStart.current && viewRef.current.scale > MIN_SCALE) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      if (Math.hypot(dx, dy) > 6) moved.current = true
      applyView(clampView({ scale: viewRef.current.scale, x: dragStart.current.vx + dx, y: dragStart.current.vy + dy }))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    pinchStart.current = null

    // Свайп листает только без увеличения — иначе жест означает перетаскивание
    if (wasSingle && viewRef.current.scale <= MIN_SCALE && swipeStart.current) {
      const start = swipeStart.current
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
        // После свайпа клик по подложке закрывать не должен
        moved.current = true
        goTo(dx < 0 ? 1 : -1)
      }
    }

    // Двойной тап — увеличить/сбросить
    const tap = tapStart.current
    if (wasSingle && tap && !moved.current) {
      const dist = Math.hypot(e.clientX - tap.x, e.clientY - tap.y)
      if (dist < 8) {
        const now = Date.now()
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0
          if (viewRef.current.scale > MIN_SCALE) applyView(IDENTITY)
          else zoomTo(2.5)
        } else {
          lastTap.current = now
        }
      }
    }

    swipeStart.current = null
    tapStart.current = null
    if (pointers.current.size === 0) {
      dragStart.current = null
      setGesturing(false)
    } else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()]
      dragStart.current = { x: only.x, y: only.y, vx: viewRef.current.x, vy: viewRef.current.y }
    }
  }

  // Клик по пустому месту сцены (не по картинке) закрывает просмотр
  const onStageClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    if (moved.current) { moved.current = false; return }
    close()
  }

  const zoomed = view.scale > MIN_SCALE
  const current = open !== null ? images[open] : null
  const captionParts = current
    ? [current.name || current.rooms, current.area ? `${current.area} ${t.complex.areaUnit}` : '', current.building].filter(Boolean)
    : []

  return (
    <>
      {/* Компактные кнопки вместо открытых миниатюр. PDF — ссылка, картинка —
          кнопка крупного просмотра: обе выглядят одинаково (§2.4) */}
      <div className="flex flex-wrap gap-3">
        {items.map((item, index) => {
          const content = (
            <>
              <svg
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-[var(--n15-gold)]"
              >
                <rect x="2.5" y="2.5" width="17" height="17" stroke="currentColor" strokeWidth="1.2" />
                <path d="M2.5 8.5 H19.5 M8.5 2.5 V19.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="font-[family-name:var(--font-display)] text-sm text-[var(--n15-white)] transition-colors group-hover:text-[var(--n15-gold)]">
                {item.label}
              </span>
            </>
          )
          const className =
            'group inline-flex min-h-[44px] cursor-pointer items-center gap-3 border border-[var(--n15-gold)]/25 px-4 py-2.5 text-left transition-colors hover:border-[var(--n15-gold)]/60 hover:bg-[var(--n15-gold)]/10'
          return item.pdf ? (
            <a
              key={index}
              href={item.full}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
              aria-label={`${item.label}. ${t.complex.planningDownload}`}
            >
              {content}
            </a>
          ) : (
            <button
              key={index}
              type="button"
              onClick={() => openAt(images.indexOf(item))}
              className={className}
              aria-label={`${item.label}. ${t.complex.planningDownload}`}
            >
              {content}
            </button>
          )
        })}
      </div>

      {/* ── Крупный просмотр планировки ── */}
      {current && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[var(--lightbox-bg)] backdrop-blur-sm select-none">
          {/* Верхняя панель: счётчик, масштаб, закрытие */}
          <div className="relative z-20 flex items-center justify-between gap-2 px-4 py-3 md:px-6 md:py-4">
            <span className="text-sm text-[var(--lightbox-fg)]">
              {open! + 1} / {images.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => zoomBy(1 / 1.3)}
                disabled={!zoomed}
                aria-label={t.complex.planningZoomOut}
                className="flex h-11 w-11 items-center justify-center border border-[var(--n15-gold)]/20 text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50 disabled:opacity-30"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1.3)}
                disabled={view.scale >= MAX_SCALE}
                aria-label={t.complex.planningZoomIn}
                className="flex h-11 w-11 items-center justify-center border border-[var(--n15-gold)]/20 text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50 disabled:opacity-30"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="9" y1="4" x2="9" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {zoomed && (
                <button
                  type="button"
                  onClick={() => applyView(IDENTITY)}
                  aria-label={t.complex.planningResetZoom}
                  className="flex h-11 items-center justify-center border border-[var(--n15-gold)]/20 px-3 text-xs uppercase tracking-wider text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50"
                >
                  1:1
                </button>
              )}
              <button
                type="button"
                onClick={close}
                aria-label={t.slider.close}
                className="flex h-11 w-11 items-center justify-center border border-[var(--n15-gold)]/20 text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <line x1="3" y1="3" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="15" y1="3" x2="3" y2="15" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Сцена: увеличение, перетаскивание и листание свайпом */}
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onStageClick}
            style={{ touchAction: 'none' }}
            className={`relative flex-1 overflow-hidden ${
              zoomed ? (gesturing ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
          >
            <img
              src={current.full}
              alt={current.alt || current.label}
              draggable={false}
              className={`absolute inset-0 h-full w-full object-contain ${
                gesturing ? '' : 'transition-transform duration-200 ease-out'
              } motion-reduce:transition-none`}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            />

            {/* Стрелки листания — только без увеличения, чтобы не спорить с перетаскиванием */}
            {images.length > 1 && !zoomed && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goTo(-1) }}
                  aria-label={t.slider.prev}
                  className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-[var(--n15-gold)]/20 bg-[var(--lightbox-bg)]/50 text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50 hover:bg-[var(--lightbox-bg)]/80"
                >
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M12 4 L6 10 L12 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goTo(1) }}
                  aria-label={t.slider.next}
                  className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-[var(--n15-gold)]/20 bg-[var(--lightbox-bg)]/50 text-[var(--n15-gold)] transition-colors hover:border-[var(--n15-gold)]/50 hover:bg-[var(--lightbox-bg)]/80"
                >
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M8 4 L14 10 L8 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Подпись и лента миниатюр */}
          <div className="relative z-20 px-4 pb-4 pt-2 md:px-6">
            {captionParts.length > 0 && (
              <p className="mb-2 text-center text-sm text-[var(--lightbox-fg)]">{captionParts.join(' · ')}</p>
            )}
            {images.length > 1 && (
              <div className="flex justify-center">
                <div className="flex gap-1.5 overflow-x-auto border-t border-b border-[var(--n15-gold)]/10 bg-[var(--lightbox-bg)]/60 px-4 py-2 backdrop-blur-sm">
                  {images.map((image, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { applyView(IDENTITY); setOpen(i) }}
                      aria-label={`${t.slider.openFullscreen} ${i + 1}`}
                      className={`h-10 w-14 shrink-0 overflow-hidden border transition-all ${
                        i === open
                          ? 'border-[var(--n15-gold)] ring-1 ring-[var(--n15-gold)]/30'
                          : 'border-[var(--n15-gold)]/10 opacity-40 hover:border-[var(--n15-gold)]/30 hover:opacity-100'
                      }`}
                    >
                      <img src={image.thumb || image.full} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

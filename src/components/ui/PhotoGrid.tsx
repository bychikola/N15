'use client'

import Image from 'next/image'
import { useState, useEffect, useRef, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface Slide {
  url: string
  alt: string
  /** Миниатюра для мелкой ленты внизу лайтбокса */
  thumb?: string
  /** Версия для плиток сетки (card 800px — большая плитка не мылится) */
  tile?: string
}

// next/image в Next 16 отклоняет абсолютные URL (даже своего хоста) —
// отдаём оптимизатору только путь, без origin
function localPath(u: string): string {
  try {
    const parsed = new URL(u)
    return parsed.pathname + parsed.search
  } catch {
    return u
  }
}

interface Props {
  slides: Slide[]
}

/**
 * Мозаика-плитки фотографий как на alaniadom.ru:
 * первая плитка — большая (2×2), остальные — по 1×1, всё object-cover.
 * Показываются первые 6 плиток (3 ряда); если фото больше — на последней
 * видимой плитке оверлей «+N», клик раскрывает остальные.
 * Клик по плитке открывает полноэкранный лайтбокс.
 */
export const PhotoGrid: FC<Props> = ({ slides }) => {
  const { t } = useI18n()
  const [lightbox, setLightbox] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const count = slides.length

  // Плиток до «+N»: на ПК (3 колонки) — 6 (3 ряда), на телефоне (2 колонки) —
  // 5, иначе плитка «+N» выпадает на новую строку и стоит там одна.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const COLLAPSE_AT = isDesktop ? 6 : 5
  const hiddenCount = expanded ? 0 : Math.max(0, count - COLLAPSE_AT)
  const visibleSlides = hiddenCount > 0 ? slides.slice(0, COLLAPSE_AT) : slides

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx)
    setLightbox(true)
  }

  const closeLightbox = () => setLightbox(false)

  // Lock scroll and hide header while the lightbox is open
  useEffect(() => {
    if (lightbox) {
      document.body.style.overflow = 'hidden'
      const header = document.querySelector('header')
      if (header) (header as HTMLElement).style.display = 'none'
    } else {
      document.body.style.overflow = ''
      const header = document.querySelector('header')
      if (header) (header as HTMLElement).style.display = ''
    }
  }, [lightbox])

  const lightboxPrev = () => setLightboxIdx((prev) => (prev - 1 + count) % count)
  const lightboxNext = () => setLightboxIdx((prev) => (prev + 1) % count)

  // Свайпы на телефоне: горизонтальное движение пальцем листает фото
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = touchStart.current
    touchStart.current = null
    if (!s || count < 2) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    // Свайп вбок, а не скролл вверх/вниз
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) lightboxNext()
      else lightboxPrev()
    }
  }

  // Keyboard nav
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeLightbox(); return }
      if (e.key === 'ArrowLeft' && count > 1) { lightboxPrev(); return }
      if (e.key === 'ArrowRight' && count > 1) { lightboxNext(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, lightboxIdx, count])

  if (count === 0) {
    return (
      <div className="w-full h-[360px] bg-[var(--n15-charcoal)] flex items-center justify-center border border-[var(--n15-gold)]/10">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="opacity-20">
          <rect x="6" y="16" width="68" height="54" stroke="#C8A44E" strokeWidth="1" />
          <path d="M6 46 L30 26 L50 40 L74 16" stroke="#C8A44E" strokeWidth="1" />
          <circle cx="54" cy="28" r="5" stroke="#C8A44E" strokeWidth="1" />
        </svg>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 auto-rows-[170px] md:auto-rows-[200px] gap-3">
        {visibleSlides.map((slide, i) => {
          const isCollapseTile = hiddenCount > 0 && i === COLLAPSE_AT - 1
          return (
            <button
              key={i}
              onClick={() => (isCollapseTile ? setExpanded(true) : openLightbox(i))}
              data-more-count={isCollapseTile ? `+${hiddenCount}` : undefined}
              className={`photo-grid__tile relative overflow-hidden bg-[var(--n15-black)] border border-[var(--n15-gold)]/10 group cursor-pointer ${
                i === 0 ? 'col-span-2 row-span-2' : ''
              }`}
              aria-label={isCollapseTile ? `+${hiddenCount}` : `${t.slider.openFullscreen} ${i + 1}`}
            >
              <img
                src={slide.tile || slide.thumb || slide.url}
                alt={slide.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </button>
          )
        })}
      </div>

      {/* ── Fullscreen Lightbox (как в ImageSlider) ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-[var(--lightbox-bg)] backdrop-blur-sm select-none"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onClick={(e) => { if (e.target === e.currentTarget) closeLightbox() }}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
            <span className="text-sm text-[var(--lightbox-fg)]">
              {lightboxIdx + 1} / {count}
            </span>
            <button
              onClick={closeLightbox}
              className="w-10 h-10 flex items-center justify-center text-[var(--n15-gold)] hover:text-[var(--lightbox-fg)] transition-colors border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50"
              aria-label={t.slider.close}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <line x1="3" y1="3" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" />
                <line x1="15" y1="3" x2="3" y2="15" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {/* Image — full height, proportional width, room for thumbs at bottom.
              next/image: ресайз под экран + webp без кропа — качество оригинала,
              вес в разы меньше (как у alaniadom.ru) */}
          <div className="absolute inset-0 pt-10 pb-20 px-8 md:px-16">
            <Image
              src={localPath(slides[lightboxIdx].url)}
              alt={slides[lightboxIdx].alt}
              fill
              sizes="100vw"
              quality={85}
              priority
              draggable={false}
              className="object-contain"
            />
          </div>

          {/* Thumbnail strip at bottom */}
          {count > 1 && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
              <div className="flex gap-1.5 overflow-x-auto pb-1 px-4 max-w-full bg-[var(--lightbox-bg)]/60 backdrop-blur-sm py-2 rounded-sm border-t border-b border-[var(--n15-gold)]/10">
                {slides.map((slide, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
                    className={`flex-shrink-0 w-14 h-10 overflow-hidden border transition-all ${
                      i === lightboxIdx
                        ? 'border-[var(--n15-gold)] ring-1 ring-[var(--n15-gold)]/30'
                        : 'border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 opacity-40 hover:opacity-100'
                    }`}
                  >
                    <img src={slide.thumb || slide.tile || slide.url} alt={slide.alt} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nav arrows */}
          {count > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); lightboxPrev() }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-[var(--lightbox-bg)]/50 hover:bg-[var(--lightbox-bg)]/80 text-[var(--n15-gold)] border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50 transition-all"
                aria-label={t.slider.prev}
              >
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                  <path d="M12 4 L6 10 L12 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); lightboxNext() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-[var(--lightbox-bg)]/50 hover:bg-[var(--lightbox-bg)]/80 text-[var(--n15-gold)] border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50 transition-all"
                aria-label={t.slider.next}
              >
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                  <path d="M8 4 L14 10 L8 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}

          {/* Bottom hint */}
          <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
            <span className="text-[8px] tracking-[0.15em] uppercase text-[var(--lightbox-fg)]/50">
              {t.slider.hint}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

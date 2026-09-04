'use client'

import { useState, useCallback, useEffect, useRef, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface Slide {
  url: string
  alt: string
}

interface Props {
  slides: Slide[]
}

export const ImageSlider: FC<Props> = ({ slides }) => {
  const { t } = useI18n()
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const thumbnailsRef = useRef<HTMLDivElement>(null)
  const lightboxThumbRef = useRef<HTMLDivElement>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const lightboxThumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const count = slides.length

  const goTo = useCallback(
    (delta: number) => {
      setCurrent((prev) => (prev + delta + count) % count)
    },
    [count],
  )

  // Auto-scroll thumbnail strip to keep active thumb visible
  useEffect(() => {
    const thumb = thumbRefs.current[current]
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [current])

  // Auto-scroll lightbox thumbnails
  useEffect(() => {
    if (!lightbox) return
    const thumb = lightboxThumbRefs.current[lightboxIdx]
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [lightboxIdx, lightbox])

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx)
    setLightbox(true)
    document.body.style.overflow = 'hidden'
    // Hide header so it doesn't show above the lightbox
    const header = document.querySelector('header')
    if (header) (header as HTMLElement).style.display = 'none'
  }

  const closeLightbox = () => {
    setLightbox(false)
    document.body.style.overflow = ''
    const header = document.querySelector('header')
    if (header) (header as HTMLElement).style.display = ''
  }

  const lightboxPrev = () => {
    setLightboxIdx((prev) => (prev - 1 + count) % count)
  }

  const lightboxNext = () => {
    setLightboxIdx((prev) => (prev + 1) % count)
  }

  // Свайпы на телефоне: горизонтальное движение пальцем листает фото
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onSwipeDown = (e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const onSwipeUp = (e: React.PointerEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s || count < 2) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
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
      {/* Main slide */}
      <div className="relative w-full h-[360px] md:h-[450px] bg-[var(--n15-black)] overflow-hidden border border-[var(--n15-gold)]/10 group">
        <button
          onClick={() => openLightbox(current)}
          className="w-full h-full cursor-pointer"
          aria-label={t.slider.openFullscreen}
        >
          <img
            src={slides[current].url}
            alt={slides[current].alt}
            className="w-full h-full object-cover"
          />
        </button>

        {/* Arrows */}
        {count > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goTo(-1) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-[var(--n15-black)]/70 hover:bg-[var(--n15-black)]/90 text-[var(--n15-gold)] border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50 transition-all opacity-0 group-hover:opacity-100 z-10"
              aria-label={t.slider.prev}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4 L6 10 L12 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goTo(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-[var(--n15-black)]/70 hover:bg-[var(--n15-black)]/90 text-[var(--n15-gold)] border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50 transition-all opacity-0 group-hover:opacity-100 z-10"
              aria-label={t.slider.next}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 4 L14 10 L8 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}

        {/* Counter */}
        {count > 1 && (
          <div className="absolute bottom-3 right-3 bg-[var(--n15-black)]/70 px-3 py-1 text-xs text-[var(--n15-silver)] border border-[var(--n15-gold)]/10 pointer-events-none">
            {current + 1} / {count}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {count > 1 && (
        <div ref={thumbnailsRef} className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {slides.map((slide, i) => (
            <button
              key={i}
              ref={(el) => { thumbRefs.current[i] = el }}
              onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-20 h-16 overflow-hidden border transition-all ${
                i === current
                  ? 'border-[var(--n15-gold)] ring-1 ring-[var(--n15-gold)]/30'
                  : 'border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={slide.url} alt={slide.alt} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* ── Fullscreen Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-[var(--lightbox-bg)] backdrop-blur-sm select-none"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onSwipeDown}
          onPointerUp={onSwipeUp}
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

          {/* Image — full height, proportional width, room for thumbs at bottom */}
          <div className="absolute inset-0 flex items-center justify-center pt-10 pb-20 px-8 md:px-16">
            <img
              src={slides[lightboxIdx].url}
              alt={slides[lightboxIdx].alt}
              className="h-full w-auto max-w-full object-contain"
              draggable={false}
            />
          </div>

          {/* Thumbnail strip at bottom */}
          {count > 1 && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
              <div ref={lightboxThumbRef} className="flex gap-1.5 overflow-x-auto pb-1 px-4 max-w-full bg-[var(--lightbox-bg)]/60 backdrop-blur-sm py-2 rounded-sm border-t border-b border-[var(--n15-gold)]/10">
                {slides.map((slide, i) => (
                  <button
                    key={i}
                    ref={(el) => { lightboxThumbRefs.current[i] = el }}
                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
                    className={`flex-shrink-0 w-14 h-10 overflow-hidden border transition-all ${
                      i === lightboxIdx
                        ? 'border-[var(--n15-gold)] ring-1 ring-[var(--n15-gold)]/30'
                        : 'border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 opacity-40 hover:opacity-100'
                    }`}
                  >
                    <img src={slide.url} alt={slide.alt} className="w-full h-full object-cover" loading="lazy" />
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
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-[var(--n15-black)]/50 hover:bg-[var(--n15-black)]/80 text-[var(--n15-gold)] border border-[var(--n15-gold)]/20 hover:border-[var(--n15-gold)]/50 transition-all"
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

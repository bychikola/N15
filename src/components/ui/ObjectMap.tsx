'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface ObjectMapProps {
  /** Адрес для геокодирования и фолбэк-ссылки (город, улица, дом). */
  address: string
  /** Ручные координаты из админки — приоритет над геокодированием. */
  lat?: number
  lng?: number
}

type Status = 'loading' | 'ready' | 'error'
// Типы Яндекса не установлены; достаточно `any` для изолированного компонента.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ymaps = any

const LOAD_TIMEOUT_MS = 15_000

let ymapsPromise: Promise<Ymaps> | null = null

function loadYmaps(apiKey: string): Promise<Ymaps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const win = window as unknown as { ymaps?: Ymaps }

  // Уже загружен в этой сессии — возвращаем сразу.
  if (win.ymaps?.ready) {
    ymapsPromise = Promise.resolve(win.ymaps)
    return ymapsPromise
  }

  if (!ymapsPromise) {
    ymapsPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ymapsPromise = null
        reject(new Error('ymaps ready timeout'))
      }, LOAD_TIMEOUT_MS)

      const script = document.createElement('script')
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU&load=Map,Placemark,geocode,control.ZoomControl`
      script.async = true
      script.onload = () => {
        if (win.ymaps?.ready) {
          win.ymaps.ready(() => {
            clearTimeout(timer)
            resolve(win.ymaps)
          })
        } else {
          clearTimeout(timer)
          resolve(win.ymaps)
        }
      }
      script.onerror = () => {
        clearTimeout(timer)
        ymapsPromise = null
        reject(new Error('ymaps script failed'))
      }
      document.head.appendChild(script)
    })
  }
  return ymapsPromise
}

/**
 * Геокодирование через JS API (ymaps.geocode). На бесплатном тарифе
 * HTTP-геокодер отдельным ключом не работает — геокод доступен только
 * через JavaScript API, используя ключ карты (NEXT_PUBLIC_YANDEX_MAPS_API_KEY).
 */
async function resolveCoords(ymaps: Ymaps, address: string): Promise<[number, number]> {
  const result = await ymaps.geocode(address, { results: 1 })
  const geoObject = result.geoObjects.get(0)
  if (!geoObject) throw new Error('no geocode results')
  return geoObject.geometry.getCoordinates() as [number, number]
}

function isValidCoord(value: number | undefined, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export const ObjectMap: FC<ObjectMapProps> = ({ address, lat, lng }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY

  const hasManualCoords = isValidCoord(lat, -90, 90) && isValidCoord(lng, -180, 180)
  const canGeocode = address.trim().length > 0
  const showFallback = !apiKey || (!hasManualCoords && !canGeocode)

  const [status, setStatus] = useState<Status>(showFallback ? 'error' : 'loading')

  useEffect(() => {
    if (showFallback) return
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    loadYmaps(apiKey!)
      .then(async (ymaps: Ymaps) => {
        if (cancelled) return
        const coords: [number, number] = hasManualCoords
          ? [lat!, lng!]
          : await resolveCoords(ymaps, address)
        if (cancelled) return

        const map = new ymaps.Map(el, {
          center: coords,
          zoom: 16,
          controls: ['zoomControl'],
        })
        const placemark = new ymaps.Placemark(
          coords,
          { hintContent: address, balloonContent: address },
          { preset: 'islands#circleIcon', iconColor: '#C8A44E' },
        )
        map.geoObjects.add(placemark)
        mapRef.current = map
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [apiKey, address, lat, lng, hasManualCoords, canGeocode, showFallback])

  const mapsUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`

  // Фолбэк: нет ключа / ошибка скрипта / геокод не нашёл / нет адреса.
  if (showFallback || status === 'error') {
    return (
      <div className="w-full h-[360px] md:h-[420px] flex flex-col items-center justify-center gap-3 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 px-6 text-center">
        {address && <p className="text-sm text-[var(--n15-silver)]">{address}</p>}
        {address && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs tracking-wider uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/40 px-4 py-2 transition-colors hover:bg-[var(--n15-gold)]/10"
          >
            {t.map.openInYandex}
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[360px] md:h-[420px] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--n15-charcoal)]/70 text-xs tracking-wider uppercase text-[var(--n15-muted)]">
          {t.common.loading}
        </div>
      )}
    </div>
  )
}

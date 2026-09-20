'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import { geocodeAddress } from '@/lib/geocode'

interface ObjectMapProps {
  /** Адрес для геокодирования (город, улица, дом). */
  address: string
  /** Ручные координаты из админки — приоритет над геокодированием. */
  lat?: number
  lng?: number
}

type Status = 'loading' | 'ready' | 'error'

/**
 * Геокодирование — HTTP-геокодер отдельным ключом
 * (NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY). Ключ JavaScript API к геокодеру
 * доступа не имеет (403), поэтому ymaps.geocode не используем.
 */
async function resolveCoords(address: string): Promise<[number, number]> {
  const coords = await geocodeAddress(address)
  if (!coords) throw new Error('no geocode results')
  return coords
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
          : await resolveCoords(address)
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

  // Фолбэк: нет ключа / ошибка скрипта / геокод не нашёл / нет адреса.
  // На сторонние карты не уводим: показываем адрес — его довольно, чтобы
  // найти объект, а объект со страницы виден и списком характеристик
  if (showFallback || status === 'error') {
    return (
      <div className="w-full h-[320px] md:h-[380px] flex flex-col items-center justify-center gap-3 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 px-6 text-center">
        <p className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">{t.map.title}</p>
        {address && <p className="text-sm text-[var(--n15-silver)]">{address}</p>}
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[320px] md:h-[380px] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--n15-charcoal)]/70 text-xs tracking-wider uppercase text-[var(--n15-muted)]">
          {t.common.loading}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import { geocodeAddress } from '@/lib/geocode'
import { APPROX_MAX_ZOOM, approximatePoint, type ApproxPoint } from '@/lib/object-approx-point'

interface ObjectMapProps {
  /**
   * Адрес для геокодирования — улица без номера дома. Нужен, только если
   * координат объекта нет: тогда точку ищет геокодер.
   */
  address: string
  /**
   * Примерная область объекта по его координатам: точной метки на публичной
   * карте нет, объект показан кругом области (см. src/lib/object-approx-point.ts)
   */
  area?: ApproxPoint | null
  /** Подпись области: район, город или населённый пункт */
  label?: string
  /**
   * Показывать точную метку, а не примерную область. Ставится только тогда,
   * когда точный адрес разрешён: у объектов каталога этого не бывает вовсе
   * (номер дома закрыт, см. src/lib/object-public-address.ts), у объявлений
   * доски — по согласию собственника (см. boardShowsExactAddress).
   * Метка ставится по переданному адресу, поэтому в него должен входить дом.
   */
  exact?: boolean
  /**
   * Подпись под картой. У доски она своя: точный адрес уточняет автор
   * объявления, а не агент агентства
   */
  caption?: string
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

/**
 * Карта объекта: примерная область, в которой объект находится.
 *
 * Точки-метки у объекта нет: круг области — единственное, что отмечает объект
 * на карте, а по кругу нельзя определить ни дом, ни сторону улицы. Подпись
 * области (район, город или населённый пункт) идёт под картой, приближение
 * ограничено (APPROX_MAX_ZOOM) — точный адрес клиент уточняет у агента.
 *
 * Область приходит готовой от страницы (координаты объекта); если координат
 * нет, её считает геокодер по публичному адресу без номера дома.
 */
export const ObjectMap: FC<ObjectMapProps> = ({ address, area, label, exact = false, caption }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY

  const canGeocode = address.trim().length > 0
  const showFallback = !apiKey || (!area && !canGeocode)

  const [status, setStatus] = useState<Status>(showFallback ? 'error' : 'loading')

  useEffect(() => {
    if (showFallback) return
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    loadYmaps(apiKey!)
      .then(async (ymaps: Ymaps) => {
        if (cancelled) return

        // Точный адрес разрешён — ставим метку. Предела приближения
        // (APPROX_MAX_ZOOM) здесь нет: он нужен только примерной области,
        // чтобы по кругу нельзя было угадать дом
        if (exact) {
          const coords = await resolveCoords(address)
          if (cancelled) return
          const map = new ymaps.Map(el, {
            center: coords,
            zoom: 17,
            controls: ['zoomControl'],
          })
          // Модуль Placemark может не прийти вместе со списком загрузки:
          // без него карта осталась бы без метки (см. src/lib/ymaps.ts)
          if (typeof ymaps.Placemark === 'function') {
            map.geoObjects.add(new ymaps.Placemark(coords, {}, { preset: 'islands#goldIcon' }))
          }
          mapRef.current = map
          setStatus('ready')
          return
        }

        // Область считает сервер по координатам объекта; координат нет —
        // точку ищет геокодер по публичному адресу, и она тоже превращается в
        // примерную область: точных меток на публичной карте нет
        const point = area || approximatePoint(await resolveCoords(address))
        if (cancelled) return
        if (!point) throw new Error('no area')

        // Масштаб показывает округу целиком, а приближение ограничено: по
        // области не должно быть видно, какой это дом. Предел ставим после
        // создания карты: в опциях конструктора ymaps его не принимает —
        // проверено на живом API (см. CatalogMap)
        const map = new ymaps.Map(el, {
          center: [point.lat, point.lng],
          zoom: 14,
          controls: ['zoomControl'],
        })
        map.options.set('maxZoom', APPROX_MAX_ZOOM)
        // Область вокруг объекта — круг. Модуль Circle может не прийти вместе
        // со списком загрузки: без него карта остаётся пустой
        if (typeof ymaps.Circle === 'function') {
          map.geoObjects.add(
            new ymaps.Circle(
              [[point.lat, point.lng], point.radius],
              {},
              { fillColor: '#C8A44E26', strokeColor: '#C8A44E', strokeOpacity: 0.7, strokeWidth: 1 },
            ),
          )
        }
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
  }, [apiKey, address, area, exact, showFallback])

  // Фолбэк: нет ключа / ошибка скрипта / геокод не нашёл / нет адреса.
  // На сторонние карты не уводим: показываем адрес — по нему клиент спросит
  // объект у агента, а сам объект со страницы виден списком характеристик
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
      {/* Подпись под картой: объект показан областью, а не точкой — объясняем
          это клиенту, чтобы он не искал объект по нарисованному кругу.
          У точной метки подписи нет: её место занимает строка о разрешении
          собственника в самой карточке (см. /board/<id>) */}
      {status === 'ready' && !exact && (
        <p className="mt-3 text-xs text-[var(--n15-muted)]">
          {label ? `${label}. ` : ''}
          {caption || t.map.approx}
        </p>
      )}
    </div>
  )
}

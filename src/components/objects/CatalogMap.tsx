'use client'

import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import type { ObjectListItem } from '@/components/objects/ObjectCard'

interface Props {
  /** Объекты текущей выдачи каталога (то же, что показывает список) */
  objects: ObjectListItem[]
  lang: string
}

const isValidLat = (v: number | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
const isValidLng = (v: number | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180

/**
 * Режим «На карте» каталога: метки всех объектов выдачи на одной карте.
 *
 * Координаты объектов ставит карта в форме CRM (поле objects.coordinates).
 * Геокодировать выдачу на клиенте нельзя — геокодер платный и не рассчитан
 * на десятки объектов сразу, поэтому точками показываем только объекты
 * с координатами, а сколько их из всей выдачи — пишем под картой
 * (t.catalog.mapHint). Объекты без координат остаются в списке.
 *
 * Карта грузится тем же модулем, что карта объекта (src/lib/ymaps.ts).
 * Нет ключа API или скрипт не загрузился — отправляем в Яндекс.Карты
 * по первой точке выдачи, как это делает карточка объекта (см. ObjectMap).
 */
export const CatalogMap: FC<Props> = ({ objects, lang }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  // Скрипт карты не загрузился (нет ключа, блокировщик, сеть) — показываем
  // ссылку на Яндекс.Карты вместо пустого прямоугольника
  const [failed, setFailed] = useState(false)
  const unavailable = !apiKey || failed

  // Точки выдачи: объекты с координатами. useMemo — чтобы эффект карты
  // не пересобирался на каждый рендер (массив в зависимостях сравнивается
  // по ссылке)
  const points = useMemo(
    () => objects.filter((o) => isValidLat(o.coordinates?.lat) && isValidLng(o.coordinates?.lng)),
    [objects],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!apiKey || !el || points.length === 0) return

    let cancelled = false
    const coords = points.map((o) => [o.coordinates!.lat!, o.coordinates!.lng!] as [number, number])

    loadYmaps(apiKey)
      .then((ymaps: Ymaps) => {
        if (cancelled) return
        const map = new ymaps.Map(el, {
          center: coords[0],
          zoom: points.length === 1 ? 16 : 12,
          controls: ['zoomControl', 'geolocationControl'],
        })
        const collection = new ymaps.GeoObjectCollection()
        points.forEach((o, i) => {
          // Цена, адрес и ссылка на карточку — прямо в облачке метки:
          // по карте видно, что где стоит и за сколько
          const address = [o.address?.street, o.address?.house].filter(Boolean).join(', ')
          const balloon = [
            `<a href="/${lang}/catalog/${o.id}" style="font-weight:600">${o.title}</a>`,
            address,
            // Подпись цены — как на карточке: у аренды «в месяц», у продажи «₽»
            o.price ? `${o.price.toLocaleString(t.locale)} ${o.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}` : '',
          ].filter(Boolean).join('<br>')
          collection.add(
            new ymaps.Placemark(
              coords[i],
              { hintContent: o.title, balloonContent: balloon },
              { preset: 'islands#circleIcon', iconColor: '#C8A44E' },
            ),
          )
        })
        map.geoObjects.add(collection)
        // Несколько меток — показываем все: setBounds подбирает центр и масштаб
        if (points.length > 1) map.setBounds(collection.getBounds(), { checkZoomRange: true, zoomMargin: 40 })
        mapRef.current = map
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [apiKey, points, lang, t.locale, t.catalog.currency, t.catalog.perMonth])

  // Координат нет ни у одного объекта выдачи — карта пуста, но объекты есть:
  // говорим об этом прямо, чтобы не читалось как «ничего не найдено»
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 px-6 text-center border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/30">
        <p className="text-sm text-[var(--n15-muted)]">{t.catalog.mapEmpty}</p>
      </div>
    )
  }

  // Нет ключа API или скрипт не загрузился — ссылка на карту по первой точке
  if (unavailable) {
    const first = points[0].coordinates!
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/30">
        <p className="text-sm text-[var(--n15-muted)]">{t.catalog.mapHint}</p>
        <a
          href={`https://yandex.ru/maps/?pt=${first.lng},${first.lat}&z=12&l=map`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs tracking-wider uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/40 px-4 py-2 transition-colors hover:bg-[var(--n15-gold)]/10"
        >
          {t.map.openInYandex}
        </a>
      </div>
    )
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full h-[420px] md:h-[560px] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20"
      />
      {/* Сколько объектов выдачи попало точками: остальные — без координат */}
      <p className="mt-3 text-xs text-[var(--n15-muted)]">
        {points.length} / {objects.length} — {t.catalog.mapHint}
      </p>
    </div>
  )
}

export default CatalogMap

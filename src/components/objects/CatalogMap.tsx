'use client'

import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import { categoryLabel } from '@/lib/object-categories'
import type { ObjectMapPoint } from '@/lib/object-map-point'

interface Props {
  /**
   * Условия выдачи каталога (buildWhere) — те же, что у списка: карта
   * показывает не первую страницу карточек, а всю выдачу целиком.
   */
  where: Record<string, unknown>
  lang: string
}

/** Ответ маршрута /api/objects/map (см. его описание). Числа найденных
 *  объектов в ответе нет: общее количество объектов компании сайт не
 *  показывает, а сколько точек пришло — видно по самому массиву */
interface MapData {
  points: ObjectMapPoint[]
  /** В выдаче больше объектов, чем помещается на карту */
  truncated: boolean
  /** Сколько адресов сервер ещё определяет — за ними стоит повторить запрос */
  pending: number
}

/** Данные выдачи вместе с условиями, по которым они получены: пока ключи не
 *  совпадают, показывать нечего (идёт загрузка новых условий) */
interface LoadedMap extends MapData {
  key: string
}

/** Сколько раз переспрашиваем сервер, пока он определяет адреса объектов */
const PENDING_RETRIES = 3
/** Пауза перед повторным запросом: геокодер отвечает за десятые доли секунды */
const PENDING_RETRY_MS = 2_500

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )

/**
 * Режим «На карте» каталога: все объекты выдачи метками на встроенной карте.
 *
 * Точки отдаёт сервер (/api/objects/map): координаты объекта, а объектам без
 * координат точку определяет геокодер по адресу — поэтому на карте
 * оказывается вся выдача, а не только объекты с отмеченной точкой.
 *
 * Метки собираются в кластеры (ymaps.Clusterer): на выдаче в десятки
 * объектов соседние точки иначе перекрывают друг друга. В облачке метки —
 * фотография, тип объекта, адрес, цена и кнопка «Открыть объект»; на
 * внешние карты отсюда не уводим.
 */
export const CatalogMap: FC<Props> = ({ where, lang }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const clustererRef = useRef<Ymaps | null>(null)
  /** Условия, под которые карта уже подобрала масштаб: добавление меток
   *  (сервер доопределил адреса) не должно сбрасывать вид пользователя */
  const fittedRef = useRef<string | null>(null)
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY

  const [loaded, setLoaded] = useState<LoadedMap | null>(null)
  /** Условия, на которых карта не загрузилась: с новыми условиями пробуем снова */
  const [failedKey, setFailedKey] = useState<string | null>(null)

  // Условия выдачи строкой: объект в зависимостях эффекта сравнивался бы
  // по ссылке и перезапускал запрос на каждом рендере
  const whereKey = useMemo(() => JSON.stringify(where), [where])

  const failed = !apiKey || failedKey === whereKey
  // Данные показываем, только когда они получены для текущих условий: иначе
  // после смены фильтров на карте оставались бы метки прошлой выдачи
  const data = !failed && loaded?.key === whereKey ? loaded : null
  // useMemo: пустой массив в зависимостях эффекта карты менял бы ссылку на
  // каждом рендере и переставлял метки без нужды
  const points = useMemo(() => data?.points ?? [], [data])

  useEffect(() => {
    if (!apiKey) return
    const controller = new AbortController()
    let cancelled = false
    let retries = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const load = async () => {
      try {
        const params = new URLSearchParams()
        if (whereKey !== '{}') params.set('where', whereKey)
        const res = await fetch(`/api/objects/map?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`map http ${res.status}`)
        const payload = (await res.json()) as Partial<MapData>
        if (cancelled) return
        const next: LoadedMap = {
          key: whereKey,
          points: payload.points || [],
          truncated: !!payload.truncated,
          pending: payload.pending ?? 0,
        }
        setLoaded(next)
        setFailedKey((prev) => (prev === whereKey ? null : prev))
        // Адреса объектов сервер определяет и после ответа: повторяем запрос,
        // чтобы точки появились без перезагрузки страницы
        if (next.pending > 0 && retries < PENDING_RETRIES) {
          retries++
          retryTimer = setTimeout(() => void load(), PENDING_RETRY_MS)
        }
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
        setFailedKey(whereKey)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      controller.abort()
    }
  }, [apiKey, whereKey])

  // Карта создаётся один раз и живёт до ухода со страницы: метки при смене
  // фильтров переставляются в уже открытой карте
  useEffect(() => {
    return () => {
      mapRef.current?.destroy()
      mapRef.current = null
      clustererRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!apiKey || !el) return

    let cancelled = false
    // Разметку облачка собираем до загрузки API карт: ymaps нужен только
    // для самих меток (ниже)
    const prepared = points.map((point) => {
      const price = point.price
        ? `${point.price.toLocaleString(t.locale)} ${point.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}`
        : ''
      // Облачко — обычная разметка внутри страницы: фотография, тип, адрес,
      // цена и кнопка на карточку объекта. Значения экранируем: заголовок и
      // адрес вводит агент, а сервер отдаёт их как есть
      const kind = [
        point.type === 'rent' ? t.object.rent : t.object.sale,
        point.category ? categoryLabel(point.category) : '',
      ]
        .filter(Boolean)
        .join(' · ')

      const balloon = [
        '<div class="n15-map-balloon">',
        point.image ? `<img class="n15-map-balloon__photo" src="${escapeHtml(point.image)}" alt="">` : '',
        '<div class="n15-map-balloon__text">',
        kind ? `<span class="n15-map-balloon__kind">${escapeHtml(kind)}</span>` : '',
        point.title ? `<div class="n15-map-balloon__title">${escapeHtml(point.title)}</div>` : '',
        point.address ? `<div class="n15-map-balloon__addr">${escapeHtml(point.address)}</div>` : '',
        point.byAddress ? `<div class="n15-map-balloon__note">${escapeHtml(t.catalog.mapByAddress)}</div>` : '',
        price ? `<div class="n15-map-balloon__price">${escapeHtml(price)}</div>` : '',
        `<a class="n15-map-balloon__link" href="/${lang}/catalog/${point.id}">${escapeHtml(t.catalog.mapOpenObject)}</a>`,
        '</div>',
        '</div>',
      ].join('')

      return { point, balloon }
    })

    loadYmaps(apiKey)
      .then((ymaps: Ymaps) => {
        if (cancelled) return
        let map = mapRef.current
        if (!map) {
          map = new ymaps.Map(el, {
            center: [points[0]?.lat ?? 43.0367, points[0]?.lng ?? 44.6678],
            zoom: 12,
            controls: ['zoomControl'],
          })
          mapRef.current = map
        }

        // Метки переставляем целиком: состав выдачи после фильтров меняется
        // полностью, а кластеру важно видеть актуальный набор
        let clusterer = clustererRef.current
        if (!clusterer) {
          clusterer = new ymaps.Clusterer({
            // Кластер — золотой кружок фирменного цвета с числом объектов;
            // одиночная метка остаётся обычной точкой (preset ниже)
            preset: 'islands#clusterSvgIcons',
            clusterIconColor: '#C8A44E',
            clusterDisableClickZoom: false,
            clusterOpenBalloonOnClick: true,
            groupByCoordinates: false,
          })
          map.geoObjects.add(clusterer)
          clustererRef.current = clusterer
        }
        clusterer.removeAll()
        clusterer.add(
          prepared.map(
            ({ point, balloon }) =>
              new ymaps.Placemark(
                [point.lat, point.lng],
                { hintContent: point.title, balloonContent: balloon },
                { preset: 'islands#circleIcon', iconColor: '#C8A44E' },
              ),
          ),
        )

        // Масштаб подбираем один раз на набор условий: сервер может добавить
        // точки позже (определил адреса), но карту пользователю не дёргаем
        if (prepared.length && fittedRef.current !== whereKey) {
          fittedRef.current = whereKey
          if (prepared.length > 1) {
            map.setBounds(clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 40 })
          } else {
            map.setCenter([points[0].lat, points[0].lng], 16)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setFailedKey(whereKey)
      })

    return () => {
      cancelled = true
    }
  }, [apiKey, points, whereKey, lang, t])

  return (
    <div>
      <div className="relative">
        {/* Контейнер карты не размонтируем: карта переживает смену фильтров,
            меняются только метки */}
        <div
          ref={containerRef}
          className="w-full h-[380px] md:h-[560px] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20"
        />
        {/* Состояния — поверх карты: подсказка не должна уносить с неё метки */}
        {!data && !failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-[var(--n15-charcoal)]/70 text-xs tracking-wider uppercase text-[var(--n15-muted)]">
            {t.catalog.mapLoading}
          </div>
        )}
        {/* Ключа карты нет в сборке (NEXT_PUBLIC_YANDEX_MAPS_API_KEY не передан
            при сборке) или скрипт карт не загрузился: объекты остаются
            списком, на сторонние карты не уводим */}
        {failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center bg-[var(--n15-charcoal)]/90">
            <p className="text-sm text-[var(--n15-muted)]">{t.catalog.mapError}</p>
          </div>
        )}
        {/* Точек нет не всегда по вине карты: у объекта может не быть ни
            адреса, ни координат — тогда ему негде стоять */}
        {data && points.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center bg-[var(--n15-charcoal)]/90">
            <p className="text-sm text-[var(--n15-muted)]">{t.catalog.mapEmpty}</p>
          </div>
        )}
      </div>
      {/* Подсказка под картой — без числа объектов: сколько объектов нашлось
          и сколько попало на карту, на сайте не показываем (см. CatalogContent).
          Точка — координаты объекта или определённый по адресу геокодер */}
      {points.length > 0 && (
        <p className="mt-3 text-xs text-[var(--n15-muted)]">
          {t.catalog.mapOnMap} {data?.truncated ? t.catalog.mapTruncated : t.catalog.mapHint}
        </p>
      )}
    </div>
  )
}

export default CatalogMap

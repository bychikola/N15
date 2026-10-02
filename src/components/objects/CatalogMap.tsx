'use client'

import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import { categoryLabel } from '@/lib/object-categories'
import type { ObjectMapArea, ObjectMapPoint } from '@/lib/object-map-point'
import { APPROX_MAX_ZOOM } from '@/lib/object-approx-point'

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
 *  показывает, а сколько объектов в области — видно по списку в облачке */
interface MapData {
  areas: ObjectMapArea[]
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

/** Приближение одинокой области: показываем её окрестность, а не дом */
const SINGLE_AREA_ZOOM = 15

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )

/**
 * Режим «На карте» каталога: выдача показывается областями на встроенной карте.
 *
 * Области отдаёт сервер (/api/objects/map): у каждого объекта есть координаты
 * (их ставит карта в форме CRM) или их определяет геокодер по адресу — поэтому
 * на карте оказывается вся выдача, а не только объекты с отмеченной точкой.
 * Точных меток у объектов нет: объект показан кругом примерной области, в
 * которой он находится (см. src/lib/object-approx-point.ts), а объекты одной
 * области собраны вместе.
 *
 * Клик (тап) по кругу открывает облачко области — подпись «район, город или
 * населённый пункт» и объекты этой области списком: фотография, тип, название,
 * цена и кнопка «Подробнее» на карточку объекта. Улицы и номера дома в облачке
 * нет, на внешние карты отсюда не уводим. Приближение карты ограничено
 * (APPROX_MAX_ZOOM) — ближе объект становится виден по домам.
 */
export const CatalogMap: FC<Props> = ({ where, lang }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Ymaps | null>(null)
  /** Условия, под которые карта уже подобрала масштаб: добавление областей
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
  // после смены фильтров на карте оставались бы области прошлой выдачи
  const data = !failed && loaded?.key === whereKey ? loaded : null
  // useMemo: пустой массив в зависимостях эффекта карты менял бы ссылку на
  // каждом рендере и переставлял области без нужды
  const areas = useMemo(() => data?.areas ?? [], [data])

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
          areas: payload.areas || [],
          truncated: !!payload.truncated,
          pending: payload.pending ?? 0,
        }
        setLoaded(next)
        setFailedKey((prev) => (prev === whereKey ? null : prev))
        // Адреса объектов сервер определяет и после ответа: повторяем запрос,
        // чтобы области появились без перезагрузки страницы
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

  // Карта создаётся один раз и живёт до ухода со страницы: области при смене
  // фильтров переставляются в уже открытой карте
  useEffect(() => {
    return () => {
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!apiKey || !el) return

    let cancelled = false

    /**
     * Облачко — обычная разметка внутри страницы: подпись области и объекты
     * этой области (фотография, тип, название, цена и кнопка на карточку).
     * Улицы и номера дома в облачке нет — на публичной карте объект показан
     * областью, а точный адрес клиент уточняет у агента. Значения экранируем:
     * название вводит агент, а сервер отдаёт его как есть
     */
    const balloonItem = (point: ObjectMapPoint): string => {
      const price = point.price
        ? `${point.price.toLocaleString(t.locale)} ${point.type === 'rent' ? t.catalog.perMonth : t.catalog.currency}`
        : ''
      const kind = [
        point.type === 'rent' ? t.object.rent : t.object.sale,
        point.category ? categoryLabel(point.category) : '',
      ]
        .filter(Boolean)
        .join(' · ')

      return [
        '<div class="n15-map-balloon__item">',
        point.image ? `<img class="n15-map-balloon__photo" src="${escapeHtml(point.image)}" alt="">` : '',
        '<div class="n15-map-balloon__text">',
        kind ? `<span class="n15-map-balloon__kind">${escapeHtml(kind)}</span>` : '',
        point.title ? `<div class="n15-map-balloon__title">${escapeHtml(point.title)}</div>` : '',
        price ? `<div class="n15-map-balloon__price">${escapeHtml(price)}</div>` : '',
        `<a class="n15-map-balloon__link" href="/${lang}/catalog/${point.slug}">${escapeHtml(t.catalog.mapOpenObject)}</a>`,
        '</div>',
        '</div>',
      ].join('')
    }

    // Разметку облачков собираем до загрузки API карт: ymaps нужен только
    // для самих областей (ниже)
    const balloons = new Map(
      areas.map((area) => [
        area.key,
        [
          '<div class="n15-map-balloon">',
          area.label ? `<div class="n15-map-balloon__area">${escapeHtml(area.label)}</div>` : '',
          '<div class="n15-map-balloon__list">',
          area.points.map(balloonItem).join(''),
          '</div>',
          '</div>',
        ].join(''),
      ]),
    )

    loadYmaps(apiKey)
      .then((ymaps: Ymaps) => {
        if (cancelled) return
        // Области рисуются только кругами: без модуля Circle показывать нечего,
        // и честнее сказать об этом, чем оставить пустую карту
        if (areas.length && typeof ymaps.Circle !== 'function') {
          throw new Error('ymaps.Circle is not loaded')
        }

        let map = mapRef.current
        if (!map) {
          map = new ymaps.Map(el, {
            center: [areas[0]?.lat ?? 43.0367, areas[0]?.lng ?? 44.6678],
            zoom: 12,
            controls: ['zoomControl'],
          })
          // Ближе областей карта не приближается: точного адреса по карте не
          // должно быть видно, и номера домов не должны читаться. Предел
          // ставим после создания карты: в опциях конструктора ymaps его не
          // принимает — проверено на живом API, options.get('maxZoom') там
          // возвращает своё умолчание (23), а setZoom уходит за предел
          map.options.set('maxZoom', APPROX_MAX_ZOOM)
          mapRef.current = map
        }

        // Области переставляем целиком: состав выдачи после фильтров меняется
        // полностью
        map.geoObjects.removeAll()
        for (const area of areas) {
          const circle = new ymaps.Circle(
            [[area.lat, area.lng], area.radius],
            { balloonContent: balloons.get(area.key) },
            {
              fillColor: '#C8A44E26',
              strokeColor: '#C8A44E',
              strokeOpacity: 0.7,
              strokeWidth: 1,
              // Облачко открывает наш обработчик (ниже), а не действие по
              // умолчанию: клик по области открывает список её объектов
              // независимо от того, как ymaps обошёлся с нажатием
              openBalloonOnClick: false,
            },
          )
          // Клик или тап по области открывает облачко, повторный — закрывает.
          // preventDefault гасит действие по умолчанию: облачко открываем сами,
          // чтобы нажатие срабатывало всегда
          circle.events.add('click', (e: Ymaps) => {
            e.preventDefault()
            const balloon = circle.balloon
            if (!balloon) return
            if (balloon.isOpen()) balloon.close()
            else balloon.open()
          })
          map.geoObjects.add(circle)
        }

        // Масштаб подбираем один раз на набор условий: сервер может добавить
        // области позже (определил адреса), но карту пользователю не дёргаем
        if (areas.length && fittedRef.current !== whereKey) {
          fittedRef.current = whereKey
          const bounds = areas.length > 1 ? map.geoObjects.getBounds() : null
          // Несколько областей — показываем всю выдачу; одна — её окрестность
          // (на дом карту не наводим)
          if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 })
          else map.setCenter([areas[0].lat, areas[0].lng], SINGLE_AREA_ZOOM)
        }
      })
      .catch(() => {
        if (!cancelled) setFailedKey(whereKey)
      })

    return () => {
      cancelled = true
    }
  }, [apiKey, areas, whereKey, lang, t])

  return (
    <div>
      <div className="relative">
        {/* Контейнер карты не размонтируем: карта переживает смену фильтров,
            меняются только области */}
        <div
          ref={containerRef}
          className="w-full h-[380px] md:h-[560px] bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20"
        />
        {/* Состояния — поверх карты: подсказка не должна уносить с неё области */}
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
        {/* Областей нет не всегда по вине карты: у объекта может не быть ни
            адреса, ни координат — тогда ему негде стоять */}
        {data && areas.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center bg-[var(--n15-charcoal)]/90">
            <p className="text-sm text-[var(--n15-muted)]">{t.catalog.mapEmpty}</p>
          </div>
        )}
      </div>
      {/* Подсказка под картой — без числа объектов: сколько объектов нашлось
          и сколько попало на карту, на сайте не показываем (см. CatalogContent).
          Объекты показаны примерными областями: точный адрес по ним не определить */}
      {areas.length > 0 && (
        <p className="mt-3 text-xs text-[var(--n15-muted)]">
          {t.catalog.mapOnMap} {data?.truncated ? t.catalog.mapTruncated : t.catalog.mapHint}
        </p>
      )}
    </div>
  )
}

export default CatalogMap

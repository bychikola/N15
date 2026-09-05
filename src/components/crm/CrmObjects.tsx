'use client'

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
// Справочник садовых товариществ (СТ/СНТ/СНО/ДНТ) — тот же, что в разделах
// «Участки» и «Дома» на главной странице сайта.
import { SNT_AREAS } from '@/components/home/landing-data'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
import { geocodeAddress } from '@/lib/geocode'
import { sortAgents } from '@/lib/agents-sort'
// Площадь участков: сотки ↔ м² (1 сотка = 100 м²), чтение «11,5» с запятой
import { areToSqm, areaNumberText, parseAreaNumber, sqmToAre } from '@/lib/area-format'

interface ObjectRow {
  id: number
  title: string
  category: string
  price: number | null
  status: string
  agentName?: string
  thumb?: string
  /** Сводка «Где размещён объект» для мини-подписи на плитке */
  plChecked: boolean
  plFound: number
}

interface PhotoItem {
  id: number | null
  url?: string
}

interface DuplicateInfo {
  id: number
  title?: string
  price?: number | null
  address?: { city?: string; street?: string; house?: string; apartment?: string } | null
  ownerName?: string | null
  matches: string[]
  strength: 'strong' | 'weak'
}

// --- Блок «Где размещён объект» ------------------------------------------------
// Привязанные к объекту объявления площадок и метки проверок живут в скрытой
// группе placements объекта (заполняет сервер, см. src/lib/placements-service.ts).
interface PlacementItemUi {
  id?: number | string
  platform?: string
  url?: string
  title?: string
  source?: string
  status?: string
  match?: number | null
  price?: number | null
  priceInitial?: number | null
  firstSeenAt?: string | null
  lastCheckedAt?: string | null
  note?: string
}

interface PlacementsUi {
  lastCheckedAt?: string | null
  note?: string | null
  items?: PlacementItemUi[]
}

interface PlacementLink {
  slug: string
  name: string
  url: string
}

// Названия площадок для показа (серверный справочник — src/lib/listing-check.ts,
// здесь только имена для быстрого отображения без лишнего запроса)
const PLATFORM_NAMES: Record<string, string> = {
  avito: 'Авито',
  cian: 'ЦИАН',
  domclick: 'Домклик',
  yandex: 'Яндекс Недвижимость',
}
const platformName = (slug?: string) => (slug ? PLATFORM_NAMES[slug] || slug : '—')

// Домены ссылок площадок — для автоподстановки площадки в форме добавления
// (сервер при сохранении всё равно проверяет домен — см. placements-manage)
const PLATFORM_DOMAINS: Record<string, string[]> = {
  avito: ['avito.ru'],
  cian: ['cian.ru'],
  domclick: ['domclick.ru'],
  yandex: ['realty.yandex.ru', 'realty.yandex.com'],
}

/** Площадка по домену ссылки ('' — не распознана) */
const platformSlugByUrl = (url: string): string => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    const hit = Object.entries(PLATFORM_DOMAINS).find(([, ds]) =>
      ds.some((d) => host === d || host.endsWith(`.${d}`)),
    )
    return hit ? hit[0] : ''
  } catch {
    return ''
  }
}

// Подстановка %d/%s в строку словаря; '%%' в конце — литеральный процент
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out.replace(/%%/g, '%')
}
const rub = (v: number) => new Intl.NumberFormat('ru-RU').format(v)

// «только что / N мин назад / N ч назад / N дн назад / дата» — для меток проверок
const agoText = (t: Dict, isoAt?: string | null): string => {
  if (!isoAt) return '—'
  const at = new Date(isoAt).getTime()
  if (!Number.isFinite(at)) return '—'
  const diffMs = Date.now() - at
  if (diffMs < 60_000) return t.crm.plAgoJust
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return fmt(t.crm.plAgoMin, min)
  const hours = Math.floor(min / 60)
  if (hours < 24) return fmt(t.crm.plAgoHour, hours)
  const days = Math.floor(hours / 24)
  if (days < 14) return fmt(t.crm.plAgoDay, days)
  return new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Извлечение группы placements из документа объекта (REST Payload)
const placementsFromDoc = (o: Record<string, unknown>): PlacementsUi => {
  const p = o.placements as PlacementsUi | undefined
  return p && typeof p === 'object' ? p : { items: [] }
}

// Сводка для плитки списка: сколько площадок с активным объявлением
const rowPlacementSummary = (o: Record<string, unknown>): { checked: boolean; found: number } => {
  const p = placementsFromDoc(o)
  const items = p.items || []
  const active = new Set(items.filter((it) => it.status === 'active').map((it) => it.platform))
  return { checked: !!p.lastCheckedAt, found: active.size }
}

const emptyForm = {
  title: '', type: 'sale', category: 'apartment', price: '', area: '', areaUnit: 'sqm', livingArea: '',
  kitchenArea: '', rooms: '', floor: '', totalFloors: '', buildingType: '', condition: '',
  heating: '', balcony: '', water: '', sewerage: '', electricity: '', gas: '', internet: '',
  city: 'Владикавказ', district: '', cityDistrict: '', locality: '', snt: '', street: '', house: '', apartment: '',
  lat: '', lng: '', description: '', status: 'draft', agent: '',
  ownerName: '', ownerPhone: '', cadastralNumber: '',
}

type FormState = typeof emptyForm

// Шрифт полей не задаём здесь: его даёт crm.css (.crm-property-form input),
// на телефонах он увеличивается до 16px, чтобы iOS не приближала страницу при вводе
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7,
  background: 'white', color: '#25241f', padding: 12,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {label}{children}
    </label>
  )
}

// --- Карта с меткой в форме объекта ---
// Точный адрес (населённый пункт + улица + дом) ищется на Яндекс.Картах
// автоматически, кнопка «Найти на карте» ищет по любому заполненному адресу.
// Метку можно передвинуть пальцем/мышью или поставить кликом — координаты
// уходят в скрытые поля формы (lat/lng) и сохраняются с объектом без ручного ввода.

// Начальный центр карты для новых объектов (по умолчанию город — Владикавказ)
const VLAV_CENTER: [number, number] = [43.0205, 44.6819]

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

// Адрес одной строкой для поиска на карте: населённый пункт (или город),
// затем улица и дом. Для пунктов в черте Владикавказа город добавляем следом,
// чтобы геокодер не увёл запрос в другой регион.
const addressForMap = (f: FormState): string => {
  const city = f.city.trim()
  const locality = f.locality.trim()
  const place = locality && locality !== city
    ? (f.district === 'Владикавказский городской округ' ? `${locality}, ${city}` : locality)
    : city
  return [place, f.street.trim(), f.house.trim()].filter(Boolean).join(', ')
}

const toNum = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const isLat = (v: number | null): v is number => v !== null && v >= -90 && v <= 90
const isLng = (v: number | null): v is number => v !== null && v >= -180 && v <= 180

interface ObjMapProps {
  t: Dict
  /** Адрес одной строкой для геокодирования */
  address: string
  /** Адрес «точный» (улица и дом заполнены) — включается авто-поиск */
  autoSearch: boolean
  /** Пользователь менял адресные поля с момента открытия формы */
  addrTouched: boolean
  /** Координаты объекта при открытии формы ('' — нет) */
  lat: string
  lng: string
  /** Новые координаты метки; null — метку убрали */
  onCoords: (lat: number | null, lng: number | null) => void
}

const ObjMapEditor: FC<ObjMapProps> = ({ t, address, autoSearch, addrTouched, lat, lng, onCoords }) => {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const markerRef = useRef<Ymaps | null>(null)
  const ymapsRef = useRef<Ymaps | null>(null)
  const [ready, setReady] = useState(false)
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState<'notfound' | 'noaddress' | 'unavailable' | null>(null)
  // Актуальные пропсы для асинхронных колбэков карты (dragend, click, geocode)
  const propsRef = useRef({ address, autoSearch, addrTouched, lat, lng, onCoords })
  useEffect(() => {
    propsRef.current = { address, autoSearch, addrTouched, lat, lng, onCoords }
  }, [address, autoSearch, addrTouched, lat, lng, onCoords])
  // Поколение поиска: ответы устаревших запросов геокодера игнорируем
  const genRef = useRef(0)

  const removePin = useCallback(() => {
    const mk = markerRef.current
    if (mk && mapRef.current) mapRef.current.geoObjects.remove(mk)
    markerRef.current = null
  }, [])

  // Ставит метку (заменяя старую); метку можно перетаскивать
  const putPin = useCallback((coords: [number, number]) => {
    const ym = ymapsRef.current
    const map = mapRef.current
    if (!ym || !map) return
    removePin()
    const pin = new ym.Placemark(
      coords,
      { hintContent: propsRef.current.address },
      { preset: 'islands#circleIcon', iconColor: '#a7814e', draggable: true },
    )
    pin.events.add('dragend', () => {
      genRef.current++ // ручная установка важнее незавершённого авто-поиска
      const c = pin.geometry.getCoordinates() as [number, number]
      propsRef.current.onCoords(round6(c[0]), round6(c[1]))
    })
    map.geoObjects.add(pin)
    markerRef.current = pin
  }, [removePin])

  // Геокодирование строки адреса; null — ничего не найдено.
  // Через HTTP-геокодер (отдельный ключ): ymaps.geocode с ключом JS API — 403.
  const geocode = useCallback(async (text: string): Promise<[number, number] | null> => {
    const coords = await geocodeAddress(text)
    if (!coords) return null
    return [round6(coords[0]), round6(coords[1])]
  }, [])

  // Инициализация карты при открытии формы: центр — координаты объекта,
  // если они есть (туда же ставим метку), иначе — Владикавказ
  useEffect(() => {
    if (!apiKey) return
    const el = containerRef.current
    if (!el) return
    let disposed = false

    loadYmaps(apiKey)
      .then((ym) => {
        if (disposed) return
        ymapsRef.current = ym
        const sLat = toNum(propsRef.current.lat)
        const sLng = toNum(propsRef.current.lng)
        const known = isLat(sLat) && isLng(sLng)
        const center: [number, number] = known ? [sLat, sLng] : VLAV_CENTER
        const map = new ym.Map(el, {
          center,
          zoom: known ? 17 : 12,
          controls: ['zoomControl'],
        })
        mapRef.current = map
        if (known) putPin(center)
        // Клик по карте — быстрая установка метки (удобно с телефона)
        map.events.add('click', (e: Ymaps) => {
          const c = e.get('coords') as [number, number] | undefined
          if (!c) return
          genRef.current++ // ручная установка важнее незавершённого авто-поиска
          const coords: [number, number] = [round6(c[0]), round6(c[1])]
          putPin(coords)
          propsRef.current.onCoords(coords[0], coords[1])
        })
        setReady(true)
      })
      .catch(() => {
        // Карта не загрузилась (нет сети, заблокирован скрипт) — сообщаем
        if (!disposed) setErr('unavailable')
      })

    return () => {
      disposed = true
      try {
        mapRef.current?.destroy()
      } catch {
        // карта могла не успеть создаться
      }
      mapRef.current = null
      ymapsRef.current = null
      markerRef.current = null
    }
  }, [apiKey, putPin])

  // Авто-поиск по точному адресу: после паузы в вводе ищем адрес и ставим
  // метку. Если адрес перестал быть точным — метку убираем, чтобы объект
  // не остался привязан к старой точке.
  useEffect(() => {
    if (!ready) return
    const gen = ++genRef.current
    if (!autoSearch) {
      // Форму только открыли — метку и координаты не трогаем
      if (!addrTouched) return
      const timer = setTimeout(() => {
        setSearching(false)
        setErr(null)
        removePin()
        propsRef.current.onCoords(null, null)
      }, 600)
      return () => clearTimeout(timer)
    }
    // Метка уже стоит по сохранённым координатам, адрес не правили — без поиска
    if (!addrTouched && isLat(toNum(propsRef.current.lat)) && isLng(toNum(propsRef.current.lng))) {
      return
    }
    const text = address.trim()
    if (!text) return
    const timer = setTimeout(() => {
      setSearching(true)
      setErr(null)
      void (async () => {
        try {
          const found = await geocode(text)
          if (gen !== genRef.current) return
          if (found) {
            // Карта могла быть закрыта, пока шёл запрос — тогда ничего не трогаем
            if (mapRef.current) {
              mapRef.current.setCenter(found, 17)
              putPin(found)
              propsRef.current.onCoords(found[0], found[1])
            }
          } else {
            setErr('notfound')
          }
        } finally {
          if (gen === genRef.current) setSearching(false)
        }
      })()
    }, 900)
    return () => clearTimeout(timer)
  }, [ready, address, autoSearch, addrTouched, removePin, putPin, geocode])

  // Кнопка «Найти на карте»: поиск по любому заполненному адресу (без debounce)
  const findOnMap = useCallback(() => {
    const text = propsRef.current.address.trim()
    if (!text) {
      setErr('noaddress')
      return
    }
    const gen = ++genRef.current
    setSearching(true)
    setErr(null)
    void (async () => {
      try {
        const found = await geocode(text)
        if (gen !== genRef.current) return
        if (found) {
          // Карта могла быть закрыта, пока шёл запрос — тогда ничего не трогаем
          if (mapRef.current) {
            // Полный адрес (пункт, улица, дом) — крупный план, иначе — вид города
            mapRef.current.setCenter(found, text.includes(',') ? 17 : 14)
            putPin(found)
            propsRef.current.onCoords(found[0], found[1])
          }
        } else {
          setErr('notfound')
        }
      } finally {
        if (gen === genRef.current) setSearching(false)
      }
    })()
  }, [geocode, putPin])

  const noKey = !apiKey
  const statusText = err === 'unavailable' || noKey
    ? t.crm.objMapNoKey
    : err === 'notfound'
      ? t.crm.objMapNotFound
      : err === 'noaddress'
        ? t.crm.objMapNoAddress
        : t.crm.objMapHint

  return (
    <div>
      <div className="crm-map-bar">
        <button type="button" onClick={findOnMap} disabled={!ready || searching}>
          {t.crm.objMapFind}
        </button>
        {searching && <span>{t.crm.objMapSearch}</span>}
      </div>
      <div ref={containerRef} className="crm-map-canvas" />
      <p className={noKey || err ? 'crm-map-status err' : 'crm-map-status'}>{statusText}</p>
    </div>
  )
}

export const CrmObjects: FC<{ t: Dict; isAdmin: boolean }> = ({ t, isAdmin }) => {
  const [rows, setRows] = useState<ObjectRow[]>([])
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [features, setFeatures] = useState<string[]>([])
  const [featureInput, setFeatureInput] = useState('')
  // Перетаскивание фото для смены порядка
  const [dragPhotoIdx, setDragPhotoIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Найденные дубли объекта (модалка подтверждения)
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null)
  // Адрес менялся с момента открытия формы — для авто-поиска метки на карте
  const [addrTouched, setAddrTouched] = useState(false)
  // «Где размещён объект»: привязанные объявления площадок открытого объекта
  const [pl, setPl] = useState<PlacementsUi | null>(null)
  const [plLinks, setPlLinks] = useState<PlacementLink[]>([])
  const [plBusy, setPlBusy] = useState(false)
  const [plErr, setPlErr] = useState('')

  const load = useCallback(async () => {
    const [objectsRes, agentsRes] = await Promise.all([
      fetch('/api/objects?limit=100&depth=1', { credentials: 'include' }),
      fetch('/api/agents?limit=100', { credentials: 'include' }),
    ])
    const objectsData = await objectsRes.json()
    const agentsData = await agentsRes.json()
    setRows(
      ((objectsData.docs || []) as Record<string, unknown>[]).map((o) => {
        const img = o.primaryImage as { url?: string } | undefined
        const agent = o.agent as { name?: string } | undefined
        const plSum = rowPlacementSummary(o)
        return {
          id: o.id as number,
          title: o.title as string,
          category: o.category as string,
          price: o.price as number | null,
          status: o.status as string,
          agentName: agent?.name,
          thumb: img?.url,
          plChecked: plSum.checked,
          plFound: plSum.found,
        }
      }),
    )
    // Агенты в алфавитном порядке по фамилии (единый порядок для сайта и CRM)
    setAgents(sortAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name }))))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled) return
      await load()
    }
    void tick()
    return () => { cancelled = true }
  }, [load])

  // Автоматическая периодическая проверка площадок: пока страница открыта,
  // раз в минуту предлагаем серверу обработать объекты с наступившим сроком
  // (плюс отдельный серверный таймер — src/instrumentation.ts). Обработка
  // идемпотентна и ограничена порциями, так что частые вызовы безопасны.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const sweep = async () => {
      try {
        const res = await fetch('/api/objects/placements-sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ limit: 10 }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { checked?: number }
        // Что-то проверилось — обновляем подписи «на площадках» на плитках
        if (!cancelled && data.checked) await load()
      } catch {
        // фоновая проверка не должна мешать работе со списком
      }
    }
    void sweep()
    const timer = setInterval(() => void sweep(), 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [loading, load])

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setPhotos([])
    setFeatures([])
    setSaveError('')
    setDuplicates(null)
    setAddrTouched(false)
    setPl(null)
    setPlLinks([])
    setPlErr('')
  }

  const startEdit = (o: Record<string, unknown>) => {
    setModalOpen(true)
    setDuplicates(null)
    setSaveError('')
    setAddrTouched(false)
    const addr = o.address as Record<string, unknown> | undefined
    const coords = o.coordinates as Record<string, unknown> | undefined
    const agentRel = o.agent as Record<string, unknown> | undefined
    setEditId(o.id as number)
    // Площадь участка показываем в той единице, в которой её вводили
    // (сотки — «6», а не «600»); у остальных категорий и старых объектов
    // без единицы — как раньше, в м².
    const areaUnit: 'sqm' | 'are' =
      o.category === 'land' && (o.areaUnit as string | undefined) === 'are' ? 'are' : 'sqm'
    setForm({
      ...emptyForm,
      title: (o.title as string) || '',
      type: (o.type as string) || 'sale',
      category: (o.category as string) || 'apartment',
      price: o.price != null ? String(o.price) : '',
      area: o.area != null
        ? areaUnit === 'are'
          ? areaNumberText(sqmToAre(o.area as number))
          : String(o.area)
        : '',
      areaUnit,
      livingArea: o.livingArea != null ? String(o.livingArea) : '',
      kitchenArea: o.kitchenArea != null ? String(o.kitchenArea) : '',
      rooms: o.rooms != null ? String(o.rooms) : '',
      floor: o.floor != null ? String(o.floor) : '',
      totalFloors: o.totalFloors != null ? String(o.totalFloors) : '',
      buildingType: (o.buildingType as string) || '',
      condition: (o.condition as string) || '',
      heating: (o.heating as string) || '',
      balcony: (o.balcony as string) || '',
      water: (o.water as string) || '',
      sewerage: (o.sewerage as string) || '',
      electricity: (o.electricity as string) || '',
      gas: (o.gas as string) || '',
      internet: (o.internet as string) || '',
      city: (addr?.city as string) || 'Владикавказ',
      district: (addr?.district as string) || '',
      cityDistrict: (addr?.cityDistrict as string) || '',
      locality: (addr?.locality as string) || '',
      snt: (addr?.snt as string) || '',
      street: (addr?.street as string) || '',
      house: (addr?.house as string) || '',
      apartment: (addr?.apartment as string) || '',
      lat: coords?.lat != null ? String(coords.lat) : '',
      lng: coords?.lng != null ? String(coords.lng) : '',
      description: '',
      status: (o.status as string) || 'draft',
      agent: agentRel?.id != null ? String(agentRel.id) : '',
      ownerName: (o.ownerName as string) || '',
      ownerPhone: (o.ownerPhone as string) || '',
      cadastralNumber: (o.cadastralNumber as string) || '',
    })
    const img = o.primaryImage as { id?: number; url?: string } | undefined
    const imgs = (o.images as { id?: number; url?: string }[] | undefined) || []
    const all: PhotoItem[] = []
    if (img?.id) all.push({ id: img.id as number, url: img.url })
    for (const i of imgs) {
      if (i.id && !all.some((p) => p.id === i.id)) all.push({ id: i.id as number, url: i.url })
    }
    setPhotos(all)
    setFeatures(((o.features as { feature?: string }[] | undefined) || []).map((f) => f.feature || '').filter(Boolean))
    const rt = o.description as { root?: { children?: { children?: { text?: string }[] }[] } } | undefined
    const descText = (rt?.root?.children || []).map((p) => (p.children || []).map((c) => c.text || '').join('')).filter(Boolean).join('\n')
    setForm((prev) => ({ ...prev, description: descText }))
    // Блок «Где размещён объект»: привязанные объявления площадок; ссылки
    // ручного поиска по адресу подгружаем отдельным запросом
    setPl(placementsFromDoc(o))
    setPlErr('')
    void fetch(`/api/objects/placement-links?id=${o.id as number}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ links?: PlacementLink[] }>) : null))
      .then((d) => setPlLinks(d?.links || []))
      .catch(() => setPlLinks([]))
  }

  const onPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      // Накладываем водяной знак (левый верхний угол с отступом) до загрузки
      const watermarked = await applyWatermark(file)
      if (!watermarked) continue
      const fd = new FormData()
      fd.append('file', watermarked, file.name)
      const res = await fetch('/api/media', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) continue
      const data = await res.json()
      const doc = data.doc as { id?: number; url?: string } | undefined
      if (doc?.id) {
        setPhotos((prev) => [...prev, { id: doc.id as number, url: doc.url }])
      }
    }
    e.target.value = ''
  }

  // Водяной знак: рисуем фото на canvas и поверх — watermark.png по центру
  // фото; размер знака ~28% ширины
  const applyWatermark = (file: File): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const wm = new Image()
        wm.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
          ctx.drawImage(img, 0, 0)
          const wmW = Math.round(canvas.width * 0.28)
          const wmH = Math.round(wmW * (wm.naturalHeight / wm.naturalWidth))
          // По центру фото
          const wmX = Math.round((canvas.width - wmW) / 2)
          const wmY = Math.round((canvas.height - wmH) / 2)
          // Знак в исходнике очень прозрачный (alpha ~0.1) — рисуем его несколько
          // раз: каждый проход накапливает непрозрачность (1-(1-a)^n)
          for (let pass = 0; pass < 4; pass++) {
            ctx.drawImage(wm, wmX, wmY, wmW, wmH)
          }
          canvas.toBlob(
            (blob) => resolve(blob),
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            0.95,
          )
        }
        wm.onerror = () => resolve(null)
        wm.src = '/img/watermark.png'
      }
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(file)
    })
  }

  const makeCover = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.unshift(item)
      return next
    })
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const movePhoto = (from: number, to: number) => {
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const save = async (force = false) => {
    if (saving || !form.title.trim()) return
    if (!form.price) {
      setSaveError(t.crm.objPriceRequired)
      return
    }
    setSaveError('')
    // Площадь в БД всегда хранится в м²: участок «6 соток» сохраняется как
    // 600 м² + единица «сотки» для показа; техрасчёты (оценка, фильтры) —
    // только по м², конвертацию больше никто не повторяет
    const areaNum = form.area.trim() ? parseAreaNumber(form.area) : null
    const isAre = form.category === 'land' && form.areaUnit === 'are'
    const area = areaNum != null && areaNum > 0
      ? isAre
        ? Math.round(areToSqm(areaNum) * 100) / 100
        : areaNum
      : undefined
    const mediaIds = photos.map((p) => p.id).filter((id): id is number => id !== null)
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      category: form.category,
      price: form.price ? Number(form.price) : undefined,
      area,
      areaUnit: form.category === 'land' ? (isAre ? 'are' : 'sqm') : undefined,
      livingArea: form.livingArea ? Number(form.livingArea) : undefined,
      kitchenArea: form.kitchenArea ? Number(form.kitchenArea) : undefined,
      rooms: form.rooms ? Number(form.rooms) : undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      totalFloors: form.totalFloors ? Number(form.totalFloors) : undefined,
      buildingType: form.buildingType || undefined,
      condition: form.condition || undefined,
      heating: form.heating || undefined,
      balcony: form.balcony || undefined,
      water: form.water || undefined,
      sewerage: form.sewerage || undefined,
      electricity: form.electricity || undefined,
      gas: form.gas || undefined,
      internet: form.internet || undefined,
      address: {
        city: form.city,
        district: form.district,
        cityDistrict: form.cityDistrict,
        locality: form.locality,
        snt: form.snt.trim(),
        street: form.street,
        house: form.house,
        apartment: form.apartment,
      },
      coordinates: form.lat || form.lng ? { lat: Number(form.lat) || undefined, lng: Number(form.lng) || undefined } : undefined,
      description: form.description.trim()
        ? { root: { children: [{ children: [{ text: form.description.trim(), type: 'text', version: 1 }], type: 'paragraph', version: 1 }], type: 'root', version: 1 } }
        : undefined,
      features: features.map((feature) => ({ feature })),
      status: form.status,
      agent: form.agent ? Number(form.agent) : undefined,
      primaryImage: mediaIds[0],
      images: mediaIds.slice(1),
      ownerName: form.ownerName.trim() || undefined,
      ownerPhone: form.ownerPhone.trim() || undefined,
      cadastralNumber: form.cadastralNumber.trim() || undefined,
    }

    // Проверка дублей перед сохранением (если не подтвердили force)
    if (!force) {
      try {
        const dupRes = await fetch('/api/objects/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ownerName: form.ownerName,
            ownerPhone: form.ownerPhone,
            cadastralNumber: form.cadastralNumber,
            address: { city: form.city, street: form.street, house: form.house, apartment: form.apartment },
            excludeId: editId ?? undefined,
          }),
        })
        if (dupRes.ok) {
          const dupData = await dupRes.json()
          if (dupData.duplicates?.length) {
            setDuplicates(dupData.duplicates)
            return
          }
        }
      } catch {
        // проверка не должна блокировать сохранение
      }
    }

    setSaving(true)
    const res = await fetch(editId ? `/api/objects/${editId}?force=${force}` : `/api/objects?force=${force}`, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      resetForm()
      setModalOpen(false)
      await load()
    } else {
      // Показываем причину ошибки — раньше неудача была безмолвной
      const errData = await res.json().catch(() => null) as { errors?: { message?: string }[] } | null
      const serverMsg = errData?.errors?.[0]?.message
      setSaveError(serverMsg ? `${t.crm.objSaveError} (${serverMsg})` : t.crm.objSaveError)
    }
  }

  const remove = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm(t.crm.objDeleteConfirm)) return
    await fetch(`/api/objects/${id}`, { method: 'DELETE', credentials: 'include' })
    await load()
  }

  const set = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  // Категория: единица «сотки» доступна только участкам. При смене категории
  // площадь снова читается в м² — число в поле не трогаем (его вводили под
  // старую категорию), единица молча возвращается к м².
  const setCategory = (v: string) => {
    setForm((prev) => ({
      ...prev,
      category: v,
      areaUnit: v === 'land' ? prev.areaUnit : 'sqm',
    }))
  }

  // Смена единицы площади участка: переводим введённое число, чтобы площадь
  // не изменилась — «600» м² становятся «6» соток, «11,5» соток — «1150» м²
  const setAreaUnit = (v: string) => {
    const next = v === 'are' ? 'are' : 'sqm'
    setForm((prev) => {
      if (prev.areaUnit === next) return prev
      const n = prev.area.trim() ? parseAreaNumber(prev.area) : null
      return {
        ...prev,
        areaUnit: next,
        area: n != null
          ? areaNumberText(next === 'are' ? sqmToAre(n) : areToSqm(n))
          : prev.area,
      }
    })
  }

  // Адресные поля: помечаем, что адрес менялся (для авто-поиска на карте).
  // При смене района сбрасываем населённый пункт, если он не входит в новый район.
  const setAddr = (k: 'city' | 'district' | 'cityDistrict' | 'locality' | 'street' | 'house' | 'apartment', v: string) => {
    setAddrTouched(true)
    setForm((prev) => ({
      ...prev,
      [k]: v,
      ...(k === 'district' && v && prev.locality && !(LOCALITIES_BY_DISTRICT[v] || []).includes(prev.locality)
        ? { locality: '' }
        : {}),
    }))
  }

  // Координаты приходят с карты: живут в скрытых полях формы и уходят с объектом
  const setMapCoords = (plat: number | null, plng: number | null) => {
    setForm((prev) => ({
      ...prev,
      lat: plat != null ? String(plat) : '',
      lng: plng != null ? String(plng) : '',
    }))
  }

  // Фильтр по статусу (черновик / опубликован / архив)
  const visibleRows = statusFilter ? rows.filter((o) => o.status === statusFilter) : rows

  // Кнопка «Проверить сейчас»: сервер прогоняет сверку площадок объекта
  const runPlacementCheck = async () => {
    if (!editId || plBusy) return
    setPlBusy(true)
    setPlErr('')
    try {
      const res = await fetch('/api/objects/check-placements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId: editId }),
      })
      const data = (await res.json()) as { error?: string; placements?: PlacementsUi; searchLinks?: PlacementLink[] }
      if (!res.ok || !data.placements) throw new Error(data.error || '')
      setPl(data.placements)
      if (data.searchLinks) setPlLinks(data.searchLinks)
      await load()
    } catch {
      setPlErr(t.crm.plCheckErr)
    } finally {
      setPlBusy(false)
    }
  }

  // Привязанные объявления изменились (добавили/убрали/подтвердили) — обновляем
  // блок и подписи на плитках
  const applyPlacements = async (placements: PlacementsUi) => {
    setPl(placements)
    setPlErr('')
    await load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t.crm.filterStatus}
          style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '10px 12px', font: '12px Arial, Helvetica, sans-serif' }}
        >
          <option value="">{t.crm.filterStatus}: {t.crm.filterAll}</option>
          <option value="draft">{t.crm.statusDraft}</option>
          <option value="published">{t.crm.statusPublished}</option>
          <option value="archived">{t.crm.statusArchived}</option>
        </select>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {visibleRows.length} / {rows.length}
        </span>
        <button type="button" onClick={() => { resetForm(); setModalOpen(true) }}
          style={{ marginLeft: 'auto', border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
          + {t.crm.objAdd}
        </button>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setModalOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 900px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
                {editId ? t.crm.objEdit : t.crm.objAdd}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>
                ✕
              </button>
            </div>
            {/* Блок «Где размещён объект» — привязанные объявления площадок.
                Доступен у сохранённого объекта (editId); у нового — появится
                после первого сохранения. */}
            {editId && (
              <PlacementBlock
                t={t}
                objectId={editId}
                value={pl}
                links={plLinks}
                busy={plBusy}
                err={plErr}
                onRun={runPlacementCheck}
                onChanged={applyPlacements}
              />
            )}
            <div className="crm-property-form">
          <Field label={t.crm.objTitle}><input value={form.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objType}>
            <select value={form.type} onChange={(e) => set('type', e.target.value)} style={inputStyle}>
              <option value="sale">Продажа</option><option value="rent">Аренда</option>
            </select>
          </Field>
          <Field label={t.crm.objCategory}>
            <select value={form.category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="apartment">Квартира</option><option value="house">Дом</option><option value="townhouse">Таунхаус</option><option value="commercial">Коммерческая</option><option value="land">Участок</option>
            </select>
          </Field>
          <Field label={t.crm.objPrice}><input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} style={inputStyle} /></Field>
          {/* Площадь: у земельного участка агент выбирает единицу (м² или сотки,
              пример «6 соток» = 600 м²); у квартир/домов/коммерции — только м².
              В БД значение всегда сохраняется в м² (см. save), сотки запоминаем
              отдельным полем areaUnit и показываем так же на сайте. */}
          {form.category === 'land' ? (
            <Field label={form.areaUnit === 'are' ? t.crm.objAreaAre : t.crm.objArea}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={form.areaUnit === 'are' ? 'text' : 'number'}
                  inputMode={form.areaUnit === 'are' ? 'decimal' : undefined}
                  value={form.area}
                  onChange={(e) => set('area', e.target.value)}
                  placeholder={form.areaUnit === 'are' ? 'Например: 6 или 11,5' : undefined}
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                <select
                  value={form.areaUnit}
                  onChange={(e) => setAreaUnit(e.target.value)}
                  aria-label="Единица площади"
                  style={{ ...inputStyle, width: 96, flexShrink: 0 }}
                >
                  <option value="sqm">м²</option>
                  <option value="are">сотки</option>
                </select>
              </div>
            </Field>
          ) : (
            <Field label={t.crm.objArea}><input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} style={inputStyle} /></Field>
          )}
          <Field label={t.crm.objLivingArea}><input type="number" value={form.livingArea} onChange={(e) => set('livingArea', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objKitchenArea}><input type="number" value={form.kitchenArea} onChange={(e) => set('kitchenArea', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objRooms}><input type="number" value={form.rooms} onChange={(e) => set('rooms', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objFloor}><input type="number" value={form.floor} onChange={(e) => set('floor', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objTotalFloors}><input type="number" value={form.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objBuildingType}>
            <input value={form.buildingType} onChange={(e) => set('buildingType', e.target.value)} style={inputStyle} list="crm-building-type" />
          </Field>
          <Field label={t.crm.objCondition}>
            <input value={form.condition} onChange={(e) => set('condition', e.target.value)} style={inputStyle} list="crm-condition" />
          </Field>
          <Field label={t.crm.objHeating}>
            <input value={form.heating} onChange={(e) => set('heating', e.target.value)} style={inputStyle} list="crm-heating" />
          </Field>
          <Field label={t.crm.objBalcony}>
            <input value={form.balcony} onChange={(e) => set('balcony', e.target.value)} style={inputStyle} list="crm-balcony" />
          </Field>
          <Field label={t.crm.objWater}>
            <input value={form.water} onChange={(e) => set('water', e.target.value)} style={inputStyle} list="crm-water" />
          </Field>
          <Field label={t.crm.objSewerage}>
            <input value={form.sewerage} onChange={(e) => set('sewerage', e.target.value)} style={inputStyle} list="crm-sewerage" />
          </Field>
          <Field label={t.crm.objElectricity}>
            <input value={form.electricity} onChange={(e) => set('electricity', e.target.value)} style={inputStyle} list="crm-electricity" />
          </Field>
          <Field label={t.crm.objGas}>
            <input value={form.gas} onChange={(e) => set('gas', e.target.value)} style={inputStyle} list="crm-gas" />
          </Field>
          <Field label={t.crm.objInternet}>
            <input value={form.internet} onChange={(e) => set('internet', e.target.value)} style={inputStyle} list="crm-internet" />
          </Field>

          <datalist id="crm-building-type">
            <option value="Кирпичный" /><option value="Монолитный" /><option value="Панельный" />
          </datalist>
          <datalist id="crm-condition">
            <option value="Новое" /><option value="Хорошее" /><option value="Требует ремонта" />
          </datalist>
          <datalist id="crm-heating">
            <option value="Центральное" /><option value="Автономное" /><option value="Газовое" />
          </datalist>
          <datalist id="crm-balcony">
            <option value="Есть" /><option value="Лоджия" /><option value="Несколько" />
          </datalist>
          <datalist id="crm-water">
            <option value="Есть" /><option value="Центральная" /><option value="Своя" />
          </datalist>
          <datalist id="crm-sewerage">
            <option value="Есть" /><option value="Центральная" /><option value="Септик" />
          </datalist>
          <datalist id="crm-electricity">
            <option value="Есть" /><option value="Нет" />
          </datalist>
          <datalist id="crm-gas">
            <option value="Есть" /><option value="Магистральный" /><option value="Баллонный" />
          </datalist>
          <datalist id="crm-internet">
            <option value="Есть" /><option value="Нет" />
          </datalist>

          {/* Адрес: широкие поля, удобные для заполнения с телефона */}
          <div className="crm-addr span-2" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-addr-full">
              <Field label={t.crm.objCity}>
                <input value={form.city} onChange={(e) => setAddr('city', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div className="crm-addr-full">
              <Field label={t.crm.objDistrict}>
                <select value={form.district} onChange={(e) => setAddr('district', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
            </div>
            {/* Район города — внутригородской район Владикавказа (Иристонский
                и др.), отдельно от района республики (address.district).
                Значение — в address.cityDistrict объекта. */}
            <div className="crm-addr-full">
              <Field label={t.crm.objCityDistrict}>
                <select value={form.cityDistrict} onChange={(e) => setAddr('cityDistrict', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {CITY_DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="crm-addr-full">
              <Field label={t.crm.objLocality}>
                <input list="crm-localities" value={form.locality} onChange={(e) => setAddr('locality', e.target.value)} style={inputStyle} />
              </Field>
              <datalist id="crm-localities">
                {(form.district ? LOCALITIES_BY_DISTRICT[form.district] || [] : LOCALITY_OPTIONS).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            {/* СТ/СНТ/СНО — выпадающий список разделов (как на главной сайта):
                только для загородных категорий (дом в СНТ, участок в
                товариществе), у городской недвижимости поля нет.
                Значение — в address.snt объекта. */}
            {(form.category === 'land' || form.category === 'house') && (
              <div className="crm-addr-full">
                <Field label={t.crm.objSnt}>
                  <select value={form.snt} onChange={(e) => set('snt', e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {SNT_AREAS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <div className="crm-addr-full">
              <Field label={t.crm.objStreet}>
                <input value={form.street} onChange={(e) => setAddr('street', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div className="crm-addr-half">
              <Field label={t.crm.objHouse}>
                <input value={form.house} onChange={(e) => setAddr('house', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div className="crm-addr-half">
              <Field label={t.crm.objApartment}>
                <input value={form.apartment} onChange={(e) => setAddr('apartment', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* Карта: авто-поиск точного адреса, метку можно передвинуть */}
          <div className="crm-map-block span-2" style={{ gridColumn: '1 / -1' }}>
            <ObjMapEditor
              t={t}
              address={addressForMap(form)}
              autoSearch={Boolean(form.city.trim() || form.locality.trim()) && Boolean(form.street.trim()) && Boolean(form.house.trim())}
              addrTouched={addrTouched}
              lat={form.lat}
              lng={form.lng}
              onCoords={setMapCoords}
            />
          </div>

          {/* Данные собственника: на телефоне поля становятся во всю ширину */}
          <div className="crm-owner span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objOwnerName}>
              <input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={t.crm.objOwnerPhone}>
              <input inputMode="tel" value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={t.crm.objCadastral}>
              <input value={form.cadastralNumber} onChange={(e) => set('cadastralNumber', e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objDescription}>
              <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objFeatures}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => { if (featureInput.trim()) { setFeatures((prev) => [...prev, featureInput.trim()]); setFeatureInput('') } }} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                  {t.crm.objFeatureAdd}
                </button>
              </div>
              {features.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {features.map((f, i) => (
                    <span key={`${f}-${i}`} style={{ padding: '6px 10px', background: '#f2ede4', borderRadius: 999, fontSize: 11, color: '#716b62', cursor: 'pointer' }} onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))}>
                      {f} ✕
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <Field label={t.crm.objStatus}>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
              <option value="draft">{t.crm.statusDraft}</option>
              <option value="published">{t.crm.statusPublished}</option>
              <option value="archived">{t.crm.statusArchived}</option>
            </select>
          </Field>
          <Field label={t.crm.objAgent}>
            <select value={form.agent} onChange={(e) => set('agent', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-gallery-field">
              <div className="crm-gallery-heading">
                <div>
                  <strong>{t.crm.objPhotos}</strong>
                  <small>{t.crm.objPhotosHint}</small>
                  <small style={{ display: 'block', marginTop: 4 }}>{t.crm.objPhotosOrder}</small>
                </div>
                <label className="crm-photo-picker" style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px dashed #cbbda9', borderRadius: 9, background: '#fcfaf7', cursor: 'pointer', padding: 16 }}>
                  <span>{t.crm.objPhotoPick}</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => void onPhotoPick(e)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                </label>
              </div>
              {photos.length ? (
                <div className="crm-photo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10 }}>
                  {photos.map((p, i) => (
                    <div
                      key={p.id ?? `new-${i}`}
                      className="crm-photo"
                      draggable={photos.length > 1}
                      onDragStart={(e) => { setDragPhotoIdx(i); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i) }}
                      onDrop={() => {
                        if (dragPhotoIdx !== null && dragPhotoIdx !== i) {
                          movePhoto(dragPhotoIdx, i)
                        }
                        setDragPhotoIdx(null)
                        setDragOverIdx(null)
                      }}
                      onDragEnd={() => { setDragPhotoIdx(null); setDragOverIdx(null) }}
                      style={{
                        padding: 7, border: '1px solid #e2dacd', borderRadius: 9, background: 'white',
                        cursor: photos.length > 1 ? 'grab' : 'default',
                        outline: dragOverIdx === i && dragPhotoIdx !== null ? '2px dashed #b68a51' : 'none',
                        opacity: dragPhotoIdx === i ? 0.45 : 1,
                        transition: 'opacity .15s',
                      }}
                    >
                      <img src={p.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6, pointerEvents: 'none' }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'stretch' }}>
                        {i === 0 ? (
                          <b style={{ flex: 1, textAlign: 'center', background: '#a7814e', color: 'white', borderRadius: 5, padding: '7px 4px', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.07em' }}>Обложка</b>
                        ) : (
                          <button type="button" onClick={() => makeCover(i)} style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: 7, fontSize: 8, cursor: 'pointer' }} title={t.crm.objPhotoCover}>{t.crm.objPhotoCover}</button>
                        )}
                        {i > 0 && (
                          <button type="button" onClick={() => movePhoto(i, i - 1)} aria-label="↑" style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>↑</button>
                        )}
                        {i < photos.length - 1 && (
                          <button type="button" onClick={() => movePhoto(i, i + 1)} aria-label="↓" style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>↓</button>
                        )}
                        <button type="button" onClick={() => removePhoto(i)} aria-label={t.crm.objPhotoRemove} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#9b4e43', padding: '7px 9px', fontSize: 10, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9b958a', fontSize: 11 }}>{t.crm.objNoPhotos}</p>
              )}
            </div>
          </div>

          <div className="span-2 crm-form-actions" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button type="button" onClick={() => void save()} disabled={saving} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '14px 22px', textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, cursor: 'pointer' }}>
              {saving ? t.crm.objSaving : editId ? t.crm.objEdit : t.crm.objAdd}
            </button>
            {saved && <p style={{ margin: 0, color: '#8b683f', fontSize: 11 }}>{t.crm.objSaved} ✓</p>}
            {saveError && <p style={{ margin: 0, color: '#9b4e43', fontSize: 11 }}>{saveError}</p>}
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка найденных дублей */}
      {duplicates && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setDuplicates(null)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 640px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
              {t.crm.dupTitle}
            </h2>
            <p style={{ margin: '0 0 14px', color: '#817b70', fontSize: 12 }}>{t.crm.dupText}</p>
            {duplicates.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #eee9e1' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title || `#${d.id}`}</div>
                  <div style={{ fontSize: 11, color: '#817b70', marginTop: 2 }}>
                    {[d.address?.city, d.address?.street, d.address?.house].filter(Boolean).join(', ')}
                    {d.ownerName ? ` · ${d.ownerName}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: d.strength === 'strong' ? '#9b4e43' : '#9b958a', marginTop: 3 }}>
                    {d.matches.map((m) => t.crm[`dupMatch${m.charAt(0).toUpperCase()}${m.slice(1)}` as keyof Dict['crm']] || m).join(' · ')}
                  </div>
                </div>
                <a href={`/ru/catalog/${d.id}`} target="_blank" rel="noopener"
                  style={{ border: '1px solid #d9d1c4', borderRadius: 7, color: '#8d6b40', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  {t.crm.dupOpen}
                </a>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => { setDuplicates(null); void save(true) }}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.dupForce}
              </button>
              <button type="button" onClick={() => setDuplicates(null)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.dupCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
      ) : rows.length && !visibleRows.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.objEmptyStatus}</p>
        </div>
      ) : visibleRows.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visibleRows.map((o) => (
            <div key={o.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14 }}>
              <div style={{ aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden', background: o.thumb ? undefined : '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {o.thumb
                  ? <img src={o.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: '#b99a6a', fontSize: 26 }}>⌂</span>}
              </div>
              <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.title}
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t.categoryLabels[o.category as keyof typeof t.categoryLabels] ?? o.category}</span>
                <span style={{ fontSize: 9, color: '#817b70' }}>{o.status === 'published' ? t.crm.statusPublished : o.status === 'archived' ? t.crm.statusArchived : t.crm.statusDraft}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#25241f' }}>
                  {o.price != null ? new Intl.NumberFormat('ru-RU').format(o.price) + ' ₽' : '—'}
                </strong>
                {o.agentName && <span style={{ fontSize: 10, color: '#8a857b' }}>{o.agentName}</span>}
              </div>
              {/* «Где размещён объект» — краткая сводка на плитке */}
              <div style={{ marginTop: 6, fontSize: 10, color: '#8a857b' }}>
                {o.plChecked
                  ? o.plFound > 0
                    ? fmt(t.crm.plTileFound, o.plFound)
                    : t.crm.plTileOnly
                  : t.crm.plTileNone}
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', gap: 6 }}>
                <button type="button" onClick={async () => { const res = await fetch(`/api/objects/${o.id}`, { credentials: 'include' }); const d = await res.json(); startEdit(d) }}
                  style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                  {t.crm.objEdit}
                </button>
                {isAdmin && (
                  <button type="button" onClick={() => void remove(o.id)}
                    style={{ border: '1px solid #e3cfc7', borderRadius: 6, background: 'transparent', color: '#9b4e43', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                    {t.crm.objDelete}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: '0 0 14px' }}>{t.crm.objEmpty}</p>
          <button type="button" onClick={() => { resetForm(); setModalOpen(true) }}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer' }}>
            + {t.crm.objAdd}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Блок «Где размещён объект» в карточке объекта CRM
// ---------------------------------------------------------------------------

const PL_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: '#e6efe1', color: '#3f6b34' },
  removed: { bg: '#efeadf', color: '#817b70' },
  needsCheck: { bg: '#f7e6cf', color: '#a1661f' },
}

interface PlacementBlockProps {
  t: Dict
  objectId: number
  value: PlacementsUi | null
  links: PlacementLink[]
  busy: boolean
  err: string
  onRun: () => Promise<void>
  onChanged: (placements: PlacementsUi) => Promise<void>
}

/** Одна строка блока: объявление площадки, привязанное к объекту */
function PlacementRow({
  t,
  item,
  onManage,
}: {
  t: Dict
  item: PlacementItemUi
  onManage: (action: 'status' | 'remove', itemId: number | string, status?: string) => Promise<void>
}) {
  const status = item.status || 'needsCheck'
  const pill = PL_STATUS_STYLE[status] || PL_STATUS_STYLE.needsCheck
  const statusLabel =
    status === 'active' ? t.crm.plStatusActive : status === 'removed' ? t.crm.plStatusRemoved : t.crm.plStatusNeeds
  const manual = item.source !== 'auto'
  const price = item.price
  const initial = item.priceInitial
  const delta =
    typeof price === 'number' && typeof initial === 'number' && initial > 0 && price !== initial
      ? price - initial
      : null
  const deltaPct = delta != null ? Math.round((Math.abs(delta) / initial!) * 100) : null

  const small: React.CSSProperties = { fontSize: 10, color: '#8a857b' }
  const chipBtn: React.CSSProperties = {
    border: '1px solid #e1d8ca',
    borderRadius: 5,
    background: '#fff',
    color: '#716b62',
    padding: '5px 8px',
    fontSize: 9,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '.05em',
  }

  return (
    <div style={{ padding: '11px 0', borderBottom: '1px solid #ece5d9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, color: '#25241f' }}>{platformName(item.platform)}</b>
        <span style={small}>
          {manual ? t.crm.plSourceManual : t.crm.plSourceAuto}
          {item.match != null ? ` · ${fmt(t.crm.plMatchPct, item.match)}` : ` · ${t.crm.plMatchNone}`}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            padding: '3px 9px',
            borderRadius: 999,
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            background: pill.bg,
            color: pill.color,
          }}
        >
          {statusLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
        <span style={small}>
          {typeof price === 'number'
            ? fmt(t.crm.plItemPrice, rub(price))
            : t.crm.plItemPriceNone}
          {delta != null && (
            <b style={{ color: delta > 0 ? '#8b5a2b' : '#3f6b34', fontWeight: 600 }}>
              {' '}
              {delta > 0
                ? fmt(t.crm.plDeltaUp, rub(delta), `+${deltaPct}`)
                : fmt(t.crm.plDeltaDown, rub(-delta), `-${deltaPct}`)}
            </b>
          )}
        </span>
        <span style={small}>
          {fmt(t.crm.plCheckedLabel, agoText(t, item.lastCheckedAt || item.firstSeenAt))}
        </span>
        {item.note && <span style={{ ...small, fontStyle: 'italic' }}>{item.note}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...chipBtn, color: '#8d6b40', textDecoration: 'none', borderColor: '#dccbb0' }}
            >
              {t.crm.plOpenBtn} ↗
            </a>
          )}
          {manual && item.id != null && (
            <>
              {status !== 'active' && (
                <button type="button" style={chipBtn} onClick={() => void onManage('status', item.id!, 'active')}>
                  {t.crm.plBtnActive}
                </button>
              )}
              {status !== 'removed' && (
                <button type="button" style={chipBtn} onClick={() => void onManage('status', item.id!, 'removed')}>
                  {t.crm.plBtnRemoved}
                </button>
              )}
              {status !== 'needsCheck' && (
                <button type="button" style={chipBtn} onClick={() => void onManage('status', item.id!, 'needsCheck')}>
                  {t.crm.plStatusNeeds}
                </button>
              )}
              <button
                type="button"
                style={{ ...chipBtn, borderColor: '#e3cfc7', color: '#9b4e43' }}
                onClick={() => void onManage('remove', item.id!)}
                title={t.crm.objDelete}
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

function PlacementBlock({ t, objectId, value, links, busy, err, onRun, onChanged }: PlacementBlockProps) {
  const items = value?.items || []
  const checked = !!value?.lastCheckedAt
  const activePlatforms = new Set(items.filter((it) => it.status === 'active').map((it) => it.platform)).size
  const [addOpen, setAddOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState('')
  const [platTouched, setPlatTouched] = useState(false)
  const [price, setPrice] = useState('')
  const [addStatus, setAddStatus] = useState('active')
  const [busyRow, setBusyRow] = useState(false)
  const [addErr, setAddErr] = useState('')

  const summary = !checked
    ? t.crm.plNotChecked
    : activePlatforms > 0
      ? activePlatforms === 1
        ? t.crm.plFoundOne
        : fmt(t.crm.plFoundOther, activePlatforms)
      : t.crm.plOnlyN15

  const manage = async (action: 'add' | 'status' | 'remove', extra: Record<string, unknown> = {}) => {
    if (busyRow) return
    setBusyRow(true)
    setAddErr('')
    try {
      const res = await fetch('/api/objects/placements-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, objectId, ...extra }),
      })
      const data = (await res.json()) as { error?: string; placements?: PlacementsUi }
      if (!res.ok || !data.placements) {
        setAddErr(data.error || t.crm.plAddErr)
        return
      }
      if (action === 'add') {
        setUrl('')
        setPrice('')
        setPlatform('')
        setPlatTouched(false)
        setAddOpen(false)
      }
      await onChanged(data.placements)
    } catch {
      setAddErr(action === 'add' ? t.crm.plAddErr : t.crm.plCheckErr)
    } finally {
      setBusyRow(false)
    }
  }

  const tryAdd = () => void manage('add', {
    url: url.trim(),
    platform: platform || undefined,
    status: addStatus,
    price: price.trim() ? Number(price) : null,
  })

  const smallBtn: React.CSSProperties = {
    border: 0,
    borderRadius: 7,
    background: '#a7814e',
    color: '#fff',
    padding: '10px 16px',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    cursor: 'pointer',
  }
  const ghostBtn: React.CSSProperties = {
    border: '1px solid #e1d8ca',
    borderRadius: 7,
    background: '#fff',
    color: '#716b62',
    padding: '10px 14px',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        background: '#fbf8f1',
        border: '1px solid #e8dfd0',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 16, color: '#25241f' }}>
            {t.crm.plTitle}
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 10, color: '#8a857b' }}>{t.crm.plSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={busy || busyRow}
          style={{ ...smallBtn, marginLeft: 'auto', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? t.crm.plChecking : t.crm.plCheckNow}
        </button>
      </div>

      {/* Сводная строка: найдено / только в Н15 / ещё не проверялось */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, color: activePlatforms > 0 ? '#3f6b34' : '#25241f' }}>{summary}</b>
        {checked && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>
            {fmt(t.crm.plCheckedLabel, agoText(t, value?.lastCheckedAt))}
          </span>
        )}
        {err && <span style={{ fontSize: 10, color: '#9b4e43' }}>{err}</span>}
        {addErr && <span style={{ fontSize: 10, color: '#9b4e43' }}>{addErr}</span>}
      </div>
      {value?.note && (
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#9b958a', fontStyle: 'italic', lineHeight: 1.5 }}>{value.note}</p>
      )}

      {/* Привязанные объявления */}
      {items.length ? (
        <div style={{ marginTop: 8 }}>
          {items.map((it) => (
            <PlacementRow
              key={String(it.id ?? `${it.platform}-${it.url}`)}
              t={t}
              item={it}
              onManage={(action, itemId, status) => manage(action, { itemId, status })}
            />
          ))}
        </div>
      ) : (
        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9b958a' }}>{t.crm.plEmpty}</p>
      )}

      {/* Добавление ручной ссылки */}
      {addOpen ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #dccbb0' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ flex: '2 1 260px', display: 'flex', flexDirection: 'column', gap: 5, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {t.crm.plUrlLabel}
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  // Площадка подставляется по домену ссылки, пока агент не
                  // выбрал её сам (тогда выбор агента не сбрасываем)
                  if (!platTouched) setPlatform(platformSlugByUrl(e.target.value))
                }}
                placeholder={t.crm.plUrlPh}
                style={{ ...inputStyle, fontSize: 12, textTransform: 'none' }}
              />
            </label>
            <label style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: 5, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {t.crm.plPlatformLabel}
              <select
                value={platform}
                onChange={(e) => { setPlatTouched(true); setPlatform(e.target.value) }}
                style={{ ...inputStyle, fontSize: 12 }}
              >
                <option value="">—</option>
                {Object.entries(PLATFORM_NAMES).map(([slug, name]) => (
                  <option key={slug} value={slug}>{name}</option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: 5, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {t.crm.plPriceLabel}
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="—"
                style={{ ...inputStyle, fontSize: 12, textTransform: 'none' }}
              />
            </label>
            <label style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: 5, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {t.crm.plAddStatusLabel}
              <select value={addStatus} onChange={(e) => setAddStatus(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                <option value="active">{t.crm.plStatusActive}</option>
                <option value="removed">{t.crm.plStatusRemoved}</option>
                <option value="needsCheck">{t.crm.plStatusNeeds}</option>
              </select>
            </label>
            <button type="button" onClick={tryAdd} disabled={busyRow} style={{ ...smallBtn, opacity: busyRow ? 0.7 : 1 }}>
              {t.crm.plAddBtn}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} style={ghostBtn}>
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setAddOpen(true); setAddErr('') }}
          style={{ ...ghostBtn, marginTop: 12, borderStyle: 'dashed' }}
        >
          + {t.crm.plAddTitle}
        </button>
      )}

      {/* Ручная проверка: ссылки на поиск площадок по адресу */}
      {links.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e3d9c8' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {t.crm.plManualTitle}
          </div>
          <p style={{ margin: '4px 0 8px', fontSize: 10, color: '#9b958a', lineHeight: 1.45 }}>{t.crm.plManualHint}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {links.map((l) => (
              <a
                key={l.slug}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...ghostBtn, textDecoration: 'none' }}
              >
                {l.name} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

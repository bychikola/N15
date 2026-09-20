'use client'

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
// Садовые товарищества — те же справочники, что в подразделе лендинга:
// категории СНТ/СНО/ДНТ из GARDENING_AREAS (всё внутри Владикавказского округа)
import { DISTRICT_OPTIONS, LOCALITIES_BY_DISTRICT, LOCALITY_OPTIONS, CITY_DISTRICT_OPTIONS, GARDENING_CATEGORY_ORDER, GARDENING_AREAS, VLAV_OKRUG } from '@/lib/districts'
import { loadYmaps, type Ymaps } from '@/lib/ymaps'
// Адресные подсказки и обратное геокодирование точки: сервер спрашивает
// адресный справочник (улицы и дома) и геокодер, клиент получает готовые
// строки и разобранные части адреса (см. /api/crm/address)
import {
  geocodeAddress,
  reverseGeocodePoint,
  suggestHouses,
  suggestStreets,
  type AddressSuggestion,
  type ReversedAddress,
} from '@/lib/geocode'
// Полный адрес собирается тем же разбором, что и в данных о доме: одно
// написание адреса на карточке, в реестре и в фильтрах
import { normalizeHouseAddress } from '@/lib/house-info'
import { sortAgents } from '@/lib/agents-sort'
// Категории объектов: полный список значений, правила участка и домовых
// категорий — общий справочник схемы коллекции (src/lib/object-categories.ts)
import { OBJECT_CATEGORIES, isHouseCategoryCode, isPlotCategoryCode, isPrivateHouseCode } from '@/lib/object-categories'
// Площадь участков: м² ↔ сотки ↔ гектары (1 сотка = 100 м², 1 га = 10000 м²),
// чтение «11,5» с запятой — дробные значения разрешены
import { areaNumberText, areaUnitOf, parseAreaNumber, sqmToUnit, unitToSqm, type AreaUnit } from '@/lib/area-format'
// Телефон собственника: маска «+7 (918) 828-40-88» прямо при наборе — тот же
// вид, в каком номер хранит коллекция (см. src/lib/phone.ts)
import { formatRuPhone, maskRuPhoneInput } from '@/lib/phone'
// Кадастровый номер: формат ЕГРН проверяется до отправки — та же проверка
// стоит в коллекции Objects (см. src/lib/cadastral.ts)
import { isCadastralFormat } from '@/lib/cadastral'
// Подписи этажей дома: «1 этаж», «2 этаж» (см. также t.crm.objFloors)
import { floorLabel } from '@/lib/floor-format'
// Варианты покупки: список отметок и правило «только продажа жилья и
// коммерции» — общие с коллекцией Objects, каталогом и страницей объекта
// (см. src/lib/purchase-options.ts)
import { PURCHASE_OPTIONS, isPurchaseOption, purchaseOptionsApply } from '@/lib/purchase-options'
import { LegalCheckBlock, type LegalFocus } from '@/components/crm/LegalCheckBlock'
import { PlacementCheckBlock } from '@/components/crm/PlacementCheckBlock'
import { HouseDataBlock } from '@/components/crm/HouseDataBlock'
// «Оценка по рынку» — предварительный расчёт по фактическим объявлениям
// (кнопка карточки, только администратор): диапазон, аналоги, дата расчёта
import { MarketValuationBlock } from '@/components/crm/MarketValuationBlock'
import { marketReportFromJson, type MarketValuationReport } from '@/lib/market-valuation'
import { formatMoney } from '@/lib/valuation'
// «Архив объекта»: причины переноса и группа archive документа
// (серверные операции — /api/objects/archive-manage, см. src/lib/archive.ts)
import { ARCHIVE_REASONS, archiveFromDoc, archiveReasonLabel, type ArchiveGroup } from '@/lib/archive'
// Правила загрузки фото (форматы и лимит) — общие с сервером:
// проверяем файл до отправки, чтобы ошибка была видна сразу (src/lib/photo-rules.ts)
import {
  PHOTO_FORMATS_LABEL,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_LABEL,
  isAllowedPhoto,
  photoSizeLabel,
} from '@/lib/photo-rules'

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

/**
 * Фото в процессе загрузки. Строка живёт от выбора файла до ответа сервера:
 * показывает прогресс, ошибку и кнопку повтора — раньше неудачная загрузка
 * молча пропадала, и сотрудник видел только «фото не появилось».
 */
interface PhotoUpload {
  /** Ключ строки: файл с тем же именем можно выбрать второй раз */
  key: string
  name: string
  size: number
  /** 0–100 */
  progress: number
  status: 'waiting' | 'uploading' | 'error'
  error?: string
  /** Исходный файл — храним, чтобы повторить отправку без выбора заново */
  source: File
  /** Сессия истекла: строку не убираем, ждём вход и повторяем */
  needsLogin?: boolean
  /** Повтор бессмысленен (формат или размер забракованы до отправки) */
  retryable?: boolean
}

/** Ответ /api/crm/upload: документ media либо код ошибки (см. маршрут) */
interface UploadResponse {
  doc?: { id?: number; url?: string }
  error?: string
  code?: string
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

// Домовые категории (дом, таунхаус, коттедж, дача, часть дома): только у них
// есть этажность дома и поэтажные описания помещений. У квартиры и комнаты
// один этаж — этаж в доме (поля «Этаж» и «Всего этажей»), у участка, гаража
// и коммерческого объекта этажей нет вовсе.
// Участок и признак частного дома — общие правила схемы и карточки объекта
// (см. src/lib/object-categories.ts), здесь только читаем их.
const isHouseCategory = isHouseCategoryCode
const isPlotAreaCategory = isPlotCategoryCode

/**
 * Водяной знак на фото: рисуем кадр на canvas и поверх — watermark.png по
 * центру, размером ~28% ширины. Функция модульная (не состояние компонента):
 * ею пользуется очередь загрузки, а результат — готовый к отправке файл.
 *
 * null — кадр не читается браузером (HEIC с iPhone, битый файл): вызывающий
 * показывает ошибку, а не пропускает фото молча, как было раньше.
 */
const watermarkPhoto = (file: File): Promise<{ blob: Blob; name: string } | null> => {
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
        // Формат сохраняем исходный (JPG/PNG/WEBP), а имя файла получает
        // правильное расширение: canvas перекодирует кадр, и «.webp» рядом с
        // JPEG-содержимым сбило бы проверку типа на сервере
        const outType = file.type === 'image/png'
          ? 'image/png'
          : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
        const ext = outType === 'image/png' ? 'png' : outType === 'image/webp' ? 'webp' : 'jpg'
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null)
              return
            }
            resolve({ blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}` })
          },
          outType,
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

// Поэтажные описания из документа объекта: место в массиве — номер этажа
// минус один (floorNumber), а не порядок строк в базе. Так «3 этаж» останется
// третьим, даже если 1-й и 2-й не заполнены (пропуски — пустые поля).
const floorDescsFromDoc = (o: Record<string, unknown>): string[] => {
  const rows = (o.floorDescriptions as { floorNumber?: number; description?: string }[] | undefined) || []
  const byFloor: string[] = []
  for (const row of rows) {
    byFloor[Math.max(1, Math.round(row.floorNumber || 0)) - 1] = row.description || ''
  }
  return Array.from(byFloor, (d) => d || '')
}

/**
 * Есть ли у объекта данные земельного участка — площадь или кадастровые
 * сведения. По ним открывается блок «Кадастровые данные участка»: если у
 * дома ничего из этого не заполнено, блок скрыт (галочку «Есть земельный
 * участок» в форме можно поставить вручную — см. hasPlot).
 */
const hasPlotInfo = (o: Record<string, unknown>): boolean =>
  o.plotArea != null
  || Boolean((o.plotCadastralNumber as string | undefined)?.trim())
  || Boolean((o.plotLandCategory as string | undefined)?.trim())
  || Boolean((o.plotPermittedUse as string | undefined)?.trim())
  || Boolean((o.plotPurpose as string | undefined)?.trim())

const emptyForm = {
  title: '', type: 'sale', category: 'apartment', price: '', area: '', areaUnit: 'sqm', livingArea: '',
  // Земельный участок (м², 6 соток = 600 м²) — отдельное поле дома,
  // таунхауса и коммерции: у базы отдыха это площадь земли, отдельная от
  // площади здания. Участвует в рыночной оценке (см. src/lib/valuation.ts).
  // plotAreaUnit — единица показа (м² / сотки / га), как areaUnit у участка
  plotArea: '', plotAreaUnit: 'sqm',
  // Кадастровые сведения участка: номер участка, категория земель, вид
  // разрешённого использования и назначение участка. Хранятся отдельно от
  // номера здания (cadastralNumber) — у дома и участка разные кадастровые
  // номера.
  plotCadastralNumber: '', plotLandCategory: '', plotPermittedUse: '', plotPurpose: '',
  kitchenArea: '', rooms: '', floor: '', totalFloors: '', buildingType: '', condition: '',
  // Этажность дома (только дом и таунхаус, см. save): выбор из списка «1/2/3
  // этажа» либо своё число («другое значение»). У остальных категорий
  // этажность по-прежнему вводится в totalFloors выше.
  floorsMode: '', floorsOther: '',
  heating: '', balcony: '', water: '', sewerage: '', electricity: '', gas: '', internet: '',
  city: 'Владикавказ', district: '', cityDistrict: '', locality: '', snt: '', street: '', house: '',
  // Корпус — отдельное поле адреса (был частью номера дома: «15 к2»);
  // полный адрес — собранная строка, её видит агент и хранит объект
  corpus: '', fullAddress: '', apartment: '',
  lat: '', lng: '', description: '', status: 'draft', agent: '',
  ownerName: '', ownerPhone: '', cadastralNumber: '',
  // Варианты покупки — множественный выбор отметками (коды из
  // src/lib/purchase-options.ts); блок только у продажи жилья и коммерции
  purchaseOptions: [] as string[],
  // Особое предложение — отметка для блока на главной странице: объект
  // остаётся в каталоге и находится по всем фильтрам (см. t.landing.special*)
  urgentSale: false,
}

type FormState = typeof emptyForm

/** Адресные поля, которые заполняют карта и подсказки справочника */
type AddrField = 'city' | 'district' | 'cityDistrict' | 'locality' | 'street' | 'house' | 'corpus'

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

/**
 * Поле с подсказками адресного справочника — улица и номер дома. Поле
 * остаётся обычным вводом: подсказка только помогает, а если справочник
 * недоступен или подходящих строк нет, значение вводится вручную. Список
 * появляется по первым буквам (у домов — сразу, как только выбрана улица),
 * стрелки и Enter выбирают строку, Escape закрывает список. Подсказки улиц
 * зависят от населённого пункта и района формы — их передаёт загрузчик
 * списка (см. разметку адреса ниже).
 */
const SuggestInput: FC<{
  t: Dict
  value: string
  onChange: (v: string) => void
  /** Выбор строки: подставить значение (и, например, корпус дома) */
  onPick?: (item: AddressSuggestion) => void
  load: (query: string) => Promise<AddressSuggestion[]>
  placeholder?: string
  /** Список открывается сразу при фокусе — номера домов выбранной улицы */
  openOnFocus?: boolean
  /** Ключ изменился (выбрана другая улица) — список перечитывается заново */
  reloadKey?: string
}> = ({ t, value, onChange, onPick, load, placeholder, openOnFocus = false, reloadKey = '' }) => {
  const [items, setItems] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [focused, setFocused] = useState(false)
  // Счётчик возвратов в поле: по нему список перечитывается заново
  const [refocus, setRefocus] = useState(0)
  const [active, setActive] = useState(-1)
  // Ответы устаревших запросов не показываем: быстрый набор «перебивает» медленный
  const genRef = useRef(0)
  // Значение, выбранное из списка: повторно его не ищем (см. эффект ниже)
  const pickedRef = useRef('')
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    // Каждое изменение состояния поля отменяет незавершённый запрос
    const gen = ++genRef.current
    if (!focused) return
    const text = value.trim()
    // Улица ищется с двух букв; дома улицы показываются и без ввода номера
    const tooShort = !openOnFocus && text.length < 2
    // Выбранную из списка строку заново не ищем: список не должен
    // распахиваться обратно сразу после выбора. Правка значения — новый поиск.
    const picked = pickedRef.current !== '' && pickedRef.current === value
    // «Ничего не найдено» показываем только когда справочник реально спрошен:
    // пустое поле дома без выбранной улицы искать нечего
    const searchable = openOnFocus ? Boolean(text || reloadKey.trim()) : text.length >= 2
    const timer = setTimeout(() => {
      // Короткий запрос: списка нет, но и ждать ответа справочника нечего
      if (tooShort || picked) {
        setItems([])
        setOpen(false)
        setEmpty(false)
        setBusy(false)
        return
      }
      setBusy(true)
      void (async () => {
        try {
          const found = await loadRef.current(text)
          if (gen !== genRef.current) return
          setItems(found)
          setActive(-1)
          setOpen(found.length > 0)
          setEmpty(found.length === 0 && searchable)
        } finally {
          if (gen === genRef.current) setBusy(false)
        }
      })()
    }, 300)
    return () => clearTimeout(timer)
  }, [value, focused, reloadKey, openOnFocus, refocus])

  const pick = (item: AddressSuggestion) => {
    pickedRef.current = item.value
    setOpen(false)
    setActive(-1)
    if (onPick) onPick(item)
    else onChange(item.value)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return
      e.preventDefault()
      setOpen(true)
      setActive((prev) => {
        const next = e.key === 'ArrowDown' ? prev + 1 : prev - 1
        return next < 0 ? items.length - 1 : next >= items.length ? 0 : next
      })
      return
    }
    if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault()
      pick(items[active])
    }
  }

  return (
    <div className="crm-suggest-wrap">
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          // Возврат в поле — снова показываем список (в том числе для уже
          // выбранной строки: улицу или дом можно выбрать заново)
          pickedRef.current = ''
          setFocused(true)
          setRefocus((n) => n + 1)
        }}
        onBlur={() => {
          setFocused(false)
          setOpen(false)
        }}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
      {open && items.length > 0 && (
        <div className="crm-suggest" role="listbox">
          {items.map((item, i) => (
            <button
              key={`${item.value}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? 'crm-suggest-item active' : 'crm-suggest-item'}
              onMouseDown={(e) => {
                // mousedown раньше blur: выбор не теряется при клике и на телефоне
                e.preventDefault()
                pick(item)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{item.value}</span>
              {item.hint && <em>{item.hint}</em>}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="crm-field-note">{t.crm.objSuggestSearching}</p>}
      {!busy && empty && <p className="crm-field-note">{t.crm.objSuggestEmpty}</p>}
    </div>
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

/**
 * Полный адрес объекта одной строкой: «г. Владикавказ, ул. Кутузова, д. 7,
 * корп. 2». Собирается тем же разбором, что и адрес для поиска в реестре
 * (normalizeHouseAddress), поэтому карточка, фильтры и данные о доме видят
 * одно и то же написание. Пустой состав даёт пустую строку — поле «Полный
 * адрес» остаётся тем, что было.
 */
const fullAddressOf = (f: FormState): string =>
  normalizeHouseAddress({
    city: f.city,
    locality: f.locality,
    snt: f.snt,
    street: f.street,
    house: f.house,
    corpus: f.corpus,
  }).display

/**
 * Полный адрес для хранения: пустая заготовка «г. Владикавказ» (в форме город
 * стоит по умолчанию) адресом не является — её сохранять нечего, иначе у всех
 * новых объектов в поле полного адреса окажется один город.
 */
const addressComposed = (f: FormState): string =>
  f.street.trim() || f.house.trim() || f.corpus.trim() || f.snt.trim() || f.locality.trim() ? fullAddressOf(f) : ''

/**
 * Полный адрес формы: собранный из частей, а пока адресные поля не правили —
 * сохранённый у объекта (адрес мог прийти из импорта без разбора на части).
 * Стоит агенту тронуть поля адреса, и строка считается заново — стёртые поля
 * не оставляют за собой прежний адрес.
 */
const fullAddressValue = (f: FormState, touched: boolean): string =>
  addressComposed(f) || (touched ? '' : f.fullAddress.trim())

/**
 * Совпадают ли значения адреса без служебных слов: «ул. Кутузова» и
 * «Кутузова» — один и тот же адрес, подтверждение не нужно; «Кутузова» и
 * «Кирова» — разные, и уже введённое значение без согласия не затирается.
 */
const ADDRESS_NOISE_RE = /(^|\s)(ул|улица|пр|проспект|пер|переулок|д|дом|к|корп|корпус|стр|строение)\.?(\s|$)/g
const sameAddressValue = (a: string, b: string): boolean => {
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(ADDRESS_NOISE_RE, ' ')
      .replace(/[^a-zа-я0-9]/g, '')
  return norm(a) === norm(b)
}

const toNum = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Дата расчёта (оценка по рынку) строкой: пустая строка, если даты нет */
const shortDate = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU')
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
  /** Адрес, определённый по точке клика: разобранные части и строка целиком */
  onAddressFound: (found: ReversedAddress, full: string) => void
}

const ObjMapEditor: FC<ObjMapProps> = ({ t, address, autoSearch, addrTouched, lat, lng, onCoords, onAddressFound }) => {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Ymaps | null>(null)
  const markerRef = useRef<Ymaps | null>(null)
  const ymapsRef = useRef<Ymaps | null>(null)
  const [ready, setReady] = useState(false)
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState<'notfound' | 'noaddress' | 'unavailable' | null>(null)
  // Обратное геокодирование точки: «Ищем адрес…» → найден / не определён.
  // Состояние живёт до следующего клика — агент видит, чем закончился выбор
  const [rev, setRev] = useState<'idle' | 'busy' | 'found' | 'empty' | 'offline'>('idle')
  const [revFull, setRevFull] = useState('')
  // Актуальные пропсы для асинхронных колбэков карты (dragend, click, geocode)
  const propsRef = useRef({ address, autoSearch, addrTouched, lat, lng, onCoords, onAddressFound })
  useEffect(() => {
    propsRef.current = { address, autoSearch, addrTouched, lat, lng, onCoords, onAddressFound }
  }, [address, autoSearch, addrTouched, lat, lng, onCoords, onAddressFound])
  // Поколение поиска: ответы устаревших запросов геокодера игнорируем
  const genRef = useRef(0)
  // Поколение обратного геокодирования: точка изменилась — старый ответ не нужен
  const revGenRef = useRef(0)

  // Точка выбрана: адрес определяет обратный геокодер, поля заполняет форма.
  // Координаты уже проставлены — даже если адрес не определился, объект
  // остаётся привязан к выбранной точке (см. onCoords выше).
  const resolvePoint = useCallback((coords: [number, number]) => {
    const gen = ++revGenRef.current
    setRev('busy')
    setRevFull('')
    void (async () => {
      try {
        const result = await reverseGeocodePoint(coords[0], coords[1])
        if (gen !== revGenRef.current) return
        if (result?.found && result.address) {
          const full = result.full || ''
          setRev('found')
          setRevFull(full)
          propsRef.current.onAddressFound(result.address, full)
          return
        }
        // Сервис ответил, но адреса по точке нет: «не удалось определить» —
        // это не то же самое, что «сервис недоступен»
        setRev(result?.reason === 'unavailable' ? 'offline' : 'empty')
      } catch {
        if (gen === revGenRef.current) setRev('offline')
      }
    })()
  }, [])

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
      const coords: [number, number] = [round6(c[0]), round6(c[1])]
      propsRef.current.onCoords(coords[0], coords[1])
      // Метку передвинули — адрес пересчитывается по новой точке
      resolvePoint(coords)
    })
    map.geoObjects.add(pin)
    markerRef.current = pin
  }, [removePin, resolvePoint])

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
        // Клик по карте — установка метки (удобно с телефона) и определение
        // адреса точки обратным геокодером: пункт, район, улица, дом, корпус
        map.events.add('click', (e: Ymaps) => {
          const c = e.get('coords') as [number, number] | undefined
          if (!c) return
          genRef.current++ // ручная установка важнее незавершённого авто-поиска
          const coords: [number, number] = [round6(c[0]), round6(c[1])]
          putPin(coords)
          propsRef.current.onCoords(coords[0], coords[1])
          resolvePoint(coords)
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
  }, [apiKey, putPin, resolvePoint])

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
  // Состояния карты по старшинству: недоступность → поиск → результат по
  // точке → результат поиска по адресу → подсказка. «Ищем адрес…» и «Адрес
  // найден» — про клик по карте, их видит агент, выбирающий точку.
  let statusText = t.crm.objMapHint
  let statusErr = false
  if (noKey || err === 'unavailable') {
    statusText = t.crm.objMapNoKey
    statusErr = true
  } else if (rev === 'busy' || searching) {
    statusText = rev === 'busy' ? t.crm.objAddrSearching : t.crm.objMapSearch
  } else if (rev === 'found') {
    statusText = revFull ? `${t.crm.objAddrFound}: ${revFull}` : t.crm.objAddrFound
  } else if (rev === 'empty') {
    statusText = t.crm.objAddrEmpty
    statusErr = true
  } else if (rev === 'offline') {
    statusText = t.crm.objAddrUnavailable
    statusErr = true
  } else if (err === 'notfound') {
    statusText = t.crm.objMapNotFound
    statusErr = true
  } else if (err === 'noaddress') {
    statusText = t.crm.objMapNoAddress
  }

  return (
    <div>
      <div className="crm-map-bar">
        <button type="button" onClick={findOnMap} disabled={!ready || searching}>
          {t.crm.objMapFind}
        </button>
        {searching && <span>{t.crm.objMapSearch}</span>}
      </div>
      <div ref={containerRef} className="crm-map-canvas" />
      <p className={statusErr ? 'crm-map-status err' : 'crm-map-status'}>{statusText}</p>
    </div>
  )
}

export const CrmObjects: FC<{
  t: Dict
  isAdmin: boolean
  /** Профиль агента текущего пользователя — подставляется в новые объекты */
  myAgentId?: number | null
  /** id «своих» объектов агента — только их агент может редактировать */
  ownObjectIds?: number[]
  /** Открыть форму нового объекта сразу (?add=1 со страницы «Обзор») */
  autoOpen?: boolean
  /** Открыть карточку объекта сразу (?edit=<id> из профиля агента) */
  autoEdit?: number | null
}> = ({ t, isAdmin, myAgentId = null, ownObjectIds = [], autoOpen = false, autoEdit = null }) => {
  const [rows, setRows] = useState<ObjectRow[]>([])
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  // Очередь загрузок фото: строки с прогрессом и ошибками, отправка идёт по
  // одной (см. pumpUploads) — пачка тяжёлых фото с телефона роняет слабый VPS
  const [uploads, setUploads] = useState<PhotoUpload[]>([])
  const uploadQueueRef = useRef<PhotoUpload[]>([])
  const pumpingRef = useRef(false)
  // Сессия Payload живёт 2 часа (auth.tokenExpiration): когда она кончилась,
  // карточку не покидаем — показываем вход прямо в форме, данные объекта
  // остаются на месте, после входа загрузки повторяются
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [featureInput, setFeatureInput] = useState('')
  // Описания помещений по этажам дома: индекс массива — номер этажа минус
  // один («1 этаж» — floorDescs[0]). Сколько полей показывать, решает
  // этажность (form.floorsMode), в базу уходит floorDescriptions объекта.
  const [floorDescs, setFloorDescs] = useState<string[]>([])
  // «Есть земельный участок»: галочка блока «Кадастровые данные участка»
  // (дом и таунхаус). Снятая галочка скрывает блок — у дома без участка его
  // нет. Галочка только показывает и скрывает: сохранённые площадь и
  // кадастровые сведения участка она не стирает (см. save), а при открытии
  // карточки встаёт сама, если данные участка у объекта уже есть. Новому
  // объекту — по умолчанию «да»: частный дом чаще всего с участком, и поля
  // участка видны сразу, как было до этого блока.
  const [hasPlot, setHasPlot] = useState(true)
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
  // Адрес с карты расходится с уже заполненными полями — ждём решения агента
  // («Заменить адрес» / «Оставить как есть»), а не стираем данные молча
  const [pendingAddr, setPendingAddr] = useState<{ proposed: Partial<Record<AddrField, string>>; full: string } | null>(null)
  // «Где размещён объект»: привязанные объявления площадок открытого объекта
  const [pl, setPl] = useState<PlacementsUi | null>(null)
  const [plLinks, setPlLinks] = useState<PlacementLink[]>([])
  const [plBusy, setPlBusy] = useState(false)
  const [plErr, setPlErr] = useState('')
  // «Юридическая экспертиза объекта»: открытый блок документов и проверки.
  // focus — кнопки «Проверить обременения» / «Проверить банкротство
  // собственника»: тот же блок, но с запуском проверки и подсветкой её пункта
  const [legalId, setLegalId] = useState<number | null>(null)
  const [legalFocus, setLegalFocus] = useState<LegalFocus | null>(null)
  // «Провести оценку по рынку»: открытый блок расчёта и последний сохранённый
  // отчёт объекта (valuation.marketRun, заполняется сервером)
  const [valuationId, setValuationId] = useState<number | null>(null)
  const [marketReport, setMarketReport] = useState<MarketValuationReport | null>(null)
  // «Проверить размещение»: открытый блок поиска объекта на площадках
  const [placeId, setPlaceId] = useState<number | null>(null)
  // «Данные о доме»: открытый блок характеристик дома из официального реестра
  const [houseDataId, setHouseDataId] = useState<number | null>(null)
  // «Архив объекта»: перенос с причиной и комментарием, возврат из архива
  const [archive, setArchive] = useState<ArchiveGroup | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archReason, setArchReason] = useState('')
  const [archComment, setArchComment] = useState('')
  const [archBusy, setArchBusy] = useState(false)
  const [archErr, setArchErr] = useState('')

  // Этажность дома: у дома и таунхауса — список «1/2/3 этажа» и своё число
  // («другое значение»), у остальных категорий — прежние поля «Этаж» и
  // «Этажей» (см. save и разметку формы ниже).
  const isHouse = isHouseCategory(form.category)
  // Коммерция (база отдыха, гостиница, ресторан, туристический объект):
  // в карточке два блока — «Площадь объекта» (здание или комплекс) и
  // «Земельный участок» (площадь земли своей единицей + кадастровые
  // сведения). У дома участок вокруг дома, у коммерции — земля под объектом
  const isCommercial = form.category === 'commercial'
  // Категории с земельным участком — дом, таунхаус и коммерция
  const isPlotArea = isPlotAreaCategory(form.category)
  // Частный дом — отдельно от таунхауса: у него блок «Кадастровые данные
  // дома», где номер дома (строения) подписан по-своему (у таунхауса
  // остаётся прежний блок «Кадастровый номер»). Дача, коттедж и часть дома
  // описываются как частный дом (см. isPrivateHouseCode)
  const isPrivateHouse = isPrivateHouseCode(form.category)
  const houseFloorsCount = isHouse
    ? Math.round(form.floorsMode === 'other' ? toNum(form.floorsOther) ?? 0 : toNum(form.floorsMode) ?? 0)
    : 0
  // Сколько полей «N этаж» показывать: по выбранной этажности (у одноэтажного
  // дома — только «1 этаж», у двухэтажного — «1 этаж» и «2 этаж»). Пока
  // этажность не выбрана, показываем сохранённые описания — иначе их нельзя
  // было бы ни увидеть, ни исправить.
  const floorFieldCount = houseFloorsCount > 0 ? houseFloorsCount : floorDescs.length

  // Актуальные значения формы для асинхронных ответов карты: пока идёт обратное
  // геокодирование, агент мог продолжить заполнять поля
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])

  // ── Несохранённые правки ─────────────────────────────────────────────
  // Полоска сохранения внизу карточки показывает состояние: «есть
  // несохранённые изменения» (в том числе загруженные, но ещё не привязанные
  // к объекту фото) либо «объект сохранён». Первое изменение после открытия
  // карточки или после сохранения пропускаем — иначе карточка выглядела бы
  // изменённой сразу (см. openCardMark).
  // Закрытые сведения объекта — собственник и кадастровые номера: их правят
  // администратор и агент в своём объекте (новый объект агента сразу его).
  // У чужого объекта полей нет вовсе — сервер их не отдаёт и не принимает по
  // тому же правилу (см. access полей в коллекции Objects и object-access.ts)
  const canEditPrivate = isAdmin || editId == null || ownObjectIds.includes(editId)
  // Чужой объект открыт только на просмотр — правки и сохранения в карточке нет
  const viewOnly = editId != null && !canEditPrivate

  const [dirty, setDirty] = useState(false)
  const skipNextDirty = useRef(true)
  const openCardMark = useCallback(() => {
    skipNextDirty.current = true
    setDirty(false)
    setSaved(false)
  }, [])
  useEffect(() => {
    if (!modalOpen) return
    if (skipNextDirty.current) {
      skipNextDirty.current = false
      return
    }
    setDirty(true)
    setSaved(false)
  }, [form, photos, features, floorDescs, uploads, modalOpen])

  // Закрытие карточки: о несохранённых правках предупреждаем — иначе правки
  // формы и ещё не привязанные к объекту фото пропадут молча
  const closeCard = useCallback(() => {
    if (dirty && !window.confirm(t.crm.objUnsavedConfirm)) return
    setModalOpen(false)
  }, [dirty, t])

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

  // Сброс формы к «новому объекту». Агент сразу подставляется в карточку —
  // иначе новый объект останется «бесхозным» и агент не сможет его
  // редактировать (править можно только объекты со своим профилем).
  const resetForm = useCallback(() => {
    // purchaseOptions — пустой список заново, а не ссылка на массив из
    // emptyForm: отметки нового объекта не должны задевать общий образец
    setForm({ ...emptyForm, agent: myAgentId ? String(myAgentId) : '', purchaseOptions: [] })
    setEditId(null)
    setPhotos([])
    setFeatures([])
    setFloorDescs([])
    // Новый объект: блок участка у дома показываем сразу (см. hasPlot)
    setHasPlot(true)
    setSaveError('')
    setDuplicates(null)
    // Карточка нового объекта только открылась — несохранённых правок нет
    openCardMark()
    setAddrTouched(false)
    setPendingAddr(null)
    setPl(null)
    setPlLinks([])
    setPlErr('')
    setArchive(null)
    setArchiveOpen(false)
    setArchReason('')
    setArchComment('')
    setArchErr('')
  }, [myAgentId, openCardMark])

  // Кнопка «+ Добавить объект» со страницы «Обзор» ведёт сюда с ?add=1:
  // открываем форму нового объекта и убираем параметр из адреса, чтобы
  // обновление страницы не открывало форму заново. Открытие откладываем
  // на следующий тик — синхронный setState внутри эффекта запрещён линтом.
  useEffect(() => {
    if (!autoOpen) return
    const timer = setTimeout(() => {
      resetForm()
      setModalOpen(true)
      window.history.replaceState(null, '', window.location.pathname)
    }, 0)
    return () => clearTimeout(timer)
  }, [autoOpen, resetForm])

  // useCallback: функция только раскладывает документ по полям формы (все
  // зависимости — модульные константы и setState), а стабильная ссылка нужна
  // эффекту открытия карточки по ?edit=<id> из профиля агента
  const startEdit = useCallback((o: Record<string, unknown>) => {
    setModalOpen(true)
    setDuplicates(null)
    setSaveError('')
    setAddrTouched(false)
    setPendingAddr(null)
    // Карточка открыта заново: сообщение о сохранении прошлого объекта не
    // показываем, прежние правки к ней не относятся
    openCardMark()
    // Последний расчёт «оценки по рынку» — из группы valuation документа
    // (поле видно только администратору: у остальных его в ответе нет)
    const valGroup = o.valuation as { marketRun?: unknown } | undefined
    setMarketReport(isAdmin ? marketReportFromJson(valGroup?.marketRun) : null)
    const addr = o.address as Record<string, unknown> | undefined
    const coords = o.coordinates as Record<string, unknown> | undefined
    const agentRel = o.agent as Record<string, unknown> | undefined
    setEditId(o.id as number)
    // Площадь участка показываем в той единице, в которой её вводили
    // (сотки — «6», гектары — «1,2», а не «600»/«12000»); у остальных
    // категорий и старых объектов без единицы — как раньше, в м².
    const areaUnit: AreaUnit = o.category === 'land' ? areaUnitOf(o.areaUnit) : 'sqm'
    // Площадь участка — своя единица (plotAreaUnit), у старых объектов её
    // нет — считаем м²
    const plotAreaUnit: AreaUnit = isPlotAreaCategory(String(o.category ?? ''))
      ? areaUnitOf(o.plotAreaUnit)
      : 'sqm'
    // Этажность дома: 1/2/3 — выбранный пункт списка, любое другое число
    // (например, 4) — пункт «другое значение» с числом в отдельном поле
    const floorsTotal = o.totalFloors != null ? String(o.totalFloors) : ''
    const floorsMode = !floorsTotal ? '' : ['1', '2', '3'].includes(floorsTotal) ? floorsTotal : 'other'
    setForm({
      ...emptyForm,
      title: (o.title as string) || '',
      type: (o.type as string) || 'sale',
      category: (o.category as string) || 'apartment',
      price: o.price != null ? String(o.price) : '',
      area: o.area != null
        ? areaUnit === 'sqm'
          ? String(o.area)
          : areaNumberText(sqmToUnit(o.area as number, areaUnit))
        : '',
      areaUnit,
      livingArea: o.livingArea != null ? String(o.livingArea) : '',
      plotArea: o.plotArea != null
        ? plotAreaUnit === 'sqm'
          ? String(o.plotArea)
          : areaNumberText(sqmToUnit(o.plotArea as number, plotAreaUnit))
        : '',
      plotAreaUnit,
      kitchenArea: o.kitchenArea != null ? String(o.kitchenArea) : '',
      rooms: o.rooms != null ? String(o.rooms) : '',
      floor: o.floor != null ? String(o.floor) : '',
      totalFloors: floorsTotal,
      floorsMode,
      floorsOther: floorsMode === 'other' ? floorsTotal : '',
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
      corpus: (addr?.corpus as string) || '',
      // Полный адрес объекта: показываем сохранённый, пока адресные поля не
      // изменили (потом строка собирается заново из частей адреса)
      fullAddress: (addr?.fullAddress as string) || '',
      apartment: (addr?.apartment as string) || '',
      lat: coords?.lat != null ? String(coords.lat) : '',
      lng: coords?.lng != null ? String(coords.lng) : '',
      description: '',
      status: (o.status as string) || 'draft',
      agent: agentRel?.id != null ? String(agentRel.id) : '',
      ownerName: (o.ownerName as string) || '',
      // Номер показываем в том же виде, что и маска ввода («+7 (918) …»):
      // хук коллекции отдаёт его уже приведённым, повторное приведение
      // идемпотентно и подстраховывает старые записи
      ownerPhone: o.ownerPhone ? formatRuPhone(o.ownerPhone as string) : '',
      cadastralNumber: (o.cadastralNumber as string) || '',
      // Кадастровые сведения участка — как номера дома, у сотрудников их в
      // ответе нет (закрытые поля), поэтому придут пустыми строками
      plotCadastralNumber: (o.plotCadastralNumber as string) || '',
      plotLandCategory: (o.plotLandCategory as string) || '',
      plotPermittedUse: (o.plotPermittedUse as string) || '',
      plotPurpose: (o.plotPurpose as string) || '',
      // Варианты покупки: чужие коды из старых записей не показываем —
      // в форме только отметки из общего списка
      purchaseOptions: ((o.purchaseOptions as string[] | undefined) || []).filter(isPurchaseOption),
      urgentSale: o.urgentSale === true,
    })
    // Блок участка открываем, если у объекта уже есть его данные — площадь
    // или кадастровые сведения (у дома без участка блок остаётся скрытым).
    // У коммерции блок открыт всегда: у базы отдыха, гостиницы или
    // туристического объекта земля входит в лот, и заполнить её предлагается
    // сразу — закрыть пустой блок можно галочкой «Есть земельный участок».
    // У коттеджа, дачи и части дома участок вокруг дома — тоже открываем
    setHasPlot(isPlotAreaCategory(String(o.category || '')) || hasPlotInfo(o))
    const img = o.primaryImage as { id?: number; url?: string } | undefined
    const imgs = (o.images as { id?: number; url?: string }[] | undefined) || []
    const all: PhotoItem[] = []
    if (img?.id) all.push({ id: img.id as number, url: img.url })
    for (const i of imgs) {
      if (i.id && !all.some((p) => p.id === i.id)) all.push({ id: i.id as number, url: i.url })
    }
    setPhotos(all)
    setFeatures(((o.features as { feature?: string }[] | undefined) || []).map((f) => f.feature || '').filter(Boolean))
    setFloorDescs(floorDescsFromDoc(o))
    const rt = o.description as { root?: { children?: { children?: { text?: string }[] }[] } } | undefined
    const descText = (rt?.root?.children || []).map((p) => (p.children || []).map((c) => c.text || '').join('')).filter(Boolean).join('\n')
    setForm((prev) => ({ ...prev, description: descText }))
    // Блок «Где размещён объект»: привязанные объявления площадок; ссылки
    // ручного поиска по адресу подгружаем отдельным запросом
    setPl(placementsFromDoc(o))
    setPlErr('')
    // Блок «Архив объекта»: причина, дата, комментарий и история переносов
    // (группу ведёт серверный хук коллекции Objects, см. src/lib/archive.ts)
    setArchive(archiveFromDoc(o))
    setArchiveOpen(false)
    setArchReason('')
    setArchComment('')
    setArchErr('')
    void fetch(`/api/objects/placement-links?id=${o.id as number}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ links?: PlacementLink[] }>) : null))
      .then((d) => setPlLinks(d?.links || []))
      .catch(() => setPlLinks([]))
  }, [isAdmin, openCardMark])

  // Кнопка «Редактировать» из профиля агента (раздел «Агенты») ведёт сюда
  // с ?edit=<id>: открываем карточку объекта и убираем параметр из адреса —
  // как ?add=1 у формы нового объекта. Права те же, что у кнопки в списке:
  // карточку открывает ответственный агент или администратор, остальным
  // параметр не открывает ничего (сервер правку чужого объекта не пропустит).
  // Открываем один раз — ref, иначе эффект повторялся бы на каждом рендере.
  const autoEditDone = useRef(false)
  useEffect(() => {
    if (!autoEdit || loading || autoEditDone.current) return
    if (!(isAdmin || ownObjectIds.includes(autoEdit))) return
    autoEditDone.current = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/objects/${autoEdit}`, { credentials: 'include' })
          if (!res.ok) return
          const data = (await res.json()) as Record<string, unknown>
          startEdit(data)
          window.history.replaceState(null, '', window.location.pathname)
        } catch {
          // Объект могли удалить в другой вкладке — просто остаёмся в списке
        }
      })()
    }, 0)
    return () => clearTimeout(timer)
  }, [autoEdit, loading, isAdmin, ownObjectIds, startEdit])

  // ── Загрузка фотографий ─────────────────────────────────────────────
  // Фото уходят на /api/crm/upload (не в REST Payload): маршрут проверяет
  // сессию до чтения файла и отвечает понятным кодом ошибки — в том числе
  // 401 «сессия истекла», на который Payload сам отвечал 403 «нет права».
  const patchUpload = useCallback((key: string, patch: Partial<PhotoUpload>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])

  // Отправка одного файла: водяной знак в браузере (на сервере нет ни
  // ffmpeg, ни headless-браузера) и прогресс через XHR — fetch не умеет
  // показывать, сколько уже улетело. watermarkPhoto объявлена на уровне
  // модуля, в зависимостях её нет — список вычисляется во время рендера.
  const sendPhoto = useCallback(async (
    item: PhotoUpload,
  ): Promise<{ ok: true; id: number; url?: string } | { ok: false; session?: boolean; message: string }> => {
    const prepared = await watermarkPhoto(item.source)
    if (!prepared) {
      // Кадр не читается браузером (HEIC с iPhone) — раньше такой файл молча
      // пропадал, теперь сотрудник видит причину
      return { ok: false, message: t.crm.objUploadUnreadable }
    }
    // Размер проверяем по тому файлу, который реально уходит: canvas
    // перекодирует кадр, и после водяного знака он весит иначе
    if (prepared.blob.size > PHOTO_MAX_BYTES) {
      return {
        ok: false,
        message: `${t.crm.objUploadTooBig} ${photoSizeLabel(prepared.blob.size)} — ${t.crm.objUploadMax} ${PHOTO_MAX_LABEL}`,
      }
    }
    const fd = new FormData()
    fd.append('file', prepared.blob, prepared.name)

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/crm/upload')
      // Кука сессии уходит вместе с запросом (тот же origin) — без неё сервер
      // отвечает 401, и это видно как «сессия истекла», а не «ничего не вышло»
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          patchUpload(item.key, { progress: Math.round((e.loaded / e.total) * 100) })
        }
      }
      xhr.onload = () => {
        let data: UploadResponse | null = null
        try {
          data = JSON.parse(xhr.responseText) as UploadResponse
        } catch {
          // Не-JSON в ответе (обрыв связи, страница ошибки Caddy) — считаем,
          // что сервер не ответил, и показываем общую причину
          data = null
        }
        if (xhr.status >= 200 && xhr.status < 300 && data?.doc?.id) {
          resolve({ ok: true, id: data.doc.id, url: data.doc.url })
          return
        }
        if (xhr.status === 401 || data?.code === 'session_expired') {
          resolve({ ok: false, session: true, message: t.crm.objUploadSession })
          return
        }
        resolve({ ok: false, message: data?.error || t.crm.objUploadFailed })
      }
      xhr.onerror = () => resolve({ ok: false, message: t.crm.objUploadNet })
      xhr.send(fd)
    })
  }, [patchUpload, t])

  // Очередь идёт по одной загрузке: десяток фото с телефона, отправленных
  // разом, съедает память контейнера (на VPS ~2 ГБ) и роняет сайт
  const pumpUploads = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    try {
      for (;;) {
        const item = uploadQueueRef.current.shift()
        if (!item) break
        patchUpload(item.key, { status: 'uploading', progress: 0, error: undefined })
        const result = await sendPhoto(item)
        if (result.ok) {
          // Фото сразу видно в галерее карточки; в объекте оно окажется при
          // сохранении (primaryImage/images — см. save)
          setUploads((prev) => prev.filter((u) => u.key !== item.key))
          setPhotos((prev) => [...prev, { id: result.id, url: result.url }])
          continue
        }
        if (result.session) {
          // Сессия кончилась: файл не теряем — ждём вход и повторяем
          patchUpload(item.key, { status: 'error', error: result.message, needsLogin: true, retryable: true })
          setSessionExpired(true)
          break
        }
        patchUpload(item.key, { status: 'error', error: result.message, retryable: true })
      }
    } finally {
      pumpingRef.current = false
      // Пока шла загрузка, могли выбрать ещё фото — подхватываем их
      if (uploadQueueRef.current.length) void pumpUploads()
    }
  }, [patchUpload, sendPhoto])

  // Выбор фото: формат и размер проверяем до отправки, чтобы сотрудник сразу
  // видел причину отказа (сервер проверяет то же самое ещё раз — см.
  // src/lib/photo-rules.ts)
  const onPhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const accepted: PhotoUpload[] = []
    const rejected: PhotoUpload[] = []
    files.forEach((file, i) => {
      const row: PhotoUpload = {
        key: `${Date.now()}-${i}-${file.name}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'waiting',
        source: file,
      }
      if (!isAllowedPhoto({ name: file.name, type: file.type })) {
        rejected.push({ ...row, status: 'error', retryable: false, error: t.crm.objUploadBadType })
        return
      }
      if (file.size > PHOTO_MAX_BYTES) {
        rejected.push({
          ...row,
          status: 'error',
          retryable: false,
          error: `${t.crm.objUploadTooBig} ${photoSizeLabel(file.size)} — ${t.crm.objUploadMax} ${PHOTO_MAX_LABEL}`,
        })
        return
      }
      accepted.push(row)
    })
    if (accepted.length || rejected.length) setUploads((prev) => [...prev, ...accepted, ...rejected])
    if (accepted.length) {
      uploadQueueRef.current.push(...accepted)
      void pumpUploads()
    }
  }

  const retryUploads = (keys: string[]) => {
    const rows = uploads.filter((u) => keys.includes(u.key) && (u.status === 'error') && u.retryable !== false)
    if (!rows.length) return
    setUploads((prev) => prev.map((u) => (rows.some((r) => r.key === u.key)
      ? { ...u, status: 'waiting', progress: 0, error: undefined, needsLogin: false }
      : u)))
    uploadQueueRef.current.push(...rows.map((r) => ({ ...r, status: 'waiting' as const, progress: 0, error: undefined, needsLogin: false })))
    void pumpUploads()
  }

  const removeUpload = (key: string) => {
    uploadQueueRef.current = uploadQueueRef.current.filter((u) => u.key !== key)
    setUploads((prev) => prev.filter((u) => u.key !== key))
  }

  // Payload на истёкшую сессию отвечает 403 «нет права на действие»
  // (пользователь в запросе анонимный) — отличить это от настоящего запрета
  // по коду нельзя, поэтому причину уточняем у сервера: /api/users/me отдаёт
  // user: null, когда сессия кончилась
  const sessionGone = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return false
      const data = (await res.json()) as { user?: unknown }
      return !data?.user
    } catch {
      return false
    }
  }

  // Вход прямо в карточке: страницу не перезагружаем, форма объекта остаётся
  // заполненной, после входа неудавшиеся загрузки повторяются сами
  const relogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loginBusy) return
    setLoginBusy(true)
    setLoginError('')
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = (await res.json().catch(() => null)) as { user?: { role?: string } } | null
      if (!res.ok || !data?.user) {
        setLoginError(t.crm.objLoginFailed)
        return
      }
      if (data.user.role !== 'agent' && data.user.role !== 'admin') {
        setLoginError(t.crm.objLoginNoAccess)
        return
      }
      setSessionExpired(false)
      setLoginPassword('')
      retryUploads(uploads.filter((u) => u.status === 'error').map((u) => u.key))
    } catch {
      setLoginError(t.crm.objLoginFailed)
    } finally {
      setLoginBusy(false)
    }
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

  // save возвращает true при успешном сохранении — этим пользуется перенос
  // в архив (см. runArchive): он сохраняет карточку вместе со сменой статуса
  // и данными архива, поэтому несохранённые правки формы не теряются
  const save = async (force = false, extra: Record<string, unknown> = {}): Promise<boolean> => {
    if (saving || !form.title.trim()) return false
    if (!form.price) {
      setSaveError(t.crm.objPriceRequired)
      return false
    }
    // Новый объект агента должен быть привязан к профилю агента: объект без
    // агента («бесхозный») агент потом не сможет редактировать и публиковать
    if (!editId && !isAdmin && !form.agent) {
      setSaveError(t.crm.objAgentRequired)
      return false
    }
    // Блоки «Собственник» и «Кадастровый номер»: проверяем до отправки, чтобы
    // сотрудник увидел причину сразу и не потерял введённое (сервер проверяет
    // то же самое — см. validate поля в коллекции Objects)
    if (canEditPrivate) {
      const cadastral = form.cadastralNumber.trim()
      if (cadastral && !isCadastralFormat(cadastral)) {
        setSaveError(t.crm.objCadastralBad)
        return false
      }
      // Номер участка дома — своё поле со своим форматом: у дома и участка
      // номера разные, поэтому проверяем каждый номер отдельно
      const plotCadastral = form.plotCadastralNumber.trim()
      if (plotCadastral && !isCadastralFormat(plotCadastral)) {
        setSaveError(t.crm.objCadastralPlotBad)
        return false
      }
      // Участок без кадастрового номера не создаём: у участка это главный
      // признак. Уже сохранённые участки без номера правятся как раньше
      if (!cadastral && !editId && form.category === 'land') {
        setSaveError(t.crm.objCadastralLand)
        return false
      }
    }
    setSaveError('')
    // Площадь в БД всегда хранится в м²: участок «6 соток» сохраняется как
    // 600 м² (а «1,2 га» — как 12000 м²) + единица для показа; техрасчёты
    // (оценка, фильтры) — только по м², конвертацию больше никто не повторяет
    const areaUnit: AreaUnit = form.category === 'land' ? areaUnitOf(form.areaUnit) : 'sqm'
    const areaNum = form.area.trim() ? parseAreaNumber(form.area) : null
    const area = areaNum != null && areaNum > 0 ? unitToSqm(areaNum, areaUnit) : undefined
    // Площадь участка — та же логика со своей единицей (у коммерции тоже:
    // «25 соток» базы отдыха хранятся как 2500 м²)
    const plotAreaUnit: AreaUnit = isPlotArea ? areaUnitOf(form.plotAreaUnit) : 'sqm'
    const plotAreaNum = form.plotArea.trim() ? parseAreaNumber(form.plotArea) : null
    const plotArea = plotAreaNum != null && plotAreaNum > 0
      ? unitToSqm(plotAreaNum, plotAreaUnit)
      : undefined
    // Поля участка уходят в запрос, когда участок отмечен. У администратора
    // блок участка можно скрыть галочкой «Есть земельный участок», и тогда
    // поля просто не участвуют в запросе (undefined) — снятая галочка
    // сохранённые площадь и кадастровые сведения участка не стирает.
    // Сотрудникам площадь участка показывается, как раньше, отдельным полем
    // формы (кадастровые сведения им не отдаются вовсе).
    const plotSent = isPlotArea && (canEditPrivate ? hasPlot : true)
    const mediaIds = photos.map((p) => p.id).filter((id): id is number => id !== null)
    // Этажность дома (дом и таунхаус): выбранное число этажей из списка или
    // своё («другое значение»). Хранится, как и раньше, в totalFloors — его
    // читают карточка сайта, оценка и публикации.
    // Этажность — целое число этажей («4,5 этажа» не бывает)
    const houseFloorsNum = !isHouse
      ? null
      : form.floorsMode === 'other' ? toNum(form.floorsOther) : toNum(form.floorsMode)
    const houseFloors = houseFloorsNum != null ? Math.round(houseFloorsNum) : undefined
    // Описания помещений по этажам: на каждый этаж свой пункт. Если этажность
    // не выбрана (старый объект), показываем и сохраняем то, что было, — иначе
    // открытие карточки молча стирало бы сохранённые описания.
    const floorRows = (isHouse ? floorDescs.slice(0, houseFloors && houseFloors > 0 ? houseFloors : floorDescs.length) : [])
      .map((d, i) => ({ floorNumber: i + 1, description: (d || '').trim() }))
      .filter((row) => row.description)
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      category: form.category,
      price: form.price ? Number(form.price) : undefined,
      area,
      areaUnit: form.category === 'land' ? areaUnit : undefined,
      livingArea: form.livingArea ? Number(form.livingArea) : undefined,
      // Земельный участок дома — только у дома и таунхауса; у остальных
      // категорий поля не отправляем, чтобы не затереть сохранённое значение
      plotArea: plotSent ? plotArea : undefined,
      plotAreaUnit: plotSent ? plotAreaUnit : undefined,
      kitchenArea: form.kitchenArea ? Number(form.kitchenArea) : undefined,
      rooms: form.rooms ? Number(form.rooms) : undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      totalFloors: isHouse ? houseFloors : form.totalFloors ? Number(form.totalFloors) : undefined,
      // Квартиры, участки и коммерция поэтажных описаний не получают —
      // поле не отправляем, чтобы не затереть чужие данные
      floorDescriptions: isHouse ? floorRows : undefined,
      buildingType: form.buildingType || undefined,
      condition: form.condition || undefined,
      heating: form.heating || undefined,
      balcony: form.balcony || undefined,
      water: form.water || undefined,
      sewerage: form.sewerage || undefined,
      electricity: form.electricity || undefined,
      gas: form.gas || undefined,
      internet: form.internet || undefined,
      // Адрес: select-поля (район, район города, товарищество) без выбора
      // уходят null («не указано»), а не '' — Payload отклоняет '' как
      // недействительный вариант select-поля. Текстовые поля — как есть.
      address: {
        city: form.city,
        district: form.district || null,
        cityDistrict: form.cityDistrict || null,
        locality: form.locality,
        snt: form.snt.trim() || null,
        street: form.street,
        house: form.house,
        // Корпус дома хранится отдельно от номера дома (дом 16, корпус 2) —
        // вместе с полным адресом, собранным из частей. Полный адрес строкой
        // нужен карточке и поиску, когда части по отдельности не читаются.
        corpus: form.corpus,
        fullAddress: fullAddressValue(form, addrTouched),
        apartment: form.apartment,
      },
      coordinates: form.lat || form.lng ? { lat: Number(form.lat) || undefined, lng: Number(form.lng) || undefined } : undefined,
      description: form.description.trim()
        ? { root: { children: [{ children: [{ text: form.description.trim(), type: 'text', version: 1 }], type: 'paragraph', version: 1 }], type: 'root', version: 1 } }
        : undefined,
      features: features.map((feature) => ({ feature })),
      // Варианты покупки — только у продажи жилья и коммерции: у аренды и
      // участков блок скрыт, и поле не отправляем, чтобы не затереть
      // сохранённое значение (у самих таких объектов вариантов не бывает —
      // см. нормализацию в коллекции Objects)
      purchaseOptions: purchaseOptionsApply(form.type, form.category) ? form.purchaseOptions : undefined,
      // Особое предложение: отметка уходит всегда — снятая галочка снимает
      // показ в блоке на главной (как и прочие признаки карточки)
      urgentSale: form.urgentSale,
      status: form.status,
      agent: form.agent ? Number(form.agent) : undefined,
      primaryImage: mediaIds[0],
      images: mediaIds.slice(1),
      // Поля собственника и кадастровый номер правят только администраторы:
      // у сотрудников их нет в форме, отправлять их не нужно (undefined —
      // поле не участвует в запросе и данные администратора не затираются).
      // Пустое поле у администратора уходит как null, а не пропускается:
      // иначе стёртое значение (очистка телефона или кадастрового) не
      // сохранялось бы — Payload считает пропущенное поле неизменённым.
      // Телефон уходит в том же виде, в каком его хранит коллекция
      // («+7 (918) 828-40-88»), чтобы дубли искались по одному написанию.
      ownerName: canEditPrivate ? form.ownerName.trim() || null : undefined,
      ownerPhone: canEditPrivate ? formatRuPhone(form.ownerPhone.trim()) || null : undefined,
      // Номер дома/строения — в cadastralNumber (историческое поле объекта),
      // кадастровые сведения участка — в своих полях: это разные объекты
      // учёта, и один номер вместо двух не подходит. Пустое поле уходит
      // null — стёртое значение сохраняется.
      cadastralNumber: canEditPrivate ? form.cadastralNumber.trim() || null : undefined,
      plotCadastralNumber: canEditPrivate && plotSent ? form.plotCadastralNumber.trim() || null : undefined,
      plotLandCategory: canEditPrivate && plotSent ? form.plotLandCategory.trim() || null : undefined,
      plotPermittedUse: canEditPrivate && plotSent ? form.plotPermittedUse.trim() || null : undefined,
      // Назначение участка — поле коммерции (у дома оно повторяло бы ВРИ):
      // у остальных категорий не отправляем, сохранённое не стираем
      plotPurpose: canEditPrivate && plotSent && isCommercial ? form.plotPurpose.trim() || null : undefined,
      // Перенос в архив добавляет статус и данные архива (см. runArchive)
      ...extra,
    }

    // Проверка дублей перед сохранением (если не подтвердили force)
    if (!force) {
      try {
        const dupRes = await fetch('/api/objects/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            // Признаки собственника шлёт только администратор — у сотрудников
            // их нет в форме, а сервер эти поля от неадминистраторов не принимает
            ownerName: isAdmin ? form.ownerName : '',
            ownerPhone: isAdmin ? form.ownerPhone : '',
            cadastralNumber: isAdmin ? form.cadastralNumber : '',
            address: { city: form.city, street: form.street, house: form.house, apartment: form.apartment },
            excludeId: editId ?? undefined,
          }),
        })
        if (dupRes.ok) {
          const dupData = await dupRes.json()
          if (dupData.duplicates?.length) {
            setDuplicates(dupData.duplicates)
            return false
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
      // Карточка остаётся открытой, введённые данные не сбрасываются:
      // сотрудник видит сообщение «Объект сохранён» и может продолжить
      // работу (например, догрузить фото и сохранить ещё раз). Новый объект
      // переключается в режим правки с его id — повторное сохранение
      // обновляет тот же объект, а не создаёт второй.
      const savedDoc = (await res.json().catch(() => null)) as { doc?: Record<string, unknown> } | null
      if (!editId && savedDoc?.doc?.id) {
        // Новый объект создан: открываем его же карточку в режиме правки
        // (startEdit сам помечает карточку как только что открытую —
        // несохранённых правок после сохранения нет)
        startEdit(savedDoc.doc)
      } else {
        // Правка существующего объекта: форма остаётся как была — она ровно
        // та, что ушла на сервер
        skipNextDirty.current = false
        setDirty(false)
      }
      setSaved(true)
      await load()
      return true
    }
    // Истёкшая сессия выглядит как «нет права на действие» — показываем вход
    // прямо в карточке, чтобы заполненная форма не пропала
    if ((res.status === 401 || res.status === 403) && await sessionGone()) {
      setSessionExpired(true)
      setSaveError(t.crm.objSessionExpiredSave)
      return false
    }
    // Показываем причину ошибки — раньше неудача была безмолвной
    const errData = await res.json().catch(() => null) as { errors?: { message?: string }[] } | null
    const serverMsg = errData?.errors?.[0]?.message
    setSaveError(serverMsg ? `${t.crm.objSaveError} (${serverMsg})` : t.crm.objSaveError)
    return false
  }

  // «Переместить в архив»: сохраняем карточку вместе со статусом archived и
  // причиной/комментарием — серверный хук фиксирует дату, автора и прежний
  // статус, а модуль публикации снимает объект с сайта и площадок
  const runArchive = async () => {
    if (!editId || archBusy) return
    if (!archReason) {
      setArchErr(t.crm.archMoveNoReason)
      return
    }
    setArchBusy(true)
    setArchErr('')
    // force: проверка дублей уже пройдена при создании объекта — перенос
    // в архив её не требует
    const ok = await save(true, { status: 'archived', archive: { reason: archReason, comment: archComment.trim() } })
    setArchBusy(false)
    if (!ok) {
      setArchErr(t.crm.archErr)
      return
    }
    setArchiveOpen(false)
    setArchReason('')
    setArchComment('')
  }

  // «Восстановить объект»: возврат в прежний статус — объект снова доступен
  // для публикации (и снова виден на сайте, если был опубликован)
  const runRestore = async () => {
    if (!editId || archBusy) return
    if (!window.confirm(t.crm.archRestoreConfirm)) return
    setArchBusy(true)
    setArchErr('')
    try {
      const res = await fetch('/api/objects/archive-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'restore', objectId: editId }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; status?: string; archive?: ArchiveGroup } | null
      if (!res.ok) {
        setArchErr(data?.error || t.crm.archErr)
        return
      }
      setForm((prev) => ({ ...prev, status: data?.status === 'published' ? 'published' : 'draft' }))
      if (data?.archive) setArchive(data.archive)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } catch {
      setArchErr(t.crm.archErr)
    } finally {
      setArchBusy(false)
    }
  }

  // Открытие карточки объекта: свой (или админом) — на правку, чужой — на
  // просмотр. Право на правку определяет сервер, а форма ориентируется на
  // тот же список своих объектов (см. canEditPrivate)
  const openObject = async (id: number) => {
    const res = await fetch(`/api/objects/${id}`, { credentials: 'include' })
    if (!res.ok) return
    startEdit(await res.json())
  }

  const remove = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm(t.crm.objDeleteConfirm)) return
    await fetch(`/api/objects/${id}`, { method: 'DELETE', credentials: 'include' })
    await load()
  }

  const set = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  // Отметка «Особое предложение» — единственная галочка в самом form (у
  // остальных признаков своё состояние: участок, варианты покупки)
  const setUrgentSale = (v: boolean) => setForm((prev) => ({ ...prev, urgentSale: v }))

  // Категория: единица «сотки»/«га» доступна только участкам, единица
  // площади участка — дому, таунхаусу и коммерции. При смене категории
  // площадь снова читается в м² — число в поле не трогаем (его вводили под
  // старую категорию), единица молча возвращается к м².
  const setCategory = (v: string) => {
    setForm((prev) => ({
      ...prev,
      category: v,
      areaUnit: v === 'land' ? prev.areaUnit : 'sqm',
      plotAreaUnit: isPlotAreaCategory(v) ? prev.plotAreaUnit : 'sqm',
      // Участки и аренда вариантов покупки не имеют — прежние отметки
      // снимаем, чтобы они не остались скрытыми в карточке
      purchaseOptions: purchaseOptionsApply(prev.type, v) ? prev.purchaseOptions : [],
    }))
  }

  /**
   * Смена типа сделки. Аренда вариантов покупки не имеет: при переключении
   * продажа → аренда отметки снимаем — блок в форме скрывается, и скрытых
   * отметок в карточке оставаться не должно.
   */
  const setType = (v: string) => {
    setForm((prev) => ({
      ...prev,
      type: v,
      purchaseOptions: purchaseOptionsApply(v, prev.category) ? prev.purchaseOptions : [],
    }))
  }

  /**
   * Отметка варианта покупки: выбор множественный — отметок может быть
   * несколько (ипотека и рассрочка сразу), повторное нажатие снимает отметку.
   * Порядок отметок — как в списке вариантов, чтобы карточка сохраняла один
   * и тот же набор одинаково.
   */
  const togglePurchase = (value: string) => {
    setForm((prev) => {
      const next = prev.purchaseOptions.includes(value)
        ? prev.purchaseOptions.filter((v) => v !== value)
        : [...prev.purchaseOptions, value]
      return { ...prev, purchaseOptions: PURCHASE_OPTIONS.map((o) => o.value).filter((v) => next.includes(v)) }
    })
  }

  /**
   * Смена единицы площади (м² / сотки / га): число в поле пересчитывается,
   * чтобы площадь не изменилась — «600» м² становятся «6» соток, «12000» м² —
   * «1,2» га. field — чья единица меняется: площадь участка (areaUnit) или
   * площадь участка дома (plotAreaUnit).
   */
  const changeAreaUnit = (field: 'areaUnit' | 'plotAreaUnit', text: string, v: string) => {
    const next = areaUnitOf(v)
    setForm((prev) => {
      const from = areaUnitOf(prev[field])
      if (from === next) return prev
      const n = text.trim() ? parseAreaNumber(text) : null
      const value = n != null ? areaNumberText(sqmToUnit(unitToSqm(n, from), next)) : text
      return field === 'areaUnit'
        ? { ...prev, areaUnit: next, area: value }
        : { ...prev, plotAreaUnit: next, plotArea: value }
    })
  }

  /** Название единицы площади для подписи поля: «сотки», «га», «м²» */
  const unitName = (u: string): string =>
    areaUnitOf(u) === 'are' ? t.catalog.areName : areaUnitOf(u) === 'ha' ? t.catalog.hectareName : t.catalog.sqm

  /**
   * Подпись площади участка — по единице показа (как areaUnit у участка).
   * У коммерции площадь земли подписана своим словом: у базы отдыха рядом
   * стоит площадь здания, и «земельный участок» без уточнения читался бы
   * как ещё одна площадь объекта.
   */
  const plotAreaLabel = areaUnitOf(form.plotAreaUnit) === 'are'
    ? (isCommercial ? t.crm.objPlotLandAreaAre : t.crm.objPlotAreaAre)
    : areaUnitOf(form.plotAreaUnit) === 'ha'
      ? (isCommercial ? t.crm.objPlotLandAreaHa : t.crm.objPlotAreaHa)
      : (isCommercial ? t.crm.objPlotLandArea : t.crm.objPlotArea)

  /**
   * Поле площади участка (число + единица показа: м² / сотки / га) — дом,
   * таунхаус и коммерция. Место у него одно из двух: у администратора —
   * в блоке участка (у дома «Кадастровые данные участка», у коммерции
   * «Земельный участок»: номер участка, площадь, категория земель, ВРИ),
   * у сотрудников — прежней строкой в общей сетке формы: площадь участка не
   * закрытое сведение, она показывается и в карточке на сайте.
   */
  const plotAreaField = (
    <Field label={plotAreaLabel}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type={form.plotAreaUnit === 'sqm' ? 'number' : 'text'}
          inputMode={form.plotAreaUnit === 'sqm' ? undefined : 'decimal'}
          value={form.plotArea}
          onChange={(e) => set('plotArea', e.target.value)}
          placeholder={form.plotAreaUnit === 'are' ? 'Например: 6 или 11,5' : form.plotAreaUnit === 'ha' ? 'Например: 1,2' : undefined}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <select
          value={form.plotAreaUnit}
          onChange={(e) => changeAreaUnit('plotAreaUnit', form.plotArea, e.target.value)}
          aria-label={t.crm.objAreaUnit}
          style={{ ...inputStyle, width: 96, flexShrink: 0 }}
        >
          <option value="sqm">{t.catalog.sqm}</option>
          <option value="are">{t.catalog.areName}</option>
          <option value="ha">{t.catalog.hectareName}</option>
        </select>
      </div>
    </Field>
  )

  // Выбор садоводческого товарищества: СНТ/СНО/ДНТ живут только внутри
  // Владикавказского городского округа — район проставляется сам (если был
  // другой или пустой), населённый пункт для товарищества не нужен и при
  // сохранении не требуется (адрес: город Владикавказ + товарищество).
  const setSnt = (v: string) => {
    setForm((prev) => {
      const next = { ...prev, snt: v }
      if (v && prev.district !== VLAV_OKRUG) {
        next.district = VLAV_OKRUG
        next.locality = ''
      }
      return next
    })
  }

  // Адресные поля: помечаем, что адрес менялся (для авто-поиска на карте).
  // При смене района сбрасываем населённый пункт, если он не входит в новый район.
  const setAddr = (k: AddrField | 'apartment', v: string) => {
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

  // Подстановка адресных полей: адрес пришёл с карты, а не из набора букв,
  // поэтому авто-поиск по строке адреса не должен сдвигать метку с выбранной
  // точки — снимаем пометку «адрес правили» (см. addrTouched).
  const applyAddressFields = (fields: Partial<Record<AddrField, string>>) => {
    setForm((prev) => ({ ...prev, ...fields }))
    setAddrTouched(false)
  }

  /**
   * Адрес точки с карты (клик или перетаскивание метки). Подставляем только
   * найденные значения: пустое не затирает введённое. Если найденный адрес
   * расходится с уже заполненными полями — ничего не меняем и спрашиваем
   * подтверждение: данные в форме не стираются молча.
   */
  const applyMapAddress = (found: ReversedAddress, full: string) => {
    const current = formRef.current
    const proposed: Partial<Record<AddrField, string>> = {}
    if (found.locality) proposed.locality = found.locality
    if (found.district) proposed.district = found.district
    if (found.cityDistrict) proposed.cityDistrict = found.cityDistrict
    if (found.street) proposed.street = found.street
    if (found.house) proposed.house = found.house
    if (found.corpus) proposed.corpus = found.corpus
    // Город: справочник называет Владикавказ — ставим и в поле «Город»
    // (как в карточках города). Остальные пункты остаются населёнными пунктами.
    if (/^владикавказ$/i.test(found.locality)) proposed.city = found.locality

    // Квартира не заполняется никогда: точку ставят у дома, а квартиру
    // агент знает сам (см. требования к форме).
    const conflicts = (Object.keys(proposed) as AddrField[]).filter((key) => {
      const was = (current[key] || '').trim()
      const next = (proposed[key] || '').trim()
      return was && !sameAddressValue(was, next)
    })
    if (conflicts.length) {
      setPendingAddr({ proposed, full })
      return
    }
    setPendingAddr(null)
    applyAddressFields(proposed)
  }

  // Фильтр по статусу (черновик / опубликован / архив)
  const visibleRows = statusFilter ? rows.filter((o) => o.status === statusFilter) : rows

  // Архивом объекта распоряжаются его агент и администратор — то же правило,
  // что у правки объектов (см. access коллекции Objects)
  const canManageArchive = isAdmin || (editId != null && ownObjectIds.includes(editId))

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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 18 }}>
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
          onClick={closeCard}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 900px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
                {viewOnly ? t.crm.objView : editId ? t.crm.objEdit : t.crm.objAdd}
              </h2>
              <button type="button" onClick={closeCard} aria-label={t.crm.close} title={t.crm.close} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>
                ✕
              </button>
            </div>
            {/* Чужой объект: карточка открыта только для просмотра — поля
                выключены, панели сохранения нет (см. viewOnly) */}
            {viewOnly && (
              <p style={{ margin: '0 0 14px', padding: '10px 12px', border: '1px solid #e8dfd0', borderRadius: 8, background: '#fbf8f1', color: '#8a857b', fontSize: 11, lineHeight: 1.5 }}>
                {t.crm.objViewHint}
              </p>
            )}
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
                onOpenSearch={() => setPlaceId(editId)}
              />
            )}
            {/* «Оценка по рынку» — администраторский расчёт по фактическим
                объявлениям рынка. Здесь показываем последний сохранённый
                расчёт объекта (valuation.marketRun, его кладёт в объект
                сервер при расчёте): примерный диапазон и дату. Оценка
                предварительная и не заменяет отчёт об оценке — об этом прямо
                сказано и в блоке расчёта (см. MarketValuationBlock). */}
            {editId && isAdmin && (
              <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 16, color: '#25241f' }}>
                    Оценка по рынку
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5 }}>
                    {!marketReport
                      ? 'Расчёт ещё не проводился: он берёт фактические объявления рынка и параметры объекта'
                      : marketReport.estimate != null
                        ? `Последний расчёт: ≈ ${formatMoney(marketReport.estimate)}${shortDate(marketReport.checkedAt) ? ` от ${shortDate(marketReport.checkedAt)}` : ''} — предварительно, не отчёт об оценке`
                        : 'Последний расчёт не сложился: данных и аналогов не хватило, откройте расчёт и проверьте параметры'}
                  </p>
                </div>
                <button type="button" onClick={() => setValuationId(editId)}
                  style={{ marginLeft: 'auto', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '8px 12px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                  {marketReport ? 'Открыть расчёт' : 'Провести оценку по рынку'}
                </button>
              </div>
            )}
            {/* Чужой объект открывается только на просмотр: fieldset с
                disabled гасит все поля, списки, файлы и кнопки формы разом —
                правки в такой карточке физически невозможны, а сервер их и
                так не примет (см. access коллекции Objects) */}
            <fieldset disabled={viewOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="crm-property-form">
          <Field label={t.crm.objTitle}><input value={form.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objType}>
            <select value={form.type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="sale">Продажа</option><option value="rent">Аренда</option>
            </select>
          </Field>
          <Field label={t.crm.objCategory}>
            <select value={form.category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {OBJECT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label={t.crm.objPrice}><input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} style={inputStyle} /></Field>
          {/* Площадь: у земельного участка агент выбирает единицу (м², сотки
              или гектары; «6 соток» = 600 м², «1,2 га» = 12000 м², дробные
              значения разрешены); у квартир/домов/коммерции — только м².
              В БД значение всегда сохраняется в м² (см. save), единицу
              запоминаем отдельным полем areaUnit и показываем так же на сайте.
              У коммерции площадь стоит в блоке «Площадь объекта» ниже: там
              рядом площадь земли, и у базы отдыха это разные величины. */}
          {form.category === 'land' ? (
            <Field label={`${t.crm.objAreaLand}, ${unitName(form.areaUnit)}`}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={form.areaUnit === 'sqm' ? 'number' : 'text'}
                  inputMode={form.areaUnit === 'sqm' ? undefined : 'decimal'}
                  value={form.area}
                  onChange={(e) => set('area', e.target.value)}
                  placeholder={form.areaUnit === 'are' ? 'Например: 6 или 11,5' : form.areaUnit === 'ha' ? 'Например: 1,2' : undefined}
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                <select
                  value={form.areaUnit}
                  onChange={(e) => changeAreaUnit('areaUnit', form.area, e.target.value)}
                  aria-label={t.crm.objAreaUnit}
                  style={{ ...inputStyle, width: 96, flexShrink: 0 }}
                >
                  <option value="sqm">{t.catalog.sqm}</option>
                  <option value="are">{t.catalog.areName}</option>
                  <option value="ha">{t.catalog.hectareName}</option>
                </select>
              </div>
            </Field>
          ) : isCommercial ? null : (
            <Field label={t.crm.objArea}><input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} style={inputStyle} /></Field>
          )}
          {/* Коммерция (база отдыха, гостиница, ресторан, туристический
              объект): площадь здания или комплекса и площадь земли — разные
              поля, поэтому блок разделён. «Площадь объекта» — площадь
              застройки, «Земельный участок» — площадь земли со своей единицей
              (м² / сотки / га: «25 соток», «1,5 га») и кадастровые сведения.
              Кадастровые поля — закрытые: их видит и меняет только
              администратор (как у дома в блоке «Кадастровые данные участка»),
              в чужих объектах сотруднику остаётся площадь земли — она
              показывается и на сайте.
              Галочка «Есть земельный участок» скрывает пустой блок — так же,
              как у дома; сохранённые данные она не стирает (см. save) */}
          {isCommercial && (
            <div className="span-2" style={{ gridColumn: '1 / -1' }}>
              <div className="crm-fields-block">
                <div className="crm-block-head">
                  <strong>{t.crm.objAreaObjectBlock}</strong>
                  <span>{t.crm.objAreaObjectHint}</span>
                </div>
                <div className="crm-fields-grid">
                  <Field label={t.crm.objAreaComplex}>
                    <input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              </div>
              {canEditPrivate && (
                <label className="crm-plot-toggle">
                  <input type="checkbox" checked={hasPlot} onChange={(e) => setHasPlot(e.target.checked)} />
                  <span>{t.crm.objPlotHas}</span>
                </label>
              )}
              {(!canEditPrivate || hasPlot) && (
                <div className="crm-fields-block" style={{ marginTop: 10 }}>
                  <div className="crm-block-head">
                    <strong>{t.crm.objPlotBlock}</strong>
                    <span>{t.crm.objPlotBlockHint}</span>
                  </div>
                  <div className="crm-fields-grid">
                    {plotAreaField}
                    {canEditPrivate && (
                      <>
                        <Field label={t.crm.objCadastralPlot}>
                          <input value={form.plotCadastralNumber} onChange={(e) => set('plotCadastralNumber', e.target.value)} style={inputStyle} placeholder="15:07:0030021:123" />
                        </Field>
                        <Field label={t.crm.objPlotLandCategory}>
                          <input value={form.plotLandCategory} onChange={(e) => set('plotLandCategory', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label={t.crm.objPlotPermittedUse}>
                          <input value={form.plotPermittedUse} onChange={(e) => set('plotPermittedUse', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label={t.crm.objPlotPurpose}>
                          <input value={form.plotPurpose} onChange={(e) => set('plotPurpose', e.target.value)} style={inputStyle} />
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <Field label={t.crm.objLivingArea}><input type="number" value={form.livingArea} onChange={(e) => set('livingArea', e.target.value)} style={inputStyle} /></Field>
          <Field label={t.crm.objKitchenArea}><input type="number" value={form.kitchenArea} onChange={(e) => set('kitchenArea', e.target.value)} style={inputStyle} /></Field>
          {/* Земельный участок — только у дома и таунхауса (как и в коллекции
              Objects); единица показа (м² / сотки / га) своя — как у участка;
              участвует в рыночной оценке: маленький участок удешевляет лот,
              большой — добавляет к цене.
              У владельца карточки поле стоит в блоке «Кадастровые данные
              участка» ниже (номер участка и категория земель — закрытые
              сведения, они показываются рядом с площадью), в чужом объекте —
              здесь: площадью участка сотрудник пользуется, а закрытых
              сведений блока не видит */}
          {isHouse && !canEditPrivate && plotAreaField}
          <Field label={t.crm.objRooms}><input type="number" value={form.rooms} onChange={(e) => set('rooms', e.target.value)} style={inputStyle} /></Field>
          {/* Этажность дома — только у дома и таунхауса: сразу видно, сколько
              этажей, и появляются поля описаний. Квартиры (этаж квартиры в
              доме), участки и коммерция — прежние «Этаж» и «Этажей». */}
          {isHouse ? (
            <>
              <Field label={t.crm.objFloors}>
                <select value={form.floorsMode} onChange={(e) => set('floorsMode', e.target.value)} style={inputStyle}>
                  <option value="">{t.crm.objFloorsNone}</option>
                  <option value="1">1 этаж</option>
                  <option value="2">2 этажа</option>
                  <option value="3">3 этажа</option>
                  <option value="other">{t.crm.objFloorsOther}</option>
                </select>
              </Field>
              {form.floorsMode === 'other' && (
                <Field label={t.crm.objFloorsCount}>
                  <input type="number" min={1} step={1} value={form.floorsOther} onChange={(e) => set('floorsOther', e.target.value)} style={inputStyle} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label={t.crm.objFloor}><input type="number" value={form.floor} onChange={(e) => set('floor', e.target.value)} style={inputStyle} /></Field>
              <Field label={t.crm.objTotalFloors}><input type="number" value={form.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} style={inputStyle} /></Field>
            </>
          )}
          {/* Описание помещений по этажам дома: у одноэтажного — только
              «1 этаж», у двухэтажного — «1 этаж» и «2 этаж», у трёхэтажного —
              ещё «3 этаж». Сохраняется отдельно на каждый этаж
              (floorDescriptions объекта) и показывается в карточке на сайте. */}
          {isHouse && floorFieldCount > 0 && (
            <div className="span-2" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Array.from({ length: floorFieldCount }, (_, i) => (
                <Field key={i} label={floorLabel(i + 1, t.crm.objFloorN)}>
                  <textarea
                    rows={2}
                    value={floorDescs[i] || ''}
                    onChange={(e) => setFloorDescs((prev) => {
                      const next = [...prev]
                      next[i] = e.target.value
                      return next
                    })}
                    placeholder={t.crm.objFloorPh}
                    style={inputStyle}
                  />
                </Field>
              ))}
            </div>
          )}
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
            {/* Садоводческое товарищество — для загородных категорий (дом
                в СНТ, участок в товариществе) и квартир в домах товариществ;
                у городской недвижимости поле не нужно. Список сгруппирован
                по категориям СНТ/СНО/ДНТ — товарищества живут только внутри
                Владикавказского городского округа, к районам республики не
                относятся. Значение — в address.snt объекта. */}
            {(form.category === 'land' || form.category === 'apartment' || form.category === 'room' || isPrivateHouseCode(form.category)) && (
              <div className="crm-addr-full">
                <Field label={t.crm.objSnt}>
                  <select value={form.snt} onChange={(e) => setSnt(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {GARDENING_CATEGORY_ORDER
                      .filter((c) => GARDENING_AREAS[c].length > 0)
                      .map((category) => (
                        <optgroup key={category} label={category}>
                          {GARDENING_AREAS[category].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                </Field>
              </div>
            )}
            {/* Улица: подсказки адресного справочника по первым буквам. Список
                зависит от населённого пункта и района формы, ручной ввод
                сохраняется — подсказка только помогает (см. SuggestInput). */}
            <div className="crm-addr-full">
              <Field label={t.crm.objStreet}>
                <SuggestInput
                  t={t}
                  value={form.street}
                  onChange={(v) => setAddr('street', v)}
                  onPick={(item) => setAddr('street', item.value)}
                  load={(q) => suggestStreets({ query: q, locality: form.locality, district: form.district, city: form.city })}
                />
              </Field>
            </div>
            {/* Дом, корпус и квартира в одну строку: дом — с номерами
                выбранной улицы из справочника, корпус дома отдельным полем,
                квартира не подставляется автоматически никогда */}
            <div className="crm-addr-half">
              <Field label={t.crm.objHouse}>
                <SuggestInput
                  t={t}
                  value={form.house}
                  onChange={(v) => setAddr('house', v)}
                  onPick={(item) => {
                    setAddr('house', item.value)
                    // Справочник различает дом и корпус — пустое поле заполняем
                    if (item.corpus && !form.corpus.trim()) setAddr('corpus', item.corpus)
                  }}
                  load={(q) => suggestHouses({ query: q, street: form.street, locality: form.locality, district: form.district, city: form.city })}
                  openOnFocus
                  reloadKey={form.street}
                />
              </Field>
            </div>
            <div className="crm-addr-half">
              <Field label={t.crm.objCorpus}>
                <input value={form.corpus} onChange={(e) => setAddr('corpus', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div className="crm-addr-half">
              <Field label={t.crm.objApartment}>
                <input value={form.apartment} onChange={(e) => setAddr('apartment', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            {/* Полный адрес одной строкой — то, что уходит в карточку объекта.
                Собирается из частей, поэтому правится не руками, а полями выше */}
            <div className="crm-addr-full">
              <Field label={t.crm.objFullAddress}>
                <p className="crm-addr-full-text">
                  {fullAddressValue(form, addrTouched) || t.crm.objFullAddressEmpty}
                </p>
              </Field>
            </div>
            {/* Адрес точки на карте разошёлся с заполненными полями: спрашиваем,
                заменять ли введённое — без ответа агента данные не стираются */}
            {pendingAddr && (
              <div className="crm-addr-confirm crm-addr-full">
                <p>{t.crm.objAddrConfirm}</p>
                {pendingAddr.full && <p className="crm-addr-full-text">{pendingAddr.full}</p>}
                <div className="crm-addr-confirm-actions">
                  <button
                    type="button"
                    onClick={() => {
                      applyAddressFields(pendingAddr.proposed)
                      setPendingAddr(null)
                    }}
                  >
                    {t.crm.objAddrReplace}
                  </button>
                  <button type="button" className="keep" onClick={() => setPendingAddr(null)}>
                    {t.crm.objAddrKeep}
                  </button>
                </div>
              </div>
            )}
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
              onAddressFound={applyMapAddress}
            />
          </div>

          {/* Блок «Собственник»: имя и телефон — закрытые сведения. Их видит
              и правит администратор, а агент — только в своём объекте (в
              чужом полей нет вовсе, а не «заблокированы»: см. access полей в
              коллекции Objects). Стоит перед блоком «Кадастровый номер»:
              сначала собственник объекта, потом номер. Разметка: блок =
              подпись + сетка полей (crm.css), на телефоне поля становятся
              в одну колонку */}
          {canEditPrivate && (
            <div className="crm-fields-block span-2" style={{ gridColumn: '1 / -1' }}>
              <div className="crm-block-head">
                <strong>{t.crm.objOwnerBlock}</strong>
                <span>{t.crm.objOwnerNote}</span>
              </div>
              <div className="crm-owner-grid">
                <Field label={t.crm.objOwnerName}>
                  <input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} style={inputStyle} />
                </Field>
                <Field label={t.crm.objOwnerPhone}>
                  {/* Маска +7 подставляется прямо при наборе: «8918…» →
                      «+7 (918) …». Значения с буквами (заметка) маска не
                      трогает — см. src/lib/phone.ts */}
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={form.ownerPhone}
                    onChange={(e) => set('ownerPhone', maskRuPhoneInput(e.target.value))}
                    style={inputStyle}
                    placeholder="+7 (___) ___-__-__"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* Блок «Кадастровый номер»: номер объекта — отдельным полем.
              У частного дома это номер дома (строения), поэтому блок
              называется «Кадастровые данные дома», а номер участка —
              отдельный блок ниже: у дома и участка номера разные.
              Формат проверяется до отправки (и на сервере), у участка номер
              обязателен при создании карточки */}
          {canEditPrivate && (
            <div className="crm-fields-block span-2" style={{ gridColumn: '1 / -1' }}>
              <div className="crm-block-head">
                <strong>{isPrivateHouse ? t.crm.objCadastralHouseBlock : t.crm.objCadastralBlock}</strong>
                <span>{t.crm.objCadastralHint}</span>
              </div>
              <Field label={isPrivateHouse ? t.crm.objCadastralHouse : t.crm.objCadastral}>
                <input value={form.cadastralNumber} onChange={(e) => set('cadastralNumber', e.target.value)} style={inputStyle} placeholder="15:07:0030021:123" />
              </Field>
              {form.category === 'land' && !editId && (
                <p className="crm-field-note">{t.crm.objCadastralLandNote}</p>
              )}
            </div>
          )}

          {/* Блок «Кадастровые данные участка» — у дома и таунхауса, когда у
              них есть участок (галочка «Есть земельный участок»): номер
              участка, площадь с единицей показа, категория земель и вид
              разрешённого использования. Закрытые сведения, как и номер дома:
              администратор и агент в своём объекте, на сайте не показываются.
              Галочка только скрывает блок — сохранённые данные участка
              остаются (см. save) */}
          {canEditPrivate && isHouse && (
            <div className="span-2" style={{ gridColumn: '1 / -1' }}>
              <label className="crm-plot-toggle">
                <input type="checkbox" checked={hasPlot} onChange={(e) => setHasPlot(e.target.checked)} />
                <span>{t.crm.objPlotHas}</span>
              </label>
              {hasPlot && (
                <div className="crm-fields-block" style={{ marginTop: 10 }}>
                  <div className="crm-block-head">
                    <strong>{t.crm.objCadastralPlotBlock}</strong>
                    <span>{t.crm.objCadastralPlotHint}</span>
                  </div>
                  <div className="crm-fields-grid">
                    <Field label={t.crm.objCadastralPlot}>
                      <input value={form.plotCadastralNumber} onChange={(e) => set('plotCadastralNumber', e.target.value)} style={inputStyle} placeholder="15:07:0030021:123" />
                    </Field>
                    {plotAreaField}
                    <Field label={t.crm.objPlotLandCategory}>
                      <input value={form.plotLandCategory} onChange={(e) => set('plotLandCategory', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label={t.crm.objPlotPermittedUse}>
                      <input value={form.plotPermittedUse} onChange={(e) => set('plotPermittedUse', e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Варианты покупки — множественный выбор отметками: ипотека
              (гражданская, семейная, военная), рассрочка, материнский
              капитал, покупка без первоначального взноса. Блок есть только у
              продажи жилья и коммерции: у аренды и земельных участков
              вариантов покупки не бывает (см. src/lib/purchase-options.ts).
              На обложке карточки каталога отметки видны значками, полный
              список — на странице объекта, в каталоге по ним есть фильтр.
              Правят отметки агент у своего объекта и администратор у любого:
              у чужого карточка и так открыта только на просмотр (см. viewOnly).
              Блок намеренно без рамок — компактный список в две колонки:
              вариантов шесть, и рамка вокруг каждого превращала блок в
              половину карточки (стили — .crm-purchase-* в crm.css) */}
          {purchaseOptionsApply(form.type, form.category) && (
            <div className="span-2 crm-purchase-block" style={{ gridColumn: '1 / -1' }}>
              <div className="crm-purchase-head">
                <strong>{t.crm.objPurchaseBlock}</strong>
                <small>{t.crm.objPurchaseHint}</small>
              </div>
              <div className="crm-purchase-grid">
                {PURCHASE_OPTIONS.map((option) => {
                  const on = form.purchaseOptions.includes(option.value)
                  return (
                    <label key={option.value} className="crm-purchase-option">
                      <input type="checkbox" checked={on} onChange={() => togglePurchase(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
              {/* Предупреждение агенту: отметка — обещание покупателю,
                  неподтверждённый вариант возвращается претензией */}
              <small className="crm-purchase-warning">{t.crm.objPurchaseWarning}</small>
            </div>
          )}

          {/* Особое предложение — отметка для блока «Особые предложения» на
              главной странице (см. urgentSale в коллекции Objects). Сам
              объект остаётся в каталоге и находится по всем фильтрам:
              отметка только добавляет его в блок. Галочка эта, в отличие от
              вариантов покупки, не обещание клиенту, а признак подборки —
              предупреждения агенту здесь нет */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="crm-check-toggle">
              <input type="checkbox" checked={form.urgentSale} onChange={(e) => setUrgentSale(e.target.checked)} />
              <span>{t.crm.objSpecial}</span>
            </label>
          </div>

          <Field label={t.crm.objStatus}>
            {/* «Архив» в списке — не просто статус: сначала спрашиваем причину
                и комментарий (модалка ниже), иначе перенос не оставит следа
                в истории. Для нового объекта статус не подменяем. */}
            <select value={form.status} onChange={(e) => {
              const v = e.target.value
              if (v === 'archived' && editId) { setArchiveOpen(true); setArchErr(''); setArchReason(''); setArchComment(''); return }
              set('status', v)
            }} style={inputStyle}>
              <option value="draft">{t.crm.statusDraft}</option>
              <option value="published">{t.crm.statusPublished}</option>
              {/* Архив — только для сохранённого объекта и только через модалку
                  с причиной (см. обработчик выше): новый объект «в архив» не
                  создаём, чтобы перенос всегда попадал в историю */}
              {editId && <option value="archived">{t.crm.statusArchived}</option>}
            </select>
          </Field>
          {/* Ответственного агента назначает администратор: агент не может
              ни передать свой объект другому, ни забрать чужой (сервер это
              тоже не принимает — см. access поля в коллекции Objects). Свой
              новый объект агент получает автоматически, поэтому ему видно
              только имя ведущего агента */}
          <Field label={t.crm.objAgent}>
            {isAdmin ? (
              <select value={form.agent} onChange={(e) => set('agent', e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <input
                value={agents.find((a) => String(a.id) === form.agent)?.name || (form.agent ? form.agent : '—')}
                readOnly
                disabled
                style={{ ...inputStyle, background: '#f2ede4', color: '#716b62' }}
              />
            )}
          </Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-gallery-field">
              {/* Сессия истекла: вход прямо в карточке — страницу не
                  перезагружаем, поэтому заполненные поля и выбранные фото
                  остаются на месте, а неудавшиеся загрузки повторяются
                  после входа (см. relogin) */}
              {sessionExpired && (
                <div style={{ padding: '12px 14px', border: '1px solid #e3cfc7', borderRadius: 10, background: '#fdf7f5' }}>
                  <strong style={{ display: 'block', color: '#9b4e43', fontSize: 12 }}>{t.crm.objSessionTitle}</strong>
                  <p style={{ margin: '4px 0 9px', fontSize: 10.5, color: '#6f6a61', lineHeight: 1.5 }}>{t.crm.objSessionText}</p>
                  <form onSubmit={(e) => void relogin(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="email" required value={loginEmail} placeholder={t.crm.loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      style={{ ...inputStyle, flex: '1 1 190px', width: 'auto', padding: '9px 11px' }}
                    />
                    <input
                      type="password" required value={loginPassword} placeholder={t.crm.loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      style={{ ...inputStyle, flex: '1 1 150px', width: 'auto', padding: '9px 11px' }}
                    />
                    <button type="submit" disabled={loginBusy} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '10px 16px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: loginBusy ? 0.7 : 1 }}>
                      {loginBusy ? '…' : t.crm.loginButton}
                    </button>
                  </form>
                  {loginError && <p style={{ margin: '7px 0 0', fontSize: 10, color: '#9b4e43' }}>{loginError}</p>}
                </div>
              )}
              <div className="crm-gallery-heading">
                <div>
                  <strong>{t.crm.objPhotos}</strong>
                  <small>{t.crm.objPhotosHint}</small>
                  <small style={{ display: 'block', marginTop: 4 }}>{t.crm.objPhotosOrder}</small>
                  {/* Фото загружаются сразу, но к объекту прикрепляются при
                      сохранении карточки — говорим об этом прямо, чтобы
                      сотрудник не закрыл карточку до сохранения */}
                  <small style={{ display: 'block', marginTop: 4, color: '#a1661f' }}>{t.crm.objPhotosNeedSave}</small>
                </div>
                <label className="crm-photo-picker" style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px dashed #cbbda9', borderRadius: 9, background: '#fcfaf7', cursor: 'pointer', padding: 16 }}>
                  <span>{t.crm.objPhotoPick}</span>
                  <small style={{ display: 'block', marginTop: 4 }}>
                    {`${PHOTO_FORMATS_LABEL} — ${t.crm.objPhotoLimit} ${PHOTO_MAX_LABEL}`}
                  </small>
                  <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={(e) => onPhotoPick(e)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                </label>
              </div>
              {/* Загрузки: у каждой строки свой прогресс, ошибка и повтор —
                  видно, что происходит с фото, и ничего не пропадает молча */}
              {uploads.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {uploads.map((u) => (
                    <div
                      key={u.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                        padding: '7px 9px', border: '1px solid #e6ded1', borderRadius: 8,
                        background: u.status === 'error' ? '#fdf6f4' : '#fbf8f2',
                      }}
                    >
                      <span style={{ flex: '1 1 140px', minWidth: 0, fontSize: 10.5, color: '#4a453d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.name}>
                        {u.name}
                      </span>
                      {u.status === 'error' ? (
                        <span style={{ flex: '2 1 180px', fontSize: 10, color: '#9b4e43' }}>{u.error}</span>
                      ) : (
                        <>
                          <span style={{ flex: '2 1 120px', height: 6, borderRadius: 999, background: '#eee6da', overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${u.progress}%`, height: '100%', background: '#a7814e', transition: 'width .15s' }} />
                          </span>
                          <span style={{ flex: '0 0 auto', fontSize: 10, color: '#8b683f', minWidth: 30, textAlign: 'right' }}>
                            {u.status === 'waiting' ? t.crm.objUploadWaiting : `${u.progress}%`}
                          </span>
                        </>
                      )}
                      <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                        {u.status === 'error' && u.retryable !== false && (
                          <button type="button" onClick={() => retryUploads([u.key])} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#8b683f', padding: '6px 9px', fontSize: 9, cursor: 'pointer' }}>
                            {t.crm.objUploadRetry}
                          </button>
                        )}
                        <button type="button" onClick={() => removeUpload(u.key)} aria-label={t.crm.objPhotoRemove} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#9b4e43', padding: '6px 9px', fontSize: 9, cursor: 'pointer' }}>
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
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

          {/* Панель сохранения: кнопка внизу карточки видна всегда — у нового
              объекта, при правке, после добавления фото и после заполнения
              полей (панель липнет к низу окна, см. .crm-save-bar). Рядом —
              состояние формы: «Объект сохранён», «Есть несохранённые
              изменения» или текст ошибки. Неудачное сохранение карточку не
              закрывает и ничего не теряет: введённые данные остаются в форме
              (см. save). В чужом объекте панели нет: он открыт на просмотр */}
          {!viewOnly && (
          <div className="span-2 crm-save-bar" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-save-state">
              {saving ? (
                <span className="crm-save-note">{t.crm.objSaving}</span>
              ) : saved ? (
                <span className="crm-save-ok">{t.crm.objSavedFull} ✓</span>
              ) : saveError ? (
                <span className="crm-save-err">{saveError}</span>
              ) : (
                <span className={dirty ? 'crm-save-dirty' : 'crm-save-note'}>
                  {dirty ? t.crm.objUnsaved : t.crm.objAllSaved}
                </span>
              )}
              {!saveError && <span className="crm-save-hint">{t.crm.objSaveHint}</span>}
            </div>
            <button type="button" className="crm-save-btn" onClick={() => void save()} disabled={saving}>
              {saving ? t.crm.objSaving : t.crm.objSave}
            </button>
          </div>
          )}
            </div>
            </fieldset>

            {/* «Архив объекта»: перенос в архив с причиной и комментарием,
                возврат из архива и история изменений (src/lib/archive.ts).
                Архивный объект не удаляется: он остаётся в базе, но скрыт
                с сайта, из каталога, поиска и с площадок публикации. */}
            {editId && (
              <div style={{ marginTop: 18, padding: '14px 16px', background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 16, color: '#25241f' }}>
                      {t.crm.archCardTitle}
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5 }}>
                      {form.status === 'archived' ? t.crm.archInArchive : t.crm.archMoveText}
                    </p>
                  </div>
                  {form.status === 'archived' && canManageArchive && (
                    <button type="button" onClick={() => void runRestore()} disabled={archBusy}
                      style={{ marginLeft: 'auto', border: 0, borderRadius: 7, background: '#a7814e', color: '#fff', padding: '11px 16px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: archBusy ? 0.7 : 1 }}>
                      {archBusy ? t.crm.archBusy : t.crm.archRestore}
                    </button>
                  )}
                  {form.status !== 'archived' && canManageArchive && (
                    <button type="button" onClick={() => { setArchiveOpen(true); setArchErr(''); setArchReason(''); setArchComment('') }}
                      style={{ marginLeft: 'auto', border: '1px solid #e3cfc7', borderRadius: 7, background: 'transparent', color: '#9b4e43', padding: '11px 16px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                      {t.crm.archMoveBtn}
                    </button>
                  )}
                </div>

                {/* Карточка архива: причина, дата, автор и комментарий */}
                {(form.status === 'archived' || archive?.archivedAt) && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#6f6a61', textTransform: 'uppercase', letterSpacing: '.07em' }}>{t.crm.archReason}</div>
                      <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>{archiveReasonLabel(archive?.reason)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#6f6a61', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                        {form.status === 'archived' ? t.crm.archDate : t.crm.archWasInArchive}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#3f3a33', marginTop: 3 }}>
                        {archive?.archivedAt
                          ? new Date(archive.archivedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                        {archive?.archivedBy ? ` · ${archive.archivedBy}` : ''}
                      </div>
                    </div>
                    {/* Комментарий к переносу — внутренний, только администратору */}
                    {isAdmin && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 9, color: '#6f6a61', textTransform: 'uppercase', letterSpacing: '.07em' }}>{t.crm.archComment}</div>
                        <div style={{ fontSize: 11.5, color: archive?.comment ? '#3f3a33' : '#9b958a', marginTop: 3, lineHeight: 1.5 }}>
                          {archive?.comment || t.crm.archNoComment}
                        </div>
                      </div>
                    )}
                    {form.status === 'archived' && archive?.previousStatus && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 10, color: '#8a857b' }}>
                        {fmt(t.crm.archRestorePrev, archive.previousStatus === 'published' ? t.crm.statusPublished : t.crm.statusDraft)}
                      </div>
                    )}
                  </div>
                )}

                {/* История изменений: перенос, восстановление, повторный перенос… */}
                {(archive?.log?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e3d9c8' }}>
                    <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>{t.crm.archHistory}</div>
                    <div style={{ marginTop: 6 }}>
                      {[...(archive?.log || [])].reverse().map((e, i) => (
                        <div key={`${e.at || ''}-${i}`} style={{ padding: '6px 0', borderBottom: i === (archive?.log?.length ?? 0) - 1 ? 0 : '1px solid #eee9e1' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <b style={{ fontSize: 11, color: e.event === 'restore' ? '#3f6b34' : '#8d6b40' }}>
                              {e.event === 'restore' ? t.crm.archLogRestore : t.crm.archLogArchive}
                            </b>
                            <span style={{ fontSize: 10, color: '#8a857b' }}>
                              {e.at ? new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                            {e.by && <span style={{ fontSize: 10, color: '#8a857b' }}>· {e.by}</span>}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#716b62', marginTop: 3, lineHeight: 1.5 }}>
                            {archiveReasonLabel(e.reason)}
                            {/* Комментарии истории — внутренние, только администратору */}
                            {isAdmin && e.comment ? ` — ${e.comment}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!canManageArchive && <p style={{ margin: '10px 0 0', fontSize: 10, color: '#9b958a' }}>{t.crm.archOnlyOwn}</p>}
                {archErr && <p style={{ margin: '10px 0 0', fontSize: 10, color: '#9b4e43' }}>{archErr}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка «Переместить в архив»: причина (обязательно) и комментарий.
          Подтверждение сохраняет карточку вместе со сменой статуса — правки
          формы не теряются (см. runArchive). */}
      {archiveOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setArchiveOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 520px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
              {t.crm.archMoveTitle}
            </h2>
            <p style={{ margin: '0 0 14px', color: '#817b70', fontSize: 12, lineHeight: 1.55 }}>{t.crm.archMoveText}</p>
            <Field label={t.crm.archMoveReason}>
              <select value={archReason} onChange={(e) => { setArchReason(e.target.value); setArchErr('') }} style={inputStyle}>
                <option value="">—</option>
                {ARCHIVE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            {/* Внутренний комментарий переноса — поле администратора: агент
                своих комментариев в архиве не видит, поэтому и не заполняет */}
            {isAdmin && (
              <div style={{ marginTop: 12 }}>
                <Field label={t.crm.archMoveComment}>
                  <textarea rows={3} value={archComment} onChange={(e) => setArchComment(e.target.value)} placeholder={t.crm.archMoveCommentPh} style={inputStyle} />
                </Field>
              </div>
            )}
            {archErr && <p style={{ margin: '12px 0 0', color: '#9b4e43', fontSize: 11 }}>{archErr}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => void runArchive()} disabled={archBusy}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: archBusy ? 0.7 : 1 }}>
                {archBusy ? t.crm.archBusy : t.crm.archMoveBtn}
              </button>
              <button type="button" onClick={() => setArchiveOpen(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.archMoveCancel}
              </button>
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
                    {/* Имя собственника — закрытые сведения: только администратор */}
                    {isAdmin && d.ownerName ? ` · ${d.ownerName}` : ''}
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

      {/* Блок «Проверить размещение»: поиск этого же объекта на площадках по
          данным карточки (без ручного ввода ссылок) — см. PlacementCheckBlock */}
      {placeId != null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}
          onClick={() => setPlaceId(null)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 860px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <PlacementCheckBlock objectId={placeId} onClose={() => setPlaceId(null)} />
          </div>
        </div>
      )}

      {/* Блок «Данные о доме»: характеристики дома по адресу объекта из
          открытых источников (реестр АИС ППК «ФРТ», капремонт, порталы,
          муниципальные базы, сайт УК, карточки площадок); клиенту уходят
          только значения, подтверждённые агентом — см. HouseDataBlock */}
      {houseDataId != null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}
          onClick={() => setHouseDataId(null)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 860px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <HouseDataBlock objectId={houseDataId} isAdmin={isAdmin} onClose={() => setHouseDataId(null)} onChanged={() => void load()} />
          </div>
        </div>
      )}

      {/* Блок «Юридическая экспертиза объекта» (документы и отчёт). Слоем над
          списком; содержимое зависит от прав сотрудника — см. LegalCheckBlock */}
      {legalId != null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}
          onClick={() => { setLegalId(null); setLegalFocus(null) }}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 780px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <LegalCheckBlock objectId={legalId} focus={legalFocus ?? undefined} onClose={() => { setLegalId(null); setLegalFocus(null) }} />
          </div>
        </div>
      )}

      {/* Блок «Оценка по рынку» — предварительный расчёт по фактическим
          объявлениям рынка (только администратор): диапазон цены, найденные
          аналоги, дата расчёта и предупреждение, что это не отчёт об оценке и
          не официальное заключение — см. MarketValuationBlock */}
      {valuationId != null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}
          onClick={() => setValuationId(null)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 860px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            {/* autoRun: расчёт запускается сразу, если сохранённого отчёта у
                объекта ещё нет (кнопка «Провести оценку по рынку» из списка) —
                иначе показываем последний расчёт и ждём «Обновить расчёт» */}
            <MarketValuationBlock objectId={valuationId} initial={marketReport} autoRun={!marketReport} onClose={() => setValuationId(null)} />
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
                {/* Чужие объекты агент видит в общей базе, но редактирует и
                    публикует только свои: на чужом объекте кнопки
                    «Редактировать» нет — он открывается на просмотр (сервер
                    правку чужого объекта тоже не пропустит) */}
                {isAdmin || ownObjectIds.includes(o.id) ? (
                  <button type="button" onClick={() => void openObject(o.id)}
                    style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                    {t.crm.objEdit}
                  </button>
                ) : (
                  <button type="button" onClick={() => void openObject(o.id)}
                    style={{ flex: 1, border: '1px solid #e1d8ca', borderRadius: 6, background: 'transparent', color: '#8a857b', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                    {t.crm.objView}
                  </button>
                )}
                {isAdmin && (
                  <button type="button" onClick={() => void remove(o.id)}
                    style={{ border: '1px solid #e3cfc7', borderRadius: 6, background: 'transparent', color: '#9b4e43', padding: '8px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                    {t.crm.objDelete}
                  </button>
                )}
              </div>
              {/* «Проверить размещение» — основная кнопка карточки: система
                  сама берёт данные объекта и ищет его на площадках
                  (см. PlacementCheckBlock). Ссылки вручную не нужны. */}
              <button type="button" onClick={() => setPlaceId(o.id)}
                style={{ marginTop: 6, width: '100%', border: 0, borderRadius: 6, background: '#a7814e', color: '#fff', padding: '9px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>
                Проверить размещение
              </button>
              {/* «Провести юридическую экспертизу» — кнопка карточки объекта
                  (модуль экспертизы, см. LegalCheckBlock). Документы, выписка
                  ЕГРН и отчёт — закрытые сведения, поэтому кнопку и блок
                  показываем только администратору: остальным сотрудникам
                  экспертная часть карточки не отображается вовсе. */}
              {isAdmin && (
                <button type="button" onClick={() => { setLegalFocus(null); setLegalId(o.id) }}
                  style={{ marginTop: 6, width: '100%', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '7px 10px', fontSize: 9.5, cursor: 'pointer' }}>
                  Провести юридическую экспертизу
                </button>
              )}
              {/* Две точечные проверки того же экспертного модуля: открывают
                  отчёт сразу на нужном пункте и запускают пересчёт
                  (focus='encumbrances' — обременения по ЕГРН, пункт 4;
                  focus='bankruptcy' — собственник по реестру ЕФРСБ, пункт 6).
                  Отчёт по-прежнему показывает всё, что проверено, — кнопка
                  лишь выделяет нужную часть, см. LegalCheckBlock. */}
              {isAdmin && (
                <button type="button" onClick={() => { setLegalFocus('encumbrances'); setLegalId(o.id) }}
                  style={{ marginTop: 6, width: '100%', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '7px 10px', fontSize: 9.5, cursor: 'pointer' }}>
                  Проверить обременения
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={() => { setLegalFocus('bankruptcy'); setLegalId(o.id) }}
                  style={{ marginTop: 6, width: '100%', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '7px 10px', fontSize: 9.5, cursor: 'pointer' }}>
                  Проверить банкротство собственника
                </button>
              )}
              {/* «Провести оценку по рынку» — администраторский расчёт по
                  фактическим объявлениям «Парсера рынка»: диапазон цены,
                  аналоги, дата расчёта и предупреждение, что это не отчёт об
                  оценке (см. MarketValuationBlock). Расчёт запускается сразу,
                  отчёт сохраняется в закрытой части карточки. */}
              {isAdmin && (
                <button type="button" onClick={() => { setMarketReport(null); setValuationId(o.id) }}
                  style={{ marginTop: 6, width: '100%', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '7px 10px', fontSize: 9.5, cursor: 'pointer' }}>
                  Провести оценку по рынку
                </button>
              )}
              {/* «Искать в открытых источниках» — характеристики дома по
                  адресу объекта из реестра жилищного фонда, программы
                  капремонта, официальных и муниципальных баз, сайта УК и
                  карточек площадок; в карточку и в описание значения попадают
                  только после подтверждения агентом (см. HouseDataBlock) */}
              <button type="button" onClick={() => setHouseDataId(o.id)}
                style={{ marginTop: 6, width: '100%', border: '1px solid #dccdb6', borderRadius: 6, background: '#f6efe4', color: '#8d6b40', padding: '7px 10px', fontSize: 9.5, cursor: 'pointer' }}>
                Искать в открытых источниках
              </button>
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
  /** Открыть блок «Проверить размещение» (поиск объекта на площадках) */
  onOpenSearch: () => void
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

function PlacementBlock({ t, objectId, value, links, busy, err, onRun, onChanged, onOpenSearch }: PlacementBlockProps) {
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
        {/* Основная кнопка карточки — поиск этого же объекта на площадках
            (данные берутся из карточки, ссылки вручную не нужны) */}
        <button
          type="button"
          onClick={onOpenSearch}
          style={{ ...smallBtn, marginLeft: 'auto' }}
        >
          Проверить размещение
        </button>
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={busy || busyRow}
          style={{ ...ghostBtn, opacity: busy ? 0.7 : 1 }}
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

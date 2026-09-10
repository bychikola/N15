'use client'

// ---------------------------------------------------------------------------
// Блок «Проверить размещение» в карточке объекта CRM (открывается кнопкой
// «Проверить размещение», см. CrmObjects). Кнопка сразу запускает проверку:
// сервер сам снимает данные объекта (адрес, город, район, тип, площадь,
// комнаты, этаж, цена, описание, фотографии) и ищет этот же объект на
// площадках — агенту не нужно ничего вводить и привязывать ссылки вручную.
//
// Результат по каждой площадке: найдено/не найдено/проверка недоступна,
// автоматически сформированная ссылка, совпадение адреса и параметров,
// совпадение фотографий, цена, дата публикации и вероятность, что найдено
// именно это объявление.
//
// Площадки без официального API/фида, запрещающие автосбор, показываются как
// «проверка недоступна» с причиной — результат по ним не имитируется
// (сервер: src/lib/placement-search-service.ts).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState, type FC } from 'react'

interface PlacementProbeUi {
  platform: string
  name: string
  status: 'found' | 'notFound' | 'unavailable'
  source: string
  url: string
  listingUrl?: string | null
  reason?: string | null
  match?: number | null
  matchParams?: string[]
  photoMatch?: number | null
  price?: number | null
  publishedAt?: string | null
  probability?: number | null
  title?: string | null
  candidates?: number
}

interface SearchProfileUi {
  query: string
  address: string
  city: string
  district: string
  kind: string
  area: number | null
  rooms: number | null
  floor: number | null
  totalFloors: number | null
  price: number | null
  descriptionChars: number
  photos: number
}

const STATUS_STYLE: Record<PlacementProbeUi['status'], { bg: string; color: string; label: string }> = {
  found: { bg: '#e6efe1', color: '#3f6b34', label: 'Найдено' },
  notFound: { bg: '#efeadf', color: '#817b70', label: 'Не найдено' },
  unavailable: { bg: '#ece8e0', color: '#716b62', label: 'Проверка недоступна' },
}

const SOURCE_LABEL: Record<string, string> = {
  own: 'наша публикация',
  api: 'официальный канал площадки',
  market: 'сохранённые объявления CRM',
  none: '',
}

/** Подписи совпавших признаков (сервер отдаёт коды — как в placements) */
const PARAM_LABEL: Record<string, string> = {
  cadastral: 'кадастровый номер',
  address: 'адрес',
  price: 'цена',
  area: 'площадь',
  rooms: 'комнаты',
  floor: 'этаж',
  photos: 'фотографии',
  description: 'описание',
}

const rub = (v: number): string => new Intl.NumberFormat('ru-RU').format(v)

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmtMoment = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Строка «признак: значение» в подписи снятых с карточки данных */
const Chip: FC<{ label: string; value: string }> = ({ label, value }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, border: '1px solid #e3d9c8', borderRadius: 999, padding: '4px 10px', background: '#fff' }}>
    <span style={{ fontSize: 9, color: '#9b958a', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
    <span style={{ fontSize: 11, color: '#25241f' }}>{value}</span>
  </span>
)

/** Одна площадка: статус, ссылка, совпадения, цена, дата, вероятность */
const ProbeRow: FC<{ probe: PlacementProbeUi }> = ({ probe }) => {
  const pill = STATUS_STYLE[probe.status] || STATUS_STYLE.unavailable
  const linkLabel =
    probe.status === 'found' ? 'Объявление' : probe.status === 'notFound' ? 'Ссылка на площадку' : 'Поиск по параметрам объекта'
  const meta: { label: string; value: string }[] = [
    {
      label: 'Совпадение адреса и параметров',
      value: probe.match != null
        ? `${probe.match}%${probe.matchParams?.length ? ` — ${probe.matchParams.map((p) => PARAM_LABEL[p] || p).join(', ')}` : ''}`
        : '—',
    },
    { label: 'Совпадение фотографий', value: probe.photoMatch != null ? `${probe.photoMatch}%` : '—' },
    { label: 'Цена', value: probe.price != null ? `${rub(probe.price)} ₽` : '—' },
    { label: 'Дата публикации', value: fmtDate(probe.publishedAt) },
    {
      label: 'Вероятность, что это оно',
      value: probe.probability != null ? `${probe.probability}%` : '—',
    },
  ]

  return (
    <div style={{ border: '1px solid #ece5d9', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14, color: '#25241f' }}>{probe.name}</b>
        {SOURCE_LABEL[probe.source] && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>{SOURCE_LABEL[probe.source]}</span>
        )}
        {typeof probe.candidates === 'number' && probe.candidates > 0 && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>просмотрено объявлений: {probe.candidates}</span>
        )}
        <span
          style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, fontSize: 9,
            textTransform: 'uppercase', letterSpacing: '.06em', background: pill.bg, color: pill.color,
          }}
        >
          {pill.label}
        </span>
      </div>

      {probe.title && <div style={{ marginTop: 4, fontSize: 11, color: '#6f6a61' }}>{probe.title}</div>}

      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: '#9b958a', textTransform: 'uppercase', letterSpacing: '.06em' }}>{linkLabel}:</span>
        {probe.url ? (
          <a
            href={probe.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#8d6b40', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {probe.url}
          </a>
        ) : (
          <span style={{ fontSize: 11, color: '#9b958a' }}>—</span>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '4px 14px' }}>
        {meta.map((m) => (
          <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f2ece1', padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: '#9b958a' }}>{m.label}</span>
            <span style={{ fontSize: 11, color: '#25241f', textAlign: 'right' }}>{m.value}</span>
          </div>
        ))}
      </div>

      {probe.reason && (
        <p style={{ margin: '8px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5, fontStyle: 'italic' }}>{probe.reason}</p>
      )}
    </div>
  )
}

export const PlacementCheckBlock: FC<{ objectId: number; onClose: () => void }> = ({ objectId, onClose }) => {
  const [probes, setProbes] = useState<PlacementProbeUi[]>([])
  const [profile, setProfile] = useState<SearchProfileUi | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)

  // Прогон проверки по кнопке: данные объекта снимаются сервером автоматически
  const run = useCallback(async () => {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/objects/check-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId }),
      })
      const data = (await res.json()) as {
        error?: string
        probes?: PlacementProbeUi[]
        profile?: SearchProfileUi
        checkedAt?: string
      }
      if (!res.ok || !data.probes) throw new Error(data.error || '')
      setProbes(data.probes)
      setProfile(data.profile || null)
      setCheckedAt(data.checkedAt || null)
      setSavedOnly(false)
    } catch {
      setErr('Не удалось выполнить проверку размещения')
    } finally {
      setBusy(false)
    }
  }, [objectId])

  // При открытии карточки показываем последний снимок (если он есть), затем
  // сразу запускаем свежую проверку — кнопка уже нажата
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/objects/check-placement?objectId=${objectId}`, { credentials: 'include' })
        if (res.ok) {
          const data = (await res.json()) as { probes?: PlacementProbeUi[]; checkedAt?: string }
          if (alive && data.probes?.length) {
            setProbes(data.probes)
            setCheckedAt(data.checkedAt || null)
            setSavedOnly(true)
          }
        }
      } catch {
        // снимка нет — не мешает свежему прогону
      }
      if (alive) await run()
    })()
    return () => { alive = false }
  }, [objectId, run])

  const found = probes.filter((p) => p.status === 'found').length
  const unavailable = probes.filter((p) => p.status === 'unavailable').length
  const notFound = probes.filter((p) => p.status === 'notFound').length

  const btn: React.CSSProperties = {
    border: 0, borderRadius: 7, background: '#a7814e', color: '#fff',
    padding: '10px 16px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
            Проверка размещения
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#817b70', maxWidth: 560, lineHeight: 1.5 }}>
            Данные объекта сняты с карточки автоматически: адрес, город, район, тип, площадь,
            комнаты, этаж, цена, описание и фотографии. По каждой площадке ищем этот же объект —
            ссылки вручную добавлять не нужно.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void run()} disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Проверяем…' : probes.length ? 'Проверить снова' : 'Проверить размещение'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '10px 14px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}
          >
            Закрыть
          </button>
        </div>
      </div>

      {/* Данные, которые система взяла из карточки без ручного ввода */}
      {profile && (
        <div style={{ marginTop: 14, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Данные объекта для поиска (сняты автоматически)
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip label="Адрес" value={profile.address || '—'} />
            <Chip label="Город" value={profile.city || '—'} />
            <Chip label="Район" value={profile.district || '—'} />
            <Chip label="Тип" value={profile.kind || '—'} />
            <Chip label="Площадь" value={profile.area != null ? `${profile.area} м²` : '—'} />
            <Chip label="Комнаты" value={profile.rooms != null ? String(profile.rooms) : '—'} />
            <Chip label="Этаж" value={profile.floor != null ? `${profile.floor}${profile.totalFloors ? ` / ${profile.totalFloors}` : ''}` : '—'} />
            <Chip label="Цена" value={profile.price != null ? `${rub(profile.price)} ₽` : '—'} />
            <Chip label="Описание" value={profile.descriptionChars ? `${profile.descriptionChars} символов` : '—'} />
            <Chip label="Фотографии" value={String(profile.photos)} />
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: '#9b958a' }}>
            Поисковый запрос: <span style={{ color: '#6f6a61' }}>{profile.query || '—'}</span>
          </div>
        </div>
      )}

      {/* Итог и результаты по площадкам */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, color: found > 0 ? '#3f6b34' : '#25241f' }}>
          {found > 0 ? `Найдено на площадках: ${found}` : 'Совпадений не найдено'}
        </b>
        {notFound > 0 && <span style={{ fontSize: 10, color: '#8a857b' }}>не найдено: {notFound}</span>}
        {unavailable > 0 && <span style={{ fontSize: 10, color: '#8a857b' }}>проверка недоступна: {unavailable}</span>}
        {checkedAt && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>
            {savedOnly ? 'Прошлая проверка: ' : 'Проверено: '}
            {fmtMoment(checkedAt)}
          </span>
        )}
        {err && <span style={{ fontSize: 10, color: '#9b4e43' }}>{err}</span>}
      </div>

      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {busy && !probes.length ? (
          <p style={{ margin: 0, fontSize: 11, color: '#8a857b' }}>Проверяем площадки…</p>
        ) : (
          probes.map((p) => <ProbeRow key={`${p.platform}`} probe={p} />)
        )}
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 10, color: '#9b958a', lineHeight: 1.5 }}>
        Площадки без официального API/фида, запрещающие автоматический поиск, отмечены как
        «проверка недоступна» — результат по ним не выдумывается, а ссылка ведёт на поиск по
        параметрам объекта для проверки вручную. Вероятность — оценка по совпадению признаков
        карточки и фотографий, а не статистический расчёт.
      </p>
    </div>
  )
}

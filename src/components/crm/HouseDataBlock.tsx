'use client'

// ---------------------------------------------------------------------------
// Блок «Данные о доме» в карточке объекта CRM (открывается кнопкой «Искать в
// открытых источниках», см. CrmObjects). Кнопка запускает проверку сразу по
// нескольким источникам: реестр жилищного фонда АИС ППК «ФРТ» (рабочий канал
// к раскрываемым сведениям ГИС ЖКХ) — паспорт дома и раздел «Управление»,
// программа капитального ремонта, официальные порталы (ГИС ЖКХ, НСПД,
// кадастровая карта), муниципальная база города, сайт управляющей организации
// и открытые карточки площадок недвижимости.
//
// Проверка идёт потоком (NDJSON, см. house-data/route.ts), поэтому источники
// появляются в блоке по мере ответа. Пока реестр дом не нашёл, а другие
// источники ещё проверяются, на экране стоит ровно то, что происходит:
// «В источнике ГИС ЖКХ не найдено. Выполняется поиск по другим источникам» —
// общего «данных нет» из-за одного источника не бывает.
//
// По каждому источнику видно: статус (дом найден / не найден / недоступен /
// проверка по ссылке), адрес карточки и степень совпадения адреса, ссылку,
// оператора и дату проверки. У каждого значения характеристики — свой
// источник, ссылка, дата проверки и совпадение адреса. Если источники дают
// разные значения, показываются оба варианта со статусом «Требует проверки»;
// значение с неподтверждённым совпадением адреса не подставляется
// автоматически. Для частного дома или участка поиск идёт по кадастровым и
// муниципальным источникам и открытым карточкам площадок — карточки такого
// дома в ГИС ЖКХ обычно нет.
//
// Пока агент не подтвердил значение, клиенту оно не показывается: кнопка
// «Подтвердить отмеченные» отправляет выбранное в публичную группу
// housePublic (см. сервер: src/lib/house-info-service.ts). Оттуда же —
// перенос значений в поля карточки и абзац в описание объекта.
//
// Права (см. house-data/route.ts): характеристики дома из открытых источников
// получает и смотрит любой сотрудник по любому объекту; подтверждение —
// правка карточки, поэтому оно доступно администратору и агенту, который
// ведёт объект (сервер отдаёт это флагом canApprove — у чужого объекта блок
// подтверждения не показывается вовсе). Кадастровый номер участка по реестру
// видит только администратор.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState, type FC } from 'react'
import {
  ADDRESS_MATCH_SHORT,
  HOUSE_FIELD_STATUS_LABEL,
  HOUSE_RESULT_LABEL,
  HOUSE_SOURCE_KIND_LABEL,
  HOUSE_SOURCE_KIND_ORDER,
  HOUSE_SOURCE_STATUS_LABEL,
  approvedItems,
  formatCheckedAt,
  sourceLine,
  type HouseFieldKey,
  type HouseInfoField,
  type HouseResultStatus,
  type HouseSourceReport,
  type HouseSourceStatus,
  type NormalizedAddress,
} from '@/lib/house-info'

/** Ответ сервера: снимок последней проверки */
interface SavedHouseUi {
  status: HouseResultStatus
  reason: string | null
  query: string
  matchedBy: 'address' | 'cadastral' | null
  house: { id: string; address: string; url: string; updatedAt: string | null; plotCadastral?: string | null } | null
  fields: HouseInfoField[]
  /** Отчёт по источникам: где дом найден, где нет, что недоступно */
  sources?: HouseSourceReport[]
  /** Адрес объекта, разобранный на части */
  address?: NormalizedAddress | null
  /** Частный дом или участок: карточки в ГИС ЖКХ обычно нет */
  privateHouse?: boolean
  checkedAt: string | null
  approved: Record<string, boolean>
  approvedAt: string | null
  approvedBy: string | null
}

/** События потока проверки (см. house-data/route.ts) */
type HouseDataEvent =
  | { type: 'start'; address: NormalizedAddress; privateHouse: boolean }
  | { type: 'source'; source: HouseSourceReport }
  | { type: 'done'; ok: true; canApprove: boolean; saved: SavedHouseUi }
  | { type: 'error'; error: string }

const FIELD_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: '#e6efe1', color: '#3f6b34' },
  conflict: { bg: '#f7e6cf', color: '#a1661f' },
  needsCheck: { bg: '#f7e6cf', color: '#a1661f' },
  notFound: { bg: '#efeadf', color: '#817b70' },
  unavailable: { bg: '#ece8e0', color: '#716b62' },
}

const SOURCE_STATUS_STYLE: Record<HouseSourceStatus, { bg: string; color: string }> = {
  found: { bg: '#e6efe1', color: '#3f6b34' },
  notFound: { bg: '#efeadf', color: '#817b70' },
  unavailable: { bg: '#f0e6e3', color: '#9b4e43' },
  manual: { bg: '#f7e6cf', color: '#a1661f' },
  notApplicable: { bg: '#ece8e0', color: '#716b62' },
}

const fmtMoment = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const btn: React.CSSProperties = {
  border: 0, borderRadius: 7, background: '#a7814e', color: '#fff',
  padding: '10px 16px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62',
  padding: '10px 14px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer',
}

const linkStyle: React.CSSProperties = { color: '#8d6b40', textDecoration: 'underline' }

/** Ссылка на источник: что за ссылка + адрес проверки */
const SourceLink: FC<{ url: string | null; label?: string | null }> = ({ url, label }) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {label || 'открыть источник'}
    </a>
  ) : null

/** Одна характеристика: значение, статус, источник, дата, варианты */
const FieldRow: FC<{
  field: HouseInfoField
  approved: boolean
  onToggle: (key: HouseFieldKey, next: boolean) => void
}> = ({ field, approved, onToggle }) => {
  const pill = FIELD_STATUS_STYLE[field.status] || FIELD_STATUS_STYLE.unavailable
  const variants = field.variants.slice(0, 4)
  const checked = field.status === 'confirmed'

  return (
    <div style={{ border: '1px solid #ece5d9', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12, color: '#25241f' }}>{field.label}</b>
        <span
          style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, fontSize: 9,
            textTransform: 'uppercase', letterSpacing: '.06em', background: pill.bg, color: pill.color,
          }}
        >
          {HOUSE_FIELD_STATUS_LABEL[field.status]}
        </span>
      </div>

      <div style={{ marginTop: 6, fontSize: field.status === 'confirmed' ? 15 : 12, color: field.status === 'confirmed' ? '#25241f' : '#8a857b' }}>
        {field.display}
      </div>

      {/* Варианты источников: у каждого — свой источник, ссылка, дата проверки
          и степень совпадения адреса (значения не смешиваются в одно) */}
      {variants.length > 1 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {variants.map((v, i) => (
            <div key={`${v.sourceCode}-${i}`} style={{ display: 'flex', gap: 8, fontSize: 10, color: '#6f6a61', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <b style={{ color: '#a1661f' }}>{v.value}</b>
              <span>{v.providers.length ? `— ${v.providers.join(', ')}` : `— ${v.sourceName}`}</span>
              {v.where.length > 0 && <span style={{ color: '#9b958a' }}>({v.where.slice(0, 3).join(', ')})</span>}
              <SourceLink url={v.sourceUrl} label={v.sourceCode === 'frt-mkd' ? 'карточка дома' : 'источник'} />
              <span style={{ color: '#9b958a' }}>
                совпадение адреса: {ADDRESS_MATCH_SHORT[v.match.level]} · проверено {formatCheckedAt(v.checkedAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: '#9b958a' }}>
        <span>
          Источник: <span style={{ color: '#6f6a61' }}>{sourceLine(field)}</span>
        </span>
        <span>
          Проверено: <span style={{ color: '#6f6a61' }}>{formatCheckedAt(field.checkedAt)}</span>
        </span>
        <SourceLink url={field.sourceUrl} label="карточка дома в реестре" />
      </div>

      {field.note && (
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5, fontStyle: 'italic' }}>
          {field.note}
        </p>
      )}

      {checked && (
        <label style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#25241f', cursor: 'pointer' }}>
          <input type="checkbox" checked={approved} onChange={(e) => onToggle(field.key, e.target.checked)} />
          Подтвердить — показывать клиенту
        </label>
      )}
    </div>
  )
}

/** Строка отчёта по источнику: статус, ссылка, дата, совпадение адреса */
const SourceRow: FC<{ source: HouseSourceReport }> = ({ source }) => {
  const pill = SOURCE_STATUS_STYLE[source.status] || SOURCE_STATUS_STYLE.notApplicable
  return (
    <div style={{ border: '1px solid #ece5d9', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '3px 9px', borderRadius: 999, fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '.06em', background: pill.bg, color: pill.color,
          }}
        >
          {HOUSE_SOURCE_STATUS_LABEL[source.status]}
        </span>
        <b style={{ fontSize: 11, color: '#25241f' }}>{source.name}</b>
        {source.valuesCount > 0 && (
          <span style={{ fontSize: 10, color: '#9b958a' }}>значений: {source.valuesCount}</span>
        )}
      </div>

      {source.cardAddress && (
        <div style={{ marginTop: 5, fontSize: 10, color: '#6f6a61' }}>
          Адрес карточки: {source.cardAddress}
          {source.match && (
            <span style={{ color: '#9b958a' }}>
              {' '}· совпадение адреса: {ADDRESS_MATCH_SHORT[source.match.level]}
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: '#9b958a' }}>
        <SourceLink url={source.url} label={source.urlLabel} />
        {source.checkedAt && <span>Проверено: <span style={{ color: '#6f6a61' }}>{fmtMoment(source.checkedAt)}</span></span>}
        {source.operator && <span>{source.operator}</span>}
      </div>

      {source.note && (
        <p style={{ margin: '5px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5 }}>{source.note}</p>
      )}
    </div>
  )
}

export const HouseDataBlock: FC<{
  objectId: number
  /** Администратору показываются кадастровые сведения снимка */
  isAdmin: boolean
  onClose: () => void
  onChanged?: () => void
}> = ({
  objectId,
  isAdmin,
  onClose,
  onChanged,
}) => {
  const [saved, setSaved] = useState<SavedHouseUi | null>(null)
  // Живой прогон: источники приходят потоком по мере ответа
  const [live, setLive] = useState<HouseSourceReport[]>([])
  const [liveAddress, setLiveAddress] = useState<NormalizedAddress | null>(null)
  const [livePrivate, setLivePrivate] = useState(false)
  // Подтверждать характеристики (правка карточки) может администратор и агент
  // объекта — решает сервер, до ответа блок подтверждения скрыт
  const [canApprove, setCanApprove] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [applyToCard, setApplyToCard] = useState(true)
  const [toDescription, setToDescription] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [err, setErr] = useState('')

  /** Прогон проверки: адрес снимается с карточки сервером автоматически */
  const run = useCallback(async () => {
    setBusy(true)
    setErr('')
    setMessage('')
    setLive([])
    try {
      const res = await fetch('/api/objects/house-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId }),
      })
      if (!res.ok || !res.body) {
        // Ошибка до начала проверки (нет доступа, не указан объект) — обычный JSON
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || '')
      }

      // Ответ — поток NDJSON: по строке на событие, источники появляются
      // в блоке сразу, а не после конца проверки
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      while (!finished) {
        const chunk = await reader.read()
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          let event: HouseDataEvent
          try {
            event = JSON.parse(line) as HouseDataEvent
          } catch {
            continue
          }
          if (event.type === 'start') {
            setLiveAddress(event.address)
            setLivePrivate(event.privateHouse)
          } else if (event.type === 'source') {
            setLive((prev) => [...prev, event.source])
          } else if (event.type === 'done') {
            finished = true
            setSaved(event.saved)
            setCanApprove(Boolean(event.canApprove))
            setChecked(event.saved.approved || {})
            onChanged?.()
          } else if (event.type === 'error') {
            finished = true
            setErr(event.error)
          }
        }
        if (chunk.done) break
      }
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Не удалось получить данные о доме')
    } finally {
      setBusy(false)
    }
  }, [objectId, onChanged])

  // При открытии показываем последний снимок; если его ещё нет — сразу
  // запускаем проверку
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/objects/house-data?objectId=${objectId}`, { credentials: 'include' })
        if (res.ok) {
          const data = (await res.json()) as { canApprove?: boolean; saved?: SavedHouseUi }
          if (alive && data.saved?.fields?.length) {
            setSaved(data.saved)
            setCanApprove(Boolean(data.canApprove))
            setChecked(data.saved.approved || {})
            return
          }
        }
      } catch {
        // снимка нет — не мешает свежему прогону
      }
      if (alive) await run()
    })()
    return () => { alive = false }
  }, [objectId, run])

  const toggle = (key: HouseFieldKey, next: boolean) => {
    setChecked((prev) => ({ ...prev, [key]: next }))
  }

  const approve = async () => {
    if (!canApprove) return
    const keys = Object.keys(checked).filter((k) => checked[k])
    if (!keys.length) {
      setErr('Отметьте хотя бы одну характеристику')
      return
    }
    setApproving(true)
    setErr('')
    setMessage('')
    try {
      const res = await fetch('/api/objects/house-data/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId, keys, applyToCard, toDescription }),
      })
      const data = (await res.json()) as {
        error?: string
        saved?: SavedHouseUi
        items?: unknown[]
        patch?: Record<string, unknown>
        paragraph?: string
      }
      if (!res.ok || !data.saved) throw new Error(data.error || '')
      setSaved(data.saved)
      setChecked(data.saved.approved || {})
      const parts = [`Подтверждено: ${(data.items || []).length}`]
      if (data.patch && Object.keys(data.patch).length) parts.push('перенесено в карточку')
      if (data.paragraph) parts.push('добавлено в описание')
      setMessage(parts.join(' · '))
      onChanged?.()
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Не удалось подтвердить характеристики')
    } finally {
      setApproving(false)
    }
  }

  const fields = saved?.fields || []
  const confirmedCount = fields.filter((f) => f.status === 'confirmed').length
  const conflictCount = fields.filter((f) => f.status === 'conflict' || f.status === 'needsCheck').length
  const notFoundCount = fields.filter((f) => f.status === 'notFound').length
  const statusLabel: Record<string, string> = HOUSE_RESULT_LABEL
  // Что уже опубликовано клиенту: подтверждённые значения последней проверки
  const published = saved?.approvedAt ? approvedItems(fields, saved.approved, saved.approvedAt) : []

  // Источники: во время прогона — пришедшие потоком, иначе — из снимка
  const sources = busy && live.length ? live : saved?.sources || live
  const address = liveAddress || saved?.address || null
  const isPrivateHouse = livePrivate || Boolean(saved?.privateHouse)

  // Итог во время прогона: пока реестр дом не нашёл, на экране ровно то, что
  // происходит, — поиск продолжается по другим источникам
  const liveFound = sources.some((s) => s.status === 'found')
  const gisMissed = sources.some((s) => s.status === 'notFound' && (s.kind === 'registry' || s.kind === 'overhaul'))
  const liveStatus = liveFound
    ? HOUSE_RESULT_LABEL.found
    : gisMissed
      ? HOUSE_RESULT_LABEL.checkingOthers
      : 'Идёт поиск по открытым источникам…'
  const statusPill = busy
    ? { bg: liveFound ? '#e6efe1' : '#f7e6cf', color: liveFound ? '#3f6b34' : '#a1661f' }
    : { bg: saved?.status === 'found' ? '#e6efe1' : '#efeadf', color: saved?.status === 'found' ? '#3f6b34' : '#817b70' }

  // Группы источников: реестр, капремонт, кадастровые, муниципальные, УК, площадки
  const groups = HOUSE_SOURCE_KIND_ORDER.map((kind) => ({
    kind,
    items: sources.filter((s) => s.kind === kind),
  })).filter((g) => g.items.length > 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
            Данные о доме
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#817b70', maxWidth: 620, lineHeight: 1.5 }}>
            Поиск идёт по нескольким открытым источникам: реестр жилищного фонда АИС ППК «ФРТ» —
            рабочий канал к раскрываемым сведениям ГИС ЖКХ (паспорт дома и управление), программа
            капитального ремонта, официальные порталы, муниципальная база города, сайт управляющей
            организации и открытые карточки площадок недвижимости. Адрес берётся из карточки и
            разбирается на части: город, улица, дом, корпус, строение. У каждого значения — свой
            источник, ссылка, дата проверки и совпадение адреса; расхождение даёт «Требует проверки»,
            а без подтверждённого совпадения адреса значение не подставляется. Клиенту уходят только
            подтверждённые вами характеристики.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void run()} disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Ищем…' : fields.length || sources.length ? 'Искать снова' : 'Искать в открытых источниках'}
          </button>
          <button type="button" onClick={onClose} style={ghostBtn}>Закрыть</button>
        </div>
      </div>

      {/* Адрес: во время прогона — тот, по которому идёт поиск */}
      {(address || saved?.query) && (
        <div style={{ marginTop: 14, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Адрес для поиска
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#25241f' }}>{address?.display || saved?.query || '—'}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: '#9b958a' }}>
            <span>Запрос к реестру: <span style={{ color: '#6f6a61' }}>{address?.query || saved?.query || '—'}</span></span>
            {address?.complete === false && <span style={{ color: '#9b4e43' }}>Не хватает улицы или номера дома</span>}
          </div>
          {isPrivateHouse && (
            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#a1661f', lineHeight: 1.5 }}>
              Частный дом или участок: карточки такого дома в ГИС ЖКХ обычно нет, поэтому сведения
              ищутся по кадастровым источникам, муниципальной базе, сайту управляющей организации и
              открытым карточкам площадок.
            </p>
          )}
        </div>
      )}

      {/* Дом, найденный в реестре: адрес, ссылка, дата актуализации */}
      {saved?.house && (
        <div style={{ marginTop: 12, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Дом в реестре
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#25241f' }}>{saved.house.address || '—'}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: '#9b958a' }}>
            <span>
              <a href={saved.house.url} target="_blank" rel="noopener noreferrer" style={{ color: '#8d6b40', textDecoration: 'underline' }}>
                Открыть карточку дома в реестре
              </a>
            </span>
            <span>Актуализировано в реестре: <span style={{ color: '#6f6a61' }}>{fmtDate(saved.house.updatedAt)}</span></span>
            <span>
              Подтверждён: <span style={{ color: '#6f6a61' }}>
                {saved.matchedBy === 'cadastral' ? 'кадастровым номером' : 'адресом'}
              </span>
            </span>
            {/* Кадастровые сведения — только администратору (сервер их и не
                присылает остальным сотрудникам, здесь — та же проверка) */}
            {isAdmin && saved.house.plotCadastral && (
              <span>Кадастровый номер участка: <span style={{ color: '#6f6a61' }}>{saved.house.plotCadastral}</span></span>
            )}
          </div>
        </div>
      )}

      {/* Итог проверки */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '.06em', background: statusPill.bg, color: statusPill.color,
          }}
        >
          {busy ? 'Проверка идёт' : 'Итог проверки'}
        </span>
        <b style={{ fontSize: 13, color: !busy && saved?.status === 'found' ? '#3f6b34' : '#25241f' }}>
          {busy ? liveStatus : statusLabel[saved?.status || 'unavailable']}
        </b>
        {!busy && saved?.status === 'found' && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>
            найдено: {confirmedCount}
            {conflictCount ? ` · требует проверки: ${conflictCount}` : ''}
            {notFoundCount ? ` · не найдено: ${notFoundCount}` : ''}
          </span>
        )}
        {saved?.checkedAt && (
          <span style={{ fontSize: 10, color: '#8a857b' }}>Проверено: {fmtMoment(saved.checkedAt)}</span>
        )}
        {saved?.approvedAt && (
          <span style={{ fontSize: 10, color: '#3f6b34' }}>
            Подтверждено: {fmtMoment(saved.approvedAt)}{saved.approvedBy ? ` (${saved.approvedBy})` : ''}
          </span>
        )}
        {err && <span style={{ fontSize: 10, color: '#9b4e43' }}>{err}</span>}
        {message && <span style={{ fontSize: 10, color: '#3f6b34' }}>{message}</span>}
      </div>

      {!busy && saved?.reason && (
        <p style={{ margin: '8px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5 }}>{saved.reason}</p>
      )}

      {/* Источники: во время прогона список пополняется на глазах */}
      {(sources.length > 0 || busy) && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Источники — проверено {sources.length}{busy ? ' (поиск продолжается)' : ''}
          </div>
          {sources.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#8a857b' }}>Запрашиваем источники…</p>
          )}
          <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
            {groups.map((g) => (
              <div key={g.kind} style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 10, color: '#9b958a' }}>{HOUSE_SOURCE_KIND_LABEL[g.kind]}</div>
                {g.items.map((s) => <SourceRow key={s.code} source={s} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Характеристики */}
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Характеристики дома
        </div>
        {busy && !fields.length ? (
          <p style={{ margin: 0, fontSize: 11, color: '#8a857b' }}>
            Собираем характеристики из найденных источников…
          </p>
        ) : fields.length ? (
          fields.map((f) => (
            <FieldRow key={f.key} field={f} approved={Boolean(checked[f.key])} onToggle={toggle} />
          ))
        ) : (
          <p style={{ margin: 0, fontSize: 11, color: '#8a857b' }}>
            Характеристик пока нет: нажмите «Искать в открытых источниках».
          </p>
        )}
      </div>

      {/* Подтверждение: до него значения клиенту не показываются. Показываем
          только тому, кому сервер разрешил (администратор и агент объекта):
          у чужого объекта подтверждение — правка чужой карточки, поэтому
          блока нет вовсе */}
      {confirmedCount > 0 && canApprove && (
        <div style={{ marginTop: 14, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Подтверждение агентом
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#25241f', cursor: 'pointer' }}>
              <input type="checkbox" checked={applyToCard} onChange={(e) => setApplyToCard(e.target.checked)} />
              Перенести в поля карточки: год постройки, этажность, материал стен
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#25241f', cursor: 'pointer' }}>
              <input type="checkbox" checked={toDescription} onChange={(e) => setToDescription(e.target.checked)} />
              Добавить подтверждённые характеристики абзацем в описание объекта
            </label>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => void approve()} disabled={approving} style={{ ...btn, opacity: approving ? 0.7 : 1 }}>
              {approving ? 'Сохраняем…' : 'Подтвердить отмеченные'}
            </button>
            <span style={{ fontSize: 10, color: '#9b958a' }}>
              Подтверждённые характеристики попадут на страницу объекта для клиента
            </span>
          </div>
        </div>
      )}

      {/* Что уже показывается клиенту */}
      {published.length > 0 && (
        <div style={{ marginTop: 12, border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
          <div style={{ fontSize: 9, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Показывается клиенту
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {published.map((i) => (
              <div key={i.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f2ece1', padding: '4px 0' }}>
                <span style={{ fontSize: 10, color: '#9b958a' }}>{i.label}</span>
                <span style={{ fontSize: 11, color: '#25241f', textAlign: 'right' }}>
                  {i.value} <span style={{ fontSize: 9, color: '#9b958a' }}>· {i.source}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: '12px 0 0', fontSize: 10, color: '#9b958a', lineHeight: 1.5 }}>
        Источники — официальные открытые сведения: реестр жилищного фонда АИС ППК «Фонд развития
        территорий» (раскрытие данных ГИС ЖКХ, постановление Правительства РФ № 731, приказ Минстроя
        России № 536/пр), официальные порталы, муниципальные базы, сайты управляющих организаций и
        открытые карточки домов. Автоматически собираются только те источники, чьи правила это
        допускают; где сбор запрещён или страница отдаётся скриптом, даётся ссылка на ручную проверку.
        Реестр содержит многоквартирные дома: для частных домов, участков и нежилых строений сведения
        обычно отсутствуют — для них поиск идёт по другим источникам. Значения соседних домов и
        данные с неподтверждённым совпадением адреса система не подставляет.
      </p>
    </div>
  )
}

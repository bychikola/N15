'use client'

// ---------------------------------------------------------------------------
// Блок «Данные о доме» в карточке объекта CRM (открывается кнопкой «Получить
// данные о доме», см. CrmObjects). Кнопка запускает проверку открытого
// реестра АИС ППК «ФРТ» (ГИС ЖКХ): по адресу объекта находится дом, из
// паспорта дома и раздела «Управление» собираются характеристики — год
// постройки, материал стен, этажность, серия, год капитального ремонта,
// управляющая организация, площадь дома.
//
// У каждого значения показаны источник, поставщик данных (уполномоченный
// орган субъекта, управляющая организация) и дата проверки. Если поставщики
// расходятся, значение помечается «Требует проверки» с перечислением
// вариантов; если сведений нет — «Не найдено»; если реестр не ответил —
// «Проверка недоступна». Предположительные данные не подставляются.
//
// Пока агент не подтвердил значение, клиенту оно не показывается: кнопка
// «Подтвердить отмеченные» отправляет выбранное в публичную группу
// housePublic (см. сервер: src/lib/house-info-service.ts). Оттуда же —
// перенос значений в поля карточки и абзац в описание объекта.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState, type FC } from 'react'
import {
  HOUSE_FIELD_STATUS_LABEL,
  HOUSE_RESULT_LABEL,
  approvedItems,
  formatCheckedAt,
  sourceLine,
  type HouseFieldKey,
  type HouseInfoField,
  type HouseResultStatus,
} from '@/lib/house-info'

/** Ответ сервера: снимок последней проверки */
interface SavedHouseUi {
  status: HouseResultStatus
  reason: string | null
  query: string
  matchedBy: 'address' | 'cadastral' | null
  house: { id: string; address: string; url: string; updatedAt: string | null; plotCadastral?: string | null } | null
  fields: HouseInfoField[]
  checkedAt: string | null
  approved: Record<string, boolean>
  approvedAt: string | null
  approvedBy: string | null
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: '#e6efe1', color: '#3f6b34' },
  conflict: { bg: '#f7e6cf', color: '#a1661f' },
  notFound: { bg: '#efeadf', color: '#817b70' },
  unavailable: { bg: '#ece8e0', color: '#716b62' },
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

/** Одна характеристика: значение, статус, источник, дата, варианты */
const FieldRow: FC<{
  field: HouseInfoField
  approved: boolean
  onToggle: (key: HouseFieldKey, next: boolean) => void
}> = ({ field, approved, onToggle }) => {
  const pill = STATUS_STYLE[field.status] || STATUS_STYLE.unavailable
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

      {variants.length > 1 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {variants.map((v) => (
            <div key={`${v.value}`} style={{ display: 'flex', gap: 8, fontSize: 10, color: '#6f6a61', flexWrap: 'wrap' }}>
              <b style={{ color: '#a1661f' }}>{v.value}</b>
              <span>{v.providers.length ? `— ${v.providers.join(', ')}` : '— реестр'}</span>
              {v.where.length > 0 && <span style={{ color: '#9b958a' }}>({v.where.slice(0, 3).join(', ')})</span>}
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
        {field.sourceUrl && (
          <a
            href={field.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#8d6b40', textDecoration: 'underline' }}
          >
            карточка дома в реестре
          </a>
        )}
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

export const HouseDataBlock: FC<{ objectId: number; onClose: () => void; onChanged?: () => void }> = ({
  objectId,
  onClose,
  onChanged,
}) => {
  const [saved, setSaved] = useState<SavedHouseUi | null>(null)
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
    try {
      const res = await fetch('/api/objects/house-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId }),
      })
      const data = (await res.json()) as { error?: string; saved?: SavedHouseUi }
      if (!res.ok || !data.saved) throw new Error(data.error || '')
      setSaved(data.saved)
      setChecked(data.saved.approved || {})
      onChanged?.()
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Не удалось получить данные о доме')
    } finally {
      setBusy(false)
    }
  }, [objectId, onChanged])

  // При открытии показываем последний снимок; если его ещё нет — сразу
  // запускаем проверку (реестр официальный, лишний раз его не дёргаем)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/objects/house-data?objectId=${objectId}`, { credentials: 'include' })
        if (res.ok) {
          const data = (await res.json()) as { saved?: SavedHouseUi }
          if (alive && data.saved?.fields?.length) {
            setSaved(data.saved)
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
  const conflictCount = fields.filter((f) => f.status === 'conflict').length
  const notFoundCount = fields.filter((f) => f.status === 'notFound').length
  const statusLabel: Record<string, string> = HOUSE_RESULT_LABEL
  // Что уже опубликовано клиенту: подтверждённые значения последней проверки
  const published = saved?.approvedAt ? approvedItems(fields, saved.approved, saved.approvedAt) : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>
            Данные о доме
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#817b70', maxWidth: 620, lineHeight: 1.5 }}>
            Характеристики многоквартирного дома из открытого реестра АИС ППК «ФРТ» (ГИС ЖКХ:
            постановление Правительства РФ № 731, приказ Минстроя России № 536/пр). Адрес берётся
            из карточки автоматически. Значения сверяются между поставщиками сведений: расхождение
            помечается «Требует проверки», отсутствие данных — «Не найдено». Клиенту уходят только
            подтверждённые вами характеристики.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void run()} disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Проверяем…' : fields.length ? 'Проверить снова' : 'Получить данные о доме'}
          </button>
          <button type="button" onClick={onClose} style={ghostBtn}>Закрыть</button>
        </div>
      </div>

      {/* Дом, найденный в реестре: адрес, ссылка, дата актуализации */}
      {saved?.house && (
        <div style={{ marginTop: 14, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 10, padding: '12px 14px' }}>
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
            {saved.house.plotCadastral && (
              <span>Кадастровый номер участка: <span style={{ color: '#6f6a61' }}>{saved.house.plotCadastral}</span></span>
            )}
            <span>Поисковый запрос: <span style={{ color: '#6f6a61' }}>{saved.query || '—'}</span></span>
          </div>
        </div>
      )}

      {/* Итог проверки */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, color: saved?.status === 'found' ? '#3f6b34' : '#25241f' }}>
          {statusLabel[saved?.status || 'unavailable']}
        </b>
        {saved?.status === 'found' && (
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

      {saved?.reason && (
        <p style={{ margin: '8px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5 }}>{saved.reason}</p>
      )}

      {/* Характеристики */}
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {busy && !fields.length ? (
          <p style={{ margin: 0, fontSize: 11, color: '#8a857b' }}>Запрашиваем реестр…</p>
        ) : (
          fields.map((f) => (
            <FieldRow key={f.key} field={f} approved={Boolean(checked[f.key])} onToggle={toggle} />
          ))
        )}
      </div>

      {/* Подтверждение: до него значения клиенту не показываются */}
      {confirmedCount > 0 && (
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
        Источник — открытые сведения официального портала ППК «Фонд развития территорий» (ГИС ЖКХ).
        Реестр содержит многоквартирные дома: для частных домов, участков и нежилых строений сведения
        обычно отсутствуют. Поиск портала работает по адресу — при неточном адресе система не
        подставляет данные соседних домов, а просит уточнить улицу и номер.
      </p>
    </div>
  )
}

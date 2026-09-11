'use client'

import Link from 'next/link'
import { useMemo, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { AgentCard, AgentObjectBucket, AgentObjectRow } from '@/lib/agents-service'
import { archiveReasonLabel } from '@/lib/archive'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from '@/lib/districts'

/**
 * Профиль агента в разделе CRM «Агенты»: контакты агента и его объекты по
 * категориям — активные, на модерации, архивные, проданные/закрытые.
 *
 * Фильтры: тип объекта (категория) и тип сделки, статус (категория объекта),
 * район и город, плюс поиск по объекту и адресу. Значения фильтров берём из
 * самих объектов агента — в списке нет пустых вариантов.
 *
 * Права: раздел открыт всем сотрудникам CRM, объекты коллег видны на чтение.
 * Кнопка «Редактировать» показывается только ответственному агенту и
 * администратору (isAdmin или объект в ownObjectIds) и ведёт в раздел
 * «Объекты» с открытой карточкой (?edit=<id>) — права на правку там те же
 * (access коллекции Objects). Персональные данные собственников в строки
 * объектов не попадают (см. src/lib/agents-service.ts).
 */

interface Props {
  t: Dict
  agent: AgentCard
  rows: AgentObjectRow[]
  isAdmin: boolean
  /** id «своих» объектов сотрудника — их он может редактировать */
  ownObjectIds: number[]
}

// Категории объектов в профиле — в порядке показа (см. objectBucket)
const BUCKETS: AgentObjectBucket[] = ['active', 'moderation', 'archive', 'sold']

// Порядок категорий в фильтре «Тип объекта» — как в схеме объектов
const CATEGORIES = ['apartment', 'house', 'townhouse', 'commercial', 'land']

// Типы сделки — как в схеме объектов
const DEAL_TYPES = ['sale', 'rent']

const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out
}

const rub = (v: number) => new Intl.NumberFormat('ru-RU').format(v)

/** Дата «11.09.2026» */
const dateText = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Площадь участка показываем в той единице, в которой её вводил агент */
const areaText = (row: AgentObjectRow): string => {
  if (row.area == null) return ''
  if (row.category === 'land' && row.areaUnit === 'are') {
    const are = row.area / 100
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(are)} соток`
  }
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(row.area)} м²`
}

/** Подпись района в фильтре: у внутригородских добавляем город */
const districtLabel = (value: string): string =>
  (CITY_DISTRICT_OPTIONS as readonly string[]).includes(value) ? `${value} (Владикавказ)` : value

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '10px 12px',
  font: '12px Arial, Helvetica, sans-serif',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  color: '#6f6a61',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  minWidth: 0,
}

const btnGhost: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  background: '#faf7f2',
  color: '#716b62',
  padding: '11px 16px',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

export const CrmAgentProfile: FC<Props> = ({ t, agent, rows, isAdmin, ownObjectIds }) => {
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState('')
  const [category, setCategory] = useState('')
  const [dealType, setDealType] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')

  const bucketLabels: Record<AgentObjectBucket, string> = {
    active: t.crm.agBucketActive,
    moderation: t.crm.agBucketModeration,
    archive: t.crm.agBucketArchive,
    sold: t.crm.agBucketSold,
  }

  // Районы и города — из объектов агента: в списке только те, что есть в базе.
  // Республиканские районы идут первыми (в порядке справочника), затем
  // внутригородские, затем всё остальное.
  const districtOptions = useMemo(() => {
    const values = [...new Set(rows.map((r) => r.district).filter(Boolean))]
    const order = [...DISTRICT_OPTIONS, ...CITY_DISTRICT_OPTIONS]
    return values
      .sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        if (ia !== -1 || ib !== -1) return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
        return a.localeCompare(b, 'ru')
      })
      .map((v) => ({ value: v, label: districtLabel(v) }))
  }, [rows])

  const cityOptions = useMemo(
    () => [...new Set(rows.map((r) => r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [rows],
  )

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((row) => {
      if (bucket && row.bucket !== bucket) return false
      if (category && row.category !== category) return false
      if (dealType && row.type !== dealType) return false
      if (district && row.district !== district) return false
      if (city && row.city !== city) return false
      if (!needle) return true
      return [row.title, row.address, row.city, row.district].join(' ').toLowerCase().includes(needle)
    })
  }, [rows, q, bucket, category, dealType, district, city])

  const canEdit = (row: AgentObjectRow) => isAdmin || ownObjectIds.includes(row.id)

  const filtersActive = Boolean(q.trim() || bucket || category || dealType || district || city)

  const resetFilters = () => {
    setQ('')
    setBucket('')
    setCategory('')
    setDealType('')
    setDistrict('')
    setCity('')
  }

  // Разделы категорий: при выбранном статусе — только он, иначе все
  // непустые. Пустые не показываем, чтобы телефон не листал лишнее.
  const sections = BUCKETS
    .filter((b) => (bucket ? b === bucket : true))
    .map((b) => ({ bucket: b, rows: visible.filter((r) => r.bucket === b) }))
    .filter((s) => s.rows.length > 0)

  return (
    <div>
      <Link href="/crm/agents" style={{ display: 'inline-block', marginBottom: 14, color: '#927046', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {t.crm.agBack}
      </Link>

      {/* Шапка профиля: фото или инициалы, контакты и сводка по объектам */}
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {agent.photo ? (
            <img src={agent.photo} alt="" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
          ) : (
            <span style={{ width: 76, height: 76, borderRadius: '50%', background: '#b38a52', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: "'New Standard', Georgia, serif", fontSize: 26, flex: 'none' }}>
              {agent.initials || '—'}
            </span>
          )}
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>
              {agent.name || `Агент #${agent.id}`}
            </h2>
            <p style={{ margin: '5px 0 0', color: '#817b70', fontSize: 11 }}>
              {agent.position || t.crm.agNoPosition}
            </p>
            <p style={{ margin: '7px 0 0', fontSize: 12 }}>
              {agent.phone ? <a href={`tel:${agent.phone}`} style={{ color: '#25241f' }}>{agent.phone}</a> : <span style={{ color: '#9b958a' }}>{t.crm.agNoPhone}</span>}
              {!agent.isActive && (
                <span style={{ marginLeft: 10, padding: '3px 9px', borderRadius: 999, background: '#efeadf', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {t.crm.agInactive}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Сводка: сколько объектов в каждой категории */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee9e1', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {BUCKETS.map((b) => (
            <div key={b} style={{ flex: '1 1 150px', background: '#faf7f2', border: '1px solid #eee4d5', borderRadius: 10, padding: '12px 14px' }}>
              <span style={{ display: 'block', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {bucketLabels[b]}
              </span>
              <strong style={{ display: 'block', marginTop: 8, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>
                {agent.counts[b]}
              </strong>
            </div>
          ))}
        </div>
      </div>

      <h3 style={{ margin: '0 0 10px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 19 }}>
        {t.crm.agObjectsTitle}
      </h3>

      {/* Фильтры: поиск, тип объекта и сделки, статус, район, город */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5dfd3',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <label style={{ ...labelStyle, flex: '2 1 200px' }}>
          {t.crm.agSearchLabel}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.crm.agSearchObjectsPh} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 160px' }}>
          {t.crm.agFilterType}
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t.categoryLabels[c as keyof typeof t.categoryLabels] ?? c}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 140px' }}>
          {t.crm.agFilterDeal}
          <select value={dealType} onChange={(e) => setDealType(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {DEAL_TYPES.map((d) => (
              <option key={d} value={d}>{t.typeLabels[d as keyof typeof t.typeLabels] ?? d}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 170px' }}>
          {t.crm.agFilterStatus}
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {BUCKETS.map((b) => (
              <option key={b} value={b}>{bucketLabels[b]}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 170px' }}>
          {t.crm.agFilterDistrict}
          <select value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {districtOptions.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 150px' }}>
          {t.crm.agFilterCity}
          <select value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle}>
            <option value="">{t.crm.filterAll}</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        {filtersActive && (
          <button type="button" onClick={resetFilters} style={btnGhost}>
            {t.crm.agResetFilters}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {fmt(t.crm.agFound, visible.length, rows.length)}
        </span>
        <span style={{ fontSize: 10, color: '#9b958a' }}>{t.crm.agEditHint}</span>
      </div>

      {!rows.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agObjectsEmpty}</p>
          <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.agObjectsEmptyText}</p>
        </div>
      ) : !visible.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agNothingFound}</p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.bucket} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 16 }}>
                {bucketLabels[section.bucket]}
              </h4>
              <span style={{ fontSize: 10, color: '#927046' }}>{section.rows.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
              {section.rows.map((row) => (
                <div key={row.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden', background: row.thumb ? undefined : '#f2eadf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {row.thumb ? (
                      <img src={row.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: '#b99a6a', fontSize: 26 }}>⌂</span>
                    )}
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.title}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {t.categoryLabels[row.category as keyof typeof t.categoryLabels] ?? row.category}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f7f4ee', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {t.typeLabels[row.type as keyof typeof t.typeLabels] ?? row.type}
                    </span>
                    <span style={{ fontSize: 9, color: '#817b70' }}>{bucketLabels[row.bucket]}</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
                      {row.price != null ? `${rub(row.price)} ₽` : '—'}
                    </strong>
                    {(row.rooms != null || row.area != null) && (
                      <span style={{ fontSize: 10, color: '#8a857b' }}>
                        {[row.rooms != null ? `${row.rooms} ${t.crm.agRooms}` : '', areaText(row)].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '8px 0 0', color: '#817b70', fontSize: 10, lineHeight: 1.5 }}>
                    {row.address || '—'}
                  </p>
                  {/* У архивных и проданных видно причину переноса — по ней
                      объект потом и восстанавливают в разделе «Архив» */}
                  {row.archiveReason && (
                    <p style={{ margin: '6px 0 0', fontSize: 10, color: '#8d6b40' }}>
                      {t.crm.agArchiveReason}: {archiveReasonLabel(row.archiveReason)}
                    </p>
                  )}
                  <p style={{ margin: '6px 0 0', color: '#9b958a', fontSize: 10 }}>
                    {t.crm.agUpdated}: {dateText(row.at)}
                  </p>
                  <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', gap: 6 }}>
                    {/* Правка — только ответственный агент и администратор:
                        тот же объект в разделе «Объекты» открывается по ?edit= */}
                    {canEdit(row) && (
                      <Link
                        href={`/crm/objects?edit=${row.id}`}
                        style={{ flex: 1, textAlign: 'center', border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62', padding: '9px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', textDecoration: 'none' }}
                      >
                        {t.crm.agEdit}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

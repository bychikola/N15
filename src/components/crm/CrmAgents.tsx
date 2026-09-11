'use client'

import Link from 'next/link'
import { useMemo, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { AgentCard } from '@/lib/agents-service'

/**
 * Раздел CRM «Агенты»: риелторы агентства карточками — фото (или инициалы),
 * имя и фамилия, должность, телефон и количество активных объектов. Карточка
 * ведёт в профиль агента со списком его объектов (/crm/agents/<id>).
 *
 * Раздел открыт всем сотрудникам CRM; клиентам сайта и посетителям он не
 * виден — страница проверяет доступ до отдачи данных (см. src/app/crm/agents).
 * Персональные данные собственников и закрытые документы в раздел не
 * попадают (см. src/lib/agents-service.ts).
 */

interface Props {
  t: Dict
  agents: AgentCard[]
}

// Подстановка %d/%s в строку словаря (как в других разделах CRM)
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out
}

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

export const CrmAgents: FC<Props> = ({ t, agents }) => {
  const [q, setQ] = useState('')

  // Фильтр по имени агента: ищем по имени и фамилии, должности и телефону
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return agents
    return agents.filter((a) =>
      [a.name, a.position, a.phone].join(' ').toLowerCase().includes(needle),
    )
  }, [agents, q])

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
          {t.crm.agTitle}
        </h2>
        <p style={{ margin: '6px 0 0', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
          {t.crm.agSubtitle}
        </p>
      </div>

      {/* Поиск по имени агента */}
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
        <label style={{ ...labelStyle, flex: '1 1 260px' }}>
          {t.crm.agSearchLabel}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.crm.agSearchPh}
            style={inputStyle}
          />
        </label>
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', paddingBottom: 12 }}>
          {fmt(t.crm.agFound, visible.length, agents.length)}
        </span>
      </div>

      {!agents.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agEmpty}</p>
          <p style={{ color: '#9b958a', fontSize: 11, margin: '8px 0 0' }}>{t.crm.agEmptyText}</p>
        </div>
      ) : !visible.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.agNothingFound}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visible.map((agent) => (
            <Link
              key={agent.id}
              href={`/crm/agents/${agent.id}`}
              style={{
                display: 'block',
                background: '#fff',
                border: '1px solid #e5dfd3',
                borderRadius: 12,
                padding: 16,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Фото агента, а без него — инициалы (как на сайте) */}
                {agent.photo ? (
                  <img
                    src={agent.photo}
                    alt=""
                    style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', flex: 'none' }}
                  />
                ) : (
                  <span
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      background: '#b38a52',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: "'New Standard', Georgia, serif",
                      fontSize: 19,
                      flex: 'none',
                    }}
                  >
                    {agent.initials || '—'}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.name || `Агент #${agent.id}`}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, color: '#817b70' }}>
                    {agent.position || t.crm.agNoPosition}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 11, color: agent.phone ? '#25241f' : '#9b958a' }}>
                  {agent.phone || t.crm.agNoPhone}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    {t.crm.agActiveObjects}
                  </span>
                  <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20, color: '#25241f' }}>
                    {agent.counts.active}
                  </strong>
                </div>
                {/* Неактивного агента показываем в списке (за ним остались
                    объекты), но помечаем — новых сделок он не ведёт */}
                {!agent.isActive && (
                  <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: 999, background: '#efeadf', color: '#817b70', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t.crm.agInactive}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#927046', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  {t.crm.agOpenProfile} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

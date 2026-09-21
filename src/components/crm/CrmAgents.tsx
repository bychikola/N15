'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { AgentCard } from '@/lib/agents-service'
import { AgentFormModal } from '@/components/crm/AgentFormModal'

/**
 * Раздел CRM «Агенты»: риелторы агентства карточками — фото (или инициалы),
 * имя и фамилия, должность, телефон и количество активных объектов. Карточка
 * ведёт в профиль агента со списком его объектов (/crm/agents/<id>).
 *
 * Раздел открыт всем сотрудникам CRM; клиентам сайта и посетителям он не
 * виден — страница проверяет доступ до отдачи данных (см. src/app/crm/agents).
 * Персональные данные собственников и закрытые документы в раздел не
 * попадают (см. src/lib/agents-service.ts).
 *
 * Число активных объектов сотрудник видит только у себя: администратор — у
 * всех, агент — на своей карточке (ownAgentIds), у коллег вместо числа
 * прочерк. Сами числа чужих счётчиков страница в пропсы не кладёт.
 *
 * Профиль агента заводят кнопкой «Добавить агента», правят — «Редактировать»
 * на карточке (окно одно и то же, см. CrmAgentFormModal). Кнопки видны только
 * тем, кто вправе менять профили (canManage).
 */

interface Props {
  t: Dict
  agents: AgentCard[]
  /** Право заводить и править профили: админ или сотрудник с разрешением (см. Users.ts) */
  canManage: boolean
  /** Администратору видны счётчики объектов всех агентов (см. описание) */
  isAdmin: boolean
  /** Профили агентов этого сотрудника: на своей карточке счётчик видит и агент */
  ownAgentIds: number[]
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

// Кнопка правки на карточке — та же, что у карточек объектов в профиле агента
const editBtnStyle: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  border: '1px solid #e1d8ca',
  borderRadius: 6,
  background: '#faf7f2',
  color: '#716b62',
  padding: '9px 10px',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

export const CrmAgents: FC<Props> = ({ t, agents, canManage, isAdmin, ownAgentIds }) => {
  const [q, setQ] = useState('')
  const router = useRouter()

  // Окно профиля: null — закрыто, { agent: null } — новый агент,
  // { agent } — правка выбранного. Состояние одним объектом, чтобы окно
  // не могло открыться сразу в двух режимах
  const [modal, setModal] = useState<{ agent: AgentCard | null } | null>(null)

  // Чьи счётчики объектов показываем: администратору — все, агенту — только
  // свои профили (см. описание раздела). Set: карточек в списке десятки
  const shownCounts = useMemo(
    () => (isAdmin ? null : new Set(ownAgentIds)),
    [isAdmin, ownAgentIds],
  )

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
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            {t.crm.agTitle}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
            {t.crm.agSubtitle}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setModal({ agent: null })}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '11px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', flex: 'none' }}
          >
            + {t.crm.agAddButton}
          </button>
        )}
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
            // Карточка-ссылка и кнопка правки — соседи, а не вложены друг в
            // друга: клик по кнопке внутри <a> открывал бы профиль вместо
            // окна правки (и это была бы вложенная интерактивность)
            <div
              key={agent.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                border: '1px solid #e5dfd3',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <Link
                href={`/crm/agents/${agent.id}`}
                style={{ display: 'block', flex: 1, color: 'inherit', textDecoration: 'none' }}
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
                      {!shownCounts || shownCounts.has(agent.id) ? agent.counts.active : '—'}
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

              {/* Правка профиля — тем же окном, что и «Добавить агента» */}
              {canManage && (
                <button type="button" onClick={() => setModal({ agent })} style={editBtnStyle}>
                  {t.crm.agEdit}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Окно профиля: для нового агента — пустая форма, для существующего —
          с его данными (см. AgentFormModal). После сохранения список
          собирается на сервере заново, поэтому обновляем страницу */}
      {modal && (
        <AgentFormModal
          t={t}
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

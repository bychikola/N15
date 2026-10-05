'use client'

import { useEffect, useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'
import type { ObjectSourceState, SourceQueueItem } from '@/lib/object-source-service'
import type { SourceCandidateStatus } from '@/lib/object-sources'
import { OBJECT_SOURCE_POLICY_LABELS } from '@/lib/object-sources'
import { categoryLabel } from '@/lib/object-categories'

/**
 * Раздел CRM «Источники объектов» (только администратор) — очередь объектов
 * из внешних каналов. Первый внешний источник — партнёрский JSON-фид: забор
 * читает согласованный фид по договору, кладёт объекты кандидатами со статусом
 * «Ждёт решения» и ничего не публикует сам. Одобренный кандидат переносится
 * в каталог отдельной кнопкой — объект заводится черновиком, ссылка на
 * источник и партнёрская комиссия остаются закрытыми и клиенту не показываются.
 *
 * Все действия идут маршрутом /api/object-sources: он ещё раз проверяет, что
 * вошедший — администратор, и только потом меняет данные (сервер:
 * src/lib/object-source-service.ts). Повторный забор того же объекта обновляет
 * кандидата, а не создаёт второго, — в ответе забора видно, сколько добавлено
 * и сколько обновлено.
 */

interface Props {
  t: Dict
  sources: ObjectSourceState[]
  queue: SourceQueueItem[]
  /** Активные агенты для выбора ответственного при переносе в каталог */
  agents: { id: number; name: string }[]
  /** Профиль агента учётной записи администратора — предлагается по умолчанию */
  defaultAgentId?: number | null
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5dfd3',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const btnStyle: React.CSSProperties = {
  border: '1px solid #d9d1c4',
  borderRadius: 8,
  background: '#fff',
  color: '#25241f',
  padding: '9px 14px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  cursor: 'pointer',
  minHeight: 44,
}

const btnGold: React.CSSProperties = {
  ...btnStyle,
  border: 0,
  background: '#a7814e',
  color: '#fff',
}

const chipStyle = (tone: 'ok' | 'warn' | 'muted' | 'bad'): React.CSSProperties => {
  const tones = {
    ok: { background: '#eef3e6', color: '#4e7a3a' },
    warn: { background: '#fbf3e6', color: '#8d6b40' },
    muted: { background: '#efeadf', color: '#817b70' },
    bad: { background: '#f6e7e4', color: '#9b4e43' },
  }
  return {
    ...tones[tone],
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    whiteSpace: 'nowrap',
  }
}

const dateText = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const money = (v: number | null): string => (v == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(v)} ₽`)

export const SourceQueueBoard: FC<Props> = ({ t, sources, queue, agents, defaultAgentId }) => {
  const router = useRouter()
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<SourceCandidateStatus | 'all'>('pending')
  const [publishTarget, setPublishTarget] = useState<SourceQueueItem | null>(null)
  const [publishAgent, setPublishAgent] = useState<number | null>(null)

  // Модалка подтверждения закрывается Esc — как и кликом по подложке и крестиком
  useEffect(() => {
    if (!publishTarget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPublishTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [publishTarget])

  const statusLabel = (status: SourceCandidateStatus): string =>
    status === 'pending'
      ? t.crm.srcStatusPending
      : status === 'approved'
        ? t.crm.srcStatusApproved
        : status === 'rejected'
          ? t.crm.srcStatusRejected
          : t.crm.srcStatusPublished

  const act = async (key: string, body: Record<string, unknown>): Promise<{ error?: string; import?: { message?: string } } | null> => {
    if (busy) return null
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/object-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; import?: { message?: string } } | null
      if (!res.ok) {
        setError(data?.error || t.crm.srcActionFailed)
        return null
      }
      router.refresh()
      return data
    } catch {
      setError(t.crm.srcActionFailed)
      return null
    } finally {
      setBusy('')
    }
  }

  const runImport = async (slug: string) => {
    const data = await act(`import:${slug}`, { action: 'import', slug })
    if (data) setNotice(data.import?.message || t.crm.srcImportFailed)
  }

  const decide = async (id: number | string, decision: 'approved' | 'rejected') => {
    await act(`decide:${id}`, { action: 'decide', candidateId: id, decision })
  }

  // Открытие подтверждения переноса: сразу предлагаем ответственного агента —
  // профиль администратора, если он есть, иначе первого активного агента
  const openPublish = (row: SourceQueueItem) => {
    const preferred =
      defaultAgentId != null && agents.some((a) => a.id === defaultAgentId)
        ? defaultAgentId
        : agents[0]?.id ?? null
    setPublishAgent(preferred)
    setPublishTarget(row)
  }

  const confirmPublish = async () => {
    if (!publishTarget || !publishAgent) return
    const data = await act(`publish:${publishTarget.id}`, {
      action: 'publish',
      candidateId: publishTarget.id,
      agentId: publishAgent,
    })
    if (data) {
      setPublishTarget(null)
      setNotice(t.crm.srcPublished)
    }
  }

  const filters: { value: SourceCandidateStatus | 'all'; label: string }[] = [
    { value: 'pending', label: t.crm.srcFilterPending },
    { value: 'approved', label: t.crm.srcFilterApproved },
    { value: 'all', label: t.crm.srcFilterAll },
  ]
  const rows = queue.filter((q) => filter === 'all' || q.status === filter)
  // Каналы забора: ручной ввод карточку заводит человек, в очереди он не участвует
  const channels = sources.filter((s) => s.allowed && s.kind !== 'manual')

  return (
    <div>
      {error && <p style={{ margin: '0 0 12px', color: '#9b4e43', fontSize: 12 }}>{error}</p>}
      {notice && <p style={{ margin: '0 0 12px', color: '#3f6b34', fontSize: 12 }}>{notice}</p>}

      {/* Каналы забора: что подключено, что реализовано и что мешает забору */}
      <div style={{ ...cardStyle, background: '#fdfbf7' }}>
        <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
          {t.crm.srcSourcesTitle}
        </div>
        {channels.map((s) => {
          const importing = busy === `import:${s.slug}`
          return (
            <div key={s.slug} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f0e8da' }}>
              <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                <div style={{ fontSize: 13, color: '#25241f', fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#817b70', lineHeight: 1.5 }}>{s.summary}</div>
              </div>
              <span style={chipStyle(s.allowed ? 'ok' : 'bad')}>{OBJECT_SOURCE_POLICY_LABELS[s.policy]}</span>
              <span style={chipStyle(s.enabled ? 'ok' : 'muted')}>{s.enabled ? t.crm.srcEnabled : t.crm.srcDisabled}</span>
              <span style={chipStyle(s.channelReady ? 'ok' : 'warn')}>
                {s.channelReady ? t.crm.srcChannelReady : t.crm.srcChannelNotReady}
              </span>
              {s.credentials.length > 0 && (
                <span style={chipStyle(s.configured ? 'ok' : 'warn')}>
                  {s.configured ? t.crm.srcConfigured : t.crm.srcNotConfigured}
                </span>
              )}
              <button
                type="button"
                onClick={() => void runImport(s.slug)}
                disabled={!s.canImport || importing || Boolean(busy)}
                title={s.canImport ? '' : s.importReason}
                style={{ ...btnStyle, marginLeft: 'auto', opacity: !s.canImport || busy ? 0.45 : 1, cursor: s.canImport ? 'pointer' : 'not-allowed' }}
              >
                {importing ? t.crm.srcImporting : t.crm.srcImport}
              </button>
            </div>
          )
        })}
      </div>

      {/* Очередь кандидатов: решение и перенос в каталог */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {filters.map((f) => {
          const active = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              style={{
                border: `1px solid ${active ? '#a7814e' : '#e1d8ca'}`,
                borderRadius: 999,
                background: active ? '#a7814e' : '#fff',
                color: active ? '#fff' : '#716b62',
                padding: '9px 14px',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {f.label}
            </button>
          )
        })}
        <span style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', alignSelf: 'center', marginLeft: 'auto' }}>
          {t.crm.srcFound.replace('%d', String(rows.length))}
        </span>
      </div>

      {!rows.length ? (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#817b70', fontSize: 13, margin: 0 }}>{t.crm.srcEmpty}</p>
        </div>
      ) : (
        rows.map((row) => {
          const isPending = row.status === 'pending'
          const isApproved = row.status === 'approved'
          const isPublished = row.status === 'published'
          const areaLine = [
            row.area != null ? `${row.area} м²` : '',
            row.rooms != null ? `${row.rooms} ${t.crm.agRooms}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
                <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 18 }}>
                  {row.title || `№${row.id}`}
                </strong>
                <span style={chipStyle(isPublished ? 'ok' : isApproved ? 'warn' : 'muted')}>{statusLabel(row.status)}</span>
                <span style={{ fontSize: 11, color: '#817b70' }}>
                  {row.sourceName} · {money(row.price)}
                  {areaLine ? ` · ${areaLine}` : ''}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#817b70' }}>
                  {t.crm.srcReceivedAt}: {dateText(row.importedAt)}
                  {row.actualAt ? ` · ${t.crm.srcActualAt}: ${dateText(row.actualAt)}` : ''}
                </span>
              </div>

              <div style={{ fontSize: 12, color: '#25241f', lineHeight: 1.6, marginBottom: 8 }}>
                {row.region && (
                  <div>
                    <strong>{t.crm.srcRegion}:</strong> {row.region}
                  </div>
                )}
                {(row.objectType || row.dealType) && (
                  <div>
                    {row.objectType && (
                      <>
                        <strong>{t.crm.srcObjectType}:</strong> {categoryLabel(row.objectType)}
                      </>
                    )}
                    {row.objectType && row.dealType ? ' · ' : ''}
                    {row.dealType && (
                      <>
                        <strong>{t.crm.srcDealType}:</strong>{' '}
                        {row.dealType === 'rent' ? t.crm.srcDealRent : t.crm.srcDealSale}
                      </>
                    )}
                  </div>
                )}
                <div>
                  <strong>{t.crm.srcAddress}:</strong> {row.address || '—'}
                </div>
                {row.externalId && (
                  <div style={{ color: '#716b62' }}>
                    {t.crm.srcExternalId}: {row.externalId}
                  </div>
                )}
              </div>

              {row.photos.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                    {t.crm.srcPhotos} — {row.photos.length}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {row.photos.map((p) => (
                      <img
                        key={p}
                        src={p}
                        alt=""
                        style={{ width: 92, height: 69, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5dfd3' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {row.description && (
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#454340', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{row.description}</p>
              )}

              {/* Закрытые поля источника — служебные, клиенту сайта не показываются */}
              {(row.url || row.commission) && (
                <div style={{ border: '1px solid #f0e8da', borderRadius: 10, padding: '8px 12px', marginBottom: 10, background: '#fdfbf7', fontSize: 11, color: '#716b62' }}>
                  <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                    {t.crm.srcPrivateHint}
                  </div>
                  {row.url && (
                    <div>
                      <strong>{t.crm.srcUrl}:</strong>{' '}
                      <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: '#927046' }}>
                        {row.url}
                      </a>
                    </div>
                  )}
                  {row.commission && (
                    <div>
                      <strong>{t.crm.srcCommission}:</strong> {row.commission}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {isPending && (
                  <>
                    <button type="button" onClick={() => void decide(row.id, 'approved')} disabled={Boolean(busy)} style={btnGold}>
                      {t.crm.srcApprove}
                    </button>
                    <button type="button" onClick={() => void decide(row.id, 'rejected')} disabled={Boolean(busy)} style={btnStyle}>
                      {t.crm.srcReject}
                    </button>
                  </>
                )}
                {isApproved && (
                  <button type="button" onClick={() => openPublish(row)} disabled={Boolean(busy)} style={{ ...btnGold, marginLeft: 'auto' }}>
                    {t.crm.srcPublish}
                  </button>
                )}
                {isPublished && row.publishedObject && (
                  <a href={`/crm/objects?edit=${row.publishedObject}`} style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}>
                    {t.crm.srcOpenObject}
                  </a>
                )}
              </div>
            </div>
          )
        })
      )}

      {publishTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.crm.srcPublishConfirmTitle}
          onClick={() => setPublishTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(35,33,28,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 20, width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 19, flex: 1 }}>
                {t.crm.srcPublishConfirmTitle}
              </strong>
              <button
                type="button"
                aria-label={t.crm.srcCancel}
                onClick={() => setPublishTarget(null)}
                style={{ border: 0, background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: '#817b70', minWidth: 44, minHeight: 44 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#25241f', fontWeight: 600 }}>
              {publishTarget.title || `№${publishTarget.id}`}
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#716b62', lineHeight: 1.6 }}>{t.crm.srcPublishConfirmText}</p>
            {/* Ответственный агент обязателен для нового объекта: без него
                сервер отклоняет создание (validateResponsibleAgent) */}
            <label style={{ display: 'block', fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {t.crm.srcPublishAgent}
            </label>
            <select
              value={publishAgent ?? ''}
              onChange={(e) => setPublishAgent(e.target.value ? Number(e.target.value) : null)}
              disabled={Boolean(busy) || !agents.length}
              style={{ width: '100%', minHeight: 44, border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '9px 12px', fontSize: 12, marginBottom: 6 }}
            >
              {!agents.length && <option value="">{t.crm.srcPublishNoAgents}</option>}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: '#817b70', lineHeight: 1.5 }}>{t.crm.srcPublishAgentHint}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setPublishTarget(null)} disabled={Boolean(busy)} style={btnStyle}>
                {t.crm.srcCancel}
              </button>
              <button
                type="button"
                onClick={() => void confirmPublish()}
                disabled={Boolean(busy) || !publishAgent}
                style={{ ...btnGold, opacity: busy || !publishAgent ? 0.6 : 1 }}
              >
                {busy ? t.crm.srcImporting : t.crm.srcPublishConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

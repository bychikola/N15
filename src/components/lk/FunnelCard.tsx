import type { Dict } from '@/i18n/dictionaries'

export interface FunnelApplication {
  id: number
  status: string
  type: string
  createdAt: string
  clientName: string
  clientPhone?: string
  objectTitle?: string
  objectId?: number
  objectPrice?: number
  lastText?: string
  lastActionAt?: string
  unread: number
}

export const STAGES: { value: string; labelKey: string }[] = [
  { value: 'unsorted', labelKey: 'crm.stageUnsorted' },
  { value: 'new', labelKey: 'crm.stageNew' },
  { value: 'call', labelKey: 'crm.stageCall' },
  { value: 'showing', labelKey: 'crm.stageShowing' },
  { value: 'negotiation', labelKey: 'crm.stageNegotiation' },
  { value: 'deal', labelKey: 'crm.stageDeal' },
  { value: 'closed', labelKey: 'crm.stageClosed' },
  { value: 'rejected', labelKey: 'crm.stageRejected' },
]

export function stageLabel(t: Dict, stage: string): string {
  const found = STAGES.find((s) => s.value === stage)
  if (!found) return stage
  const key = found.labelKey
  return (t.crm as unknown as Record<string, string>)[key.split('.')[1]] || stage
}

const typeKeys: Record<string, string> = {
  viewing: 'Просмотр', callback: 'Обратный звонок', mortgage: 'Ипотека', consultation: 'Консультация',
}

interface Props {
  app: FunnelApplication
  lang: string
  t: Dict
  onMoveLeft?: () => void
  onMoveRight?: () => void
  onOpenChat?: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
}

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 16,
  color: '#25241f', cursor: 'grab', boxShadow: '0 1px 2px rgba(37,36,31,.04)',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-block', padding: '4px 8px', borderRadius: 999, background: '#f2eadf',
  color: '#8d6b40', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em',
}

const actionBtn: React.CSSProperties = {
  border: '1px solid #e1d8ca', borderRadius: 6, background: '#faf7f2', color: '#716b62',
  padding: '6px 10px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer',
}

export default function FunnelCard({ app, lang, t, onMoveLeft, onMoveRight, onOpenChat, canMoveLeft, canMoveRight }: Props) {
  const lastAction = app.lastActionAt || app.createdAt
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <a
          href={app.objectId ? `/${lang}/catalog/${app.objectId}` : undefined}
          onClick={(e) => { e.stopPropagation(); if (!app.objectId) { e.preventDefault(); onOpenChat?.() } }}
          style={{ fontWeight: 600, fontSize: 13, color: '#25241f', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {app.objectTitle || `Заявка #${app.id}`}
        </a>
        {app.unread > 0 && (
          <span style={{ flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: '#a7814e', color: '#fff', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {app.unread}
          </span>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: '#25241f' }}>
        {app.clientName}
        {app.clientPhone && (
          <a href={`tel:${app.clientPhone.replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()} style={{ color: '#8d6b40', marginLeft: 6, textDecoration: 'none' }}>
            {app.clientPhone}
          </a>
        )}
      </div>

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        <span style={pillStyle}>{typeKeys[app.type] || app.type}</span>
        <span>{t.crm.updated}: {new Date(lastAction).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}</span>
      </div>

      {app.lastText && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#8a857b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          «{app.lastText}»
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee9e1', display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* stopPropagation: кнопки не должны проваливаться в клик по карточке (открытие чата) */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveLeft?.() }} disabled={!canMoveLeft} aria-label={t.lkFunnel.moveLeft} style={{ ...actionBtn, opacity: canMoveLeft ? 1 : 0.3 }}>
          ←
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveRight?.() }} disabled={!canMoveRight} aria-label={t.lkFunnel.moveRight} style={{ ...actionBtn, opacity: canMoveRight ? 1 : 0.3 }}>
          →
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenChat?.() }} style={{ ...actionBtn, marginLeft: 'auto' }}>
          {t.crm.chat}
        </button>
        {app.clientPhone && (
          <a href={`tel:${app.clientPhone.replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()} style={{ ...actionBtn, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ☎ {t.crm.call}
          </a>
        )}
      </div>
    </div>
  )
}

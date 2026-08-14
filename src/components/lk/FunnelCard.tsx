import type { Dict } from '@/i18n/dictionaries'
import Link from 'next/link'

export interface FunnelApplication {
  id: number
  status: string
  type: string
  createdAt: string
  clientName: string
  clientPhone?: string
  objectTitle?: string
  objectId?: number
  lastText?: string
  unread: number
}

export const STAGES: { value: string; labelKey: string }[] = [
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
  return (t.crm as Record<string, string>)[key.split('.')[1]] || stage
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
  canMoveLeft: boolean
  canMoveRight: boolean
}

export default function FunnelCard({ app, lang, t, onMoveLeft, onMoveRight, canMoveLeft, canMoveRight }: Props) {
  return (
    <div className="relative bg-[var(--n15-black)] border border-[var(--n15-gold)]/15 hover:border-[var(--n15-gold)]/40 p-4 transition-all duration-300 cursor-grab active:cursor-grabbing shadow-[0_24px_48px_-32px_rgba(63,17,22,0.2)]">
      {app.unread > 0 && (
        <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-[var(--n15-gold)] text-[var(--on-accent)] text-[11px] font-semibold flex items-center justify-center">
          {app.unread}
        </span>
      )}

      <Link
        href={app.objectId ? `/${lang}/catalog/${app.objectId}` : `/${lang}/lk/messages/${app.id}`}
        className="block text-sm text-[var(--n15-gold)] hover:underline pr-8"
        onClick={(e) => e.stopPropagation()}
      >
        {app.objectTitle || `${t.lkChat.requestCard} #${app.id}`}
      </Link>

      <div className="text-xs text-[var(--n15-white)] mt-1.5 truncate">
        {app.clientName}
        {app.clientPhone && <span className="text-[var(--n15-muted)]"> · {app.clientPhone}</span>}
      </div>

      <div className="text-[10px] tracking-[0.15em] uppercase text-[var(--n15-muted)] mt-1.5">
        {typeKeys[app.type] || app.type} · {new Date(app.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}
      </div>

      {app.lastText && (
        <div className="text-xs text-[var(--n15-muted)] mt-2 truncate">«{app.lastText}»</div>
      )}

      {/* Touch-стрелки: видимы только на устройствах с coarse-указателем */}
      <div className="funnel-arrows mt-3 pt-3 border-t border-[var(--n15-gold)]/10">
        <button
          type="button"
          onClick={(e) => {
            // Карточка лежит в кликабельной обёртке на чат — стрелки не должны
            // уводить в чат, только двигать стадию
            e.preventDefault()
            e.stopPropagation()
            onMoveLeft?.()
          }}
          disabled={!canMoveLeft}
          aria-label={t.lkFunnel.moveLeft}
          className="material-symbols-outlined text-base text-[var(--n15-gold)] disabled:opacity-25 disabled:cursor-default cursor-pointer"
        >
          chevron_left
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onMoveRight?.()
          }}
          disabled={!canMoveRight}
          aria-label={t.lkFunnel.moveRight}
          className="material-symbols-outlined text-base text-[var(--n15-gold)] disabled:opacity-25 disabled:cursor-default cursor-pointer ml-2"
        >
          chevron_right
        </button>
      </div>
    </div>
  )
}

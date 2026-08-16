'use client'

import { useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import FunnelBoard from '@/components/lk/FunnelBoard'
import LeadsList from './LeadsList'

export default function LeadsView({ t }: { t: Dict }) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  const btn = (active: boolean): React.CSSProperties => ({
    border: '1px solid #d9d1c4', borderRadius: 7, background: active ? '#a7814e' : '#fff',
    color: active ? '#fff' : '#716b62', padding: '8px 14px', fontSize: 10, textTransform: 'uppercase',
    letterSpacing: '.08em', cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setView('kanban')} style={btn(view === 'kanban')}>{t.crm.viewKanban}</button>
        <button type="button" onClick={() => setView('list')} style={btn(view === 'list')}>{t.crm.viewList}</button>
      </div>
      {view === 'kanban' ? <FunnelBoard lang="ru" /> : <LeadsList />}
    </div>
  )
}

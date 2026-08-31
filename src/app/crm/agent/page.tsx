import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import AgentChat from '@/components/crm/AgentChat'

export const dynamic = 'force-dynamic'

export default async function CrmAgentPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || !user.agentAccess) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="agent">
      <AgentChat />
    </CrmShell>
  )
}

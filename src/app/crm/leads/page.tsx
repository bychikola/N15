import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import LeadsView from '@/components/crm/LeadsView'

export const dynamic = 'force-dynamic'

export default async function CrmLeadsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="leads">
      <LeadsView t={t} />
    </CrmShell>
  )
}

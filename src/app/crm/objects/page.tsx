import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmObjects } from '@/components/crm/CrmObjects'

export const dynamic = 'force-dynamic'

export default async function CrmObjectsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="objects">
      <CrmObjects t={t} isAdmin={user.role === 'admin'} />
    </CrmShell>
  )
}

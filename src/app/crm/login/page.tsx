import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmLogin } from '@/components/crm/CrmLogin'

export const dynamic = 'force-dynamic'

export default async function CrmLoginPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (user && canAccessCrm(user)) {
    redirect('/crm')
  }
  return <CrmLogin t={t} />
}

import { notFound, redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import CustomerCard from '@/components/crm/CustomerCard'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CrmCustomerPage({ params }: PageProps) {
  const { id } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  const customerId = parseInt(id, 10)
  if (!Number.isFinite(customerId)) notFound()
  return (
    <CrmShell user={user} t={t} active="customers">
      <CustomerCard id={customerId} />
    </CrmShell>
  )
}

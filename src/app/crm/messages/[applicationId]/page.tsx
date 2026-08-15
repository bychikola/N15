import { notFound, redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import ChatThread from '@/components/lk/ChatThread'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ applicationId: string }>
}

export default async function CrmChatPage({ params }: PageProps) {
  const { applicationId } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  const id = parseInt(applicationId, 10)
  if (!Number.isFinite(id)) notFound()
  return (
    <CrmShell user={user} t={t} active="messages">
      <ChatThread applicationId={id} lang="ru" variant="crm" />
    </CrmShell>
  )
}

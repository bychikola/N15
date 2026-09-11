import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmArchive } from '@/components/crm/CrmArchive'
import { loadArchiveBoard } from '@/lib/archive-service'

export const dynamic = 'force-dynamic'

/** «Архив объектов» — объекты, снятые с продажи: остаются в базе, но скрыты
 *  с сайта и с площадок публикации (см. src/lib/archive.ts). Раздел виден
 *  только авторизованным сотрудникам CRM. */
export default async function CrmArchivePage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  const payload = await getPayload({ config })
  const rows = await loadArchiveBoard(payload)

  // «Свои» объекты агента: восстановить объект может его агент или админ
  // (то же правило, что у правки объектов в коллекции Objects)
  const ownObjectIds: number[] = []
  if (user.role !== 'admin') {
    const agentsRes = await payload.find({
      collection: 'agents',
      where: { user: { equals: user.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const myAgentIds = agentsRes.docs.map((a) => a.id as number)
    if (myAgentIds.length) {
      for (const row of rows) {
        if (row.agentId != null && myAgentIds.includes(row.agentId)) ownObjectIds.push(row.id)
      }
    }
  }

  return (
    <CrmShell user={user} t={t} active="archive">
      <CrmArchive t={t} rows={rows} isAdmin={user.role === 'admin'} ownObjectIds={ownObjectIds} />
    </CrmShell>
  )
}

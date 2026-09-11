import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmAgentProfile } from '@/components/crm/CrmAgentProfile'
import { loadAgentProfile } from '@/lib/agents-service'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Профиль агента в разделе CRM «Агенты»: контакты и объекты по категориям —
 * активные, на модерации, архивные, проданные/закрытые — с фильтрами по типу,
 * статусу, району и городу.
 *
 * Раздел открыт всем сотрудникам CRM, поэтому объекты агента сотрудник видит
 * на чтение. Править их может только ответственный агент и администратор:
 * кнопка «Редактировать» показывается, когда профиль агента привязан к учётной
 * записи сотрудника (agents.user — то же правило, что в access коллекции
 * Objects), администратору — всегда.
 */
export default async function CrmAgentProfilePage({ params }: PageProps) {
  const { id } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  const payload = await getPayload({ config })
  const agentId = Number(id)
  const profile = Number.isFinite(agentId) && agentId > 0
    ? await loadAgentProfile(payload, agentId)
    : null

  // Свои объекты: у агента — объекты его профиля (agents.user), у админа — все.
  // Профиль агента не найден (удалён в другой вкладке) — показываем заглушку,
  // а не ошибку сервера.
  let ownObjectIds: number[] = []
  if (profile) {
    if (user.role === 'admin') {
      ownObjectIds = profile.rows.map((row) => row.id)
    } else {
      const myAgents = await payload.find({
        collection: 'agents',
        where: { user: { equals: user.id } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      if (myAgents.docs.some((a) => (a.id as number) === profile.agent.id)) {
        ownObjectIds = profile.rows.map((row) => row.id)
      }
    }
  }

  return (
    <CrmShell user={user} t={t} active="agents">
      {profile ? (
        <CrmAgentProfile
          t={t}
          agent={profile.agent}
          rows={profile.rows}
          isAdmin={user.role === 'admin'}
          ownObjectIds={ownObjectIds}
        />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ color: '#25241f', fontSize: 15, margin: 0 }}>{t.crm.agProfileMissing}</p>
          <p style={{ color: '#817b70', fontSize: 11, margin: '8px 0 16px' }}>{t.crm.agProfileMissingText}</p>
          <Link href="/crm/agents" style={{ color: '#927046', fontSize: 11 }}>
            {t.crm.agBackToList}
          </Link>
        </div>
      )}
    </CrmShell>
  )
}

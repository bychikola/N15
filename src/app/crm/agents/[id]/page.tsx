import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmAgentProfile } from '@/components/crm/CrmAgentProfile'
import { emptyAgentCounts, loadAgentProfile } from '@/lib/agents-service'
import { agentProfileIds } from '@/lib/object-access'

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
 *
 * Количество объектов — закрытое сведение: числа по категориям и счётчики
 * списка видит администратор и сам агент в своём профиле. В чужом профиле
 * числа не показываются и в пропсы не попадают.
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

  // Свои объекты: у админа — все, у сотрудника — объекты его профиля
  // (agents.user) и те, что он завёл сам (createdBy): заведённый объект
  // остаётся доступен автору, даже если ведение передали другому агенту —
  // то же правило, что и на сервере (см. src/lib/object-access.ts).
  // Профиль агента не найден (удалён в другой вкладке) — показываем заглушку,
  // а не ошибку сервера.
  let ownObjectIds: number[] = []
  // Счётчики объектов профиля: администратору — всегда, агенту — только в
  // своём профиле (в чужом числа не показываем, см. шапку файла)
  let countsVisible = user.role === 'admin'
  if (profile) {
    if (user.role === 'admin') {
      ownObjectIds = profile.rows.map((row) => row.id)
    } else {
      const myAgentIds = await agentProfileIds(payload, user.id)
      const myProfile = myAgentIds.has(profile.agent.id)
      countsVisible = myProfile
      ownObjectIds = profile.rows
        .filter((row) => myProfile || (row.authorId != null && String(row.authorId) === String(user.id)))
        .map((row) => row.id)
    }
  }


  return (
    <CrmShell user={user} t={t} active="agents">
      {profile ? (
        <CrmAgentProfile
          t={t}
          /* Чужой профиль: числа по категориям — закрытое сведение, в пропсы
             их не кладём (клиентская часть получает их как есть). Строки
             объектов остаются: список коллег команда видит на чтение */
          agent={countsVisible ? profile.agent : { ...profile.agent, counts: emptyAgentCounts() }}
          rows={profile.rows}
          isAdmin={user.role === 'admin'}
          ownObjectIds={ownObjectIds}
          countsVisible={countsVisible}
          /* Правка самого профиля — то же право, что у «Добавить агента»
             в списке: админ или сотрудник с галочкой «Может добавлять агентов» */
          canManage={user.role === 'admin' || user.canManageAgents}
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

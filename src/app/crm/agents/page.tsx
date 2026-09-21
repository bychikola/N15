import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmAgents } from '@/components/crm/CrmAgents'
import { emptyAgentCounts, loadAgentRoster } from '@/lib/agents-service'
import { agentProfileIds } from '@/lib/object-access'

export const dynamic = 'force-dynamic'

/**
 * Раздел CRM «Агенты»: риелторы агентства — фото или инициалы, имя, должность,
 * телефон и количество активных объектов. Карточка открывает профиль агента
 * со списком его объектов (/crm/agents/<id>).
 *
 * Раздел открыт всем сотрудникам CRM (агент и администратор) — объекты коллег
 * видны команде на чтение, редактирование остаётся у ответственного агента и
 * администратора. Клиентам сайта (role=user) и посетителям раздел не виден:
 * тех, кто не сотрудник, разворачиваем на вход в CRM.
 *
 * Количество объектов — закрытое сведение: общее число по агентству видит
 * только администратор, агент — счётчик по своим профилям (см. ниже).
 */
export default async function CrmAgentsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  const payload = await getPayload({ config })
  const agents = await loadAgentRoster(payload)

  // Счётчики объектов: администратору — по всем агентам, агенту — только по
  // своим профилям (коллег он не считает). Чужие числа не просто прячем в
  // интерфейсе, а не отдаём странице: клиентская часть получает эти пропсы
  // как есть, и в них не должно быть размеров чужой работы.
  const ownAgentIds = user.role === 'admin'
    ? []
    : [...(await agentProfileIds(payload, user.id))]
  const cards = user.role === 'admin'
    ? agents
    : agents.map((agent) =>
        ownAgentIds.includes(agent.id) ? agent : { ...agent, counts: emptyAgentCounts() },
      )

  return (
    <CrmShell user={user} t={t} active="agents">
      {/* Добавлять агентов может админ или сотрудник с разрешением (галочка
          «Может добавлять агентов» в админке, см. src/payload/collections/Users.ts) */}
      <CrmAgents
        t={t}
        agents={cards}
        isAdmin={user.role === 'admin'}
        ownAgentIds={ownAgentIds}
        canManage={user.role === 'admin' || user.canManageAgents}
      />
    </CrmShell>
  )
}

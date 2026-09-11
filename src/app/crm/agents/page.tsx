import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmAgents } from '@/components/crm/CrmAgents'
import { loadAgentRoster } from '@/lib/agents-service'

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
 */
export default async function CrmAgentsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  const payload = await getPayload({ config })
  const agents = await loadAgentRoster(payload)

  return (
    <CrmShell user={user} t={t} active="agents">
      <CrmAgents t={t} agents={agents} />
    </CrmShell>
  )
}

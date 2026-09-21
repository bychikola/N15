import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmArchive } from '@/components/crm/CrmArchive'
import { loadArchiveBoard } from '@/lib/archive-service'
import { agentProfileIds } from '@/lib/object-access'

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
  // Внутренние комментарии архива — только администратору (см. archive-service)
  const board = await loadArchiveBoard(payload, user.role === 'admin')

  // Агенту показываем только его архив: «свой» объект — тот, где он
  // ответственный агент (профиль agents, agents.user = его учётная запись) или
  // автор карточки (то же правило, что у правки объектов в коллекции Objects —
  // см. src/lib/object-access.ts). Чужой архив ему не отдаём: иначе список и
  // счётчик «Найдено» считали бы объекты коллег, а восстановить их он всё
  // равно не может. Администратор видит архив целиком.
  const myAgentIds = user.role === 'admin' ? new Set<number>() : await agentProfileIds(payload, user.id)
  const rows = user.role === 'admin'
    ? board
    : board.filter(
        (row) =>
          (row.agentId != null && myAgentIds.has(row.agentId)) ||
          (row.authorId != null && String(row.authorId) === String(user.id)),
      )
  // Восстановить объект может его агент, автор карточки или администратор,
  // поэтому у агента «свои» — все строки, что он видит
  const ownObjectIds: number[] = user.role === 'admin' ? [] : rows.map((row) => row.id)

  return (
    <CrmShell user={user} t={t} active="archive">
      <CrmArchive t={t} rows={rows} isAdmin={user.role === 'admin'} ownObjectIds={ownObjectIds} />
    </CrmShell>
  )
}

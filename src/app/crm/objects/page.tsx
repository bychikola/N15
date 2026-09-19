import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmObjects } from '@/components/crm/CrmObjects'
import { ownObjectsWhere } from '@/lib/object-access'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ add?: string; edit?: string }>
}

export default async function CrmObjectsPage({ searchParams }: PageProps) {
  const { add, edit } = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }

  // «Свои» объекты сотрудника (см. access в коллекции Objects): объект
  // считается своим, если в нём указан профиль агента (коллекция agents),
  // привязанный к учётной записи этого пользователя (agents.user), или если
  // он сам завёл карточку (createdBy — учётная запись пользователя). Тем же
  // правилом ограничены права на сервере (см. src/lib/object-access.ts).
  // Профиль по умолчанию для новых объектов и список id своих объектов
  // уходят в клиентский список: по нему кнопка «Редактировать» есть только
  // на своих объектах.
  const payload = await getPayload({ config })
  const myAgentIds: number[] = []
  let myObjectIds: number[] = []
  if (user.role !== 'admin') {
    const agentsRes = await payload.find({
      collection: 'agents',
      where: { user: { equals: user.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const agent of agentsRes.docs) {
      if (typeof agent.id === 'number') myAgentIds.push(agent.id)
    }
    const where = ownObjectsWhere(user.id, new Set(myAgentIds))
    if (where) {
      const objectsRes = await payload.find({
        collection: 'objects',
        where,
        limit: 2000,
        depth: 0,
        overrideAccess: true,
      })
      myObjectIds = objectsRes.docs.map((o) => o.id as number)
    }
  }

  return (
    <CrmShell user={user} t={t} active="objects">
      <CrmObjects
        t={t}
        isAdmin={user.role === 'admin'}
        myAgentId={myAgentIds[0] ?? null}
        ownObjectIds={myObjectIds}
        autoOpen={add === '1'}
        // ?edit=<id> — кнопка «Редактировать» из профиля агента («Агенты»)
        autoEdit={Number(edit) > 0 ? Number(edit) : null}
      />
    </CrmShell>
  )
}

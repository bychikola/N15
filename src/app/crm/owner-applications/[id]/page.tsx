import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { OwnerApplicationCard } from '@/components/crm/OwnerApplicationCard'
import { loadOwnerApplication } from '@/lib/owner-service'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Полная карточка одной заявки собственника.
 *
 * Заявка и объект — разные сущности: карточка открывается целиком ещё до
 * создания объекта в каталоге. Администратор видит всё, что отправил
 * владелец, историю статусов и внутренний комментарий, подтверждает телефон
 * и заводит объект — тот же маршрут действий, что и в списке заявок.
 *
 * Раздел закрыт для агентов: в заявке персональные данные собственника
 * (та же проверка на странице /crm/owner-applications и в маршруте
 * /api/crm/owner-applications/action).
 */
export default async function CrmOwnerApplicationCardPage({ params }: PageProps) {
  const { id: rawId } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')
  if (user.role !== 'admin') redirect('/crm')

  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id)) notFound()

  const payload = await getPayload({ config })
  const row = await loadOwnerApplication(payload, id)
  if (!row) notFound()

  // Список активных агентов — для назначения ответственного при подтверждении
  // телефона и заведении объекта (см. resolveOwnerAgent в owner-service.ts)
  let agents: { id: number; name: string }[] = []
  try {
    const res = await payload.find({
      collection: 'agents',
      where: { isActive: { equals: true } },
      sort: 'sortOrder',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    agents = res.docs
      .map((doc) => ({ id: Number(doc.id), name: String((doc as { name?: unknown }).name || '').trim() }))
      .filter((agent) => Number.isFinite(agent.id) && agent.name)
  } catch (e) {
    console.error('Заявки собственников: не удалось прочитать список агентов:', e)
  }

  return (
    <CrmShell user={user} t={t} active="owner-applications">
      <p style={{ margin: '0 0 14px' }}>
        <Link href="/crm/owner-applications" style={{ color: '#8d6b40', fontSize: 11 }}>
          {t.crm.ownBack}
        </Link>
      </p>
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.ownCardTitle}
      </h2>
      <OwnerApplicationCard t={t} row={row} agents={agents} />
    </CrmShell>
  )
}

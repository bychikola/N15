import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { OwnerApplicationsBoard } from '@/components/crm/OwnerApplicationsBoard'
import { loadOwnerBoard } from '@/lib/owner-service'
import { OWNER_APPLICATION_STATUSES } from '@/lib/owner-applications'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

/**
 * Раздел CRM «Заявки собственников» — приёмка объектов от владельцев.
 *
 * Здесь администратор видит всё, что нужно для проверки: телефон и имя
 * собственника, источник заявки, дату поступления, объект, статус проверки,
 * фотографии, внутренний комментарий и найденные совпадения с объектами базы.
 * Телефон подтверждается кодом из SMS, а если SMS не ушла — вручную кнопкой
 * «Подтвердить телефон». Объект заводится кнопкой «Создать объект» и только
 * черновиком: до публикации в каталог он не попадает. Если похожий объект
 * уже есть в базе, он показан в совпадениях, а кнопка «Дубль» связывает
 * заявку с ним — второй объект автоматически не создаётся.
 *
 * Раздел закрыт для агентов: в заявке персональные данные собственника
 * (та же проверка в /api/crm/owner-applications/action).
 *
 * Фильтр по статусу — в адресе (?status=new): ссылкой на очередь можно
 * поделиться, а после действия страница остаётся на том же фильтре.
 */
export default async function CrmOwnerApplicationsPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')
  if (user.role !== 'admin') redirect('/crm')

  // Неизвестный статус игнорируем: показываем всю очередь
  const known = OWNER_APPLICATION_STATUSES.some((s) => s.value === status)
  const filter = known ? String(status) : ''

  const payload = await getPayload({ config })
  const rows = await loadOwnerBoard(payload, { status: filter || undefined })

  // Ответственных агентов выбирает администратор при подтверждении телефона и
  // заведении объекта: у объекта из заявки агент обязателен (маршрутизация
  // звонков и доступ к карточке). Список — активные профили агентства.
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
    // Без списка агентов подтвердить заявку и завести объект нельзя: раздел
    // не роняем — сервер вернёт понятную ошибку (см. resolveOwnerAgent)
    console.error('Заявки собственников: не удалось прочитать список агентов:', e)
  }

  return (
    <CrmShell user={user} t={t} active="owner-applications">
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.ownTitle}
      </h2>
      <p style={{ margin: '0 0 18px', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 760 }}>
        {t.crm.ownSubtitle}
      </p>
      <OwnerApplicationsBoard t={t} rows={rows} status={filter} agents={agents} />
    </CrmShell>
  )
}

import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { PlatformIntegrations } from '@/components/crm/PlatformIntegrations'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Интеграции площадок' }

/** Строка объекта для выбора в проверке: «Название — город, улица, дом» */
function objectLabel(doc: Record<string, unknown>): string {
  const addr = (doc.address || {}) as Record<string, string | undefined>
  const place = [addr.locality || addr.city, addr.street, addr.house, addr.apartment && `кв. ${addr.apartment}`]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
  const title = typeof doc.title === 'string' ? doc.title.trim() : ''
  return place ? `${title || 'Объект'} — ${place}` : title || `Объект №${String(doc.id)}`
}

/**
 * «Интеграции площадок» — раздел администратора: подключение официальных
 * каналов Авито, ЦИАН, Домклика (и наших каналов публикации), проверка
 * соединения реальным запросом к API площадки и проверка реального объекта
 * CRM по подключённой площадке. Раздел закрыт для агентов: в настройках
 * лежат ключи площадок.
 */
export default async function CrmIntegrationsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || user.role !== 'admin') redirect('/crm')

  // Реальные объекты CRM — из них администратор выбирает объект для проверки
  // на подключённой площадке (не больше 50 последних, без связей)
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'objects',
    where: { status: { not_equals: 'archived' } },
    sort: '-updatedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const objects = (res.docs as unknown as Record<string, unknown>[]).map((doc) => ({
    id: Number(doc.id),
    label: objectLabel(doc),
  }))

  return (
    <CrmShell user={user} t={t} active="integrations">
      <PlatformIntegrations t={t} objects={objects} />
    </CrmShell>
  )
}

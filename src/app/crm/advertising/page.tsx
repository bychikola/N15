import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { AdvertisingBoard } from '@/components/crm/AdvertisingBoard'
import { loadAdvertisingBoard } from '@/lib/advertising-service'

export const dynamic = 'force-dynamic'

/**
 * Раздел CRM «Реклама»: материалы с кнопками публикации и снятия (условия
 * размещения — src/lib/advertising.ts) и заявки с формы /advertising.
 * Управление рекламой доступно администратору: агент видит только разделы
 * своей работы (материалы и оплата — не его зона).
 */
export default async function CrmAdvertisingPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || user.role !== 'admin') redirect('/crm')

  const payload = await getPayload({ config })
  const { ads, requests } = await loadAdvertisingBoard(payload)

  return (
    <CrmShell user={user} t={t} active="advertising">
      <AdvertisingBoard t={t} ads={ads} requests={requests} />
    </CrmShell>
  )
}

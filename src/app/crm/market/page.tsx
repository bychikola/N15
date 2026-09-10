import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { MarketParser } from '@/components/crm/MarketParser'

export const dynamic = 'force-dynamic'

/** «Парсер рынка» — отдельная от публикации страница CRM: чужие объявления,
 *  похожие объекты и дубли (см. src/lib/market-parser.ts). */
export default async function CrmMarketPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  return (
    <CrmShell user={user} t={t} active="market">
      <MarketParser t={t} isAdmin={user.role === 'admin'} />
    </CrmShell>
  )
}

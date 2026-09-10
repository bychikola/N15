import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { NewsReview } from '@/components/crm/NewsReview'
import { loadNewsBoard } from '@/lib/news-service'

export const dynamic = 'force-dynamic'

/** «Новости на проверку» — очередь официальных новостей о недвижимости:
 *  подтверждение, отклонение и отложенность публикаций (src/lib/news.ts). */
export default async function CrmNewsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  const payload = await getPayload({ config })
  const board = await loadNewsBoard(payload)

  return (
    <CrmShell user={user} t={t} active="news">
      <NewsReview t={t} board={board} />
    </CrmShell>
  )
}

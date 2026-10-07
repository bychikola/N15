import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmDevelopers } from '@/components/crm/CrmDevelopers'

export const dynamic = 'force-dynamic'

/**
 * Раздел CRM «Застройщики»: карточки компаний-застройщиков и их жилые
 * комплексы (коллекции developers и complexes, см. src/payload/collections).
 *
 * Раздел только для администратора: в карточке лежит контакт ответственного
 * представителя — персональные данные, которые не показываются никому, кроме
 * администратора. Та же проверка стоит в правах коллекций: заводить и править
 * застройщиков и комплексы может только администратор.
 *
 * Клиента сайта (role=user) и посетителя разворачиваем на вход в CRM; агента —
 * на «Обзор»: справочник ему доступен на чтение в карточке объекта, но не
 * здесь.
 */
export default async function CrmDevelopersPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')
  if (user.role !== 'admin') redirect('/crm')

  return (
    <CrmShell user={user} t={t} active="developers">
      <CrmDevelopers t={t} />
    </CrmShell>
  )
}

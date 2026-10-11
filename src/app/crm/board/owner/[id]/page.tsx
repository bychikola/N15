import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { OwnerBoardAdEdit } from '@/components/crm/OwnerBoardAdEdit'
import { loadOwnerBoardAdForEdit } from '@/lib/owner-board-edit'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Правка объявления собственника администратором (CRM).
 *
 * Объявление собрано из заявки владельца и связано с ней — здесь меняются
 * заголовок, описание, параметры, стоимость и фотографии с выбором главной.
 * Контакты и адрес не редактируются: имя собственника остаётся в публичной
 * карточке, а телефон на сайт не публикуется — связь идёт через Н15
 * (см. boardShowsPublicPhone и updateOwnerBoardAdByAdmin).
 *
 * Раздел закрыт для агентов: объявление принадлежит собственнику, а в записи
 * его имя и телефон. Та же проверка — в маршруте /api/crm/board/owner-ad.
 */
export default async function CrmOwnerBoardEditPage({ params }: PageProps) {
  const { id: rawId } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')
  if (user.role !== 'admin') redirect('/crm')

  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id)) notFound()

  const payload = await getPayload({ config })
  const ad = await loadOwnerBoardAdForEdit(payload, id)
  if (!ad) notFound()

  return (
    <CrmShell user={user} t={t} active="board">
      <p style={{ margin: '0 0 14px' }}>
        <Link
          href={ad.applicationId ? `/crm/owner-applications/${ad.applicationId}` : '/crm/board'}
          style={{ color: '#8d6b40', fontSize: 11 }}
        >
          {ad.applicationId ? t.crm.ownEditBack : t.crm.navBoard}
        </Link>
      </p>
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.ownEditTitle}
      </h2>
      <p style={{ margin: '0 0 18px', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
        {t.crm.ownEditSubtitle}
      </p>
      <OwnerBoardAdEdit t={t} ad={ad} />
    </CrmShell>
  )
}

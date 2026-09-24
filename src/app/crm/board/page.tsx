import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { BoardModeration } from '@/components/crm/BoardModeration'
import { loadBoardQueue } from '@/lib/board-service'
import { BOARD_STATUS_OPTIONS } from '@/lib/board'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

/**
 * Раздел CRM «Доска» — модерация объявлений с сайта.
 *
 * Объявления приходят со страницы /board/new со статусом «На модерации»:
 * публикация возможна только после проверки (см. boardPublishIssue в
 * src/lib/board.ts). Раздел открыт всей команде Н15 — объявлений со временем
 * будет много, и очередь не должна зависеть от одного человека; сузить доступ
 * до администратора можно здесь же (проверка роли) и в /api/board/manage.
 *
 * Фильтр по статусу — в адресе (?status=published): ссылкой на очередь можно
 * поделиться, а после действия страница обновляется и остаётся на том же
 * фильтре.
 */
export default async function CrmBoardPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  // Неизвестный статус игнорируем: показываем всю очередь
  const known = BOARD_STATUS_OPTIONS.some((o) => o.value === status)
  const filter = known ? String(status) : ''

  const payload = await getPayload({ config })
  const rows = await loadBoardQueue(payload, filter || undefined)

  return (
    <CrmShell user={user} t={t} active="board">
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.boardTitle}
      </h2>
      <p style={{ margin: '0 0 18px', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
        {t.crm.boardSubtitle}
      </p>
      <BoardModeration t={t} rows={rows} status={filter} />
    </CrmShell>
  )
}

import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { ReviewsModeration } from '@/components/crm/ReviewsModeration'
import { loadReviewQueue } from '@/lib/review-service'
import { REVIEW_STATUS_LABELS } from '@/lib/reviews'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

/**
 * Раздел CRM «Отзывы» — модерация отзывов клиентов с сайта.
 *
 * Отзывы приходят из формы «Оставить отзыв» со статусом «Ждут проверки»:
 * публикация возможна только после проверки (см. reviewPublishIssue в
 * src/lib/reviews.ts). Раздел открыт всей команде Н15 — отзывы касаются
 * работы агентов, и очередь не должна зависеть от одного человека; действия
 * идут маршрутом /api/reviews/manage с той же проверкой роли.
 *
 * Фильтр по статусу — в адресе (?status=pending): ссылкой на очередь можно
 * поделиться, а после действия страница обновляется и остаётся на фильтре.
 */
export default async function CrmReviewsPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')

  // Неизвестный статус игнорируем: показываем всю очередь
  const known = Object.prototype.hasOwnProperty.call(REVIEW_STATUS_LABELS, status || '')
  const filter = known ? String(status) : ''

  const payload = await getPayload({ config })
  const rows = await loadReviewQueue(payload, filter || undefined)

  return (
    <CrmShell user={user} t={t} active="reviews">
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.reviewsTitle}
      </h2>
      <p style={{ margin: '0 0 18px', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 720 }}>
        {t.crm.reviewsSubtitle}
      </p>
      <ReviewsModeration t={t} rows={rows} status={filter} />
    </CrmShell>
  )
}

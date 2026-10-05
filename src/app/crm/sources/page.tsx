import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { SourceQueueBoard } from '@/components/crm/SourceQueueBoard'
import type { ObjectSourceState, SourceQueueItem } from '@/lib/object-source-service'
import { objectSourceStates, sourceQueue } from '@/lib/object-source-service'

export const dynamic = 'force-dynamic'

/**
 * Раздел CRM «Источники объектов» — очередь объектов из внешних каналов.
 *
 * Здесь администратор видит каналы забора (партнёрский JSON-фид и заявки
 * собственников), запускает забор, принимает решение по каждому кандидату и
 * переносит одобренный объект в каталог. Публикации из источника нет: объект
 * заводится черновиком, в каталог сайта попадает только после обычной
 * публикации в CRM. Ссылка на источник и партнёрская комиссия — закрытые
 * данные: их видит администратор, клиенту сайта они не показываются.
 *
 * Раздел только для администратора: и в источниках лежат доступы каналов,
 * и в очереди — служебные данные партнёра (та же проверка в маршруте
 * /api/object-sources).
 */
export default async function CrmSourcesPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) redirect('/crm')
  if (user.role !== 'admin') redirect('/crm')

  const payload = await getPayload({ config })
  let sources: ObjectSourceState[] = []
  let queue: SourceQueueItem[] = []
  try {
    sources = await objectSourceStates(payload)
    queue = await sourceQueue(payload)
  } catch (e) {
    // Схема может быть не досоздана — раздел не роняем, показываем пустую очередь
    console.error('Object sources: не удалось прочитать очередь кандидатов:', e)
  }

  return (
    <CrmShell user={user} t={t} active="sources">
      <h2 style={{ margin: '0 0 6px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
        {t.crm.srcTitle}
      </h2>
      <p style={{ margin: '0 0 18px', color: '#817b70', fontSize: 11, lineHeight: 1.55, maxWidth: 760 }}>
        {t.crm.srcSubtitle}
      </p>
      <SourceQueueBoard t={t} sources={sources} queue={queue} />
    </CrmShell>
  )
}

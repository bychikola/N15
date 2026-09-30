import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { BarRow } from '@/components/crm/BarRow'
import { DEVICE_LABELS, SOURCE_LABELS } from '@/lib/site-stats'
import {
  loadObjectTitles,
  loadVisitorEvents,
  loadVisitorHistory,
  share,
  type VisitorRow,
} from '@/lib/visitor-report'
import { logAnalyticsAccess } from '@/lib/analytics-access'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

/** Сколько последних визитов и действий показываем в карточке */
const VISITS_LIMIT = 30
const EVENTS_LIMIT = 40

/** Дата и время по местному времени сервера: «01.10.2026, 14:22» */
function formatMoment(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Строка «подпись — значение» для шапки карточки */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.09em' }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 12 }}>{value}</div>
    </div>
  )
}

/**
 * Карточка посетителя: кто это в обезличенном виде (номер), как часто и когда
 * заходил, что смотрел, что делал и оставлял ли обращения. Персональные данные
 * посетителя здесь не показываются — их в системе и нет, пока человек сам не
 * отправил заявку; фамилия и телефон видны только в самой заявке.
 *
 * Раздел закрыт для администратора, открытие записывается в журнал доступа
 * (см. src/lib/analytics-access.ts).
 */
export default async function CrmVisitorCardPage({ params }: PageProps) {
  const { id: rawId } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || user.role !== 'admin') redirect('/crm')

  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id)) notFound()

  const payload = await getPayload({ config })

  let card: VisitorRow | null = null
  try {
    card = (await payload.findByID({
      collection: 'visitors',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as VisitorRow
  } catch {
    // Запись могла быть удалена как устаревшая (см. pruneVisitorData)
    card = null
  }

  if (!card) {
    return (
      <CrmShell user={user} t={t} active="visitors">
        <p style={{ margin: '0 0 14px' }}>
          <Link href="/crm/visitors" style={{ color: '#8d6b40', fontSize: 11 }}>{t.crm.visitorBack}</Link>
        </p>
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.visitorNotFound}</strong>
              <p>{t.crm.visitorNotFoundText}</p>
            </div>
          </article>
        </div>
      </CrmShell>
    )
  }

  const hash = (card.visitor || '').trim()
  const [history, events] = await Promise.all([
    hash ? loadVisitorHistory(payload, hash) : Promise.resolve(null),
    hash ? loadVisitorEvents(payload, hash, 500) : Promise.resolve([]),
  ])
  const titles = await loadObjectTitles(payload, history ? Array.from(history.objects.keys()) : [])

  // Обращения: в карточке хранятся ссылки на заявки, которые пришли с этого
  // браузера. Показываем тип, статус и дату — имя и телефон смотреть в самой
  // заявке: карточка посетителя обезличена
  const applicationIds = (card.applications || [])
    .map((a) => (typeof a === 'object' && a ? Number(a.id) : Number(a)))
    .filter((n) => Number.isInteger(n) && n > 0)
  const applicationRows: { id: number; label: string; status: string; at: string }[] = []
  if (applicationIds.length) {
    try {
      const res = await payload.find({
        collection: 'applications',
        where: { id: { in: applicationIds } },
        sort: '-createdAt',
        limit: 50,
        depth: 0,
        overrideAccess: true,
        select: { type: true, status: true, createdAt: true },
      })
      for (const doc of res.docs as unknown as { id: number; type?: string; status?: string; createdAt?: string }[]) {
        applicationRows.push({
          id: Number(doc.id),
          label: APPLICATION_TYPE_LABELS[String(doc.type)] || String(doc.type || ''),
          status: STATUS_LABELS[String(doc.status)] || String(doc.status || ''),
          at: doc.createdAt || '',
        })
      }
    } catch (e) {
      console.error('[visitors] не удалось прочитать обращения посетителя:', e)
    }
  }

  await logAnalyticsAccess(payload, {
    userId: user.id,
    userName: user.name,
    section: t.crm.navVisitors,
    note: `Карточка ${card.title || `ID ${card.id}`}`,
  })

  // Действия по видам: сначала счётчики, потом последние события списком
  const counts = new Map<string, number>()
  for (const event of events) counts.set(event.kind, (counts.get(event.kind) || 0) + 1)
  const actionKinds = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const filters = events.filter((e) => e.kind === 'filter_use' && e.detail).slice(0, 30)
  const totalEvents = events.length

  const objectRows = history ? Array.from(history.objects.entries()).sort((a, b) => b[1] - a[1]) : []
  const objectViewsTotal = objectRows.reduce((sum, [, views]) => sum + views, 0)
  const pageRows = history ? Array.from(history.pages.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15) : []

  const eventLabel = (kind: string) =>
    ({
      object_view: t.crm.eventObjectView,
      filter_use: t.crm.eventFilterUse,
      favorite_add: t.crm.eventFavoriteAdd,
      favorite_remove: t.crm.eventFavoriteRemove,
      call_click: t.crm.eventCallClick,
      whatsapp_click: t.crm.eventWhatsappClick,
      write_click: t.crm.eventWriteClick,
      lead_submit: t.crm.eventLeadSubmit,
      board_started: t.crm.eventBoardStarted,
      board_published: t.crm.eventBoardPublished,
    })[kind] || kind

  return (
    <CrmShell user={user} t={t} active="visitors">
      <p style={{ margin: '0 0 14px' }}>
        <Link href="/crm/visitors" style={{ color: '#8d6b40', fontSize: 11 }}>{t.crm.visitorBack}</Link>
      </p>

      <div className="crm-grid">
        <article className="crm-card wide">
          <div className="crm-card-header">
            <h2>{card.title || `ID ${card.id}`}</h2>
            <span>{card.identified ? t.crm.visitorsIdentified : t.crm.visitorsAnon}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <Meta label={t.crm.visitorFirst} value={formatMoment(card.firstSeenAt)} />
            <Meta label={t.crm.visitorLast} value={formatMoment(card.lastSeenAt)} />
            <Meta label={t.crm.visitorVisits} value={(card.visitsCount || 0).toLocaleString('ru-RU')} />
            <Meta label={t.crm.visitorPageviews} value={(card.pageviewsCount || 0).toLocaleString('ru-RU')} />
            <Meta label={t.crm.visitorsColDevice} value={DEVICE_LABELS[String(card.device)] || String(card.device || '—')} />
            <Meta label={t.crm.visitorsColSource} value={SOURCE_LABELS[String(card.source)] || String(card.source || '—')} />
            <Meta label={t.crm.visitorsColRegion} value={card.region || '—'} />
          </div>
        </article>

        <article className="crm-card">
          <div className="crm-card-header">
            <h2>{t.crm.visitorObjectsViewed}</h2>
            <span>{objectRows.length.toLocaleString('ru-RU')}</span>
          </div>
          {objectRows.length ? (
            <table className="crm-table">
              <tbody>
                {objectRows.slice(0, 20).map(([objectId, views]) => {
                  const object = titles.get(objectId)
                  return (
                    <BarRow
                      key={objectId}
                      value={views.toLocaleString('ru-RU')}
                      share={share(views, objectViewsTotal)}
                    >
                      <Link href={`/ru/catalog/${objectId}`} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
                        <strong>{object?.title || `Объект №${objectId}`}</strong>
                      </Link>
                      {object?.place ? (
                        <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>{object.place}</div>
                      ) : null}
                    </BarRow>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty">
              <strong>{t.crm.visitorNoObjects}</strong>
            </div>
          )}
        </article>

        <article className="crm-card">
          <div className="crm-card-header">
            <h2>{t.crm.visitorActions}</h2>
            <span>{totalEvents.toLocaleString('ru-RU')}</span>
          </div>
          {actionKinds.length ? (
            <>
              <table className="crm-table">
                <tbody>
                  {actionKinds.map(([kind, count]) => (
                    <tr key={kind}>
                      <td><strong>{eventLabel(kind)}</strong></td>
                      <td style={{ textAlign: 'right' }}>{count.toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 16 }}>
                {events.slice(0, EVENTS_LIMIT).map((event, index) => (
                  <div key={`${event.at}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid #f1ece3' }}>
                    <span style={{ fontSize: 11 }}>
                      {eventLabel(event.kind)}
                      {event.objectId ? ` · Объект №${event.objectId}` : ''}
                      {event.kind === 'filter_use' && event.detail ? ` · ${event.detail}` : ''}
                    </span>
                    <span className="crm-muted" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatMoment(event.at)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="crm-empty">
              <strong>{t.crm.visitorNoActions}</strong>
            </div>
          )}
        </article>

        <article className="crm-card">
          <div className="crm-card-header">
            <h2>{t.crm.visitorFilters}</h2>
            <span>{filters.length.toLocaleString('ru-RU')}</span>
          </div>
          {filters.length ? (
            <table className="crm-table">
              <tbody>
                {filters.map((event, index) => (
                  <tr key={`${event.at}-${index}`}>
                    <td>{event.detail}</td>
                    <td className="crm-muted" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatMoment(event.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty">
              <strong>{t.crm.visitorNoFilters}</strong>
            </div>
          )}
        </article>

        <article className="crm-card">
          <div className="crm-card-header">
            <h2>{t.crm.visitorApplications}</h2>
            <span>{applicationRows.length.toLocaleString('ru-RU')}</span>
          </div>
          {applicationRows.length ? (
            <>
              <table className="crm-table">
                <tbody>
                  {applicationRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/crm/messages/${row.id}`} style={{ color: 'inherit' }}>
                          <strong>{row.label || `Заявка №${row.id}`}</strong>
                        </Link>
                        <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>{row.status}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatMoment(row.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crm-muted" style={{ fontSize: 10, marginTop: 12 }}>
                Имя и телефон клиента — в самой заявке: карточка посетителя обезличена.
              </p>
            </>
          ) : (
            <div className="crm-empty">
              <strong>{t.crm.visitorNoApplications}</strong>
            </div>
          )}
        </article>

        <article className="crm-card wide">
          <div className="crm-card-header">
            <h2>{t.crm.visitorVisitsTitle}</h2>
            <span>{(history?.visitsCount || 0).toLocaleString('ru-RU')}</span>
          </div>
          {history?.visits.length ? (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>{t.crm.visitorsColLast}</th>
                  <th>{t.crm.visitorsColSource}</th>
                  <th>{t.crm.visitorsColDevice}</th>
                  <th>{t.crm.visitorPages}</th>
                </tr>
              </thead>
              <tbody>
                {history.visits.slice(0, VISITS_LIMIT).map((visit, index) => (
                  <tr key={`${visit.at}-${index}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatMoment(visit.at)}</td>
                    <td>{SOURCE_LABELS[visit.source] || visit.source}</td>
                    <td>{DEVICE_LABELS[visit.device] || visit.device}</td>
                    <td>
                      {(visit.pageviews || 0).toLocaleString('ru-RU')}
                      {visit.landing ? (
                        <div className="crm-muted" style={{ fontSize: 10, marginTop: 3, overflowWrap: 'anywhere' }}>{visit.landing}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty">
              <strong>{t.crm.visitorNoVisits}</strong>
            </div>
          )}
          {pageRows.length ? (
            <p className="crm-muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
              {t.crm.visitorPages}: {pageRows.map(([path, n]) => `${path} — ${n}`).join(', ')}
            </p>
          ) : null}
        </article>
      </div>
    </CrmShell>
  )
}

/** Типы заявок — как в карточке лида (см. src/app/crm/leads) */
const APPLICATION_TYPE_LABELS: Record<string, string> = {
  viewing: 'Просмотр',
  callback: 'Обратный звонок',
  mortgage: 'Ипотека',
  consultation: 'Консультация',
  valuation: 'Оценка объекта',
  sale: 'Продажа объекта',
  selection: 'Подбор недвижимости',
  search: 'Заявка на поиск',
  installment: 'Рассрочка',
}

const STATUS_LABELS: Record<string, string> = {
  unsorted: 'Неразобранное',
  new: 'Новая заявка',
  call: 'Звонок',
  showing: 'Показ',
  negotiation: 'Переговоры',
  deal: 'Сделка',
  closed: 'Завершено',
  rejected: 'Отказ',
}

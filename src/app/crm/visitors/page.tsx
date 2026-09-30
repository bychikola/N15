import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { BarRow } from '@/components/crm/BarRow'
import { DEVICE_LABELS, SOURCE_LABELS } from '@/lib/site-stats'
import {
  ensureVisitors,
  loadObjectTitles,
  resolvePeriod,
  scanApplications,
  scanVisits,
  share,
} from '@/lib/visitor-report'
import { loadAnalyticsAccess, logAnalyticsAccess } from '@/lib/analytics-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Посетители' }

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}

/** Сколько посетителей показываем в таблице: дальше — карточка по ссылке */
const LIST_LIMIT = 100

/** Дата и время по местному времени сервера: «01.10.2026, 14:22» */
function formatMoment(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * «Аналитика → Посетители» — закрытый раздел администратора: обезличенные
 * карточки посетителей сайта, их визиты, просмотренные объекты и обращения.
 *
 * Сверху — три цифры, с которых начинают смотреть отчёт: посетители за
 * период, повторные посетители и обращения. Ниже — «Самые просматриваемые
 * объекты», затем список посетителей. Персональных данных в отчёте нет:
 * ни полного IP, ни имён — только номера вида «Посетитель #184»
 * (см. src/lib/visitor-tracking.ts).
 *
 * Доступ только у администратора, и каждый заход записывается в журнал
 * analytics-access (ст. 19 152-ФЗ) — блок «Журнал доступа» внизу страницы.
 */
export default async function CrmVisitorsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || user.role !== 'admin') redirect('/crm')

  const range = resolvePeriod(sp)
  const periodLabel =
    range.period === 'custom'
      ? `${range.startKey} — ${range.endKey}`
      : t.crm[range.period === 'today' ? 'periodToday' : range.period === 'week' ? 'periodWeek' : 'periodMonth']

  const payload = await getPayload({ config })
  const [visits, applications] = await Promise.all([
    scanVisits(payload, range.start, range.end),
    scanApplications(payload, range.start, range.end),
  ])

  // Посетители периода, свежие — первыми: чаще всего смотрят, кто заходил
  const summaries = Array.from(visits.visitors.values()).sort((a, b) =>
    (b.lastAt || '') < (a.lastAt || '') ? -1 : 1,
  )
  const repeatCount = summaries.filter((s) => s.visits > 1).length

  const topObjects = Array.from(visits.objects.entries())
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 10)
  const objectTitles = await loadObjectTitles(payload, topObjects.map(([id]) => id))

  // Видимому списку нужны номера карточек: у визитов до 01.10 карточки нет,
  // её заводит ensureVisitors по первому визиту (см. visitor-report)
  const shown = summaries.slice(0, LIST_LIMIT)
  const cards = await ensureVisitors(payload, shown.map((s) => s.visitor))

  // Журнал доступа: фиксируем сам факт открытия отчёта и показываем последние
  // записи — видно, что заходы действительно записываются
  await logAnalyticsAccess(payload, {
    userId: user.id,
    userName: user.name,
    section: t.crm.navVisitors,
    note: `Отчёт за период ${range.startKey} — ${range.endKey}`,
  })
  const accessLog = await loadAnalyticsAccess(payload, 8)

  const tiles = [
    {
      label: range.period === 'today' ? t.crm.visitorsToday : t.crm.visitorsPeriod,
      value: summaries.length.toLocaleString('ru-RU'),
      note: periodLabel,
    },
    { label: t.crm.visitorsRepeat, value: repeatCount.toLocaleString('ru-RU'), note: t.crm.visitorsRepeatNote },
    { label: t.crm.visitorsInquiries, value: applications.total.toLocaleString('ru-RU'), note: t.crm.visitorsInquiriesNote },
  ]

  return (
    <CrmShell user={user} t={t} active="visitors">
      <div className="crm-site-stats-filter">
        {(['today', 'week', 'month'] as const).map((p) => (
          <a key={p} href={`/crm/visitors?period=${p}`} className={range.period === p ? 'is-active' : undefined}>
            {t.crm[p === 'today' ? 'periodToday' : p === 'week' ? 'periodWeek' : 'periodMonth']}
          </a>
        ))}
        {/* Свой период — обычная GET-форма: работает без JavaScript и на телефоне */}
        <form className="crm-site-stats-range" method="get" action="/crm/visitors">
          <input type="hidden" name="period" value="custom" />
          <label>
            {t.crm.siteStatsFrom}
            <input type="date" name="from" defaultValue={range.startKey} max={range.endKey} />
          </label>
          <label>
            {t.crm.siteStatsTo}
            <input type="date" name="to" defaultValue={range.endKey} max={range.endKey} />
          </label>
          <button type="submit" className={range.period === 'custom' ? 'is-active' : undefined}>
            {t.crm.siteStatsApply}
          </button>
        </form>
      </div>

      <p className="crm-site-stats-note">
        {t.crm.visitorsNote}
        {visits.truncated ? ` ${t.crm.visitorsTruncated}` : ''}
      </p>

      <div className="crm-metrics">
        {tiles.map((m) => (
          <article className="crm-metric" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </div>

      {visits.readError ? (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.siteStatsFailed}</strong>
            </div>
          </article>
        </div>
      ) : summaries.length === 0 ? (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.visitorsEmptyTitle}</strong>
              <p>{t.crm.visitorsEmptyText}</p>
            </div>
          </article>
        </div>
      ) : (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{t.crm.visitorsTopObjects}</h2>
              <span>{periodLabel}</span>
            </div>
            {topObjects.length ? (
              <table className="crm-table">
                <tbody>
                  {topObjects.map(([id, stat]) => {
                    const object = objectTitles.get(id)
                    return (
                      <BarRow
                        key={id}
                        value={stat.views.toLocaleString('ru-RU')}
                        share={share(stat.views, visits.pageviewsCount)}
                        // «уникальных: 3 · обращения: 1» — без согласования числа
                        // и слова, иначе на 1 выходило бы «1 просмотры»
                        note={`${t.crm.interestUnique}: ${stat.visitors.size} · ${t.crm.interestInquiries}: ${applications.byObject.get(id) || 0}`}
                      >
                        <Link href={`/crm/interest?object=${id}`} style={{ color: 'inherit' }}>
                          <strong>{object?.title || `Объект №${id}`}</strong>
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
                <strong>{t.crm.statsNoData}</strong>
              </div>
            )}
          </article>

          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{t.crm.visitorsTable}</h2>
              <span>{periodLabel}</span>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>{t.crm.visitorsColVisitor}</th>
                  <th>{t.crm.visitorsColLast}</th>
                  <th>{t.crm.visitorsColVisits}</th>
                  <th>{t.crm.visitorsColPages}</th>
                  <th>{t.crm.visitorsColObjects}</th>
                  <th>{t.crm.visitorsColDevice}</th>
                  <th>{t.crm.visitorsColSource}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const card = cards.get(s.visitor)
                  return (
                    <tr key={s.visitor}>
                      <td>
                        {card ? (
                          <Link href={`/crm/visitors/${card.id}`} style={{ color: 'inherit' }}>
                            <strong>{card.title || `ID ${card.id}`}</strong>
                          </Link>
                        ) : (
                          <span className="crm-muted" style={{ fontSize: 11 }}>{t.crm.visitorsOpenCard}</span>
                        )}
                        <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>
                          {card?.identified ? t.crm.visitorsIdentified : t.crm.visitorsAnon}
                          {card?.region ? ` · ${card.region}` : ''}
                        </div>
                      </td>
                      <td>{formatMoment(s.lastAt)}</td>
                      <td>{s.visits.toLocaleString('ru-RU')}</td>
                      <td>{s.pageviews.toLocaleString('ru-RU')}</td>
                      <td>{s.objects.size.toLocaleString('ru-RU')}</td>
                      <td>{DEVICE_LABELS[s.device] || s.device}</td>
                      <td>{SOURCE_LABELS[s.source] || s.source}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </article>

          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{t.crm.visitorsAccessJournal}</h2>
              <span>{t.crm.navVisitors}</span>
            </div>
            <table className="crm-table">
              <tbody>
                {accessLog.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.userName || '—'}</strong>
                      <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>
                        {row.section}
                        {row.note ? ` · ${row.note}` : ''}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatMoment(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="crm-muted" style={{ fontSize: 10, marginTop: 12 }}>
              {t.crm.visitorsAccessJournalNote}
            </p>
          </article>
        </div>
      )}
    </CrmShell>
  )
}

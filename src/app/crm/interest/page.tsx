import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { BarRow } from '@/components/crm/BarRow'
import { loadObjectTitles, resolvePeriod, scanApplications, scanEvents, scanVisits, share } from '@/lib/visitor-report'
import { logAnalyticsAccess } from '@/lib/analytics-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Интерес к объектам' }

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string; object?: string }>
}

/** Сколько объектов показываем в отчёте: дальше — хвост из редких просмотров */
const LIST_LIMIT = 50

/** Строка отчёта по одному объекту */
interface ObjectRow {
  id: number
  views: number
  unique: number
  favorites: number
  inquiries: number
}

/**
 * «Аналитика → Интерес к объектам» — закрытый раздел администратора: по каждому
 * объекту за период видно, сколько людей им интересовались и чем интерес
 * закончился — просмотры, повторные просмотры, избранное, обращения и
 * конверсия из просмотра в обращение.
 *
 * Просмотры и уникальные посетители считаются по обезличенным визитам
 * (src/lib/visitor-report.ts, данные пишет /api/visit), избранное — по
 * событиям сайта, обращения — по заявкам CRM. Персональных данных в отчёте
 * нет; открытие раздела записывается в журнал доступа.
 */
export default async function CrmInterestPage({ searchParams }: PageProps) {
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
  const [visits, events, applications] = await Promise.all([
    scanVisits(payload, range.start, range.end),
    scanEvents(payload, range.start, range.end),
    scanApplications(payload, range.start, range.end),
  ])

  // Один объект из ссылки «Самые просматриваемые» на странице посетителей
  const focusId = Number.parseInt(String(sp.object || ''), 10)
  const focus = Number.isInteger(focusId) && focusId > 0 ? focusId : null

  const rows: ObjectRow[] = Array.from(visits.objects.entries())
    .map(([id, stat]) => ({
      id,
      views: stat.views,
      unique: stat.visitors.size,
      favorites: events.favorites.get(id) || 0,
      inquiries: applications.byObject.get(id) || 0,
    }))
    .sort((a, b) => b.views - a.views || b.unique - a.unique)

  const shown = focus ? rows.filter((row) => row.id === focus) : rows.slice(0, LIST_LIMIT)
  const titles = await loadObjectTitles(payload, shown.map((row) => row.id))

  const viewsTotal = rows.reduce((sum, row) => sum + row.views, 0)
  const favoritesTotal = rows.reduce((sum, row) => sum + row.favorites, 0)
  const inquiriesTotal = rows.reduce((sum, row) => sum + row.inquiries, 0)
  const uniqueTotal = rows.reduce((sum, row) => sum + row.unique, 0)

  // Популярные фильтры каталога: «Каталог: Тип — Квартира, цена до 5 000 000 ₽»
  const topFilters = Array.from(events.filters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
  const filtersTotal = Array.from(events.filters.values()).reduce((sum, n) => sum + n, 0)

  await logAnalyticsAccess(payload, {
    userId: user.id,
    userName: user.name,
    section: t.crm.navInterest,
    note: focus ? `Объект №${focus}, период ${range.startKey} — ${range.endKey}` : `Отчёт за период ${range.startKey} — ${range.endKey}`,
  })

  const tiles = [
    { label: t.crm.interestObjects, value: rows.length.toLocaleString('ru-RU'), note: periodLabel },
    { label: t.crm.interestViewsTotal, value: viewsTotal.toLocaleString('ru-RU'), note: periodLabel },
    { label: t.crm.interestFavoritesTotal, value: favoritesTotal.toLocaleString('ru-RU'), note: periodLabel },
    { label: t.crm.interestInquiriesTotal, value: inquiriesTotal.toLocaleString('ru-RU'), note: periodLabel },
  ]

  return (
    <CrmShell user={user} t={t} active="interest">
      <div className="crm-site-stats-filter">
        {(['today', 'week', 'month'] as const).map((p) => (
          <a
            key={p}
            href={`/crm/interest?period=${p}${focus ? `&object=${focus}` : ''}`}
            className={range.period === p ? 'is-active' : undefined}
          >
            {t.crm[p === 'today' ? 'periodToday' : p === 'week' ? 'periodWeek' : 'periodMonth']}
          </a>
        ))}
        <form className="crm-site-stats-range" method="get" action="/crm/interest">
          <input type="hidden" name="period" value="custom" />
          {focus ? <input type="hidden" name="object" value={focus} /> : null}
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
        {t.crm.interestNote}
        {visits.truncated || events.truncated ? ` ${t.crm.siteStatsTruncated}` : ''}
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
      ) : rows.length === 0 ? (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.interestEmptyTitle}</strong>
              <p>{t.crm.interestEmptyText}</p>
            </div>
          </article>
        </div>
      ) : (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{focus ? `Объект №${focus}` : t.crm.interestTable}</h2>
              <span>
                {focus ? (
                  <Link href={`/crm/interest?period=${range.period}`} style={{ color: '#927046' }}>
                    Все объекты
                  </Link>
                ) : (
                  periodLabel
                )}
              </span>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>{t.crm.interestUnique}</th>
                  <th>{t.crm.interestViews}</th>
                  <th>{t.crm.interestRepeat}</th>
                  <th>{t.crm.interestFavorites}</th>
                  <th>{t.crm.interestInquiries}</th>
                  <th>{t.crm.interestConversion}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const object = titles.get(row.id)
                  const repeat = Math.max(0, row.views - row.unique)
                  const conversion = share(row.inquiries, row.unique)
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/ru/catalog/${row.id}`} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
                          <strong>{object?.title || `Объект №${row.id}`}</strong>
                        </Link>
                        {object?.place ? (
                          <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>{object.place}</div>
                        ) : null}
                      </td>
                      <td>{row.unique.toLocaleString('ru-RU')}</td>
                      <td>{row.views.toLocaleString('ru-RU')}</td>
                      <td title={t.crm.interestRepeatNote}>{repeat.toLocaleString('ru-RU')}</td>
                      <td>{row.favorites.toLocaleString('ru-RU')}</td>
                      <td>{row.inquiries.toLocaleString('ru-RU')}</td>
                      <td>{row.inquiries ? `${conversion}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="crm-muted" style={{ fontSize: 10, marginTop: 12 }}>
              {t.crm.interestRepeat}: {t.crm.interestRepeatNote}. {t.crm.interestUnique} за период: {uniqueTotal.toLocaleString('ru-RU')}.
            </p>
          </article>

          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{t.crm.interestFilters}</h2>
              <span>{periodLabel}</span>
            </div>
            {topFilters.length ? (
              <table className="crm-table">
                <tbody>
                  {topFilters.map(([label, count]) => (
                    <BarRow key={label} value={count.toLocaleString('ru-RU')} share={share(count, filtersTotal)}>
                      <strong>{label}</strong>
                    </BarRow>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="crm-empty">
                <strong>{t.crm.statsNoData}</strong>
              </div>
            )}
            <p className="crm-muted" style={{ fontSize: 10, marginTop: 12 }}>
              {t.crm.interestFiltersNote}
            </p>
          </article>
        </div>
      )}
    </CrmShell>
  )
}

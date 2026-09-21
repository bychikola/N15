import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { DEVICE_LABELS, SOURCE_LABELS, objectPathId } from '@/lib/site-stats'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Статистика сайта' }

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}

/** Визит из базы — только те поля, что нужны отчёту (см. select в запросе) */
interface VisitSlice {
  visitor?: string | null
  source?: string | null
  referrer?: string | null
  device?: string | null
  pageviews?: number | null
  pages?: { path?: string | null }[] | null
  createdAt?: string | null
}

/** Объект для подписи в отчёте: название и адрес */
interface ObjectSlice {
  id: number
  title?: string | null
  address?: { locality?: string | null; city?: string | null; street?: string | null; house?: string | null } | null
}

/**
 * Одна страница визитов из базы. null — прочитать не удалось: страница отчёта
 * не должна падать из-за статистики, поэтому причину пишем в лог, а отчёт
 * покажет «не удалось прочитать» вместо пустой сводки.
 */
async function loadVisitsPage(payload: Payload, start: Date, end: Date, page: number) {
  try {
    return await payload.find({
      collection: 'site-visits',
      where: { createdAt: { greater_than_equal: start.toISOString(), less_than_equal: end.toISOString() } },
      sort: '-createdAt',
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
      select: { visitor: true, source: true, referrer: true, device: true, pageviews: true, pages: true, createdAt: true },
    })
  } catch (e) {
    console.error('[site-stats] отчёт: не удалось прочитать визиты:', e)
    return null
  }
}

/** Ключ дня YYYY-MM-DD по местному времени сервера (Europe/Moscow) */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Дата из строки YYYY-MM-DD на начало местных суток; null — строка не дата */
function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Сколько визитов максимум смотрим в одном отчёте (защита от «всё за год») */
const MAX_VISITS = 20_000
const PAGE_SIZE = 1_000
/** Самый длинный свой период: год */
const MAX_RANGE_DAYS = 366

/** Строка рейтинга: число, доля и полоска — как в воронке раздела «Аналитика» */
function BarRow({ value, share, note, children }: { value: string; share: number; note?: string; children?: React.ReactNode }) {
  return (
    <tr>
      <td>{children}</td>
      <td>
        {/* Полоска тянется по свободному месту и ужимается до 40px — на телефоне
            строка не выдавливает таблицу за край карточки */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ minWidth: 30, textAlign: 'right' }}>{value}</strong>
          <div style={{ flex: 1, minWidth: 40, maxWidth: 190, height: 8, borderRadius: 4, background: '#f2eadf', overflow: 'hidden' }}>
            {/* Совсем маленькие доли оставляем видимой полоской */}
            <div style={{ width: `${Math.min(100, share > 0 ? Math.max(share, 2) : 0)}%`, height: '100%', background: '#a7814e' }} />
          </div>
          <span style={{ fontSize: 10, color: '#817b70', minWidth: 30 }}>{share}%</span>
        </div>
        {note ? <div style={{ fontSize: 10, color: '#a09a8f', marginTop: 4 }}>{note}</div> : null}
      </td>
    </tr>
  )
}

/**
 * «Статистика сайта» — закрытый раздел администратора: посещения, уникальные
 * посетители, просмотры страниц, популярные страницы и объекты, источники
 * переходов и устройства за сегодня, неделю, месяц или свой период.
 *
 * Данные собирает свой счётчик (src/lib/site-stats.ts, маршрут /api/visit):
 * обезличенно, без cookie и без внешних сервисов. Агентам, клиентам и
 * посетителям сайта статистика не показывается — раздел открыт только
 * администратору, пункт меню у агентов не выводится (CrmShell).
 */
export default async function CrmSiteStatsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user) || user.role !== 'admin') redirect('/crm')

  // Период: сегодня / неделя (7 дней) / месяц (30 дней) / свой диапазон дат
  const today = new Date()
  const todayKey = dayKey(today)
  const midnight = new Date(`${todayKey}T00:00:00`)
  const customFrom = parseDay(sp.from)
  const customTo = parseDay(sp.to)
  const period: 'today' | 'week' | 'month' | 'custom' =
    sp.period === 'today' || sp.period === 'week' || sp.period === 'month'
      ? sp.period
      : sp.period === 'custom' && (customFrom || customTo)
        ? 'custom'
        : 'week'

  let start = new Date(midnight.getTime() - (period === 'today' ? 0 : period === 'week' ? 6 : 29) * 86_400_000)
  let end = new Date(today.getTime() + 1)
  if (period === 'custom') {
    // Даты в адресе могут быть любые: чиним порядок и ограничиваем длину
    const from = customFrom || customTo || midnight
    const to = customTo || customFrom || midnight
    const [a, b] = from <= to ? [from, to] : [to, from]
    start = a
    end = new Date(Math.min(b.getTime() + 86_400_000, today.getTime() + 1))
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      start = new Date(end.getTime() - MAX_RANGE_DAYS * 86_400_000)
    }
  }

  const startKey = dayKey(start)
  const endKey = dayKey(new Date(end.getTime() - 1))
  const periodLabel =
    period === 'custom'
      ? `${startKey} — ${endKey}`
      : t.crm[period === 'today' ? 'periodToday' : period === 'week' ? 'periodWeek' : 'periodMonth']

  const payload = await getPayload({ config })

  // Визиты периода страницами по 1000: считаем сводку на ходу, в памяти
  // держим только счётчики, а не все документы
  const visitorSet = new Set<string>()
  const pathCounts = new Map<string, number>()
  const objectCounts = new Map<number, number>()
  const sourceCounts = new Map<string, number>()
  const referrerCounts = new Map<string, number>()
  const deviceCounts = new Map<string, number>()
  const dayCounts = new Map<string, { visits: number; views: number }>()
  let visitsCount = 0
  let pageviewsCount = 0
  let truncated = false
  // Не прочитали визиты (например, таблицы ещё нет) — покажем это прямо,
  // а не пустую сводку: «данных нет» и «данные недоступны» — разное
  let readError = false

  for (let page = 1; page <= Math.ceil(MAX_VISITS / PAGE_SIZE); page++) {
    const res = await loadVisitsPage(payload, start, end, page)
    if (!res) {
      readError = true
      break
    }
    const docs = res.docs as unknown as VisitSlice[]
    for (const visit of docs) {
      visitsCount++
      pageviewsCount += visit.pageviews || 0
      if (visit.visitor) visitorSet.add(visit.visitor)

      const source = visit.source || 'direct'
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1)
      if (visit.referrer) referrerCounts.set(visit.referrer, (referrerCounts.get(visit.referrer) || 0) + 1)
      const device = visit.device || 'desktop'
      deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1)

      // День визита — по местному времени сервера: createdAt в базе в UTC,
      // поэтому строку не режем, а переводим дату
      const created = visit.createdAt ? new Date(visit.createdAt) : null
      const day = created && !Number.isNaN(created.getTime()) ? dayKey(created) : startKey
      const bucket = dayCounts.get(day) || { visits: 0, views: 0 }
      bucket.visits++
      bucket.views += visit.pageviews || 0
      dayCounts.set(day, bucket)

      // Просмотры страниц визита относим к дню начала визита (визит живёт
      // не дольше 30 минут, через полночь переходят единицы)
      for (const hit of visit.pages || []) {
        const path = (hit.path || '').trim()
        if (!path) continue
        pathCounts.set(path, (pathCounts.get(path) || 0) + 1)
        const objectId = objectPathId(path)
        if (objectId) objectCounts.set(objectId, (objectCounts.get(objectId) || 0) + 1)
      }
    }
    if (!res.hasNextPage) break
    if (page === Math.ceil(MAX_VISITS / PAGE_SIZE)) truncated = true
  }

  // Названия объектов для отчёта: в адресе карточки только номер
  const objectIds = Array.from(objectCounts.keys())
  const objectTitles = new Map<number, string>()
  const objectPlaces = new Map<number, string>()
  if (objectIds.length) {
    const res = await payload.find({
      collection: 'objects',
      where: { id: { in: objectIds } },
      limit: objectIds.length,
      depth: 0,
      overrideAccess: true,
      select: { title: true, address: true },
    })
    for (const doc of res.docs as unknown as ObjectSlice[]) {
      const id = Number(doc.id)
      objectTitles.set(id, (doc.title || '').trim() || `Объект №${id}`)
      const addr = doc.address || {}
      const place = [addr.locality || addr.city, addr.street, addr.house].map((p) => (p || '').trim()).filter(Boolean).join(', ')
      if (place) objectPlaces.set(id, place)
    }
  }

  /** Топ значений из счётчика: [значение, сколько раз] */
  const top = (counts: Map<string, number>, limit: number) =>
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)

  // Популярные страницы: карточки объектов считаем отдельно — им посвящена
  // своя таблица, иначе один и тот же просмотр попал бы в отчёт дважды
  const topPages = top(pathCounts, 40)
    .filter(([path]) => !objectPathId(path))
    .slice(0, 12)
  const topObjects = Array.from(objectCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  const topSources = top(sourceCounts, 10)
  const topReferrers = top(referrerCounts, 5)
  const topDevices = top(deviceCounts, 10)
  const byDay = Array.from(dayCounts.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))

  const share = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0)
  const tiles = [
    { label: t.crm.siteStatsVisits, value: visitsCount.toLocaleString('ru-RU'), note: periodLabel },
    { label: t.crm.siteStatsVisitors, value: visitorSet.size.toLocaleString('ru-RU'), note: t.crm.siteStatsVisitorsNote },
    { label: t.crm.siteStatsPageviews, value: pageviewsCount.toLocaleString('ru-RU'), note: periodLabel },
    {
      label: t.crm.siteStatsDepth,
      // Дробную часть показываем по-русски: «2,0», а не «2.0»
      value: visitsCount
        ? (pageviewsCount / visitsCount).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : '—',
      note: periodLabel,
    },
  ]

  return (
    <CrmShell user={user} t={t} active="site-stats">
      <div className="crm-site-stats-filter">
        {(['today', 'week', 'month'] as const).map((p) => (
          <a key={p} href={`/crm/site-stats?period=${p}`} className={period === p ? 'is-active' : undefined}>
            {t.crm[p === 'today' ? 'periodToday' : p === 'week' ? 'periodWeek' : 'periodMonth']}
          </a>
        ))}
        {/* Свой период — обычная GET-форма: работает без JavaScript и на телефоне */}
        <form className="crm-site-stats-range" method="get" action="/crm/site-stats">
          <input type="hidden" name="period" value="custom" />
          <label>
            {t.crm.siteStatsFrom}
            <input type="date" name="from" defaultValue={startKey} max={todayKey} />
          </label>
          <label>
            {t.crm.siteStatsTo}
            <input type="date" name="to" defaultValue={endKey} max={todayKey} />
          </label>
          <button type="submit" className={period === 'custom' ? 'is-active' : undefined}>
            {t.crm.siteStatsApply}
          </button>
        </form>
      </div>

      <p className="crm-site-stats-note">
        {t.crm.siteStatsNote}
        {truncated ? ` ${t.crm.siteStatsTruncated}` : ''}
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

      {readError ? (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.siteStatsFailed}</strong>
            </div>
          </article>
        </div>
      ) : visitsCount === 0 ? (
        <div className="crm-grid">
          <article className="crm-card wide">
            <div className="crm-empty">
              <strong>{t.crm.siteStatsEmptyTitle}</strong>
              <p>{t.crm.siteStatsEmptyText}</p>
            </div>
          </article>
        </div>
      ) : (
        <div className="crm-grid">
          <article className="crm-card">
            <div className="crm-card-header">
              <h2>{t.crm.siteStatsTopPages}</h2>
              <span>{periodLabel}</span>
            </div>
            <table className="crm-table">
              <tbody>
                {topPages.map(([path, views]) => (
                  <BarRow key={path} value={views.toLocaleString('ru-RU')} share={share(views, pageviewsCount)}>
                    <a href={path} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
                      <strong>{pageLabel(path)}</strong>
                    </a>
                    {/* Длинный адрес без пробелов переносим: иначе он выдавит таблицу на телефоне */}
                    <div className="crm-muted" style={{ fontSize: 10, marginTop: 3, overflowWrap: 'anywhere' }}>{path}</div>
                  </BarRow>
                ))}
              </tbody>
            </table>
            <p className="crm-muted" style={{ fontSize: 10, marginTop: 12 }}>
              {t.crm.siteStatsPagesNote}
            </p>
          </article>

          <article className="crm-card">
            <div className="crm-card-header">
              <h2>{t.crm.siteStatsSources}</h2>
              <span>{periodLabel}</span>
            </div>
            <table className="crm-table">
              <tbody>
                {topSources.map(([source, visits]) => (
                  <BarRow key={source} value={visits.toLocaleString('ru-RU')} share={share(visits, visitsCount)}>
                    <strong>{SOURCE_LABELS[source] || source}</strong>
                  </BarRow>
                ))}
              </tbody>
            </table>
            {topReferrers.length ? (
              <p className="crm-muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.7 }}>
                {t.crm.siteStatsReferrers}: {topReferrers.map(([host, n]) => `${host} — ${n}`).join(', ')}
              </p>
            ) : null}
          </article>

          <article className="crm-card">
            <div className="crm-card-header">
              <h2>{t.crm.siteStatsTopObjects}</h2>
              <span>{periodLabel}</span>
            </div>
            {topObjects.length ? (
              <table className="crm-table">
                <tbody>
                  {topObjects.map(([id, views]) => (
                    <BarRow key={id} value={views.toLocaleString('ru-RU')} share={share(views, pageviewsCount)}>
                      <a
                        href={`/ru/catalog/${id}`}
                        target="_blank"
                        rel="noopener"
                        style={{ color: 'inherit' }}
                      >
                        <strong>{objectTitles.get(id) || `Объект №${id}`}</strong>
                      </a>
                      {objectPlaces.get(id) ? (
                        <div className="crm-muted" style={{ fontSize: 10, marginTop: 3 }}>{objectPlaces.get(id)}</div>
                      ) : null}
                    </BarRow>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="crm-empty">
                <strong>{t.crm.statsNoData}</strong>
              </div>
            )}
          </article>

          <article className="crm-card">
            <div className="crm-card-header">
              <h2>{t.crm.siteStatsDevices}</h2>
              <span>{periodLabel}</span>
            </div>
            <table className="crm-table">
              <tbody>
                {topDevices.map(([device, visits]) => (
                  <BarRow key={device} value={visits.toLocaleString('ru-RU')} share={share(visits, visitsCount)}>
                    <strong>{DEVICE_LABELS[device] || device}</strong>
                  </BarRow>
                ))}
              </tbody>
            </table>
          </article>

          <article className="crm-card wide">
            <div className="crm-card-header">
              <h2>{t.crm.siteStatsByDay}</h2>
              <span>{periodLabel}</span>
            </div>
            <table className="crm-table">
              <tbody>
                {byDay.map(([day, bucket]) => (
                  <BarRow
                    key={day}
                    value={bucket.visits.toLocaleString('ru-RU')}
                    share={share(bucket.visits, visitsCount)}
                    // «Просмотры: 12» — без согласования числа и слова, иначе
                    // на 1 выходило бы «1 просмотры»
                    note={`${t.crm.siteStatsViews}: ${bucket.views.toLocaleString('ru-RU')}`}
                  >
                    {/* Ключ дня — ISO (YYYY-MM-DD), в отчёте показываем 21.09.2026 */}
                    <strong>{day.split('-').reverse().join('.')}</strong>
                  </BarRow>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      )}
    </CrmShell>
  )
}

/**
 * Понятное название страницы по адресу: в отчёте рядом с адресом показываем
 * привычное имя («Каталог», «Контакты»). Незнакомые адреса показываем как есть.
 */
function pageLabel(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/'
  const known: Record<string, string> = {
    '': 'Главная',
    '/ru': 'Главная',
    '/os': 'Главная (осетинская версия)',
  }
  if (known[clean] != null) return known[clean]
  const withoutLang = clean.replace(/^\/(ru|os)/, '') || '/'
  const section = withoutLang.split('/').filter(Boolean)[0] || ''
  const titles: Record<string, string> = {
    catalog: 'Каталог объектов',
    about: 'Об агентстве',
    contacts: 'Контакты',
    services: 'Услуги',
    blog: 'Блог',
    news: 'Новости',
    advertising: 'Реклама на сайте',
    interregional: 'Межрегиональные объекты',
    foreign: 'Зарубежная недвижимость',
    newbuildings: 'Новостройки',
    sell: 'Продажа объекта',
    mortgage: 'Ипотека',
    privacy: 'Политика конфиденциальности',
    login: 'Вход',
    register: 'Регистрация',
    lk: 'Личный кабинет',
  }
  return titles[section] || withoutLang
}

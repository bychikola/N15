'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
import type { CrmUser } from '@/app/crm/auth'

interface Props {
  user: CrmUser
  t: Dict
  active: string
  children: ReactNode
}

/** Статусы заявки собственника, которые сотрудник ещё не разобрал */
const OWNER_QUEUE_STATUSES = ['new', 'checking']

export function CrmShell({ user, t, active, children }: Props) {
  const isAdmin = user.role === 'admin'
  // Счётчик неразобранных заявок собственников: сколько клиентских объектов
  // ждут проверки. Рядом с пунктом меню его видно с любой страницы CRM
  const [ownerQueue, setOwnerQueue] = useState(0)
  const navItems: { id: string; href: string; label: string; badge?: number }[] = [
    { id: 'overview', href: '/crm', label: t.crm.navOverview },
    { id: 'leads', href: '/crm/leads', label: t.crm.navLeads },
    { id: 'messages', href: '/crm/messages', label: t.crm.navMessages },
    { id: 'tasks', href: '/crm/tasks', label: t.crm.navTasks },
    { id: 'customers', href: '/crm/customers', label: t.crm.navCustomers },
    { id: 'objects', href: '/crm/objects', label: t.crm.navObjects },
    // «Заявки собственников»: объекты от владельцев — до подтверждения
    // телефона и проверки в каталог не попадают. Раздел только для
    // администратора: в заявке телефон и адрес собственника
    // (та же проверка на странице /crm/owner-applications)
    ...(isAdmin
      ? [{ id: 'owner-applications', href: '/crm/owner-applications', label: t.crm.navOwnerApplications, badge: ownerQueue }]
      : []),
    // «Источники объектов»: очередь объектов из внешних каналов (партнёрский
    // JSON-фид, заявки собственников). В настройках лежат доступы каналов, в
    // очереди — служебные данные источника: раздел только для администратора
    // (та же проверка на странице /crm/sources)
    ...(isAdmin ? [{ id: 'sources', href: '/crm/sources', label: t.crm.navSources }] : []),
    // «Застройщики»: компании-застройщики и их жилые комплексы. Раздел только
    // для администратора — в карточке контакт представителя (персональные
    // данные), а заводить и править справочник может только администратор
    // (та же проверка на странице /crm/developers)
    ...(isAdmin ? [{ id: 'developers', href: '/crm/developers', label: t.crm.navDevelopers }] : []),
    // «Архив объектов»: снятые с продажи объекты остаются в базе, но скрыты
    // с сайта, из каталога, поиска и с площадок публикации (src/lib/archive.ts)
    { id: 'archive', href: '/crm/archive', label: t.crm.navArchive },
    // «Агенты»: риелторы агентства и объекты каждого. Раздел виден всем
    // сотрудникам CRM (объекты коллег — на чтение, редактирует их
    // ответственный агент или администратор, см. src/app/crm/agents)
    { id: 'agents', href: '/crm/agents', label: t.crm.navAgents },
    // «Доска»: очередь модерации объявлений с сайта (src/lib/board.ts).
    // Раздел открыт всей команде — объявлений со временем будет много
    { id: 'board', href: '/crm/board', label: t.crm.navBoard },
    // «Отзывы»: отзывы клиентов с сайта ждут проверки перед публикацией
    // (src/lib/reviews.ts). Раздел открыт всей команде — отзывы касаются
    // работы агентов, и очередь не должна зависеть от одного человека
    { id: 'reviews', href: '/crm/reviews', label: t.crm.navReviews },
    // «Новости на проверку»: официальные новости о недвижимости ждут
    // подтверждения перед публикацией в блоге (src/lib/news.ts)
    { id: 'news', href: '/crm/news', label: t.crm.navNews },
    { id: 'market', href: '/crm/market', label: t.crm.navMarket },
    { id: 'stats', href: '/crm/stats', label: t.crm.navStats },
    // «Статистика сайта»: посещения, источники, популярные страницы и объекты.
    // Раздел только для администратора — агентам и клиентам статистика
    // недоступна (та же проверка на странице /crm/site-stats)
    ...(isAdmin ? [{ id: 'site-stats', href: '/crm/site-stats', label: t.crm.navSiteStats }] : []),
    // «Посетители» и «Интерес к объектам»: обезличенные карточки посетителей,
    // их действия и интерес к объектам. Здесь есть связь с обращениями, поэтому
    // разделы открыты только администратору, а каждый заход записывается в
    // журнал доступа (ст. 19 152-ФЗ, см. src/lib/analytics-access.ts)
    ...(isAdmin ? [{ id: 'visitors', href: '/crm/visitors', label: t.crm.navVisitors }] : []),
    ...(isAdmin ? [{ id: 'interest', href: '/crm/interest', label: t.crm.navInterest }] : []),
    { id: 'mail', href: '/crm/mail', label: t.crm.navMail },
    // Рекламой управляет администратор — агентам раздел не показываем
    ...(isAdmin ? [{ id: 'advertising', href: '/crm/advertising', label: t.crm.navAdvertising }] : []),
    // «Интеграции площадок»: в настройках лежат ключи и токены Авито/ЦИАН/
    // Домклика — подключение и проверка соединения только у администратора
    ...(isAdmin ? [{ id: 'integrations', href: '/crm/integrations', label: t.crm.intTitle }] : []),
    ...(user.agentAccess ? [{ id: 'agent', href: '/crm/agent', label: t.crm.navAgent }] : []),
  ]

  // Сессия Payload живёт 2 часа (auth.tokenExpiration) и продлевается только
  // запросом refresh-token. Пока CRM открыта, продлеваем её сами: иначе
  // сотрудник, заполняющий карточку объекта, в середине работы оказывается
  // «выброшенным» — обновление страницы уводит на форму входа, а загрузка
  // фото молча перестаёт работать. Ошибку не показываем: если продлить не
  // удалось (сессия уже кончилась), карточка сама предложит войти, не теряя
  // заполненные данные (см. CrmObjects).
  useEffect(() => {
    const keepAlive = () => {
      void fetch('/api/users/refresh-token', { method: 'POST', credentials: 'include' }).catch(() => {})
    }
    const timer = setInterval(keepAlive, 20 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // Число неразобранных заявок собственников: считается тем же REST-ом
  // Payload, что и таблица коллекции, — доступ к ней закрыт для всех, кроме
  // администратора, поэтому и запрос уходит только под админской сессией.
  // limit=1: нужен не список, а totalDocs; ошибку молча пропускаем — счётчик
  // не должен мешать работе CRM
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    const params = new URLSearchParams({ limit: '1', depth: '0' })
    OWNER_QUEUE_STATUSES.forEach((status, i) => params.append(`where[status][in][${i}]`, status))
    const load = async () => {
      try {
        const res = await fetch(`/api/owner-applications?${params}`, { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as { totalDocs?: number } | null
        if (!cancelled) setOwnerQueue(Number(data?.totalDocs) || 0)
      } catch {
        /* счётчик — вспомогательная подсказка, без него страница работает */
      }
    }
    void load()
    const timer = setInterval(() => void load(), 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isAdmin])

  const signOut = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || 'Н'

  return (
    <main className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <img className="crm-logo" src="/logo.png" alt="Н15" />
          <span>{t.crm.sidebarCaption}</span>
        </div>
        <nav className="crm-nav" aria-label="Разделы CRM">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={item.badge ? 'crm-nav-owner' : undefined}
              style={active === item.id ? { background: 'rgba(198,160,105,.14)', color: '#e4c89f' } : undefined}
            >
              <span>{item.label}</span>
              {/* Заметный счётчик новых заявок: цифра на золоте рядом с
                  пунктом «Заявки собственников», пока заявка не разобрана */}
              {item.badge ? (
                <span className="crm-nav-badge" aria-label={`${t.crm.navOwnerApplications}: ${item.badge}`}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
          {/* На телефоне меню кабинета сворачивается в сетку — рядом с разделами
              держим кнопку «+ Добавить объект» (на десктопе она на «Обзоре»
              и в разделе «Объекты», в сайдбаре не дублируется: .crm-nav-add
              показывается только на экранах до 900px) */}
          <Link className="crm-nav-add" href="/crm/objects?add=1">
            + {t.crm.objAdd}
          </Link>
        </nav>
        <div className="crm-sidebar-bottom">
          <Link className="crm-site-link" href="/">{t.crm.openSite}</Link>
        </div>
      </aside>
      <section className="crm-main" id="overview">
        <header className="crm-topbar">
          <div className="crm-greeting">
            <p>{t.crm.greeting}</p>
            <h1>Добрый день, {user.name}</h1>
          </div>
          <div className="crm-user">
            <span className="crm-avatar">{initial}</span>
            <div>
              <strong>{isAdmin ? t.crm.roleAdmin : t.crm.roleAgent}</strong>
              <span>{user.name}</span>
              <button type="button" className="crm-signout" onClick={() => void signOut()} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                {t.crm.signOut}
              </button>
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  )
}

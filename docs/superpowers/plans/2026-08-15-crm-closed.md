# Закрытая CRM /crm — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрытая CRM для команды на `/crm` внутри основного приложения: Payload-авторизация с проверкой роли (agent/admin), дашборд с метриками, воронка и чаты (перенос из ЛК), управление объектами через Payload REST.

**Architecture:** Топ-уровневый роут `src/app/crm/` со своим тёмным layout (исключён из локализации в proxy.ts). Серверная проверка сессии через `payload.auth({ headers })` на каждой странице. Переиспользование `FunnelBoard`/`ChatList`/`ChatThread` с новым пропом `basePath`. Объекты — CRUD через `/api/objects` и `/api/media`.

**Tech Stack:** Next.js 16 (Turbopack), Payload REST, i18n ru/os, New Standard.

**Спека:** `docs/superpowers/specs/2026-08-15-crm-closed-design.md`

## Global Constraints

- **⚠️ ЗАПРЕЩЕНЫ git-коммиты и push — явная команда пользователя. Все шаги «Commit» ПРОПУСКАЮТСЯ.**
- Проверка: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` + `npm run lint` + браузер (dev-сервер http://localhost:3000)
- TypeScript модифицирован: однострочные `if (x) a() else b()` без фигурных скобок ломают компиляцию — всегда `{ }`
- Правило `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- Стиль CRM — из прототипа (`crm.css` + `crm-additions.css`), шрифт Baskerville → `'New Standard', Georgia, serif`
- Тестовые аккаунты (локально): admin `dzagurov95@gmail.com`, agent `agent1@test.ru` (роль agent), client `client1@test.ru` (пароль `test12345`)

---

### Task 1: Роут /crm, proxy-исключение, layout, crm.css

**Files:**
- Create: `src/app/crm/layout.tsx`, `src/app/crm/crm.css`
- Modify: `src/proxy.ts`

**Interfaces:**
- Produces: layout `/crm` (тёмный фон, без Header сайта), классы `crm-*` — используются в Tasks 3-6

- [ ] **Step 1: proxy.ts — исключить crm из локализации**

В `src/proxy.ts` изменить matcher:

```ts
export const config = {
  matcher: ['/((?!api|_next|admin|admin-add|crm|.*\\..*).*)'],
}
```

- [ ] **Step 2: Создать `src/app/crm/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './crm.css'

export const metadata: Metadata = {
  title: { default: 'CRM N15', template: '%s · CRM N15' },
  robots: { index: false, follow: false },
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-[#f5f2eb]">{children}</body>
    </html>
  )
}
```

⚠️ Внимание: layout на топ-уровне `/crm` сам рендерит `<html>`/`<body>` (как `(site)/[lang]/layout.tsx`). Глобальные стили сайта: импортировать `@/app/globals.css` НЕ нужно — CRM изолирован; но глобальный `body`/`a` из globals.css не будет применяться (это плюс).

- [ ] **Step 3: Создать `src/app/crm/crm.css`**

Полный CSS из прототипа (`crm.css` + `crm-additions.css`), с заменами:
- `Baskerville,"Iowan Old Style","Palatino Linotype","Book Antiqua",serif` → `'New Standard', Georgia, serif`
- `Arial,Helvetica,sans-serif` → оставить Arial (body CRM как в прототипе)
- путь Фатимы `/images/fatima-ossetia.png` → `/img/fatima-ossetia.png`
- путь лого `/images/n15-logo.png` → `/img/n15-logo.png`

Скопировать содержимое обоих файлов прототипа (`C:/Users/Admin/Documents/N15-chatgpt/app/crm/crm.css` и `crm-additions.css`), применить замены выше.

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/crm`
Expected: tsc PASS; `/crm` отвечает (200 или redirect — страницы ещё нет, но роут не уходит в /ru/...)

- [ ] **Step 5: НЕ коммитить** — перейти к Task 2

---

### Task 2: i18n ключи crm.* (ru+os)

**Files:**
- Modify: `src/i18n/dictionaries.ts`

**Interfaces:**
- Produces: ключи `crm.*` — используются в Tasks 3-6

- [ ] **Step 1: Добавить в ru-словарь** (после блока `landing: { ... },`)

```ts
  crm: {
    loginTitle: 'Вход в CRM N15',
    loginKicker: 'Закрытая рабочая система',
    loginText: 'Клиенты, объекты, задачи и звонки доступны только владельцу и приглашённым сотрудникам.',
    loginEmail: 'Email',
    loginPassword: 'Пароль',
    loginButton: 'Войти',
    loginError: 'Неверный email или пароль',
    backToSite: '← Вернуться на сайт',
    deniedTitle: 'Доступ только для команды N15',
    deniedText: 'Личный кабинет клиента не даёт доступа к CRM. Если вы сотрудник — попросите владельца выдать роль агента или администратора.',
    deniedLogout: 'Выйти и вернуться на сайт',
    navOverview: 'Обзор',
    navLeads: 'Заявки',
    navMessages: 'Сообщения',
    navObjects: 'Объекты',
    navTeam: 'Команда',
    sidebarCaption: 'закрытая CRM',
    openSite: '← Открыть сайт N15',
    greeting: 'Рабочее пространство',
    roleAdmin: 'Администратор',
    roleAgent: 'Агент N15',
    signOut: 'Выйти',
    metricObjects: 'Объекты',
    metricObjectsNote: 'в базе N15',
    metricLeads: 'Активные заявки',
    metricLeadsNote: 'в работе',
    metricClients: 'Клиенты',
    metricClientsNote: 'контактов',
    metricMessages: 'Сообщения',
    metricMessagesNote: 'в чатах',
    recentLeads: 'Последние заявки',
    recentLeadsNote: 'клик — открыть чат',
    thClient: 'Клиент',
    thObject: 'Объект',
    thStage: 'Стадия',
    thAgent: 'Агент',
    emptyLeads: 'Заявок пока нет',
    emptyLeadsText: 'Заявки с сайта появятся здесь автоматически.',
    objAdd: 'Добавить объект',
    objEdit: 'Редактировать',
    objDelete: 'Удалить',
    objDeleteConfirm: 'Удалить объект? Это действие необратимо.',
    objSaved: 'Сохранено',
    objSaving: 'Сохранение…',
    objTitle: 'Название объекта',
    objType: 'Тип сделки',
    objCategory: 'Категория',
    objPrice: 'Цена, ₽',
    objArea: 'Площадь, м²',
    objLivingArea: 'Жилая, м²',
    objKitchenArea: 'Кухня, м²',
    objRooms: 'Комнат',
    objFloor: 'Этаж',
    objTotalFloors: 'Этажей',
    objBuildingType: 'Тип дома',
    objCondition: 'Состояние',
    objHeating: 'Отопление',
    objBalcony: 'Балкон',
    objWater: 'Вода',
    objSewerage: 'Канализация',
    objElectricity: 'Электричество',
    objGas: 'Газ',
    objInternet: 'Интернет',
    objAddress: 'Адрес',
    objCity: 'Город',
    objDistrict: 'Район',
    objStreet: 'Улица',
    objHouse: 'Дом',
    objApartment: 'Квартира',
    objLat: 'Широта',
    objLng: 'Долгота',
    objDescription: 'Описание',
    objFeatures: 'Особенности (по одной)',
    objFeatureAdd: 'Добавить',
    objStatus: 'Статус',
    objAgent: 'Агент',
    objPhotos: 'Фотографии',
    objPhotosHint: 'Первая — обложка. Перетаскивание порядка не требуется: кнопки под фото.',
    objPhotoPick: 'Загрузить фото',
    objPhotoCover: 'Сделать обложкой',
    objPhotoRemove: 'Убрать',
    objNoPhotos: 'Фото ещё не загружены',
    statusPublished: 'Опубликован',
    statusDraft: 'Черновик',
    statusArchived: 'Архив',
  },
```

- [ ] **Step 2: Зеркально в os-словарь**

```ts
  crm: {
    loginTitle: 'CRM N15-мæ бацæуæн',
    loginKicker: 'Æхгæд кусæн системæ',
    loginText: 'Клиенттæ, объекттæ, хæстæ æмæ дзурдтæ ис æрмæст хицауæн æмæ хонгæ кусджытæн.',
    loginEmail: 'Email',
    loginPassword: 'Пароль',
    loginButton: 'Бацæуын',
    loginError: 'Email кæнæ пароль раст нæу',
    backToSite: '← Сайтмæ аздæхын',
    deniedTitle: 'Бацæуæн æрмæст N15-ы командæйæн',
    deniedText: 'Клиенты хиуарт кабинет CRM-мæ бацæуæн нæ дæтты. Кусæг куы уай — хицауæй агент кæнæ администраторы роль ракур.',
    deniedLogout: 'Рацæуын æмæ сайтмæ аздæхын',
    navOverview: 'Æвзæрст',
    navLeads: 'Заявкæтæ',
    navMessages: 'Ныхæстæ',
    navObjects: 'Объекттæ',
    navTeam: 'Командæ',
    sidebarCaption: 'æхгæд CRM',
    openSite: '← N15-ы сайт байгом кæнын',
    greeting: 'Кусæн бынат',
    roleAdmin: 'Администратор',
    roleAgent: 'Агент N15',
    signOut: 'Рацæуын',
    metricObjects: 'Объекттæ',
    metricObjectsNote: 'N15-ы бындуры',
    metricLeads: 'Активон заявкæтæ',
    metricLeadsNote: 'куысты',
    metricClients: 'Клиенттæ',
    metricClientsNote: 'контактты',
    metricMessages: 'Ныхæстæ',
    metricMessagesNote: 'чатты',
    recentLeads: 'Фæстаг заявкæтæ',
    recentLeadsNote: 'ныкъуырд — чат байгом кæнын',
    thClient: 'Клиент',
    thObject: 'Объект',
    thStage: 'Стади',
    thAgent: 'Агент',
    emptyLeads: 'Заявкæтæ нырма нæй',
    emptyLeadsText: 'Сайты заявкæтæ ам хи ныхæй фæзындзысты.',
    objAdd: 'Объект бафтау',
    objEdit: 'Баив',
    objDelete: 'Асхафын',
    objDeleteConfirm: 'Объект асхафын? Ацы архайд фæстæмæ нæ здæхы.',
    objSaved: 'Бавæрд æрцыд',
    objSaving: 'Æвæры…',
    objTitle: 'Объекты ном',
    objType: 'Базары хуыз',
    objCategory: 'Категори',
    objPrice: 'Аргъ, ₽',
    objArea: 'Фæзуат, м²',
    objLivingArea: 'Цæрæн, м²',
    objKitchenArea: 'Кухня, м²',
    objRooms: 'Уатты',
    objFloor: 'Этæж',
    objTotalFloors: 'Этæжты',
    objBuildingType: 'Хæдзары тип',
    objCondition: 'Уавæр',
    objHeating: 'Хъармгæнæн',
    objBalcony: 'Балкон',
    objWater: 'Дон',
    objSewerage: 'Канализаци',
    objElectricity: 'Электрикон',
    objGas: 'Газ',
    objInternet: 'Интернет',
    objAddress: 'Адрис',
    objCity: 'Горæт',
    objDistrict: 'Район',
    objStreet: 'Уынг',
    objHouse: 'Хæдзар',
    objApartment: 'Квартирæ',
    objLat: 'Уæрхат',
    objLng: 'Дæргъад',
    objDescription: 'Нывæрд',
    objFeatures: 'Хицæндзинæдтæ (иугай)',
    objFeatureAdd: 'Бафтау',
    objStatus: 'Статус',
    objAgent: 'Агент',
    objPhotos: 'Къамтæ',
    objPhotosHint: 'Фыццаг — сæрæн. Фæтк ивынæн дæлдæр кнопкæтæ ис.',
    objPhotoPick: 'Къам равзарын',
    objPhotoCover: 'Сæрæн скæнын',
    objPhotoRemove: 'Аиуварс кæнын',
    objNoPhotos: 'Къамтæ нырма нæй',
    statusPublished: 'Рауагъд',
    statusDraft: 'Черновик',
    statusArchived: 'Архив',
  },
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS (пропущенный ключ в os = ошибка типа)

- [ ] **Step 4: НЕ коммитить** — перейти к Task 3

---

### Task 3: Доступ (серверный хелпер) + CrmLogin + страница входа

**Files:**
- Create: `src/app/crm/auth.ts` (серверный хелпер)
- Create: `src/components/crm/CrmLogin.tsx` (клиентская форма)
- Create: `src/app/crm/login/page.tsx`

**Interfaces:**
- Produces: `getCrmUser(): Promise<{ id: number; name: string; email: string; role: string } | null>` — используется в Tasks 4-6; `CrmLogin({ t }: { t: Dict })`

- [ ] **Step 1: Создать `src/app/crm/auth.ts`**

```ts
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

export interface CrmUser {
  id: number
  name: string
  email: string
  role: string
}

/**
 * Серверная проверка сессии CRM: Payload-auth по cookie запроса.
 * null — не залогинен; роль user — клиент (доступ в CRM запрещён).
 */
export async function getCrmUser(): Promise<CrmUser | null> {
  const headersList = await headers()
  const payload = await getPayload({ config })
  try {
    const result = await payload.auth({ headers: headersList })
    const user = result.user as { id?: number; name?: string; email?: string; role?: string } | null | undefined
    if (!user?.id) return null
    return {
      id: user.id as number,
      name: (user.name as string) || (user.email as string) || 'Команда',
      email: (user.email as string) || '',
      role: (user.role as string) || 'user',
    }
  } catch {
    return null
  }
}

export function canAccessCrm(user: CrmUser): boolean {
  return user.role === 'agent' || user.role === 'admin'
}
```

- [ ] **Step 2: Создать `src/components/crm/CrmLogin.tsx`**

```tsx
'use client'

import { useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import type { Dict } from '@/i18n/dictionaries'

export const CrmLogin: FC<{ t: Dict }> = ({ t }) => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(t.crm.loginError)
      setLoading(false)
      return
    }
    const role = data?.user?.role
    if (role === 'agent' || role === 'admin') {
      router.push('/crm')
      router.refresh()
      return
    }
    // Клиент — в CRM нельзя; выводим в тот же экран
    setError(t.crm.deniedTitle)
    setLoading(false)
  }

  return (
    <main className="crm-login">
      <section className="crm-login-card">
        <div className="crm-login-brand">
          <img className="crm-logo large" src="/img/n15-logo.png" alt="Н15" />
          <span>CRM</span>
        </div>
        <p className="crm-login-kicker">{t.crm.loginKicker}</p>
        <h1>{t.crm.loginTitle}</h1>
        <p>{t.crm.loginText}</p>
        <form className="crm-login-form" onSubmit={(e) => void submit(e)}>
          <label>
            {t.crm.loginEmail}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@n15-realty.ru" />
          </label>
          <label>
            {t.crm.loginPassword}
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="crm-login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '…' : t.crm.loginButton}
          </button>
        </form>
        <a className="crm-back-link" href="/">{t.crm.backToSite}</a>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Создать `src/app/crm/login/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmLogin } from '@/components/crm/CrmLogin'

export const dynamic = 'force-dynamic'

export default async function CrmLoginPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (user && canAccessCrm(user)) {
    redirect('/crm')
  }
  return <CrmLogin t={t} />
}
```

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/app/crm/auth.ts src/components/crm/CrmLogin.tsx "src/app/crm/login/page.tsx"`
Expected: PASS

- [ ] **Step 5: Проверить в браузере**

- http://localhost:3000/crm/login — форма входа отображается (тёмный экран с лого)
- Войти клиентом (client1@test.ru) → ошибка «Доступ только для команды N15»
- Войти агентом (agent1@test.ru) → redirect на /crm (страница пока 404 — ок до Task 4)

- [ ] **Step 6: НЕ коммитить** — перейти к Task 4

---

### Task 4: CrmShell + дашборд с метриками + последние заявки

**Files:**
- Create: `src/components/crm/CrmShell.tsx`
- Create: `src/app/crm/page.tsx` (дашборд, server component)

**Interfaces:**
- Consumes: `getCrmUser`, `canAccessCrm` (Task 3), ключи `crm.*` (Task 2)
- Produces: `CrmShell({ user, t, active, children }: { user: CrmUser; t: Dict; active: string; children: ReactNode })` — используется в Tasks 5-6

- [ ] **Step 1: Создать `src/components/crm/CrmShell.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import type { CrmUser } from '@/app/crm/auth'

interface Props {
  user: CrmUser
  t: Dict
  active: string
  children: ReactNode
}

export function CrmShell({ user, t, active, children }: Props) {
  const isAdmin = user.role === 'admin'
  const navItems = [
    { id: 'overview', href: '/crm', label: t.crm.navOverview, adminOnly: false },
    { id: 'leads', href: '/crm/leads', label: t.crm.navLeads, adminOnly: false },
    { id: 'messages', href: '/crm/messages', label: t.crm.navMessages, adminOnly: false },
    { id: 'objects', href: '/crm/objects', label: t.crm.navObjects, adminOnly: false },
  ]

  const signOut = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || 'N'

  return (
    <main className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <img className="crm-logo" src="/img/n15-logo.png" alt="Н15" />
          <span>{t.crm.sidebarCaption}</span>
        </div>
        <nav className="crm-nav" aria-label="Разделы CRM">
          {navItems.map((item) => (
            <a key={item.id} href={item.href} style={active === item.id ? { background: 'rgba(198,160,105,.14)', color: '#e4c89f' } : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="crm-sidebar-bottom">
          <a className="crm-site-link" href="/">{t.crm.openSite}</a>
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
```

- [ ] **Step 2: Создать `src/app/crm/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from './auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { stageLabel } from '@/components/lk/FunnelCard'

export const dynamic = 'force-dynamic'

const STAGE_ORDER = ['new', 'call', 'showing', 'negotiation', 'deal', 'closed', 'rejected']

export default async function CrmPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    return (
      <main className="crm-access-denied">
        <div>
          <strong>N15</strong>
          <h1>{t.crm.deniedTitle}</h1>
          <p>{t.crm.deniedText}</p>
          <a className="crm-denied-back" href="/api/users/logout">{t.crm.deniedLogout}</a>
        </div>
      </main>
    )
  }

  const payload = await getPayload({ config })
  const [objectsCount, clientsCount, activeLeads, messagesCount, recentDocs] = await Promise.all([
    payload.count({ collection: 'objects' }),
    payload.count({ collection: 'users', where: { role: { equals: 'user' } } }),
    payload.count({
      collection: 'applications',
      where: { and: [{ status: { not_equals: 'closed' } }, { status: { not_equals: 'rejected' } }] },
    }),
    payload.count({ collection: 'messages' }),
    payload.find({
      collection: 'applications',
      sort: '-createdAt',
      limit: 5,
      depth: 1,
    }),
  ])

  const metrics = [
    { label: t.crm.metricObjects, value: String(objectsCount.totalDocs), note: t.crm.metricObjectsNote },
    { label: t.crm.metricLeads, value: String(activeLeads.totalDocs), note: t.crm.metricLeadsNote },
    { label: t.crm.metricClients, value: String(clientsCount.totalDocs), note: t.crm.metricClientsNote },
    { label: t.crm.metricMessages, value: String(messagesCount.totalDocs), note: t.crm.metricMessagesNote },
  ]

  const recent = (recentDocs.docs || []).map((d) => {
    const a = d as unknown as Record<string, unknown>
    const obj = a.object as Record<string, unknown> | undefined
    const clientUser = a.user as Record<string, unknown> | undefined
    const agent = a.agent as Record<string, unknown> | undefined
    return {
      id: a.id as number,
      client: (clientUser?.name as string) || (a.clientName as string) || '—',
      object: (obj?.title as string) || (a.type as string) || '—',
      stage: stageLabel(t, (a.status as string) || 'new'),
      agent: (agent?.name as string) || '—',
    }
  })

  return (
    <CrmShell user={user} t={t} active="overview">
      <div className="crm-metrics">
        {metrics.map((m) => (
          <article className="crm-metric" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </div>
      <div className="crm-grid">
        <article className="crm-card wide" id="leads">
          <div className="crm-card-header">
            <h2>{t.crm.recentLeads}</h2>
            <span>{t.crm.recentLeadsNote}</span>
          </div>
          {recent.length ? (
            <table className="crm-table">
              <thead>
                <tr><th>{t.crm.thClient}</th><th>{t.crm.thObject}</th><th>{t.crm.thStage}</th><th>{t.crm.thAgent}</th></tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => { if (typeof window !== 'undefined') window.location.href = `/crm/messages/${r.id}` }}>
                    <td><strong>{r.client}</strong></td>
                    <td>{r.object}</td>
                    <td><span className="crm-status">{r.stage}</span></td>
                    <td>{r.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty"><strong>{t.crm.emptyLeads}</strong><p>{t.crm.emptyLeadsText}</p></div>
          )}
        </article>
      </div>
    </CrmShell>
  )
}
```

⚠️ Внимание: `onClick` со `window.location.href` на `<tr>` — серверный компонент; для кликабельности проще обернуть клиента в `<td><a href={`/crm/messages/${r.id}`}>` — заменить onClick-вариант на ссылку:

```tsx
<td><a href={`/crm/messages/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><strong>{r.client}</strong></a></td>
```

(и убрать onClick со строки)

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/app/crm/page.tsx" src/components/crm/CrmShell.tsx`
Expected: PASS

- [ ] **Step 4: Проверить в браузере**

- Войти агентом → http://localhost:3000/crm — метрики (Объекты 8, Заявки N, Клиенты 3, Сообщения N) и таблица последних заявок
- Клик по строке заявки → переход на /crm/messages/[id] (страница появится в Task 5)
- Клиент (client1@test.ru) на /crm → экран «Доступ только для команды»

- [ ] **Step 5: НЕ коммитить** — перейти к Task 5

---

### Task 5: Воронка и чаты в CRM (basePath)

**Files:**
- Modify: `src/components/lk/ChatList.tsx` (проп basePath)
- Modify: `src/components/lk/ChatThread.tsx` (проп basePath)
- Create: `src/app/crm/leads/page.tsx`
- Create: `src/app/crm/messages/page.tsx`
- Create: `src/app/crm/messages/[applicationId]/page.tsx`

**Interfaces:**
- Consumes: `CrmShell` (Task 4), `FunnelBoard`, `ChatList`, `ChatThread` (существующие)
- Produces: страницы CRM-воронки и чатов

- [ ] **Step 1: basePath в ChatList**

В `src/components/lk/ChatList.tsx`:
- Сигнатура: `export default function ChatList({ lang, basePath = '/lk/messages' }: { lang: string; basePath?: string })`
- Заменить в ссылке: `href={`/${lang}/lk/messages/${c.applicationId}`}` → `href={`${basePath}/${c.applicationId}`}` (убрать lang-префикс из basePath-ссылки — CRM без локали)

- [ ] **Step 2: basePath в ChatThread**

В `src/components/lk/ChatThread.tsx`:
- Сигнатура: `export default function ChatThread({ applicationId, lang, basePath = '/lk/messages' }: { applicationId: number; lang: string; basePath?: string })`
- В шапке ссылка «назад» не используется (её нет в компоненте); проверить, что ссылок на /lk внутри нет — единственная ссылка на объект `/${lang}/catalog/...` (остаётся как есть)

- [ ] **Step 3: Страница /crm/leads**

`src/app/crm/leads/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import FunnelBoard from '@/components/lk/FunnelBoard'

export const dynamic = 'force-dynamic'

export default async function CrmLeadsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="leads">
      <FunnelBoard lang="ru" />
    </CrmShell>
  )
}
```

- [ ] **Step 4: Страницы /crm/messages и /crm/messages/[applicationId]**

`src/app/crm/messages/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import ChatList from '@/components/lk/ChatList'

export const dynamic = 'force-dynamic'

export default async function CrmMessagesPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="messages">
      <ChatList lang="ru" basePath="/crm/messages" />
    </CrmShell>
  )
}
```

`src/app/crm/messages/[applicationId]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import ChatThread from '@/components/lk/ChatThread'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ applicationId: string }>
}

export default async function CrmChatPage({ params }: PageProps) {
  const { applicationId } = await params
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  const id = parseInt(applicationId, 10)
  if (!Number.isFinite(id)) notFound()
  return (
    <CrmShell user={user} t={t} active="messages">
      <ChatThread applicationId={id} lang="ru" basePath="/crm/messages" />
    </CrmShell>
  )
}
```

⚠️ ChatThread внутри CrmShell — светлый фон компонента (lp-стили ЛК-переменных `var(--n15-*)`) не определены в CRM-layout (globals.css сайта не подключён)! **Важно:** в `src/app/crm/layout.tsx` добавить импорт глобальных переменных: создать `src/app/crm/vars.css` с копией `:root`-блока токенов из globals.css (первые ~50 строк до `@theme inline`) и импортировать его в layout ДО crm.css. Тогда `var(--n15-*)` в переиспользуемых компонентах разрешатся.

Содержимое `src/app/crm/vars.css` — скопировать из `src/app/globals.css` блоки `@font-face New Standard` + `:root { ... }` + `html[data-theme='dark'] { ... }` + правила `body/a/h1-h6` не копировать (они конфликтуют с crm.css). Достаточно токенов `--n15-*` и `--font-display`.

- [ ] **Step 5: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/app/crm src/components/lk/ChatList.tsx src/components/lk/ChatThread.tsx`
Expected: PASS

- [ ] **Step 6: Проверить в браузере**

- http://localhost:3000/crm/leads — воронка агента (свои заявки)
- http://localhost:3000/crm/messages — список диалогов; клик → чат, сообщения грузятся, отправка работает
- ЛК (`/ru/lk`) — чаты/воронка клиента не затронуты (basePath по умолчанию)

- [ ] **Step 7: НЕ коммитить** — перейти к Task 6

---

### Task 6: Управление объектами (/crm/objects)

**Files:**
- Create: `src/components/crm/CrmObjects.tsx` (клиентский: список + форма с фото)
- Create: `src/app/crm/objects/page.tsx`

**Interfaces:**
- Consumes: `CrmShell` (Task 4), `getCrmUser` (Task 3), ключи `crm.*` (Task 2)
- Produces: страница управления объектами

- [ ] **Step 1: Создать `src/app/crm/objects/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getDictionary } from '@/i18n/dictionaries'
import { canAccessCrm, getCrmUser } from '../auth'
import { CrmShell } from '@/components/crm/CrmShell'
import { CrmObjects } from '@/components/crm/CrmObjects'

export const dynamic = 'force-dynamic'

export default async function CrmObjectsPage() {
  const t = getDictionary('ru')
  const user = await getCrmUser()
  if (!user) redirect('/crm/login')
  if (!canAccessCrm(user)) {
    redirect('/crm')
  }
  return (
    <CrmShell user={user} t={t} active="objects">
      <CrmObjects t={t} isAdmin={user.role === 'admin'} />
    </CrmShell>
  )
}
```

- [ ] **Step 2: Создать `src/components/crm/CrmObjects.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'

interface ObjectRow {
  id: number
  title: string
  category: string
  price: number | null
  status: string
  agentName?: string
  thumb?: string
}

interface PhotoItem {
  id: number | null
  url?: string
  isNew: boolean
}

const emptyForm = {
  title: '', type: 'sale', category: 'apartment', price: '', area: '', livingArea: '',
  kitchenArea: '', rooms: '', floor: '', totalFloors: '', buildingType: '', condition: '',
  heating: '', balcony: '', water: '', sewerage: '', electricity: '', gas: '', internet: '',
  city: 'Владикавказ', district: '', street: '', house: '', apartment: '',
  lat: '', lng: '', description: '', status: 'draft', agent: '',
}

type FormState = typeof emptyForm

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 7, color: '#6f6a61', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}{children}</label>
}

export const CrmObjects: FC<{ t: Dict; isAdmin: boolean }> = ({ t, isAdmin }) => {
  const [rows, setRows] = useState<ObjectRow[]>([])
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [features, setFeatures] = useState<string[]>([])
  const [featureInput, setFeatureInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const [objectsRes, agentsRes] = await Promise.all([
      fetch('/api/objects?limit=100&depth=1', { credentials: 'include' }),
      fetch('/api/agents?limit=100', { credentials: 'include' }),
    ])
    const objectsData = await objectsRes.json()
    const agentsData = await agentsRes.json()
    setRows(
      ((objectsData.docs || []) as Record<string, unknown>[]).map((o) => {
        const img = o.primaryImage as { url?: string } | undefined
        const agent = o.agent as { name?: string } | undefined
        return {
          id: o.id as number,
          title: o.title as string,
          category: o.category as string,
          price: o.price as number | null,
          status: o.status as string,
          agentName: agent?.name,
          thumb: img?.url,
        }
      }),
    )
    setAgents(((agentsData.docs || []) as { id: number; name: string }[]).map((a) => ({ id: a.id, name: a.name })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setPhotos([])
    setFeatures([])
  }

  const startEdit = async (o: Record<string, unknown>) => {
    setEditId(o.id as number)
    setForm({
      ...emptyForm,
      title: (o.title as string) || '',
      type: (o.type as string) || 'sale',
      category: (o.category as string) || 'apartment',
      price: o.price != null ? String(o.price) : '',
      area: o.area != null ? String(o.area) : '',
      livingArea: o.livingArea != null ? String(o.livingArea) : '',
      kitchenArea: o.kitchenArea != null ? String(o.kitchenArea) : '',
      rooms: o.rooms != null ? String(o.rooms) : '',
      floor: o.floor != null ? String(o.floor) : '',
      totalFloors: o.totalFloors != null ? String(o.totalFloors) : '',
      buildingType: (o.buildingType as string) || '',
      condition: (o.condition as string) || '',
      heating: (o.heating as string) || '',
      balcony: (o.balcony as string) || '',
      water: (o.water as string) || '',
      sewerage: (o.sewerage as string) || '',
      electricity: (o.electricity as string) || '',
      gas: (o.gas as string) || '',
      internet: (o.internet as string) || '',
      city: ((o.address as Record<string, unknown> | undefined)?.city as string) || 'Владикавказ',
      district: ((o.address as Record<string, unknown> | undefined)?.district as string) || '',
      street: ((o.address as Record<string, unknown> | undefined)?.street as string) || '',
      house: ((o.address as Record<string, unknown> | undefined)?.house as string) || '',
      apartment: ((o.address as Record<string, unknown> | undefined)?.apartment as string) || '',
      lat: ((o.coordinates as Record<string, unknown> | undefined)?.lat != null ? String((o.coordinates as Record<string, unknown>).lat) : ''),
      lng: ((o.coordinates as Record<string, unknown> | undefined)?.lng != null ? String((o.coordinates as Record<string, unknown>).lng) : ''),
      description: '',
      status: (o.status as string) || 'draft',
      agent: ((o.agent as Record<string, unknown> | undefined)?.id as number | undefined) != null ? String((o.agent as Record<string, unknown>).id) : '',
    })
    const img = o.primaryImage as { id?: number; url?: string } | undefined
    const imgs = (o.images as { id?: number; url?: string }[] | undefined) || []
    const all: PhotoItem[] = []
    if (img?.id) all.push({ id: img.id as number, url: img.url, isNew: false })
    for (const i of imgs) {
      if (i.id && !all.some((p) => p.id === i.id)) all.push({ id: i.id as number, url: i.url, isNew: false })
    }
    setPhotos(all)
    setFeatures(((o.features as { feature?: string }[] | undefined) || []).map((f) => f.feature || '').filter(Boolean))
    // Описание: richText — для простоты берём текстовый срез
    const rt = o.description as { root?: { children?: { children?: { text?: string }[] }[] } } | undefined
    const descText = (rt?.root?.children || []).map((p) => (p.children || []).map((c) => c.text || '').join('')).filter(Boolean).join('\n')
    setForm((prev) => ({ ...prev, description: descText }))
  }

  const onPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/media', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) continue
      const data = await res.json()
      const doc = data.doc as { id?: number; url?: string } | undefined
      if (doc?.id) {
        setPhotos((prev) => [...prev, { id: doc.id as number, url: doc.url, isNew: true }])
      }
    }
    e.target.value = ''
  }

  const makeCover = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.unshift(item)
      return next
    })
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    if (saving || !form.title.trim()) return
    setSaving(true)
    const mediaIds = photos.map((p) => p.id).filter((id): id is number => id !== null)
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      category: form.category,
      price: form.price ? Number(form.price) : undefined,
      area: form.area ? Number(form.area) : undefined,
      livingArea: form.livingArea ? Number(form.livingArea) : undefined,
      kitchenArea: form.kitchenArea ? Number(form.kitchenArea) : undefined,
      rooms: form.rooms ? Number(form.rooms) : undefined,
      floor: form.floor ? Number(form.floor) : undefined,
      totalFloors: form.totalFloors ? Number(form.totalFloors) : undefined,
      buildingType: form.buildingType || undefined,
      condition: form.condition || undefined,
      heating: form.heating || undefined,
      balcony: form.balcony || undefined,
      water: form.water || undefined,
      sewerage: form.sewerage || undefined,
      electricity: form.electricity || undefined,
      gas: form.gas || undefined,
      internet: form.internet || undefined,
      address: {
        city: form.city,
        district: form.district,
        street: form.street,
        house: form.house,
        apartment: form.apartment,
      },
      coordinates: form.lat || form.lng ? { lat: Number(form.lat) || undefined, lng: Number(form.lng) || undefined } : undefined,
      description: form.description.trim() ? { root: { children: [{ children: [{ text: form.description.trim(), type: 'text', version: 1 }], type: 'paragraph', version: 1 }], type: 'root', version: 1 } } : undefined,
      features: features.map((feature) => ({ feature })),
      status: form.status,
      agent: form.agent ? Number(form.agent) : undefined,
      primaryImage: mediaIds[0],
      images: mediaIds.slice(1),
    }

    const res = await fetch(editId ? `/api/objects/${editId}` : '/api/objects', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      resetForm()
      await load()
    }
  }

  const remove = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm(t.crm.objDeleteConfirm)) return
    await fetch(`/api/objects/${id}`, { method: 'DELETE', credentials: 'include' })
    await load()
  }

  const set = (k: keyof FormState, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  return (
    <div>
      <details className="crm-property-editor" open={editId !== null || rows.length === 0}>
        <summary><span>+</span> {editId ? t.crm.objEdit : t.crm.objAdd}</summary>
        <div className="crm-property-form">
          <Field label={t.crm.objTitle}><input value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objType}>
            <select value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }}>
              <option value="sale">Продажа</option><option value="rent">Аренда</option>
            </select>
          </Field>
          <Field label={t.crm.objCategory}>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }}>
              <option value="apartment">Квартира</option><option value="house">Дом</option><option value="townhouse">Таунхаус</option><option value="commercial">Коммерческая</option><option value="land">Участок</option>
            </select>
          </Field>
          <Field label={t.crm.objPrice}><input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objArea}><input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objLivingArea}><input type="number" value={form.livingArea} onChange={(e) => set('livingArea', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objKitchenArea}><input type="number" value={form.kitchenArea} onChange={(e) => set('kitchenArea', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objRooms}><input type="number" value={form.rooms} onChange={(e) => set('rooms', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objFloor}><input type="number" value={form.floor} onChange={(e) => set('floor', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objTotalFloors}><input type="number" value={form.totalFloors} onChange={(e) => set('totalFloors', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objBuildingType}><input value={form.buildingType} onChange={(e) => set('buildingType', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objCondition}><input value={form.condition} onChange={(e) => set('condition', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objHeating}><input value={form.heating} onChange={(e) => set('heating', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objBalcony}><input value={form.balcony} onChange={(e) => set('balcony', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objWater}><input value={form.water} onChange={(e) => set('water', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objSewerage}><input value={form.sewerage} onChange={(e) => set('sewerage', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objElectricity}><input value={form.electricity} onChange={(e) => set('electricity', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objGas}><input value={form.gas} onChange={(e) => set('gas', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objInternet}><input value={form.internet} onChange={(e) => set('internet', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>

          <div className="span-2" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
            <Field label={t.crm.objCity}><input value={form.city} onChange={(e) => set('city', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
            <Field label={t.crm.objDistrict}><input value={form.district} onChange={(e) => set('district', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
            <Field label={t.crm.objStreet}><input value={form.street} onChange={(e) => set('street', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
            <Field label={t.crm.objHouse}><input value={form.house} onChange={(e) => set('house', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
            <Field label={t.crm.objApartment}><input value={form.apartment} onChange={(e) => set('apartment', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          </div>
          <Field label={t.crm.objLat}><input value={form.lat} onChange={(e) => set('lat', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>
          <Field label={t.crm.objLng}><input value={form.lng} onChange={(e) => set('lng', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} /></Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objDescription}>
              <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} />
            </Field>
          </div>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <Field label={t.crm.objFeatures}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} style={{ flex: 1, boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }} />
                <button type="button" onClick={() => { if (featureInput.trim()) { setFeatures((prev) => [...prev, featureInput.trim()]); setFeatureInput('') } }} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '12px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                  {t.crm.objFeatureAdd}
                </button>
              </div>
              {features.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {features.map((f, i) => (
                    <span key={i} style={{ padding: '6px 10px', background: '#f2ede4', borderRadius: 999, fontSize: 11, color: '#716b62', cursor: 'pointer' }} onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))}>
                      {f} ✕
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <Field label={t.crm.objStatus}>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }}>
              <option value="draft">{t.crm.statusDraft}</option>
              <option value="published">{t.crm.statusPublished}</option>
              <option value="archived">{t.crm.statusArchived}</option>
            </select>
          </Field>
          <Field label={t.crm.objAgent}>
            <select value={form.agent} onChange={(e) => set('agent', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 7, background: 'white', color: '#25241f', padding: 12, font: '12px Arial' }}>
              <option value="">—</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <div className="crm-gallery-field">
              <div className="crm-gallery-heading">
                <div>
                  <strong>{t.crm.objPhotos}</strong>
                  <small>{t.crm.objPhotosHint}</small>
                </div>
                <label className="crm-photo-picker" style={{ position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px dashed #cbbda9', borderRadius: 9, background: '#fcfaf7', cursor: 'pointer', padding: 16 }}>
                  <span>{t.crm.objPhotoPick}</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => void onPhotoPick(e)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                </label>
              </div>
              {photos.length ? (
                <div className="crm-photo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10 }}>
                  {photos.map((p, i) => (
                    <div key={p.id ?? `new-${i}`} className="crm-photo" style={{ padding: 7, border: '1px solid #e2dacd', borderRadius: 9, background: 'white' }}>
                      <img src={p.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                      <div className="crm-photo-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
                        {i === 0 ? <b style={{ gridColumn: '1 / -1', textAlign: 'center', background: '#a7814e', color: 'white', borderRadius: 5, padding: '7px 4px', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.07em' }}>Обложка</b> : <button type="button" onClick={() => makeCover(i)} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: 7, fontSize: 8, cursor: 'pointer' }}>{t.crm.objPhotoCover}</button>}
                        {i !== 0 && <button type="button" className="remove" onClick={() => removePhoto(i)} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#9b4e43', padding: 7, fontSize: 8, cursor: 'pointer' }}>{t.crm.objPhotoRemove}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9b958a', fontSize: 11 }}>{t.crm.objNoPhotos}</p>
              )}
            </div>
          </div>

          <div className="span-2 crm-form-actions" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button type="button" onClick={() => void save()} disabled={saving} style={{ border: 0, borderRadius: 7, background: '#a7814e', color: 'white', padding: '14px 22px', textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 10, cursor: 'pointer' }}>
              {saving ? t.crm.objSaving : t.crm.objSaved && !saving ? t.crm.objSaved + ' ✓' : t.crm.objSave || (editId ? t.crm.objEdit : t.crm.objAdd)}
            </button>
            {saved && <p style={{ margin: 0, color: '#8b683f', fontSize: 11 }}>{t.crm.objSaved}</p>}
          </div>
        </div>
      </details>

      {loading ? (
        <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
      ) : rows.length ? (
        <table className="crm-table crm-properties-table">
          <thead>
            <tr><th>{t.crm.objTitle}</th><th>{t.crm.objCategory}</th><th>{t.crm.objPrice}</th><th>{t.crm.thAgent}</th><th>{t.crm.objStatus}</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {o.thumb && <img src={o.thumb} alt="" style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: 5 }} />}
                    <strong style={{ fontFamily: "'New Standard', Georgia, serif", fontSize: 13, fontWeight: 400 }}>{o.title}</strong>
                  </div>
                </td>
                <td>{o.category}</td>
                <td>{o.price != null ? new Intl.NumberFormat('ru-RU').format(o.price) + ' ₽' : '—'}</td>
                <td>{o.agentName || '—'}</td>
                <td><span className="crm-status">{o.status === 'published' ? t.crm.statusPublished : o.status === 'archived' ? t.crm.statusArchived : t.crm.statusDraft}</span></td>
                <td>
                  <button type="button" onClick={async () => { const res = await fetch(`/api/objects/${o.id}`, { credentials: 'include' }); const d = await res.json(); void startEdit(d) }} style={{ border: '1px solid #e1d8ca', borderRadius: 5, background: '#faf7f2', color: '#716b62', padding: '7px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>{t.crm.objEdit}</button>
                  {isAdmin && <button type="button" onClick={() => void remove(o.id)} style={{ marginLeft: 6, border: '1px solid #e3cfc7', borderRadius: 5, background: 'transparent', color: '#9b4e43', padding: '7px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', cursor: 'pointer' }}>{t.crm.objDelete}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="crm-empty"><strong>{t.crm.objAdd}</strong></div>
      )}
    </div>
  )
}
```

⚠️ В коде выше есть недочёт: ключ `t.crm.objSave` не объявлен в i18n. **Заменить** в кнопке сохранения на: `{saving ? t.crm.objSaving : editId ? t.crm.objEdit : t.crm.objAdd}` (убрать упоминание objSave и saved ✓).

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/crm/CrmObjects.tsx "src/app/crm/objects/page.tsx"`
Expected: PASS

- [ ] **Step 4: Проверить в браузере**

- http://localhost:3000/crm/objects — список объектов (8 тестовых)
- «Добавить объект» → заполнить название/категорию/цену + загрузить фото → сохранить → объект в списке
- http://localhost:3000/ru/catalog — новый опубликованный объект появился
- «Редактировать» — форма заполнена данными объекта; PATCH сохраняет

- [ ] **Step 5: НЕ коммитить** — перейти к Task 7

---

### Task 7: Чистка ЛК + футер лендинга → /crm

**Files:**
- Modify: `src/components/lk/LkShell.tsx` (убрать пункт «Воронка»)
- Modify: `src/app/(site)/[lang]/page.tsx` (футер: «Вход для команды» → /crm)

- [ ] **Step 1: LkShell — убрать воронку**

В `src/components/lk/LkShell.tsx` удалить блок spread с funnel из navItems:

```tsx
  const navItems: NavItem[] = [
    { href: `/${lang}/lk`, icon: 'dashboard', label: t.lk.home },
    { href: `/${lang}/lk/favorites`, icon: 'favorite', label: t.lk.favorites, count: counts?.favorites },
    { href: `/${lang}/lk/applications`, icon: 'article', label: t.lk.applications, count: counts?.applications },
    { href: `/${lang}/lk/messages`, icon: 'forum', label: t.lk.messages, count: counts?.unread },
    { href: `/${lang}/lk/profile`, icon: 'person', label: t.lk.profile },
  ]
```

(полностью удалить `...(role === 'agent' || role === 'admin' ? [...] : [])`; `role`-state можно оставить или удалить — если больше нигде не используется, удалить state и setRole)

- [ ] **Step 2: Футер лендинга**

В `src/app/(site)/[lang]/page.tsx` изменить:

```tsx
<a className="lp-team-login" href={`/${lang}/lk`}>{t.landing.footerTeam}</a>
```

на:

```tsx
<a className="lp-team-login" href="/crm">{t.landing.footerTeam}</a>
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/lk/LkShell.tsx "src/app/(site)/[lang]/page.tsx"`
Expected: PASS

- [ ] **Step 4: Проверить в браузере**

- `/ru/lk` под агентом — пункта «Воронка» нет
- `/ru` — футер: «Вход для команды» ведёт на /crm

- [ ] **Step 5: НЕ коммитить** — перейти к Task 8

---

### Task 8: Сквозная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint 2>&1 | grep -cE " error "`
Expected: `0`

- [ ] **Step 2: Сценарий агента**

1. `/crm/login` → вход агентом → дашборд с метриками
2. `/crm/leads` — воронка своих заявок, drag работает
3. `/crm/messages` → чат → ответ клиенту (проверить под клиентом: сообщение получено, бейдж в ЛК)
4. `/crm/objects` — создать объект с фото → опубликован в каталоге

- [ ] **Step 3: Сценарий клиента и админа**

1. Клиент на `/crm` → «Доступ только для команды»
2. Админ на `/crm` — видит все заявки в воронке, кнопку «Удалить» у объектов

- [ ] **Step 4: Регрессия ЛК и сайта**

- `/ru/lk` (клиент) — заявки/избранное/чат работают, воронки нет
- `/ru` — лендинг без изменений, «Вход для команды» → /crm
- `/ru/catalog` — фильтры, карточки работают

- [ ] **Step 5: Без коммитов — доложить о готовности**

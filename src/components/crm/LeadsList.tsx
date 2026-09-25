'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import { APPLICATION_TYPE_LABELS, STAGES, stageLabel, type FunnelApplication } from '@/components/lk/FunnelCard'

const POLL_MS = 30_000

// Цвета этапов: мягкая плашка с тёмным текстом — этап узнаётся по цвету
// и в списке, и в фильтре. Терминальные этапы («Завершено», «Отказ») —
// приглушённые, чтобы не спорили с активными заявками.
const STAGE_COLORS: Record<string, { bg: string; fg: string }> = {
  unsorted: { bg: '#eeece6', fg: '#6f6a61' },
  new: { bg: '#e6eef8', fg: '#3a5f92' },
  call: { bg: '#e2f0f0', fg: '#2c6b6b' },
  showing: { bg: '#ebe7f6', fg: '#574a8a' },
  negotiation: { bg: '#f7eeda', fg: '#8a6420' },
  deal: { bg: '#e5f0e2', fg: '#3c6f3f' },
  closed: { bg: '#e2e5df', fg: '#4a5546' },
  rejected: { bg: '#f6e5e2', fg: '#9b4e43' },
}

const stageColor = (stage: string) => STAGE_COLORS[stage] || { bg: '#f2eadf', fg: '#8d6b40' }

const money = (v: number) => new Intl.NumberFormat('ru-RU').format(v) + ' ₽'

// Заявка в списке: к данным воронки добавляется клиент из базы (карточка
// клиента) и запрос подбора — что, за сколько и где ищет клиент
interface LeadRow extends FunnelApplication {
  customerId?: number
  propertyType?: string
  budget?: number
  location?: string
  // Отметки согласий из формы заявки (поля consent, consentCallback,
  // marketingConsent — см. Applications.ts). Дата и версия документов
  // проставлены сервером; у заявок, заведённых агентом вручную, их нет
  consentData?: boolean
  consentCallback?: boolean
  marketingConsent?: boolean
  consentAt?: string
  legalVersion?: string
}

export default function LeadsList() {
  const { t } = useI18n()
  const router = useRouter()
  const [apps, setApps] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('') // '' — все этапы
  const [meRole, setMeRole] = useState('user')
  const [meAgentId, setMeAgentId] = useState<number | null>(null)
  const [menuId, setMenuId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const meRes = await fetch('/api/users/me', { credentials: 'include' })
    const meData = await meRes.json()
    const me = meData?.user
    if (!me) return
    setMeRole((me.role as string) || 'user')

    if (me.role === 'agent') {
      const agentRes = await fetch(`/api/agents?${new URLSearchParams({ where: JSON.stringify({ user: { equals: me.id } }), limit: '1', depth: '0' })}`, { credentials: 'include' })
      const agentData = await agentRes.json()
      setMeAgentId(((agentData.docs || [])[0] as { id?: number } | undefined)?.id ?? null)
    }

    const where: Record<string, unknown> = {}
    if (me.role === 'agent') {
      // Свои заявки + общий пул «Неразобранное»
      where.or = [
        { 'agent.user': { equals: me.id } },
        { status: { equals: 'unsorted' } },
      ]
    }
    const params = new URLSearchParams({ sort: '-createdAt', depth: '2', limit: '200' })
    if (Object.keys(where).length) params.set('where', JSON.stringify(where))
    const res = await fetch(`/api/applications?${params}`, { credentials: 'include' })
    const data = await res.json()
    const docs = (data.docs || []) as Record<string, unknown>[]
    setApps(docs.map((a) => {
      const obj = a.object as Record<string, unknown> | undefined
      const agent = a.agent as Record<string, unknown> | undefined
      const clientUser = a.user as Record<string, unknown> | undefined
      const customer = a.customer as Record<string, unknown> | undefined
      return {
        id: a.id as number,
        status: a.status as string,
        type: a.type as string,
        createdAt: a.createdAt as string,
        clientName: (clientUser?.name as string) || (a.clientName as string) || '—',
        clientPhone: (clientUser?.phone as string) || (a.clientPhone as string) || undefined,
        objectTitle: (obj?.title as string) || undefined,
        objectId: (obj?.id as number) || undefined,
        objectPrice: (obj?.price as number) || undefined,
        tags: ((a.tags as { tag?: string }[] | undefined) || []).map((tg) => tg.tag || '').filter(Boolean),
        agentName: (agent?.name as string) || undefined,
        customerId: (customer?.id as number) || undefined,
        // Запрос подбора: тип недвижимости, бюджет и место поиска — поля
        // заявки из формы «Подбор недвижимости» / «Заявка на поиск»
        propertyType: (a.propertyType as string) || undefined,
        budget: (a.budget as number) || undefined,
        location: (a.location as string) || undefined,
        consentData: a.consent === true,
        consentCallback: a.consentCallback === true,
        marketingConsent: a.marketingConsent === true,
        consentAt: (a.consentAt as string) || undefined,
        legalVersion: (a.legalVersion as string) || undefined,
        unread: 0,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled || document.visibilityState !== 'visible') return
      await load()
    }
    void tick()
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [load])

  // Меню этапа закрывается кликом мимо и по Escape
  useEffect(() => {
    if (menuId === null) return
    const close = () => setMenuId(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuId(null) }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of apps) m[a.status] = (m[a.status] || 0) + 1
    return m
  }, [apps])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return apps.filter((a) => {
      if (stage && a.status !== stage) return false
      if (!q) return true
      return a.clientName.toLowerCase().includes(q) ||
        (a.clientPhone || '').toLowerCase().includes(q) ||
        (a.objectTitle || '').toLowerCase().includes(q) ||
        (a.agentName || '').toLowerCase().includes(q)
    })
  }, [apps, search, stage])

  const changeStage = async (app: LeadRow, status: string) => {
    setMenuId(null)
    if (status === app.status) return
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)))
    const body: Record<string, unknown> = { status }
    // Агент забирает заявку из «Неразобранного» — назначается автоматически
    if (app.status === 'unsorted' && meRole === 'agent' && meAgentId) {
      body.agent = meAgentId
    }
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await load()
      }
    } catch {
      await load()
    }
  }

  // Клик по строке открывает полную карточку заявки (переписка по объекту)
  const openApp = (id: number) => {
    router.push(`/crm/messages/${id}`)
  }

  if (loading) {
    return <p style={{ color: '#817b70', fontSize: 12 }}>…</p>
  }

  const selectStyle: React.CSSProperties = {
    border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f',
    padding: '11px 12px', font: '12px Arial, Helvetica, sans-serif', cursor: 'pointer',
  }

  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
      <div style={{ flex: '1 1 240px', maxWidth: 420 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.crm.leadSearch}
          aria-label={t.crm.leadSearch}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif' }}
        />
      </div>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        aria-label={t.crm.stageFilter}
        style={selectStyle}
      >
        <option value="">{t.crm.stageFilterAll}</option>
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>{stageLabel(t, s.value)} ({counts[s.value] || 0})</option>
        ))}
      </select>
      {search && (
        <button type="button" onClick={() => setSearch('')}
          style={{ border: 0, background: 'none', color: '#8d6b40', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
          ✕
        </button>
      )}
    </div>
  )

  if (!apps.length) {
    return (
      <div>
        {toolbar}
        <div className="crm-empty" style={{ maxWidth: 1000 }}>
          <strong>{t.crm.emptyLeads}</strong>
          <p>{t.crm.emptyLeadsText}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {toolbar}
      {visible.length === 0 ? (
        <div className="crm-empty" style={{ maxWidth: 1000 }}>
          <p style={{ margin: 0 }}>{t.crm.noResults}</p>
        </div>
      ) : (
        <div className="crm-leads" role="list">
          <div className="crm-leads-head" aria-hidden="true">
            <span>{t.crm.thClient}</span>
            <span>{t.crm.thObject}</span>
            <span>{t.crm.thAgent}</span>
            <span>{t.crm.thStage}</span>
            <span>{t.crm.thDate}</span>
          </div>
          {visible.map((a) => {
            const color = stageColor(a.status)
            const date = new Date(a.createdAt).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })
            // Без объекта заголовок — тип заявки, поэтому в подписи его не повторяем
            const meta = [
              a.objectTitle ? (APPLICATION_TYPE_LABELS[a.type] || a.type) : '',
              a.objectPrice != null ? money(a.objectPrice) : '',
            ].filter(Boolean).join(' · ')
            // Запрос подбора (заявки без объекта): «Квартира · до 6 000 000 ₽ ·
            // Иристонский район» — агент видит, что именно искать
            const request = [
              a.propertyType ? (t.categoryLabels as unknown as Record<string, string>)[a.propertyType] || a.propertyType : '',
              a.budget ? money(a.budget) : '',
              a.location || '',
            ].filter(Boolean).join(' · ')
            // Отметки согласий из формы: агент видит, на что клиент согласился.
            // Подсказка — когда согласие дано и по какой редакции документов
            const consents = [
              a.consentData ? `${t.crm.consentsData} ✓` : '',
              a.consentCallback ? `${t.crm.consentsCallback} ✓` : '',
              a.marketingConsent ? `${t.crm.consentsMarketing} ✓` : '',
            ].filter(Boolean).join(' · ')
            const consentsHint = [
              t.crm.consentsTitle,
              a.consentAt ? new Date(a.consentAt).toLocaleString(t.locale) : '',
              a.legalVersion ? t.documents.version.replace('%s', a.legalVersion) : '',
            ].filter(Boolean).join(' · ')
            return (
              <div
                key={a.id}
                className={`crm-lead${menuId === a.id ? ' open' : ''}`}
                role="listitem"
                tabIndex={0}
                aria-label={[a.clientName, a.objectTitle, a.agentName, stageLabel(t, a.status)].filter(Boolean).join(' · ')}
                onClick={() => openApp(a.id)}
                onKeyDown={(e) => {
                  // Строка — не кнопка: Enter/пробел только когда фокус на самой строке
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openApp(a.id)
                  }
                }}
              >
                <span className="crm-lead-client">
                  {a.customerId ? (
                    <Link href={`/crm/customers/${a.customerId}`} className="crm-lead-name"
                      title={t.crm.customerCard} onClick={(e) => e.stopPropagation()}>
                      {a.clientName}
                    </Link>
                  ) : (
                    <span className="crm-lead-name">{a.clientName}</span>
                  )}
                  {a.clientPhone && (
                    <span className="crm-lead-sub">
                      <a href={`tel:${a.clientPhone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>{a.clientPhone}</a>
                    </span>
                  )}
                  {consents && (
                    <span className="crm-lead-sub" title={consentsHint}>{consents}</span>
                  )}
                </span>

                <span className="crm-lead-object">
                  <span className="crm-lead-title">{a.objectTitle || APPLICATION_TYPE_LABELS[a.type] || '—'}</span>
                  {meta && <span className="crm-lead-sub">{meta}</span>}
                  {!a.objectTitle && request && <span className="crm-lead-sub">{request}</span>}
                </span>

                <span className="crm-lead-agent">{a.agentName || '—'}</span>

                <span className="crm-lead-stage">
                  {/* Плашка этапа: клик открывает список этапов, выбор меняет статус заявки */}
                  <button
                    type="button"
                    className="crm-stage-pill"
                    style={{ background: color.bg, color: color.fg }}
                    title={t.crm.stageFilter}
                    aria-haspopup="menu"
                    aria-expanded={menuId === a.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuId(menuId === a.id ? null : a.id)
                    }}
                  >
                    {stageLabel(t, a.status)}
                    <span style={{ opacity: 0.55 }}>▾</span>
                  </button>
                  {menuId === a.id && (
                    <span className="crm-stage-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                      {STAGES.map((s) => (
                        <button key={s.value} type="button" role="menuitem"
                          aria-current={s.value === a.status}
                          onClick={() => void changeStage(a, s.value)}>
                          <span className="crm-stage-dot" style={{ background: stageColor(s.value).fg }} />
                          {stageLabel(t, s.value)}
                        </button>
                      ))}
                    </span>
                  )}
                </span>

                <span className="crm-lead-date">{date}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

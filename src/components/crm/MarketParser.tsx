'use client'

import { useEffect, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'

/**
 * «Парсер рынка» — отдельная страница CRM (не публикация!): агенты сохраняют
 * ссылки на чужие объявления (Авито, ЦИАН, Домклик, Яндекс, VK, Telegram…),
 * сервер распознаёт площадку, ведёт историю цены и считает похожесть на
 * объекты Н15 (см. src/lib/market-parser.ts и market-service.ts).
 * Автосбора объявлений нет: каждая запись добавлена ссылкой вручную или
 * официальным каналом площадки.
 */

interface MarketListingUi {
  id: number
  url: string
  platform?: string | null
  title?: string | null
  address?: string | null
  price?: number | null
  priceInitial?: number | null
  area?: number | null
  rooms?: number | null
  authorKind?: string | null
  status?: string | null
  publishedAt?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  matchedObject?: number | null
  matchPct?: number | null
  matchedTitle?: string | null
  priceHistory?: { at?: string | null; price?: number | null }[] | null
}

interface MarketRowUi {
  objectId: number
  headline: string
  price?: number | null
  area?: number | null
  match: number
  matched: string[]
  verdict: 'none' | 'weak' | 'strong'
}

interface AddResult {
  ok: boolean
  listing: MarketListingUi
  created: boolean
  priceChanged: boolean
  wasPrice: number | null
  urlDuplicates: { id: number | string; url: string }[]
  contentDuplicates: { id: number | string; url: string; score: number }[]
  report: MarketRowUi[]
  linked?: { objectId: number; match: number } | null
  error?: string
}

// Названия площадок (серверный справочник шире — market-parser.ts, здесь
// только быстрые подписи без лишнего запроса)
const PLATFORM_NAMES: Record<string, string> = {
  avito: 'Авито',
  cian: 'ЦИАН',
  domclick: 'Домклик',
  yandex: 'Яндекс Недвижимость',
  vk: 'VK',
  telegram: 'Telegram',
  instagram: 'Instagram',
  ok: 'Одноклассники',
  site: 'Сайт Н15',
}

const MATCH_PARAM_LABELS: Record<string, string> = {
  cadastral: 'кадастровый номер',
  address: 'адрес',
  price: 'цена',
  area: 'площадь',
  rooms: 'комнаты',
  floor: 'этаж',
  photos: 'фотографии',
  description: 'описание',
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: '#e6efe1', color: '#3f6b34' },
  removed: { bg: '#efeadf', color: '#817b70' },
  needsCheck: { bg: '#f7e6cf', color: '#a1661f' },
}

const AUTHOR_LABEL: Record<string, string> = {
  owner: 'marketAuthorOwner',
  agent: 'marketAuthorAgent',
  unknown: 'marketAuthorUnknown',
}

// Подстановка %d/%s в строку словаря
const fmt = (tpl: string, ...vals: (string | number)[]): string => {
  let out = tpl
  for (const v of vals) out = out.replace(/%d|%s/, String(v))
  return out
}
const rub = (v: number | null | undefined) => (v == null ? '' : new Intl.NumberFormat('ru-RU').format(v))

const dayText = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
}

const small: React.CSSProperties = { fontSize: 10, color: '#8a857b' }
const chipBtn: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 5,
  background: '#fff',
  color: '#716b62',
  padding: '5px 8px',
  fontSize: 9,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
}
const chipDanger: React.CSSProperties = { ...chipBtn, borderColor: '#e3cfc7', color: '#9b4e43' }
const chipGold: React.CSSProperties = { ...chipBtn, color: '#8d6b40', borderColor: '#dccbb0', textDecoration: 'none' }

export const MarketParser: FC<{ t: Dict; isAdmin: boolean }> = ({ t, isAdmin }) => {
  const [list, setList] = useState<MarketListingUi[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  // Форма добавления
  const [form, setForm] = useState({
    url: '',
    title: '',
    address: '',
    price: '',
    area: '',
    rooms: '',
    authorKind: 'unknown',
    publishedAt: '',
  })
  const [addBusy, setAddBusy] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  // По каждой записи: последний отчёт о совпадениях и счётчики дублей
  const [reports, setReports] = useState<Record<number, MarketRowUi[]>>({})
  const [dupes, setDupes] = useState<Record<number, { url: number; content: number }>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
  const [showHist, setShowHist] = useState<Record<number, boolean>>({})

  const load = async () => {
    try {
      const res = await fetch('/api/market/listings', { credentials: 'include' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error || 'HTTP ' + res.status)
      }
      const j = (await res.json()) as { listings: MarketListingUi[] }
      setList(j.listings)
      setLoadErr('')
    } catch (e) {
      setLoadErr(String(e))
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const setFormField = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const addListing = async () => {
    const url = form.url.trim()
    if (!url) {
      setAddErr(t.crm.marketUrlPh === '' ? 'Вставьте ссылку' : 'Вставьте ссылку на объявление')
      return
    }
    setAddBusy(true)
    setAddErr('')
    setNotice(null)
    try {
      const res = await fetch('/api/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'add',
          url,
          title: form.title.trim() || null,
          address: form.address.trim() || null,
          price: form.price.trim() ? Number(form.price.replace(/\s/g, '')) : null,
          area: form.area.trim() ? Number(form.area.replace(/\s/g, '')) : null,
          rooms: form.rooms.trim() ? Number(form.rooms) : null,
          authorKind: form.authorKind,
          publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
        }),
      })
      const j = (await res.json().catch(() => null)) as AddResult | { error?: string } | null
      if (!res.ok || !j || !('ok' in j) || !j.ok) {
        throw new Error((j as { error?: string })?.error || 'HTTP ' + res.status)
      }
      const r = j as AddResult
      // Обновляем список: новая запись или обновлённая — наверх
      setList((prev) => {
        const others = (prev || []).filter((l) => l.id !== r.listing.id)
        return [r.listing, ...others]
      })
      setReports((m) => ({ ...m, [r.listing.id]: r.report }))
      if (r.urlDuplicates.length || r.contentDuplicates.length) {
        setDupes((m) => ({ ...m, [r.listing.id]: { url: r.urlDuplicates.length, content: r.contentDuplicates.length } }))
      }
      const priceNote = r.priceChanged ? ` ${fmt(t.crm.marketResultPriceChanged, rub(r.wasPrice), rub(r.listing.price))}` : ''
      setNotice({
        kind: r.urlDuplicates.length || r.contentDuplicates.length ? 'warn' : 'ok',
        text: `${r.created ? t.crm.marketResultCreated : t.crm.marketResultUpdated}.${priceNote}`,
      })
      setForm((f) => ({ ...f, url: '', title: '', address: '', price: '', area: '', rooms: '', publishedAt: '', authorKind: 'unknown' }))
    } catch (e) {
      setAddErr(String(e))
    } finally {
      setAddBusy(false)
    }
  }

  const recheck = async (id: number) => {
    setBusyId(id)
    setAddErr('')
    try {
      const res = await fetch('/api/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'recheck', id }),
      })
      const j = (await res.json().catch(() => null)) as AddResult | { error?: string } | null
      if (!res.ok || !j || !('ok' in j) || !j.ok) {
        throw new Error((j as { error?: string })?.error || 'HTTP ' + res.status)
      }
      const r = j as AddResult
      setReports((m) => ({ ...m, [id]: r.report }))
      // Свежая версия записи (могли обновиться связь и цена)
      setList((prev) => (prev || []).map((l) => (l.id === id ? r.listing : l)))
    } catch (e) {
      setAddErr(String(e))
    } finally {
      setBusyId(null)
    }
  }

  const removeListing = async (id: number) => {
    setBusyId(id)
    try {
      await fetch('/api/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'remove', id }),
      })
      setConfirmRemove(null)
      setList((prev) => (prev || []).filter((l) => l.id !== id))
    } catch (e) {
      setAddErr(String(e))
    } finally {
      setBusyId(null)
    }
  }

  const authorLabel = (kind?: string | null) =>
    kind === 'owner' ? t.crm.marketAuthorOwner : kind === 'agent' ? t.crm.marketAuthorAgent : t.crm.marketAuthorUnknown

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24, color: '#25241f' }}>
          {t.crm.marketTitle}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#8a857b', lineHeight: 1.6 }}>{t.crm.marketSubtitle}</p>
        <p style={{ margin: '4px 0 0', fontSize: 10, color: '#a1661f' }}>{t.crm.marketAddHint}</p>
      </div>

      {/* Добавление объявления */}
      <div
        style={{
          background: '#fbf8f1',
          border: '1px solid #e8dfd0',
          borderRadius: 10,
          padding: '14px 16px',
          margin: '12px 0 18px',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div style={{ flex: '2 1 260px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketUrlLabel} *</label>
            <input
              value={form.url}
              onChange={(e) => setFormField('url', e.target.value)}
              placeholder={t.crm.marketUrlPh}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketTitleLabel}</label>
            <input value={form.title} onChange={(e) => setFormField('title', e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketAuthorLabel}</label>
            <select
              value={form.authorKind}
              onChange={(e) => setFormField('authorKind', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="unknown">{t.crm.marketAuthorUnknown}</option>
              <option value="owner">{t.crm.marketAuthorOwner}</option>
              <option value="agent">{t.crm.marketAuthorAgent}</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: '2 1 260px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketAddressLabel}</label>
            <input value={form.address} onChange={(e) => setFormField('address', e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ flex: '1 1 130px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketPriceLabel}</label>
            <input
              value={form.price}
              onChange={(e) => setFormField('price', e.target.value)}
              inputMode="numeric"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 110px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketAreaLabel}</label>
            <input
              value={form.area}
              onChange={(e) => setFormField('area', e.target.value)}
              inputMode="numeric"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 90px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketRoomsLabel}</label>
            <input
              value={form.rooms}
              onChange={(e) => setFormField('rooms', e.target.value)}
              inputMode="numeric"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <label style={small}>{t.crm.marketDateLabel}</label>
            <input
              type="date"
              value={form.publishedAt}
              onChange={(e) => setFormField('publishedAt', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
        {addErr && <div style={{ marginTop: 8, fontSize: 11, color: '#9b4e43' }}>{addErr}</div>}
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            disabled={addBusy}
            onClick={() => void addListing()}
            style={{
              border: 0,
              borderRadius: 7,
              background: '#a7814e',
              color: '#fff',
              padding: '10px 18px',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              cursor: addBusy ? 'wait' : 'pointer',
              opacity: addBusy ? 0.6 : 1,
            }}
          >
            {addBusy ? t.crm.pubBusy : `+ ${t.crm.marketAddBtn}`}
          </button>
        </div>
        {notice && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 7,
              fontSize: 11,
              lineHeight: 1.5,
              background: notice.kind === 'ok' ? '#e6efe1' : '#f7e6cf',
              color: notice.kind === 'ok' ? '#3f6b34' : '#8b5a2b',
            }}
          >
            {notice.text}
          </div>
        )}
      </div>

      {loadErr && <div style={{ fontSize: 11, color: '#9b4e43', margin: '10px 0' }}>{loadErr}</div>}

      {/* Записи */}
      {list === null ? (
        <div style={small}>…</div>
      ) : list.length === 0 ? (
        <div
          style={{
            border: '1px dashed #e1d8ca',
            borderRadius: 10,
            padding: '28px 16px',
            textAlign: 'center',
            fontSize: 12,
            color: '#8a857b',
          }}
        >
          {t.crm.marketNoListings}
        </div>
      ) : (
        list.map((l) => {
          const pill = STATUS_STYLE[l.status || 'active'] || STATUS_STYLE.active
          const statusLabel =
            l.status === 'removed'
              ? t.crm.marketStatusRemoved
              : l.status === 'needsCheck'
                ? t.crm.marketStatusNeedsCheck
                : t.crm.marketStatusActive
          const report = reports[l.id]
          const dup = dupes[l.id]
          const hist = Array.isArray(l.priceHistory) ? l.priceHistory : []
          const priceDiffers =
            typeof l.price === 'number' && typeof l.priceInitial === 'number' && l.price !== l.priceInitial
          const linked = l.matchedObject ? `${t.crm.marketObjMatch.replace('%s', l.matchedTitle || `№${l.matchedObject}`)}` : null
          return (
            <div
              key={l.id}
              style={{
                background: '#fff',
                border: '1px solid #e8dfd0',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 12,
              }}
            >
              {/* Шапка записи */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13, color: '#25241f' }}>{PLATFORM_NAMES[l.platform || 'other'] || '—'}</b>
                <span style={small}>{fmt(t.crm.marketSeenFmt, dayText(l.firstSeenAt))}</span>
                {dup && (dup.url > 0 || dup.content > 0) && (
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 999,
                      fontSize: 9,
                      background: '#f7e6cf',
                      color: '#a1661f',
                    }}
                    title={
                      dup.url > 0
                        ? fmt(t.crm.marketLinkDupes, dup.url)
                        : fmt(t.crm.marketContentDupes, dup.content)
                    }
                  >
                    {fmt(t.crm.marketDupNote, dup.url > 0 ? dup.url : dup.content)}
                  </span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 9px',
                    borderRadius: 999,
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    background: pill.bg,
                    color: pill.color,
                  }}
                >
                  {statusLabel}
                </span>
              </div>

              {/* Ссылка + цена */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ ...chipGold, fontSize: 10 }}>
                  {l.url.length > 64 ? l.url.slice(0, 64) + '…' : l.url} {t.crm.marketOpen}
                </a>
                <b style={{ fontSize: 15, color: '#25241f', whiteSpace: 'nowrap' }}>
                  {typeof l.price === 'number' ? `${rub(l.price)} ₽` : t.crm.marketUnknownValue}
                </b>
              </div>

              {/* Автор, даты */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 }}>
                <span style={small}>{fmt(t.crm.marketAuthorFmt, authorLabel(l.authorKind))}</span>
                {l.publishedAt && <span style={small}>{fmt(t.crm.marketPublishedFmt, dayText(l.publishedAt))}</span>}
                {l.area ? (
                  <span style={small}>
                    {typeof l.area === 'number' && `${rub(l.area)} м²`}
                  </span>
                ) : null}
                {l.title ? (
                  <span style={{ fontSize: 10, color: '#716b62', fontStyle: 'italic' }}>{l.title}</span>
                ) : null}
              </div>

              {/* Связь с объектом Н15 */}
              {linked && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#3f6b34' }}>
                  {linked}
                  {typeof l.matchPct === 'number' ? ` (${l.matchPct}%)` : ''}
                </div>
              )}

              {/* Действия: отчёт, история цены, удаление */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" style={chipBtn} onClick={() => void recheck(l.id)} disabled={busyId === l.id}>
                  {busyId === l.id ? t.crm.pubBusy : t.crm.marketCheckNow}
                </button>
                {(hist.length > 0 || priceDiffers) && (
                  <button
                    type="button"
                    style={chipBtn}
                    onClick={() => setShowHist((m) => ({ ...m, [l.id]: !m[l.id] }))}
                  >
                    {t.crm.marketPriceHist}
                    {showHist[l.id] ? ' ▴' : ' ▾'}
                  </button>
                )}
                {isAdmin && (
                  <span style={{ marginLeft: 'auto' }}>
                    {confirmRemove === l.id ? (
                      <>
                        <button
                          type="button"
                          style={{ ...chipBtn, borderColor: '#e3cfc7', color: '#9b4e43' }}
                          onClick={() => void removeListing(l.id)}
                          disabled={busyId === l.id}
                        >
                          ✓
                        </button>
                        <button type="button" style={chipBtn} onClick={() => setConfirmRemove(null)}>
                          ✕
                        </button>
                      </>
                    ) : (
                      <button type="button" style={chipDanger} onClick={() => setConfirmRemove(l.id)} title={t.crm.marketRemoveConfirm}>
                        {t.crm.marketRemove}
                      </button>
                    )}
                  </span>
                )}
              </div>

              {/* История цены */}
              {showHist[l.id] && (priceDiffers || hist.length > 0) && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#faf8f2', borderRadius: 7, fontSize: 11, color: '#5c574e' }}>
                  <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8a857b', marginBottom: 4 }}>
                    {t.crm.marketPriceHist}
                  </div>
                  {typeof l.priceInitial === 'number' && (
                    <div>{fmt(t.crm.marketPriceInit, `${rub(l.priceInitial)} ₽`)}</div>
                  )}
                  {hist.map((h, i) => (
                    <div key={i}>{fmt(t.crm.marketPriceHistRow, dayText(h.at), rub(h.price))}</div>
                  ))}
                </div>
              )}

              {/* Отчёт о совпадениях */}
              {report !== undefined && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#faf8f2', borderRadius: 7 }}>
                  <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8a857b', marginBottom: 4 }}>
                    {t.crm.marketMatchTitle}
                  </div>
                  {report.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#8a857b' }}>{t.crm.marketMatchNone}</div>
                  ) : (
                    report.map((r) => {
                      const labels = r.matched.map((p) => MATCH_PARAM_LABELS[p] || p).join(', ')
                      const verdictText =
                        r.verdict === 'strong'
                          ? t.crm.marketVerdictStrong
                          : r.verdict === 'weak'
                            ? t.crm.marketVerdictWeak
                            : ''
                      return (
                        <div key={r.objectId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '3px 0', fontSize: 11 }}>
                          <b style={{ color: r.match >= 75 ? '#3f6b34' : r.match >= 45 ? '#a1661f' : '#817b70', whiteSpace: 'nowrap' }}>
                            {r.match}%
                          </b>
                          <a
                            href="/crm/objects"
                            style={{ color: '#8d6b40', textDecoration: 'none' }}
                            title={t.crm.marketObjMatch.replace('%s', r.headline)}
                          >
                            {r.headline}
                          </a>
                          <span style={{ color: '#8a857b' }}>
                            {labels}
                            {labels && verdictText ? ` · ${verdictText}` : verdictText}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  background: '#fff',
  color: '#25241f',
  padding: '7px 10px',
  fontSize: 12,
  boxSizing: 'border-box',
}

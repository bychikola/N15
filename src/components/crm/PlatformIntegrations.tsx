'use client'

// ---------------------------------------------------------------------------
// Раздел CRM «Интеграции площадок» (только администратор): Авито, ЦИАН,
// Домклик, Яндекс Недвижимость и наши каналы публикации (VK, Telegram).
//
// По каждой площадке видно: чем она подключается, что канал реально даёт,
// статус подключения, дату последней проверки, ответ площадки на последний
// запрос. Кнопки: «Подключить» (сохранить доступы), «Проверить соединение»
// (реальный запрос к официальному API площадки), «Отключить».
//
// ЧЕСТНОСТЬ: статус «Подключена» появляется только после фактического ответа
// площадки. Пока доступов нет, площадка подписана «Площадка не подключена»
// или «Нужен доступ администратора» — пустая карточка не выдаётся за
// работающий парсер. После подключения администратор проверяет реальный
// объект CRM и видит, найдено ли объявление, ссылку, цену, дату и совпадение
// параметров с фотографиями (сервер: src/lib/platform-integration-service.ts).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'
import {
  CONNECTION_STATUS_HINTS,
  CONNECTION_STATUS_LABELS,
  type ConnectionStatus,
} from '@/lib/platform-integrations'

interface CredentialUi {
  key: string
  label: string
  hint: string
  secret: boolean
  filled: boolean
  source: 'crm' | 'env' | null
  preview: string
}

interface ChannelUi {
  kind: string
  title: string
  gives: string
  limits: string
  needs: string
  docsUrl: string
  programmable: boolean
}

interface PlatformUi {
  slug: string
  name: string
  summary: string
  channel: ChannelUi
  status: ConnectionStatus
  lastCheckedAt: string | null
  lastMessage: string | null
  lastHttpStatus: number | null
  credentials: CredentialUi[]
  configured: boolean
  canTest: boolean
}

interface ProbeUi {
  status: ConnectionStatus
  httpStatus?: number
  message: string
  detail?: string
  latencyMs?: number
}

interface ObjectCheckUi {
  platform: string
  name: string
  found: boolean
  checked: number
  listingUrl: string | null
  title: string | null
  price: number | null
  publishedAt: string | null
  match: number | null
  matchParams: string[]
  photoMatch: number | null
  probability: number | null
  reason: string
}

interface ObjectOption {
  id: number
  label: string
}

/** Цвета статусов подключения — та же палитра, что в остальных блоках CRM */
const STATUS_STYLE: Record<ConnectionStatus, { bg: string; color: string }> = {
  connected: { bg: '#e6efe1', color: '#3f6b34' },
  authError: { bg: '#f6e2dc', color: '#9b4e43' },
  // Промежуточный статус: доступы есть, фактической проверки ещё не было
  notChecked: { bg: '#fbf3e2', color: '#8b6a2b' },
  notConfigured: { bg: '#ece8e0', color: '#716b62' },
  needsAdmin: { bg: '#f7e6cf', color: '#a1661f' },
  unreachable: { bg: '#f7e6cf', color: '#8b5a2b' },
}

/** Подписи совпавших признаков (сервер отдаёт коды — как в placement-search) */
const PARAM_LABEL: Record<string, string> = {
  cadastral: 'кадастровый номер',
  address: 'адрес',
  price: 'цена',
  area: 'площадь',
  rooms: 'комнаты',
  floor: 'этаж',
  photos: 'фотографии',
  description: 'описание',
}

const rub = (v: number): string => new Intl.NumberFormat('ru-RU').format(v)

const fmtMoment = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  background: '#fff',
  padding: '7px 10px',
  fontSize: 12,
  color: '#25241f',
  width: '100%',
}

const btnGold: React.CSSProperties = {
  border: 0,
  borderRadius: 7,
  background: '#a7814e',
  color: '#fff',
  padding: '9px 14px',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  cursor: 'pointer',
}

const btnQuiet: React.CSSProperties = {
  border: '1px solid #e1d8ca',
  borderRadius: 7,
  background: '#fff',
  color: '#716b62',
  padding: '9px 14px',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  border: '1px solid #e3cfc7',
  borderRadius: 7,
  background: '#fff',
  color: '#9b4e43',
  padding: '9px 14px',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  cursor: 'pointer',
}

/** Строка «признак: значение» в результате проверки объекта */
const Row: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f2ece1', padding: '4px 0' }}>
    <span style={{ fontSize: 10, color: '#9b958a' }}>{label}</span>
    <span style={{ fontSize: 11, color: '#25241f', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
  </div>
)

export const PlatformIntegrations: FC<{ t: Dict; objects: ObjectOption[] }> = ({ t, objects }) => {
  const [platforms, setPlatforms] = useState<PlatformUi[] | null>(null)
  const [connectedCount, setConnectedCount] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState<Record<string, Record<string, string>>>({})
  const [probes, setProbes] = useState<Record<string, ProbeUi>>({})
  const [checks, setChecks] = useState<Record<string, ObjectCheckUi>>({})
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [confirmClear, setConfirmClear] = useState('')
  const [foundAny, setFoundAny] = useState(false)

  const applyPlatform = useCallback((platform: PlatformUi | null | undefined) => {
    if (!platform) return
    setPlatforms((prev) => (prev || []).map((p) => (p.slug === platform.slug ? platform : p)))
  }, [])

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const res = await fetch('/api/platforms/integrations', { credentials: 'include' })
      const data = (await res.json()) as { error?: string; platforms?: PlatformUi[]; summary?: { connected: number } }
      if (!res.ok || !data.platforms) throw new Error(data.error || '')
      setPlatforms(data.platforms)
      setConnectedCount(data.summary?.connected || 0)
      // Объект для проверки по умолчанию — первый реальный объект CRM
      setPicked((prev) => {
        const next = { ...prev }
        for (const p of data.platforms || []) {
          if (next[p.slug] == null && objects.length) next[p.slug] = objects[0].id
        }
        return next
      })
    } catch {
      setLoadErr(t.crm.intLoadErr)
    }
  }, [objects, t])

  useEffect(() => {
    void Promise.resolve().then(() => load())
  }, [load])

  const action = useCallback(
    async (payload: Record<string, unknown>, busyKey: string) => {
      setBusy(busyKey)
      setNotice(null)
      try {
        const res = await fetch('/api/platforms/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        const data = (await res.json()) as {
          error?: string
          platform?: PlatformUi
          probe?: ProbeUi
          check?: ObjectCheckUi
        }
        if (!res.ok) throw new Error(data.error || '')
        return data
      } catch (e) {
        setNotice({ kind: 'warn', text: e instanceof Error && e.message ? e.message : t.crm.intErr })
        return null
      } finally {
        setBusy('')
      }
    },
    [t],
  )

  const save = useCallback(
    async (slug: string) => {
      const values = form[slug] || {}
      // Пустые поля не отправляем: незаполненное поле не должно стирать
      // сохранённый доступ (для отключения есть отдельная кнопка)
      const credentials: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) if (v.trim()) credentials[k] = v.trim()
      if (!Object.keys(credentials).length) {
        setNotice({ kind: 'warn', text: 'Введите доступ, который выдала площадка' })
        return
      }
      const data = await action({ action: 'save', slug, credentials }, `save:${slug}`)
      if (!data) return
      applyPlatform(data.platform)
      setForm((prev) => ({ ...prev, [slug]: {} }))
      setNotice({ kind: 'ok', text: t.crm.intSaved })
    },
    [action, applyPlatform, form, t],
  )

  const test = useCallback(
    async (slug: string) => {
      const data = await action({ action: 'test', slug }, `test:${slug}`)
      if (!data) return
      applyPlatform(data.platform)
      if (data.probe) setProbes((prev) => ({ ...prev, [slug]: data.probe as ProbeUi }))
    },
    [action, applyPlatform],
  )

  const clear = useCallback(
    async (slug: string) => {
      const data = await action({ action: 'clear', slug }, `clear:${slug}`)
      setConfirmClear('')
      if (!data) return
      applyPlatform(data.platform)
      setProbes((prev) => {
        const next = { ...prev }
        delete next[slug]
        return next
      })
      setNotice({ kind: 'ok', text: t.crm.intCleared })
    },
    [action, applyPlatform, t],
  )

  const checkObject = useCallback(
    async (slug: string) => {
      const objectId = picked[slug]
      if (!objectId) {
        setNotice({ kind: 'warn', text: t.crm.intNoObjects })
        return
      }
      const data = await action({ action: 'checkObject', slug, objectId }, `check:${slug}`)
      if (!data?.check) return
      setChecks((prev) => ({ ...prev, [slug]: data.check as ObjectCheckUi }))
      if (data.check.found) setFoundAny(true)
    },
    [action, picked, t],
  )

  const connectedNames = useMemo(
    () => (platforms || []).filter((p) => p.status === 'connected').map((p) => p.name),
    [platforms],
  )

  if (loadErr) {
    return (
      <div>
        <h1 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24, color: '#25241f' }}>
          {t.crm.intTitle}
        </h1>
        <p style={{ marginTop: 12, fontSize: 12, color: '#9b4e43' }}>{loadErr}</p>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24, color: '#25241f' }}>
        {t.crm.intTitle}
      </h1>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#817b70', maxWidth: 720, lineHeight: 1.6 }}>
        {t.crm.intSubtitle}
      </p>

      {/* Сводка: сколько площадок реально подключено и есть ли результат по объекту */}
      <div
        style={{
          marginTop: 14,
          background: connectedCount ? '#f2f6ef' : '#fbf8f1',
          border: `1px solid ${connectedCount ? '#d8e3d0' : '#e8dfd0'}`,
          borderRadius: 10,
          padding: '12px 16px',
        }}
      >
        <div style={{ fontSize: 12, color: '#25241f' }}>
          {platforms
            ? `Подключено площадок: ${connectedCount} из ${platforms.length}${connectedNames.length ? ` — ${connectedNames.join(', ')}` : ''}`
            : 'Загружаем площадки…'}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: connectedCount && foundAny ? '#3f6b34' : '#8b5a2b', lineHeight: 1.5 }}>
          {connectedCount === 0
            ? 'Рабочей интеграции пока нет: ни одна площадка не подключена. Проверка размещения в карточке объекта честно пишет об этом, а не показывает пустые результаты.'
            : foundAny
              ? 'Есть площадка с реальным результатом по объекту — можно переходить к выгрузке объявлений.'
              : 'Площадка подключена, но реального результата по объекту ещё нет: выберите объект и нажмите «Проверить объект» ниже.'}
        </div>
      </div>

      {notice && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 11,
            background: notice.kind === 'ok' ? '#e6efe1' : '#f7e6cf',
            color: notice.kind === 'ok' ? '#3f6b34' : '#8b5a2b',
          }}
        >
          {notice.text}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        {(platforms || []).map((p) => {
          const pill = STATUS_STYLE[p.status] || STATUS_STYLE.notConfigured
          const probe = probes[p.slug]
          const check = checks[p.slug]
          return (
            <div key={p.slug} style={{ background: '#fff', border: '1px solid #e8dfd0', borderRadius: 10, padding: '14px 16px' }}>
              {/* Шапка: название, статус подключения, дата последней проверки */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 16, color: '#25241f', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400 }}>{p.name}</b>
                <span
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '.06em', background: pill.bg, color: pill.color,
                  }}
                >
                  {CONNECTION_STATUS_LABELS[p.status]}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8a857b' }}>
                  {t.crm.intLastCheck}: {p.lastCheckedAt ? fmtMoment(p.lastCheckedAt) : t.crm.intNeverChecked}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#817b70' }}>{p.summary}</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9b958a', lineHeight: 1.5 }}>{CONNECTION_STATUS_HINTS[p.status]}</p>

              {/* Официальный канал площадки: чем подключается и что даёт */}
              <div style={{ marginTop: 10, background: '#fbf8f1', border: '1px solid #e8dfd0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Официальный канал
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#25241f' }}>{p.channel.title}</div>
                <div style={{ marginTop: 6, display: 'grid', gap: 3, fontSize: 10, color: '#6f6a61', lineHeight: 1.5 }}>
                  <div><b style={{ color: '#8a857b' }}>Даёт:</b> {p.channel.gives}</div>
                  <div><b style={{ color: '#8a857b' }}>Не даёт:</b> {p.channel.limits}</div>
                  <div><b style={{ color: '#8a857b' }}>Что нужно для подключения:</b> {p.channel.needs}</div>
                </div>
                <a
                  href={p.channel.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 6, fontSize: 10, color: '#8d6b40', textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                  {p.channel.docsUrl}
                </a>
              </div>

              {/* Доступы площадки: значения не показываем — только «заполнено» */}
              {p.credentials.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Доступ площадки
                  </div>
                  <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                    {p.credentials.map((c) => (
                      <div key={c.key}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#25241f' }}>{c.label}</span>
                          <span style={{ fontSize: 9, color: c.filled ? '#3f6b34' : '#a1661f' }}>
                            {c.filled
                              ? c.source === 'env'
                                ? 'задано в окружении сервера'
                                : `сохранено: ${c.preview}`
                              : 'не задано'}
                          </span>
                        </div>
                        <input
                          style={{ ...inputStyle, marginTop: 4 }}
                          type={c.secret ? 'password' : 'text'}
                          autoComplete="off"
                          placeholder={c.hint}
                          value={form[p.slug]?.[c.key] || ''}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, [p.slug]: { ...(prev[p.slug] || {}), [c.key]: e.target.value } }))
                          }
                        />
                        <div style={{ marginTop: 3, fontSize: 9, color: '#9b958a' }}>{c.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Кнопки: подключить, проверить соединение, отключить */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {p.credentials.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void save(p.slug)}
                    disabled={busy === `save:${p.slug}`}
                    style={{ ...btnGold, opacity: busy === `save:${p.slug}` ? 0.7 : 1 }}
                  >
                    {busy === `save:${p.slug}` ? t.crm.pubBusy : t.crm.intConnect}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void test(p.slug)}
                  disabled={busy === `test:${p.slug}`}
                  style={{ ...btnQuiet, opacity: busy === `test:${p.slug}` ? 0.7 : 1 }}
                >
                  {busy === `test:${p.slug}` ? t.crm.pubBusy : t.crm.intTest}
                </button>
                {p.configured && p.credentials.length > 0 && (
                  confirmClear === p.slug ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#9b4e43' }}>Стереть доступы площадки?</span>
                      <button type="button" onClick={() => void clear(p.slug)} style={btnDanger}>Да</button>
                      <button type="button" onClick={() => setConfirmClear('')} style={btnQuiet}>Нет</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmClear(p.slug)} style={btnDanger}>
                      {t.crm.intDisconnect}
                    </button>
                  )
                )}
                {!p.canTest && (
                  <span style={{ fontSize: 10, color: '#8a857b' }}>
                    Проверка соединения программно недоступна — подключение только через кабинет площадки
                  </span>
                )}
              </div>

              {/* Ответ площадки на последнюю проверку: HTTP-код и текст как есть */}
              {(probe || p.lastMessage) && (
                <div style={{ marginTop: 10, borderTop: '1px solid #f2ece1', paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Ответ площадки
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: (probe?.status || p.status) === 'connected' ? '#3f6b34' : '#6f6a61', lineHeight: 1.5 }}>
                    {probe?.message || p.lastMessage}
                    {typeof probe?.httpStatus === 'number' && (
                      <span style={{ color: '#9b958a' }}> (HTTP {probe.httpStatus})</span>
                    )}
                    {typeof probe?.latencyMs === 'number' && (
                      <span style={{ color: '#9b958a' }}> · {probe.latencyMs} мс</span>
                    )}
                  </div>
                  {probe?.detail && (
                    <div style={{ marginTop: 3, fontSize: 9, color: '#9b958a', wordBreak: 'break-all' }}>{probe.detail}</div>
                  )}
                </div>
              )}

              {/* Проверка реального объекта: только по подключённой площадке */}
              {p.channel.programmable && (
                <div style={{ marginTop: 12, borderTop: '1px solid #f2ece1', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, color: '#8a857b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t.crm.intObjectCheck}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      style={{ ...inputStyle, maxWidth: 420 }}
                      value={picked[p.slug] || ''}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [p.slug]: Number(e.target.value) }))}
                    >
                      {objects.length === 0 && <option value="">{t.crm.intNoObjects}</option>}
                      {objects.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void checkObject(p.slug)}
                      disabled={busy === `check:${p.slug}` || !p.configured}
                      style={{ ...btnGold, opacity: busy === `check:${p.slug}` || !p.configured ? 0.6 : 1 }}
                    >
                      {busy === `check:${p.slug}` ? t.crm.pubBusy : t.crm.intObjectCheckBtn}
                    </button>
                    {!p.configured && (
                      <span style={{ fontSize: 10, color: '#8a857b' }}>
                        Проверка объекта станет доступна после подключения площадки
                      </span>
                    )}
                  </div>

                  {check && (
                    <div style={{ marginTop: 10, border: '1px solid #ece5d9', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13, color: '#25241f' }}>{t.crm.intObjectCheck}</b>
                        <span
                          style={{
                            padding: '4px 10px', borderRadius: 999, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em',
                            background: check.found ? '#e6efe1' : '#efeadf',
                            color: check.found ? '#3f6b34' : '#817b70',
                          }}
                        >
                          {check.found ? t.crm.intFound : t.crm.intNotFound}
                        </span>
                        <span style={{ fontSize: 10, color: '#8a857b' }}>проверено объявлений: {check.checked}</span>
                      </div>

                      {check.title && <div style={{ marginTop: 4, fontSize: 11, color: '#6f6a61' }}>{check.title}</div>}

                      <div style={{ marginTop: 6, fontSize: 11, color: '#25241f', wordBreak: 'break-all' }}>
                        <span style={{ fontSize: 9, color: '#9b958a', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                          Ссылка на объявление:{' '}
                        </span>
                        {check.listingUrl ? (
                          <a href={check.listingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8d6b40', textDecoration: 'underline' }}>
                            {check.listingUrl}
                          </a>
                        ) : (
                          <span style={{ color: '#9b958a' }}>—</span>
                        )}
                      </div>

                      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 14px' }}>
                        <Row label="Цена в объявлении" value={check.price != null ? `${rub(check.price)} ₽` : '—'} />
                        <Row label="Дата публикации" value={fmtDate(check.publishedAt)} />
                        <Row
                          label="Совпадение параметров"
                          value={check.match != null
                            ? `${check.match}%${check.matchParams?.length ? ` — ${check.matchParams.map((x) => PARAM_LABEL[x] || x).join(', ')}` : ''}`
                            : '—'}
                        />
                        <Row label="Совпадение фотографий" value={check.photoMatch != null ? `${check.photoMatch}%` : '—'} />
                        <Row label="Вероятность, что это оно" value={check.probability != null ? `${check.probability}%` : '—'} />
                      </div>

                      <p style={{ margin: '8px 0 0', fontSize: 10, color: '#8a857b', lineHeight: 1.5, fontStyle: 'italic' }}>{check.reason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ margin: '16px 0 0', fontSize: 10, color: '#9b958a', lineHeight: 1.6, maxWidth: 720 }}>
        Официальный канал отдаёт объявления агентства в кабинете площадки — поиска по чужим объявлениям
        здесь нет: автосбор чужих страниц запрещён правилами площадок. Статус «Подключена» ставится только
        по фактическому ответу площадки на запрос; пока доступа нет, площадка подписана «Площадка не
        подключена» или «Нужен доступ администратора».
      </p>
    </div>
  )
}

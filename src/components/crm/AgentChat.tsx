'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

const POLL_MS = 5000

interface AgentTask {
  id: number
  prompt: string
  status: 'queued' | 'running' | 'done' | 'failed'
  log?: string
  result?: string
  createdAt?: string
}

const STATUS_KEYS: Record<string, string> = {
  queued: 'agentStatusQueued',
  running: 'agentStatusRunning',
  done: 'agentStatusDone',
  failed: 'agentStatusFailed',
}

// Модульная функция — стабильная идентичность: поллинг-эффект и обработчики
// не пересоздаются на каждый рендер (React Compiler не может сохранить ручной
// useCallback с пустыми зависимостями — см. react-hooks/preserve-manual-memoization).
async function fetchTasks(): Promise<AgentTask[]> {
  try {
    const res = await fetch('/api/agent/tasks', { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs || []).map((d: Record<string, unknown>) => ({
      id: d.id as number,
      prompt: d.prompt as string,
      status: d.status as AgentTask['status'],
      log: (d.log as string) || undefined,
      result: (d.result as string) || undefined,
      createdAt: (d.createdAt as string) || undefined,
    }))
  } catch {
    // временная недоступность — молчим
    return []
  }
}

export default function AgentChat() {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const autoExpandedId = useRef<number | null>(null)
  const logEndRef = useRef<HTMLPreElement>(null)
  const [configJson, setConfigJson] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const [configSaved, setConfigSaved] = useState(false)
  const [provider, setProvider] = useState<'chatgpt' | 'deepseek' | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [providerNotice, setProviderNotice] = useState('')
  const [chatgptConfig, setChatgptConfig] = useState('')
  const [deepseekConfig, setDeepseekConfig] = useState('')
  const [journalOpen, setJournalOpen] = useState(false)
  const journalListRef = useRef<HTMLDivElement>(null)

  // В журнале держим прокрутку внизу, пока идёт активная задача
  useEffect(() => {
    if (!journalOpen) return
    const el = journalListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [tasks, journalOpen])

  const openSettings = async () => {
    setSettingsOpen(true)
    setConfigError('')
    setConfigSaved(false)
    setConfigLoading(true)
    try {
      const res = await fetch('/api/agent/config', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setConfigJson(data.envJson || '')
      } else {
        setConfigError(t.crm.agentConfigError)
      }
    } catch {
      setConfigError(t.crm.agentConfigError)
    } finally {
      setConfigLoading(false)
    }
  }

  const saveConfig = async () => {
    if (configSaving) return
    setConfigSaving(true)
    setConfigError('')
    setConfigSaved(false)
    try {
      const res = await fetch('/api/agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ envJson: configJson }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setConfigError(data?.error === 'invalid json' ? t.crm.agentConfigInvalidJson : t.crm.agentConfigError)
        return
      }
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2500)
    } catch {
      setConfigError(t.crm.agentConfigError)
    } finally {
      setConfigSaving(false)
    }
  }

  // Определяем активного провайдера по сохранённому конфигу и запоминаем
  // эталонные конфиги (дефолт ChatGPT + шаблон DeepSeek), которые отдаёт сервер.
  useEffect(() => {
    let cancelled = false
    fetch('/api/agent/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const j = String(d.envJson || '')
        if (j.includes('api.deepseek.com')) setProvider('deepseek')
        else if (j.includes('127.0.0.1') || j.includes('localhost')) setProvider('chatgpt')
        if (d.presets?.chatgpt) setChatgptConfig(String(d.presets.chatgpt))
        if (d.presets?.deepseek) setDeepseekConfig(String(d.presets.deepseek))
        setConfigLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Переключение провайдера: сохраняем эталонный конфиг с сервера —
  // не вырезаем _deepseek_template, чтобы переключение работало в обе стороны.
  const applyProvider = async (p: 'chatgpt' | 'deepseek') => {
    const next = p === 'chatgpt' ? chatgptConfig : deepseekConfig
    if (!next) return
    try {
      const put = await fetch('/api/agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ envJson: next }),
      })
      if (!put.ok) return
      setProvider(p)
      setProviderNotice(t.crm.agentProviderApplied)
      setTimeout(() => setProviderNotice(''), 2500)
    } catch {
      // молчим
    }
  }

  // Запуск авторизации ChatGPT: спец-задача __AUTH__, её обрабатывает воркер
  const startAuth = async () => {
    try {
      const res = await fetch('/api/agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: '__AUTH__' }),
      })
      if (res.ok) await refresh()
    } catch {
      // молчим
    }
  }

  // Парсим URL и код из лога задачи авторизации (вывод codex login --device-auth)
  const authLink = (log?: string) => {
    const m = (log || '').match(/https:\/\/[^\s'"<>]+/)
    return m ? m[0].replace(/[),.;:]+$/, '') : ''
  }

  const authCode = (log?: string) => {
    const m = (log || '').match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/i)
    return m ? m[0].toUpperCase() : ''
  }

  const refresh = async () => {
    setTasks(await fetchTasks())
  }

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (cancelled || document.visibilityState !== 'visible') return
      const list = await fetchTasks()
      if (!cancelled) setTasks(list)
    }
    void tick()
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // Активную задачу раскрываем автоматически — видно, как агент работает
  useEffect(() => {
    const running = tasks.find((t) => t.status === 'running' && t.prompt !== '__AUTH__')
    if (running && autoExpandedId.current !== running.id) {
      autoExpandedId.current = running.id
      setExpandedId(running.id)
    }
  }, [tasks])

  // Живой лог: прокручиваем вниз, чтобы были видны последние строки
  useEffect(() => {
    const el = logEndRef.current
    if (el && expandedId !== null) {
      el.scrollTop = el.scrollHeight
    }
  }, [tasks, expandedId])

  const send = async () => {
    const value = prompt.trim()
    if (sending || !value) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || t.crm.agentSendError)
        return
      }
      setPrompt('')
      await refresh()
    } catch {
      setError(t.crm.agentSendError)
    } finally {
      setSending(false)
    }
  }

  // Последняя задача авторизации (__AUTH__) — показываем отдельной панелью
  const authTask = [...tasks].reverse().find((t) => t.prompt === '__AUTH__')

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8,
    background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif', resize: 'none',
  }

  return (
    <div>
      {/* Шапка: журнал + настройки */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setJournalOpen(true)}
          title={t.crm.agentJournal}
          aria-label={t.crm.agentJournal}
          style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#716b62', padding: '9px 12px', cursor: 'pointer', fontSize: 11, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '.06em' }}
        >
          {t.crm.agentJournal}
        </button>
        <button
          type="button"
          onClick={() => void openSettings()}
          title={t.crm.agentSettings}
          aria-label={t.crm.agentSettings}
          style={{ border: '1px solid #d9d1c4', borderRadius: 8, background: '#fff', color: '#716b62', padding: '9px 12px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >
          ⚙
        </button>
      </div>

      {/* Выбор провайдера */}
      {configLoaded && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['chatgpt', 'deepseek'] as const).map((p) => (
            <button key={p} type="button" onClick={() => void applyProvider(p)}
              style={{
                flex: 1, border: provider === p ? '1px solid #a7814e' : '1px solid #e1d8ca', borderRadius: 10,
                padding: '12px 14px', cursor: 'pointer', textAlign: 'left', background: provider === p ? '#fbf7ef' : '#fff',
              }}>
              <span style={{ display: 'block', fontSize: 13, color: provider === p ? '#8d6b40' : '#45423c', fontWeight: 600 }}>
                {p === 'chatgpt' ? t.crm.agentProviderChatgpt : t.crm.agentProviderDeepseek}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: '#9b958a', marginTop: 2 }}>
                {p === 'chatgpt' ? 'gpt-5.5 · подписка Plus' : 'deepseek-v4-flash · API-ключ'}
              </span>
            </button>
          ))}
        </div>
      )}
      {providerNotice && <p style={{ margin: '-8px 0 12px', color: '#4e7a3a', fontSize: 11 }}>{providerNotice}</p>}

      {/* Авторизация ChatGPT — панель только при активном Codex-провайдере */}
      {provider === 'chatgpt' && (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <p style={{ margin: '0 0 12px', color: '#817b70', fontSize: 12, lineHeight: 1.6 }}>{t.crm.agentAuthHint}</p>
          {authTask && (authTask.status === 'queued' || authTask.status === 'running') ? (
            <div style={{ border: '1px dashed #d9c8a8', borderRadius: 10, padding: 14, marginBottom: 10, background: '#fbf7ef' }}>
              <p style={{ margin: '0 0 6px', color: '#8d6b40', fontSize: 11 }}>{t.crm.agentAuthWaiting}</p>
              {authLink(authTask.log) ? (
                <a href={authLink(authTask.log)} target="_blank" rel="noreferrer" style={{ color: '#a7814e', fontSize: 13, wordBreak: 'break-all' }}>{authLink(authTask.log)}</a>
              ) : (
                <p style={{ margin: 0, color: '#9b958a', fontSize: 12 }}>{t.crm.agentNoLog}</p>
              )}
              {authCode(authTask.log) && (
                <div style={{ marginTop: 10, font: '22px/1.5 Consolas, Menlo, monospace', color: '#25241f', background: '#fff', border: '1px solid #e1d8ca', borderRadius: 8, padding: '8px 14px', textAlign: 'center', letterSpacing: '.14em' }}>
                  {authCode(authTask.log)}
                </div>
              )}
            </div>
          ) : authTask?.status === 'done' ? (
            <p style={{ margin: 0, color: '#4e7a3a', fontSize: 13 }}>{t.crm.agentAuthDone} ✓ — {t.crm.agentProviderChatgpt}</p>
          ) : authTask?.status === 'failed' ? (
            <>
              <p style={{ margin: '0 0 10px', color: '#9b4e43', fontSize: 12 }}>{authTask.result || t.crm.agentAuthFailed}</p>
              {authTask.log && (
                <pre style={{ margin: '0 0 10px', fontSize: 11, lineHeight: 1.6, color: '#45423c', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto', background: '#faf8f4', border: '1px solid #eee9e1', borderRadius: 8, padding: 10 }}>{authTask.log}</pre>
              )}
              <button type="button" onClick={() => void startAuth()}
                style={{ border: '1px solid #a7814e', borderRadius: 8, background: '#fff', color: '#8d6b40', padding: '10px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.agentAuthStart}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void startAuth()}
              style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
              {t.crm.agentAuthStart}
            </button>
          )}
        </div>
      )}

      {/* Форма запроса */}
      <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <p style={{ margin: '0 0 10px', color: '#817b70', fontSize: 12, lineHeight: 1.6 }}>
          {t.crm.agentHint}
        </p>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={t.crm.agentPlaceholder}
          aria-label={t.crm.agentPlaceholder}
          style={inputStyle}
        />
        {error && <p style={{ margin: '10px 0 0', color: '#9b4e43', fontSize: 11 }}>{error}</p>}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => void send()} disabled={sending || !prompt.trim()}
            style={{ border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 22px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: sending || !prompt.trim() ? 0.5 : 1 }}>
            {sending ? t.crm.agentSending : t.crm.agentSend}
          </button>
        </div>
      </div>

      {/* Список задач */}
      {tasks.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#817b70', fontSize: 13 }}>{t.crm.agentEmpty}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.filter((t) => t.prompt !== '__AUTH__').map((task) => (
            <div key={task.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 12, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <span style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 999, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em',
                  background: task.status === 'done' ? '#e5efdd' : task.status === 'failed' ? '#f4e0dc' : task.status === 'running' ? '#f2eadf' : '#efede8',
                  color: task.status === 'done' ? '#4e7a3a' : task.status === 'failed' ? '#9b4e43' : task.status === 'running' ? '#8d6b40' : '#817b70',
                }}>
                  {t.crm[STATUS_KEYS[task.status] as keyof typeof t.crm] || task.status}{task.status === 'running' ? '…' : ''}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: '#25241f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.prompt}
                </span>
                <span style={{ fontSize: 10, color: '#9b958a', flexShrink: 0 }}>
                  {task.createdAt ? new Date(task.createdAt).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <span style={{ fontSize: 10, color: '#8d6b40', flexShrink: 0 }}>{expandedId === task.id ? '−' : '+'}</span>
              </div>
              {expandedId === task.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #eee9e1', paddingTop: 12 }}>
                  {task.result && (
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#4e7a3a' }}>{task.result}</p>
                  )}
                  {task.log ? (
                    <pre ref={logEndRef} style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: '#45423c', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto', background: '#faf8f4', border: '1px solid #eee9e1', borderRadius: 8, padding: 10 }}>
                      {task.log}
                    </pre>
                  ) : (
                    <p style={{ margin: 0, color: '#9b958a', fontSize: 11 }}>{t.crm.agentNoLog}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Модалка настроек */}
      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setSettingsOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 680px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>{t.crm.agentSettings}</h2>
              <button type="button" onClick={() => setSettingsOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#817b70', lineHeight: 1.6 }}>
              {t.crm.agentConfigHint}
            </p>
            <textarea
              rows={14}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder={'{\n  "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",\n  "ANTHROPIC_API_KEY": "sk-ant-placeholder",\n  "ANTHROPIC_MODEL": "gpt-5.5"\n}'}
              aria-label={t.crm.agentConfigJsonLabel}
              disabled={configLoading}
              style={{
                width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8,
                background: configLoading ? '#f5f2eb' : '#fff', color: '#25241f', padding: 12,
                font: '12px/1.6 Consolas, Menlo, monospace', resize: 'vertical',
              }}
            />
            {configError && <p style={{ margin: '10px 0 0', color: '#9b4e43', fontSize: 11 }}>{configError}</p>}
            {configSaved && <p style={{ margin: '10px 0 0', color: '#4e7a3a', fontSize: 11 }}>{t.crm.agentConfigSaved} ✓</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => void saveConfig()} disabled={configSaving}
                style={{ flex: 1, border: 0, borderRadius: 8, background: '#a7814e', color: '#fff', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', opacity: configSaving ? 0.5 : 1 }}>
                {configSaving ? t.crm.agentConfigSaving : t.crm.agentConfigSave}
              </button>
              <button type="button" onClick={() => setSettingsOpen(false)}
                style={{ border: '1px solid #e1d8ca', borderRadius: 8, background: '#fff', color: '#716b62', padding: '12px 18px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
                {t.crm.dupCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка журнала: все действия агента и модели */}
      {journalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(32,33,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={() => setJournalOpen(false)}>
          <div style={{ background: '#faf8f4', border: '1px solid #ded5c7', borderRadius: 12, width: 'min(100%, 760px)', padding: 22 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 20 }}>{t.crm.agentJournalTitle}</h2>
              <button type="button" onClick={() => setJournalOpen(false)} style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#817b70', lineHeight: 1.6 }}>
              {t.crm.agentJournalHint}
            </p>
            <div ref={journalListRef} style={{ maxHeight: '62vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {tasks.length === 0 ? (
                <p style={{ margin: 0, color: '#9b958a', fontSize: 12 }}>{t.crm.agentEmpty}</p>
              ) : (
                [...tasks].reverse().map((task) => (
                  <div key={task.id} style={{ background: '#fff', border: '1px solid #e5dfd3', borderRadius: 10, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        flexShrink: 0, padding: '3px 8px', borderRadius: 999, fontSize: 8, textTransform: 'uppercase', letterSpacing: '.08em',
                        background: task.status === 'done' ? '#e5efdd' : task.status === 'failed' ? '#f4e0dc' : task.status === 'running' ? '#f2eadf' : '#efede8',
                        color: task.status === 'done' ? '#4e7a3a' : task.status === 'failed' ? '#9b4e43' : task.status === 'running' ? '#8d6b40' : '#817b70',
                      }}>
                        {t.crm[STATUS_KEYS[task.status] as keyof typeof t.crm] || task.status}{task.status === 'running' ? '…' : ''}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: '#25241f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.prompt === '__AUTH__' ? t.crm.agentAuthStart : task.prompt}
                      </span>
                      <span style={{ fontSize: 10, color: '#9b958a', flexShrink: 0 }}>
                        {task.createdAt ? new Date(task.createdAt).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    {task.log ? (
                      <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: '#45423c', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto', background: '#faf8f4', border: '1px solid #eee9e1', borderRadius: 8, padding: 8 }}>
                        {task.log}
                      </pre>
                    ) : (
                      <p style={{ margin: 0, color: '#9b958a', fontSize: 11 }}>{t.crm.agentNoLog}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

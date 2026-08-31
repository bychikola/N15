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

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/tasks', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setTasks((data.docs || []).map((d: Record<string, unknown>) => ({
        id: d.id as number,
        prompt: d.prompt as string,
        status: d.status as AgentTask['status'],
        log: (d.log as string) || undefined,
        result: (d.result as string) || undefined,
        createdAt: (d.createdAt as string) || undefined,
      })))
    } catch {
      // временная недоступность — молчим
    }
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

  // Активную задачу раскрываем автоматически — видно, как агент работает
  useEffect(() => {
    const running = tasks.find((t) => t.status === 'running')
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
      await load()
    } catch {
      setError(t.crm.agentSendError)
    } finally {
      setSending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9d1c4', borderRadius: 8,
    background: '#fff', color: '#25241f', padding: '12px 14px', font: '13px Arial, Helvetica, sans-serif', resize: 'none',
  }

  return (
    <div>
      {/* Шапка с настройками */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
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
          {tasks.map((task) => (
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
              placeholder={'{\n  "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",\n  "ANTHROPIC_AUTH_TOKEN": "...",\n  "ANTHROPIC_MODEL": "deepseek-v4-flash"\n}'}
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
    </div>
  )
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Пресеты провайдеров для переключателя в CRM. Реальный ключ DeepSeek в коде
// НЕ храним (репозиторий публичный) — он лежит в .env воркера на сервере
// (/home/n15/n15-agent/.env, chmod 600) и в agent_settings (БД сервера), если
// админ сохранил конфиг. Заглушки из пресетов воркер игнорирует
// (см. sanitizeAgentEnv в tools/agent-worker/worker.js) и использует ключ из .env.
const DEEPSEEK_PRESET = `{
  "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
  "ANTHROPIC_AUTH_TOKEN": "ВСТАВЬТЕ_КЛЮЧ_ИЗ_НАСТРОЕК",
  "ANTHROPIC_MODEL": "deepseek-v4-flash",
  "CLAUDE_CODE_EFFORT_LEVEL": "max"
}`

// ChatGPT Plus — через локальный прокси claudex (порт 4000). Ключ-заглушка:
// прокси авторизует по токену Codex из ~/.codex/auth.json (--reuse-codex).
const CHATGPT_PRESET = `{
  "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
  "ANTHROPIC_API_KEY": "sk-ant-placeholder",
  "ANTHROPIC_MODEL": "gpt-5.5",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5.4-mini",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5"
}`

// По умолчанию (пока в agent_settings ничего не сохранено) — DeepSeek
const DEFAULT_ENV_JSON = DEEPSEEK_PRESET

// Конфигурация ИИ-агента (env для Claude Code CLI): только администратор.
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || !me.user.agentAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const settings = await payload.findGlobal({ slug: 'agent-settings', overrideAccess: true })
    const envJson = (settings.envJson as string)?.trim() || DEFAULT_ENV_JSON
    return NextResponse.json({
      envJson,
      presets: { deepseek: DEEPSEEK_PRESET, chatgpt: CHATGPT_PRESET },
    })
  } catch (error) {
    console.error('Agent config GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const envJson = (body.envJson as string | undefined) ?? ''

    // Валидация: должен быть валидным JSON-объектом
    if (envJson.trim()) {
      let parsed: unknown
      try {
        parsed = JSON.parse(envJson)
      } catch {
        return NextResponse.json({ error: 'invalid json' }, { status: 400 })
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'expected a json object' }, { status: 400 })
      }
    }

    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || !me.user.agentAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await payload.updateGlobal({ slug: 'agent-settings', data: { envJson }, overrideAccess: true })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Agent config PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

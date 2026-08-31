import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Конфигурация по умолчанию (провайдер ChatGPT Plus через локальный прокси
// claudex на VPS: Anthropic Messages API → OpenAI Responses API).
// ANTHROPIC_API_KEY — заглушка: прокси авторизует по токену Codex
// из ~/.codex/auth.json пользователя n15 (--reuse-codex).
// `_deepseek_template` — неактивный шаблон старого бэкенда. Воркер его
// игнорирует (sanitize пропускает только ANTHROPIC_*/CLAUDE_CODE_*).
// Вернуть DeepSeek: заменить содержимое объекта ключами шаблона.
const DEFAULT_ENV_JSON = `{
  "ANTHROPIC_BASE_URL": "http://127.0.0.1:4000",
  "ANTHROPIC_API_KEY": "sk-ant-placeholder",
  "ANTHROPIC_MODEL": "gpt-5.5",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5.4-mini",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5",
  "_deepseek_template": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "ВСТАВЬТЕ_КЛЮЧ_ИЗ_НАСТРОЕК",
    "ANTHROPIC_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_EFFORT_LEVEL": "max"
  }
}`

// Эталонные конфиги для переключателя провайдера в CRM: дефолтный ChatGPT
// (вместе с _deepseek_template) и сам шаблон DeepSeek — извлекаем один раз.
const DEEPSEEK_TEMPLATE = JSON.stringify(JSON.parse(DEFAULT_ENV_JSON)._deepseek_template, null, 2)

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
    return NextResponse.json({ envJson, defaultEnvJson: DEFAULT_ENV_JSON, deepseekTemplate: DEEPSEEK_TEMPLATE })
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

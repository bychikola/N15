import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Конфигурация по умолчанию (провайдер DeepSeek — текущий рабочий конфиг).
// Показывается в модалке, если админ ещё ничего не сохранил. Ключ не храним
// в коде: вставляется в модалке (или лежит в .env воркера на сервере).
const DEFAULT_ENV_JSON = `{
  "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
  "ANTHROPIC_AUTH_TOKEN": "ВСТАВЬТЕ_КЛЮЧ_ИЗ_НАСТРОЕК",
  "ANTHROPIC_MODEL": "deepseek-v4-flash",
  "CLAUDE_CODE_EFFORT_LEVEL": "max"
}`

// Конфигурация ИИ-агента (env для Claude Code CLI): только администратор.
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || me.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const settings = await payload.findGlobal({ slug: 'agent-settings', overrideAccess: true })
    const envJson = (settings.envJson as string)?.trim() || DEFAULT_ENV_JSON
    return NextResponse.json({ envJson })
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
    if (!me.user || me.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await payload.updateGlobal({ slug: 'agent-settings', data: { envJson }, overrideAccess: true })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Agent config PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

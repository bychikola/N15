import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

// Задачи ИИ-агента: доступ по флагу agentAccess (ставится админом в админке
// Payload на пользователе). Создание ставит задачу в очередь —
// воркер на сервере (tools/agent-worker) выполняет её.
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || !me.user.agentAccess) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
    }
    const { docs } = await payload.find({
      collection: 'agent-tasks',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
    })
    return NextResponse.json({ docs })
  } catch (error) {
    console.error('Agent tasks GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Лимит текста задачи. Прежние 4000 символов обрезали обычные рабочие запросы
// (вставил письмо, лог, кусок кода — и задача отклонялась). Воркер передаёт
// промпт аргументом командной строки, а Linux ограничивает один аргумент
// 128 КБ (MAX_ARG_STRLEN) — поэтому меряем в БАЙТАХ и оставляем запас
// (кириллица = 2 байта на символ).
const MAX_PROMPT_BYTES = 100_000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt = (body.prompt as string | undefined)?.trim()
    if (!prompt) {
      return NextResponse.json({ error: 'Текст запроса не указан' }, { status: 400 })
    }
    const promptBytes = Buffer.byteLength(prompt, 'utf8')
    if (promptBytes > MAX_PROMPT_BYTES) {
      const kb = (n: number) => Math.round(n / 1024)
      return NextResponse.json(
        { error: `Запрос слишком длинный: ${kb(promptBytes)} КБ, максимум ${kb(MAX_PROMPT_BYTES)} КБ` },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || !me.user.agentAccess) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
    }

    const task = await payload.create({
      collection: 'agent-tasks',
      data: {
        prompt,
        status: 'queued',
        user: me.user.id,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ doc: task }, { status: 201 })
  } catch (error) {
    console.error('Agent task create error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

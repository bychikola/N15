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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt = (body.prompt as string | undefined)?.trim()
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }
    if (prompt.length > 4000) {
      return NextResponse.json({ error: 'prompt too long' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || !me.user.agentAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

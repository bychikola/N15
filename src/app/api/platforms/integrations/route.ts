import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  checkObjectOnPlatform,
  clearPlatformCredentials,
  platformStates,
  platformsSummary,
  savePlatformCredentials,
  testPlatformConnection,
} from '@/lib/platform-integration-service'
import { integrationBySlug } from '@/lib/platform-integrations'

/**
 * «Интеграции площадок» — раздел CRM для администратора.
 *
 * GET  — площадки со статусом подключения, датой последней проверки и
 *        заполненностью доступов (значения секретов не отдаются).
 * POST — действие с площадкой:
 *   action: 'save'        — сохранить доступы (кнопка «Подключить»);
 *   action: 'clear'       — отключить площадку (стереть доступы);
 *   action: 'test'        — проверить соединение реальным запросом к API
 *                           площадки и вернуть её фактический ответ;
 *   action: 'checkObject' — проверить реальный объект CRM по подключённой
 *                           площадке: объявление, ссылка, цена, дата,
 *                           совпадение параметров и фотографий.
 *
 * Доступ только у администратора: в настройках лежат ключи площадок.
 */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const user = await getCrmUser()
  if (!user || !canAccessCrm(user)) {
    return { ok: false, response: NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 }) }
  }
  if (user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Подключение площадок выполняет администратор' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function GET() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.response

    const payload = await getPayload({ config })
    const platforms = await platformStates(payload)
    return NextResponse.json({ ok: true, platforms, summary: platformsSummary(platforms) })
  } catch (error) {
    console.error('Platform integrations error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.response

    const body = (await req.json().catch(() => null)) as {
      action?: string
      slug?: string
      credentials?: Record<string, string>
      objectId?: number | string
    } | null

    const action = body?.action
    const slug = String(body?.slug || '')
    const spec = integrationBySlug(slug)
    if (!spec) return NextResponse.json({ error: 'Неизвестная площадка' }, { status: 400 })

    const payload = await getPayload({ config })

    if (action === 'save') {
      const platform = await savePlatformCredentials(payload, slug, body?.credentials || {})
      return NextResponse.json({ ok: true, platform })
    }

    if (action === 'clear') {
      const platform = await clearPlatformCredentials(payload, slug)
      return NextResponse.json({ ok: true, platform })
    }

    if (action === 'test') {
      const result = await testPlatformConnection(payload, slug)
      if (!result) return NextResponse.json({ error: 'Неизвестная площадка' }, { status: 400 })
      return NextResponse.json({ ok: true, platform: result.state, probe: result.probe })
    }

    if (action === 'checkObject') {
      const objectId = Number(body?.objectId)
      if (!Number.isFinite(objectId) || objectId <= 0) {
        return NextResponse.json({ error: 'Выберите объект для проверки' }, { status: 400 })
      }
      const check = await checkObjectOnPlatform(payload, slug, objectId)
      if (!check) return NextResponse.json({ error: 'Неизвестная площадка' }, { status: 400 })
      return NextResponse.json({ ok: true, check })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (error) {
    console.error('Platform integrations action error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

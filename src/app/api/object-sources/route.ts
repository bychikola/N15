import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { isAllowedObjectSource, objectSourceBySlug } from '@/lib/object-sources'
import {
  clearObjectSourceCredentials,
  decideSourceObject,
  importFromObjectSource,
  objectSourcesSummary,
  objectSourceStates,
  saveObjectSourceCredentials,
  setObjectSourceEnabled,
  sourceQueue,
  type SourceQueueItem,
} from '@/lib/object-source-service'

/**
 * «Источники объектов» — маршрут администратора.
 *
 * GET  — источники с правовым статусом, включённостью и заполненностью
 *        доступов (значения секретов не отдаются) и очередь кандидатов,
 *        ждущих решения.
 * POST — действие с источником или кандидатом:
 *   action: 'save'    — сохранить доступы источника;
 *   action: 'clear'   — отключить источник (стереть доступы);
 *   action: 'enable'  — включить источник;
 *   action: 'disable' — выключить источник;
 *   action: 'import'  — запустить забор объектов. В основе модуля каналы не
 *                       реализованы, поэтому честный ответ — «не реализовано»;
 *   action: 'decide'  — решение по кандидату (approved/rejected): выборочная
 *                       публикация, без неё объект в каталог не попадает.
 *
 * Запрещённый источник включить нельзя: маршрут отвечает отказом до записи.
 * Доступ только у администратора: в настройках лежат доступы источников.
 */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const user = await getCrmUser()
  if (!user || !canAccessCrm(user)) {
    return { ok: false, response: NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 }) }
  }
  if (user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Источники объектов настраивает администратор' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function GET() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.response

    const payload = await getPayload({ config })
    const sources = await objectSourceStates(payload)
    let queue: SourceQueueItem[] = []
    try {
      queue = await sourceQueue(payload)
    } catch (e) {
      // Очередь может быть недоступна, пока схема не досоздана — источники
      // всё равно показываем: пустой забор не должен ронять раздел
      console.error('Object sources: не удалось прочитать очередь кандидатов:', e)
    }
    return NextResponse.json({ ok: true, sources, summary: objectSourcesSummary(sources), queue })
  } catch (error) {
    console.error('Object sources error:', error)
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
      candidateId?: number | string
    } | null

    const action = body?.action
    const payload = await getPayload({ config })

    // Решение по кандидату не привязано к источнику — разбираем до его проверки
    if (action === 'decide') {
      const decision = (body as { decision?: string } | null)?.decision
      if (decision !== 'approved' && decision !== 'rejected') {
        return NextResponse.json({ error: 'Неизвестное решение (approved/rejected)' }, { status: 400 })
      }
      const candidateId = Number(body?.candidateId)
      if (!Number.isFinite(candidateId) || candidateId <= 0) {
        return NextResponse.json({ error: 'Не указан кандидат' }, { status: 400 })
      }
      const user = await getCrmUser()
      const result = await decideSourceObject(payload, candidateId, decision, user?.id)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ok: true, status: result.status })
    }

    const slug = String(body?.slug || '')
    const spec = objectSourceBySlug(slug)
    if (!spec) return NextResponse.json({ error: 'Неизвестный источник' }, { status: 400 })

    if (action === 'import' && !isAllowedObjectSource(slug)) {
      return NextResponse.json({ error: `Источник запрещён: ${spec.reason}` }, { status: 400 })
    }

    if (action === 'save') {
      const source = await saveObjectSourceCredentials(payload, slug, body?.credentials || {})
      if (!source) return NextResponse.json({ error: `Источник запрещён: ${spec.reason}` }, { status: 400 })
      return NextResponse.json({ ok: true, source })
    }

    if (action === 'clear') {
      const source = await clearObjectSourceCredentials(payload, slug)
      if (!source) return NextResponse.json({ error: `Источник запрещён: ${spec.reason}` }, { status: 400 })
      return NextResponse.json({ ok: true, source })
    }

    if (action === 'enable' || action === 'disable') {
      const source = await setObjectSourceEnabled(payload, slug, action === 'enable')
      if (!source) return NextResponse.json({ error: `Источник запрещён: ${spec.reason}` }, { status: 400 })
      return NextResponse.json({ ok: true, source })
    }

    if (action === 'import') {
      const result = await importFromObjectSource(payload, slug)
      if (!result) return NextResponse.json({ error: 'Неизвестный источник' }, { status: 400 })
      return NextResponse.json({ ok: result.implemented, import: result })
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  } catch (error) {
    console.error('Object sources action error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

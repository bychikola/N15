import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Отмена задачи ИИ-агента.
 *
 *   PATCH /api/agent/tasks/{id}  { action: 'cancel' }
 *
 * Задача «В очереди» просто помечается отменённой — воркер её не возьмёт.
 * Запущенную задачу воркер останавливает сам: он раз в несколько секунд
 * смотрит статус в БД и убивает процесс агента, увидев 'cancelled'
 * (см. tools/agent-worker/worker.js), после чего финализирует статус.
 *
 * Отменить свою задачу может её автор; администратор — любую.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const taskId = Number(id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: 'Некорректный id задачи' }, { status: 400 })
    }

    const body = (await req.json().catch(() => null)) as { action?: string } | null
    if (body?.action !== 'cancel') {
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const me = await payload.auth({ headers: req.headers })
    if (!me.user || (!me.user.agentAccess && me.user.role !== 'admin')) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
    }

    const task = await payload.findByID({
      collection: 'agent-tasks',
      id: taskId,
      depth: 0,
      overrideAccess: true,
    })
    if (!task) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
    }

    // Автор или администратор
    const authorId = typeof task.user === 'number'
      ? task.user
      : (task.user as { id?: number } | null | undefined)?.id
    if (me.user.role !== 'admin' && authorId !== me.user.id) {
      return NextResponse.json({ error: 'Отменить можно только свою задачу' }, { status: 403 })
    }

    const status = String(task.status)
    if (status === 'done' || status === 'failed' || status === 'cancelled') {
      return NextResponse.json({ error: 'Задача уже завершена' }, { status: 400 })
    }

    const updated = await payload.update({
      collection: 'agent-tasks',
      id: taskId,
      data: {
        status: 'cancelled',
        result: status === 'running'
          ? 'Отменена пользователем — воркер останавливает агента…'
          : 'Отменена до запуска',
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, doc: updated })
  } catch (error) {
    console.error('Agent task cancel error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

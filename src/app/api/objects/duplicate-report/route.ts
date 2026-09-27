import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  duplicateMatches,
  findIntersectingObject,
  hasSignals,
  normalizeSignals,
  type DuplicateSignals,
} from '@/lib/object-duplicates'

/** Подписи признаков для текста задачи администратору */
const MATCH_LABELS: Record<string, string> = {
  phone: 'телефон собственника',
  cadastral: 'кадастровый номер',
  address: 'адрес',
  name: 'имя собственника',
}

/**
 * «Сообщить администратору» — сигнал о возможном дубле из уведомления
 * о пересечении (см. CrmObjects.tsx).
 *
 * Сообщение уходит задачей в CRM (коллекция tasks): она встаёт в «Задачи»
 * у администратора, и разбор дубля не теряется в переписке. Задача одна:
 * администраторы видят все задачи, поэтому копия каждому не нужна, а
 * ответственный — первый администратор (самая ранняя учётная запись).
 *
 * Как и просмотр (см. duplicate-view), маршрут принимает сообщение только
 * по объекту, который действительно пересекается с проверяемой карточкой:
 * иначе им можно было бы завалить администратора задачами по любым объектам.
 * Текст задачи собирается на сервере из данных объекта — присланному
 * с клиента тексту здесь места нет.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const isAdmin = user.role === 'admin'

    const body = (await req.json()) as DuplicateSignals & { id?: number; excludeId?: number }
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const signals = normalizeSignals(body, isAdmin)
    if (!hasSignals(signals)) {
      return NextResponse.json(
        { error: 'Не переданы признаки проверяемой карточки' },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config })
    const doc = await findIntersectingObject(payload, id, signals, body.excludeId)
    if (!doc) {
      return NextResponse.json(
        { error: 'Объект не совпадает с проверяемой карточкой' },
        { status: 403 },
      )
    }

    const { docs: admins } = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      sort: 'id',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const assignee = admins[0]?.id
    if (assignee == null) {
      // Администраторов в базе нет — сообщать некому: это ошибка настройки,
      // а не молчаливое «отправлено»
      return NextResponse.json({ error: 'Администратор не найден' }, { status: 503 })
    }

    const matches = duplicateMatches(doc, signals)
    const reasons = matches.map((m) => MATCH_LABELS[m] || m).join(', ')
    const objectTitle = typeof doc.title === 'string' && doc.title ? doc.title : 'без названия'
    const title = `Проверить дубль объекта #${String(doc.id)} «${objectTitle}» — совпал(о): ${reasons}. Сообщил сотрудник: ${user.name}`

    await payload.create({
      collection: 'tasks',
      data: {
        title,
        taskType: 'task',
        // Срок — сегодня: задача сразу видна в колонке «Сегодня»
        dueDate: new Date().toISOString(),
        assignedTo: assignee,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Duplicate report error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

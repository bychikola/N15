import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Создание объекта из старой формы /admin-add (быстрое добавление).
 *
 * Раньше маршрут был открыт всем: любой человек без входа мог создать объект
 * с произвольными данными, да ещё сразу со статусом «опубликован» — объект
 * с улицы попадал в каталог. Теперь карточку создаёт только сотрудник (агент
 * или администратор) со своей сессией CRM, а статус всегда черновик: объект
 * публикуется осознанно, из карточки CRM. Права проверяет и сама коллекция
 * objects — создание здесь идёт от имени пользователя (overrideAccess: false),
 * а не в обход правил.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: await headers() })
    if (!user || (user.role !== 'agent' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Нужен вход в CRM: добавление объектов доступно сотрудникам' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const object = await payload.create({
      collection: 'objects',
      // Статус и slug задаёт сервер: присланные значения не принимаем
      data: { ...body, status: 'draft' },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({ doc: object })
  } catch (error) {
    console.error('Create object error:', error)
    return NextResponse.json({ error: 'Не удалось создать объект' }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'

/**
 * Создание и правка профиля агента из CRM (раздел «Агенты»).
 *
 *   POST  /api/agents/manage  { name, position?, phone?, email?, telegram?,
 *                               whatsapp?, photoId?, isActive? }
 *   PATCH /api/agents/manage  { id, name, position?, phone?, email?, telegram?,
 *                               whatsapp?, photoId?, isActive? }
 *
 * Доступ: администратор или сотрудник с галочкой «Может добавлять агентов»
 * (поле canManageAgents, ставится в админке Payload — как доступ к ИИ-агенту).
 * Остальным — 403.
 *
 * Телефоны агентов скрыты от посетителей полевой access-проверкой коллекции
 * (см. Agents.ts), поэтому запись идёт с overrideAccess: права проверяем здесь.
 *
 * Поля в PATCH — как в обычном PATCH: чего нет в теле, то не меняется.
 *   текст   — пустая строка очищает значение (в Payload undefined значит
 *             «не трогать», поэтому пустое поле уходит как null: иначе
 *             сотрудник не смог бы стереть, например, старый telegram);
 *   photoId — число привязывает изображение из media, null убирает фото,
 *             отсутствие поля оставляет текущий снимок;
 *   isActive — меняется только когда пришёл; запрос без него не возвращает
 *             в строй снятого с публикации агента.
 */

type AgentBody = {
  id?: number | string
  name?: string
  position?: string
  phone?: string
  email?: string
  telegram?: string
  whatsapp?: string
  photoId?: number | string | null
  isActive?: boolean
}

/** Доступ к правке профилей: администратор или сотрудник с разрешением */
async function managerGate(): Promise<NextResponse | null> {
  const user = await getCrmUser()
  if (!user || !canAccessCrm(user)) {
    return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
  }
  if (user.role !== 'admin' && !user.canManageAgents) {
    return NextResponse.json(
      { error: 'Менять профили агентов может администратор или сотрудник с разрешением' },
      { status: 403 },
    )
  }
  return null
}

/** Обрезка текстового поля: undefined — поле не заполнено */
const text = (v: unknown, max = 300): string | undefined => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || undefined
}

/**
 * Значение текстового поля для PATCH: поля нет в теле — не трогаем (undefined),
 * пустая строка — очищаем (null), иначе — новое значение. Без этого частичный
 * запрос («поменять только телефон») стирал бы остальные поля профиля.
 */
const patchText = (v: unknown, max = 300): string | null | undefined =>
  v === undefined ? undefined : (text(v, max) ?? null)

/**
 * Фото: принимаем только существующий файл-изображение. Сама коллекция media
 * открыта на чтение (фото объектов и так публичны), поэтому проверяем не «чьё
 * это фото», а что id настоящий и это картинка — иначе к агенту можно привязать
 * произвольную запись (например, документ) или мусорный id.
 */
async function resolvePhoto(
  payload: Awaited<ReturnType<typeof getPayload>>,
  raw: number | string | null,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const photoId = Number(raw)
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return { ok: false, error: 'Фото не найдено или это не изображение' }
  }
  const media = await payload
    .findByID({ collection: 'media', id: photoId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const mime = String((media as { mimeType?: string } | null)?.mimeType || '')
  if (!media || !mime.startsWith('image/')) {
    return { ok: false, error: 'Фото не найдено или это не изображение' }
  }
  return { ok: true, id: photoId }
}

/** Создание агента — кнопка «Добавить агента» в разделе «Агенты» */
export async function POST(req: NextRequest) {
  try {
    const denied = await managerGate()
    if (denied) return denied

    const body = (await req.json().catch(() => null)) as AgentBody | null

    const name = text(body?.name, 200)
    if (!name) {
      return NextResponse.json({ error: 'Укажите имя агента' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    let photo: number | undefined
    if (body?.photoId != null) {
      const resolved = await resolvePhoto(payload, body.photoId)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      photo = resolved.id
    }

    const agent = await payload.create({
      collection: 'agents',
      data: {
        name,
        position: text(body?.position),
        phone: text(body?.phone, 40),
        email: text(body?.email, 200),
        telegram: text(body?.telegram),
        whatsapp: text(body?.whatsapp, 200),
        ...(photo ? { photo } : {}),
        isActive: body?.isActive !== false,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, doc: agent }, { status: 201 })
  } catch (error) {
    console.error('Agent create error:', error)
    // Детали — только в серверный лог: клиенту общее сообщение, внутренние
    // пути и текст исключений наружу не отдаём
    return NextResponse.json({ error: 'Не удалось создать агента' }, { status: 500 })
  }
}

/** Правка профиля — кнопка «Редактировать» в списке агентов и в профиле */
export async function PATCH(req: NextRequest) {
  try {
    const denied = await managerGate()
    if (denied) return denied

    const body = (await req.json().catch(() => null)) as AgentBody | null

    const agentId = Number(body?.id)
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return NextResponse.json({ error: 'Не указан агент' }, { status: 400 })
    }

    // Имя в профиле обязательное, поэтому пустым оно быть не может — но и
    // требовать его в каждом запросе не нужно: если поля в теле нет, оно
    // остаётся прежним (форма правки всегда присылает его заполненным)
    const name = text(body?.name, 200)
    if (body && 'name' in body && !name) {
      return NextResponse.json({ error: 'Укажите имя агента' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    const exists = await payload
      .findByID({ collection: 'agents', id: agentId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!exists) {
      return NextResponse.json({ error: 'Агент не найден' }, { status: 404 })
    }

    // Фото меняем только когда поле пришло: число — привязать, null — убрать.
    // Без ключа в теле оставляем то, что стоит (undefined в Payload = не трогать).
    let photoPatch: { photo?: number | null } = {}
    if (body && 'photoId' in body) {
      if (body.photoId == null) {
        photoPatch = { photo: null }
      } else {
        const resolved = await resolvePhoto(payload, body.photoId)
        if (!resolved.ok) {
          return NextResponse.json({ error: resolved.error }, { status: 400 })
        }
        photoPatch = { photo: resolved.id }
      }
    }

    const agent = await payload.update({
      collection: 'agents',
      id: agentId,
      data: {
        ...(name ? { name } : {}),
        // Пустое поле очищает значение, отсутствующее — остаётся прежним
        position: patchText(body?.position),
        phone: patchText(body?.phone, 40),
        email: patchText(body?.email, 200),
        telegram: patchText(body?.telegram),
        whatsapp: patchText(body?.whatsapp, 200),
        // Активность меняем только когда её прислали: иначе частичный запрос
        // возвращал бы в строй снятого с публикации агента
        ...(body && 'isActive' in body ? { isActive: body.isActive !== false } : {}),
        ...photoPatch,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, doc: agent })
  } catch (error) {
    console.error('Agent update error:', error)
    return NextResponse.json({ error: 'Не удалось сохранить изменения' }, { status: 500 })
  }
}

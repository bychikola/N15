import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { PHOTO_MAX_BYTES, PHOTO_MAX_LABEL } from '@/lib/photo-rules'

/**
 * Загрузка PDF-документа ЖК из CRM: презентация комплекса и планировки в PDF
 * (коллекция complex-documents, см. src/payload/collections/ComplexDocuments.ts).
 *
 * Отдельный маршрут, а не общий /api/crm/upload: тот принимает только
 * изображения и размечает их знаком «Н15» через хук media (см.
 * src/lib/media-marking.ts) — PDF через sharp не проходит, знак на документ
 * не ложится. Здесь файл уходит в хранилище как есть.
 *
 * Проверка входа — до чтения файла, ответы с понятным кодом (как в
 * /api/crm/upload): session_expired (401), too_large (413), bad_type (415),
 * upload_failed (500).
 */

/** Запас к лимиту: границы multipart, имя файла и поля формы */
const MULTIPART_OVERHEAD = 1024 * 1024

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: message, code }, { status })
}

export async function POST(req: NextRequest) {
  const user = await getCrmUser()
  if (!user) return fail(401, 'session_expired', 'Сессия истекла — войдите заново')
  if (!canAccessCrm(user)) return fail(403, 'forbidden', 'Нет доступа к CRM')

  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > PHOTO_MAX_BYTES + MULTIPART_OVERHEAD) {
    return fail(413, 'too_large', `Файл больше ${PHOTO_MAX_LABEL} — выберите поменьше`)
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || !(file instanceof File)) return fail(400, 'no_file', 'Файл не приложен')

  if (file.size > PHOTO_MAX_BYTES) {
    return fail(413, 'too_large', `Файл больше ${PHOTO_MAX_LABEL} — выберите поменьше`)
  }

  const original = Buffer.from(await file.arrayBuffer())

  // Формат определяем по «магии» самого файла, а не по file.type: на iPhone
  // Safari отдаёт PDF с пустым типом или как application/octet-stream (баг
  // FormData), и проверка по MIME отвергала настоящую презентацию — кнопка
  // «Загрузить презентацию» на телефоне не срабатывала. Заголовок %PDF- есть
  // у любого PDF и подделать его расширением нельзя.
  if (original.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return fail(415, 'bad_type', 'Нужен PDF-файл')
  }

  try {
    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: 'complex-documents',
      data: { title: file.name.replace(/\.[^.]+$/, '') },
      file: {
        data: original,
        mimetype: 'application/pdf',
        name: file.name,
        size: original.length,
      },
      // Пользователь уже проверен (getCrmUser) — передаём его в операцию,
      // чтобы правила доступа коллекции применялись как обычно
      user: { id: user.id, collection: 'users', email: user.email, role: user.role },
      overrideAccess: false,
    })
    return NextResponse.json({ doc })
  } catch (e) {
    console.error('CRM document upload error:', e)
    return fail(500, 'upload_failed', 'Сервер не смог сохранить файл — попробуйте ещё раз')
  }
}

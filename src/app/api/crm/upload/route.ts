import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  PHOTO_FORMATS_LABEL,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_LABEL,
  isAllowedPhoto,
  photoSizeLabel,
} from '@/lib/photo-rules'

/**
 * Загрузка фотографии объекта из CRM.
 *
 * Раньше карточка отправляла фото прямо в REST Payload (/api/media) и на
 * любую неудачу молча продолжала работу: файл не сохранялся, а сотрудник
 * узнавал об этом только по пропавшему фото. Отдельный маршрут нужен, чтобы
 * проверить вход до чтения файла и ответить понятным кодом (code):
 *
 *   session_expired (401) — сессия истекла, нужно войти заново: карточка
 *       показывает вход, не уводя со страницы и не теряя данные объекта;
 *   too_large (413) — файл больше лимита (Caddy на входе режет запрос по
 *       max_size и отдавал пустой ответ 413, который нечем объяснить);
 *   bad_type (415) — формат не из списка JPG/PNG/WEBP (HEIC с iPhone раньше
 *       уезжал в хранилище нечитаемым файлом);
 *   upload_failed (500) — прочие ошибки хранилища.
 *
 * Отвечаем 401, а не 403 как REST Payload: на истёкшую сессию Payload отдаёт
 * 403 «нет права на действие» (пользователь в запросе анонимный), и отличить
 * это от настоящего запрета по коду ответа нельзя.
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

  // Отсекаем заведомо большой файл, не разбирая его: на VPS ~2 ГБ памяти, а
  // перед приложением стоит Caddy с max_size 50MB (Caddyfile), так что файл
  // больше лимита сюда и не доедет.
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > PHOTO_MAX_BYTES + MULTIPART_OVERHEAD) {
    return fail(413, 'too_large', `Файл больше ${PHOTO_MAX_LABEL} — выберите фото поменьше`)
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || !(file instanceof File)) return fail(400, 'no_file', 'Файл не приложен')

  // Формат и размер — по самому файлу, а не только по заголовкам запроса
  if (!isAllowedPhoto({ name: file.name, type: file.type })) {
    return fail(415, 'bad_type', `Формат не поддерживается — нужны ${PHOTO_FORMATS_LABEL}`)
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return fail(413, 'too_large', `Фото весит ${photoSizeLabel(file.size)} — максимум ${PHOTO_MAX_LABEL}`)
  }

  // В хранилище файл кладёт Payload: сам чистит имя от путей и посторонних
  // символов, генерирует размеры (thumbnail, card, hero) и создаёт документ
  // коллекции media. Ручная запись в папку (как было в /api/upload) оставляла
  // второй, никому не нужный файл с неочищенным именем из браузера.
  try {
    const payload = await getPayload({ config })
    const buffer = Buffer.from(await file.arrayBuffer())
    const doc = await payload.create({
      collection: 'media',
      data: { alt: file.name.replace(/\.[^.]+$/, '') },
      file: {
        data: buffer,
        mimetype: file.type || 'image/jpeg',
        name: file.name,
        size: buffer.length,
      },
      // Пользователь уже проверен через payload.auth (getCrmUser) — передаём
      // его в операцию, чтобы правила доступа коллекции media применялись
      // как обычно, а не обходились флагом overrideAccess
      user: { id: user.id, collection: 'users', email: user.email, role: user.role },
      overrideAccess: false,
    })
    return NextResponse.json({ doc })
  } catch (e) {
    console.error('CRM upload error:', e)
    return fail(500, 'upload_failed', 'Сервер не смог сохранить фото — попробуйте ещё раз')
  }
}

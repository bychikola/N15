import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { updateOwnerApplicationPhotos } from '@/lib/owner-application-photos'

/**
 * Правка фотографий заявки собственника администратором из CRM.
 *
 *   POST /api/crm/owner-applications/photos   (multipart/form-data)
 *
 * Тело — та же форма, что шлёт блок фотографий в карточке заявки:
 * applicationId, keepPhotos (id оставленных снимков), photos (новые файлы)
 * и mainPhoto (ключ главного снимка). Запрос multipart, а не JSON: снимки
 * лежат в закрытом хранилище owner-materials, и принимать их должен тот же
 * маршрут, что меняет список (см. updateOwnerApplicationPhotos).
 *
 * Доступ — только администратору: заявка содержит персональные данные
 * собственника. Агент получает 403 и здесь, и на странице заявки.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Редактировать фотографии заявки может только администратор' },
        { status: 403 },
      )
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const applicationId = Number(form.get('applicationId'))
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: 'Не указана заявка' }, { status: 400 })
    }

    const result = await updateOwnerApplicationPhotos(payload, applicationId, form, user)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Owner application photos error:', error)
    return NextResponse.json({ error: 'Не удалось сохранить фотографии — попробуйте ещё раз' }, { status: 500 })
  }
}

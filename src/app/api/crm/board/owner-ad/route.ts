import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { updateOwnerBoardAdByAdmin } from '@/lib/owner-board-edit'

/**
 * Правка объявления собственника администратором из CRM.
 *
 *   POST /api/crm/board/owner-ad   (multipart/form-data)
 *
 * Тело — та же форма, что шлёт редактор: boardAdId, текстовые поля,
 * keepPhotos (id оставленных снимков), photos (новые файлы) и mainPhoto
 * (ключ главного снимка). Правка идёт multipart-запросом, а не JSON: снимки
 * до публикации лежат в закрытом хранилище board-materials, и принимать их
 * должен тот же маршрут, что меняет текст (см. updateOwnerBoardAdByAdmin).
 *
 * Доступ — только администратору: объявление принадлежит собственнику, а его
 * данные (имя и телефон) — персональные. Агент получает 403 и здесь, и на
 * странице /crm/board/owner/[id].
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Редактировать объявление собственника может только администратор' },
        { status: 403 },
      )
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    const boardAdId = Number(form.get('boardAdId'))
    if (!Number.isInteger(boardAdId) || boardAdId <= 0) {
      return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
    }

    const result = await updateOwnerBoardAdByAdmin(payload, boardAdId, form, user)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Owner board ad edit error:', error)
    return NextResponse.json({ error: 'Не удалось сохранить объявление — попробуйте ещё раз' }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'

/**
 * Массовый пересчёт рыночной оценки всех существующих объектов.
 *
 * Нужен один раз после появления полей оценки в схеме (для записей,
 * созданных до этой версии): ставит valuation: {} — хук beforeChange
 * коллекции видит изменение группы и пересчитывает системную оценку
 * (с сохранением возможной ручной правки).
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const payload = await getPayload({ config })
    let updated = 0
    let page = 1
    let totalPages = 1

    // Страницами по 100 (лимит Payload); защита от бесконечного цикла
    while (page <= totalPages && page <= 50) {
      const { docs, totalPages: pages } = await payload.find({
        collection: 'objects',
        page,
        limit: 100,
        depth: 0,
        sort: '-updatedAt',
      })
      totalPages = pages
      for (const doc of docs) {
        // Хук перед сохранением сам пересчитает оценку по полному документу
        await payload.update({
          collection: 'objects',
          id: doc.id,
          data: { valuation: {} },
          depth: 0,
        })
        updated++
      }
      page++
    }

    return NextResponse.json({ ok: true, updated })
  } catch (error) {
    console.error('Backfill valuation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { runBoardExpirySweep } from '@/lib/board-service'

/**
 * Ручной проход по срокам размещения (кнопка «Проверить сроки» в разделе
 * CRM «Доска»).
 *
 * Тот же код, что запускается по таймеру раз в час (см. src/instrumentation.ts):
 * напоминает авторам о скором конце срока и снимает просроченные объявления.
 * Отдельный маршрут нужен, чтобы это можно было сделать не дожидаясь таймера —
 * и чтобы проверить работу задачи в разработке, где таймер не запускается
 * (в dev-режиме фоновая проверка отключена).
 *
 * Доступ: команда Н15 — как у модерации.
 */
export async function POST() {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const payload = await getPayload({ config })
    const result = await runBoardExpirySweep(payload)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('Board expiry sweep error:', error)
    return NextResponse.json({ error: 'Не удалось проверить сроки' }, { status: 500 })
  }
}

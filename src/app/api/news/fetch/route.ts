import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { runNewsSweep } from '@/lib/news-service'

/**
 * «Проверить источники» — ручной запуск автосбора новостей из открытых
 * RSS-каналов официальных источников (см. src/lib/news.ts).
 *
 * Тот же проход выполняет серверный таймер (src/instrumentation.ts) по
 * расписанию; здесь — кнопка в CRM, чтобы не ждать следующего срока.
 * Проход идемпотентен: дубли не создаются, поэтому частые нажатия безопасны.
 *
 * Внутренний маршрут CRM: только агент или администратор.
 */
export async function POST() {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const payload = await getPayload({ config })
    const result = await runNewsSweep(payload)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('News fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

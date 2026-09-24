import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { boardAdPhone } from '@/lib/board-service'
import { rateLimited, clientIp } from '@/lib/rate-limit'

/**
 * Телефон автора объявления по кнопке «Показать телефон».
 *
 * Номера авторов не публикуются в разметке страницы: у доски объявления
 * размещают частные лица, и открытый номер — это персональные данные,
 * доступные любому сборщику. Номер отдаётся этим маршрутом в момент нажатия
 * (как у агентов — см. /api/agents/contact) и только у опубликованного
 * и не истёкшего объявления.
 *
 * Защита от перебора: лимит по IP — иначе маршрут позволял бы выкачать
 * телефоны всех авторов простым перебором id.
 *
 * Почему лимиту можно доверять: контейнер приложения не смотрит в интернет
 * напрямую — на входе стоит Caddy, и он дописывает реальный адрес клиента
 * в конец X-Forwarded-For. clientIp берёт именно ПОСЛЕДНИЙ элемент, поэтому
 * подставить свой адрес в заголовке и обойти лимит нельзя (первый элемент
 * как раз подделывается кем угодно). Счётчики живут в памяти процесса —
 * этого достаточно, пока контейнер один; при нескольких инстансах лимит
 * нужно выносить в базу или Redis.
 */
const PHONE_RATE_MAX = 30
const PHONE_RATE_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { id?: number | string } | null
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Не указано объявление' }, { status: 400 })
  }
  if (rateLimited(`board-phone:${clientIp(req.headers)}`, PHONE_RATE_MAX, PHONE_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Слишком много запросов — попробуйте через минуту' }, { status: 429 })
  }

  try {
    const payload = await getPayload({ config })
    const phone = await boardAdPhone(payload, id)
    if (!phone) {
      return NextResponse.json({ error: 'Телефон недоступен' }, { status: 404 })
    }
    return NextResponse.json({ phone })
  } catch (error) {
    console.error('Board phone error:', error)
    return NextResponse.json({ error: 'Не удалось показать телефон' }, { status: 500 })
  }
}

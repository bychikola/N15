import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimited, clientIp } from '@/lib/rate-limit'
import { cleanCadastral, isCadastralFormat } from '@/lib/cadastral'

/**
 * Поиск земельных участков по кадастровому номеру — для фильтра каталога.
 *
 * Кадастровые номера — закрытые сведения: поле cadastralNumber скрыто от
 * посетителей полевой проверкой коллекции objects, и публичный API такие
 * поля не только не отдаёт, но и не принимает в where («The following path
 * cannot be queried»). Поэтому фильтр не может спрашивать каталог напрямую и
 * ходит сюда: маршрут читает объекты с overrideAccess и возвращает ТОЛЬКО id
 * найденных участков — сам номер не покидает сервер ни в ответе, ни в
 * каталоге (клиент подставляет id: { in: [...] } в свой where).
 *
 * Совпадение только точное и только по формату ЕГРН (см. isCadastralFormat):
 * частичный поиск («15:07:0030021» найдёт все участки квартала) превратил бы
 * фильтр в способ выкачать номера объекта Н15 перебором. По той же причине
 * стоит лимит по IP — как у маршрута контактов агентов (см. agents/contact).
 *
 * Участок ищется по полю cadastralNumber: у земли номер участка хранится
 * именно там (у дома в этом поле номер строения, а номер участка — в
 * plotCadastralNumber, см. коллекцию objects). Фильтр каталога поэтому
 * показывается только у категории «участок».
 *
 * Параметры: ?number=15:07:0030021:123
 */
// Лимит тот же, что у маршрута контактов агентов (30 запросов в минуту):
// человеку, вводящему номер по частям, хватает с запасом, а перебор
// (30 обращений в минуту ≈ 43 тысячи в сутки на адрес) остаётся бессмысленным
const CADASTRAL_RATE_MAX = 30
const CADASTRAL_RATE_WINDOW_MS = 60_000

/** Сколько id отдаём: номер участка уникален, но дубликаты в базе бывают —
 *  ограничение защищает выдачу от разрастания на грязных данных */
const MAX_IDS = 50

export async function GET(req: NextRequest) {
  const number = cleanCadastral(req.nextUrl.searchParams.get('number'))
  // Не кадастровый номер (обрезанный, с чужими знаками, пустой) — искать
  // нечего: пустой ответ без обращения к базе. Ошибку не отдаём: клиент
  // получает тот же результат, что и по ненайденному номеру
  if (!isCadastralFormat(number)) {
    return NextResponse.json({ ids: [] })
  }
  if (rateLimited(`cadastral:${clientIp(req.headers)}`, CADASTRAL_RATE_MAX, CADASTRAL_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'objects',
      // Только опубликованные участки: черновики и архив на сайте не видны,
      // и фильтр не должен показывать их число
      where: {
        and: [
          { status: { equals: 'published' } },
          { category: { equals: 'land' } },
          { cadastralNumber: { equals: number } },
        ],
      },
      limit: MAX_IDS,
      depth: 0,
      overrideAccess: true,
    })
    return NextResponse.json({ ids: docs.map((d) => Number(d.id)).filter(Number.isInteger) })
  } catch (error) {
    console.error('Cadastral lookup error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

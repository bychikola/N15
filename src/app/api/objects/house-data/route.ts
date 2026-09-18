import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { myObjectIds } from '@/lib/legal-service'
import { normalizeHouseAddress, type HouseSourceReport } from '@/lib/house-info'
import { houseInfoForStaff, lookupHouseInfo, persistHouseInfo, savedHouseInfo } from '@/lib/house-info-service'
import type { SavedHouseInfo } from '@/lib/house-info-service'

/**
 * «Искать в открытых источниках» — кнопка в карточке объекта CRM.
 *
 * POST { objectId } — проверка дома по открытым источникам. Адрес снимается с
 * карточки и разбирается на части (город, улица, номер дома, корпус,
 * строение), по ним ищется дом в реестре АИС ППК «ФРТ» — это рабочий канал к
 * раскрываемым сведениям ГИС ЖКХ. Источников несколько: паспорт дома и
 * раздел «Управление» (жилищный фонд), карточка программы капитального
 * ремонта, официальные порталы (ГИС ЖКХ, НСПД, кадастровая карта),
 * муниципальная база города, сайт управляющей организации и открытые
 * карточки площадок недвижимости. Из ответов собираются характеристики дома —
 * год постройки, материал стен, этажность, серия, площадь, капитальный
 * ремонт, управляющая организация.
 *
 * Ответ — поток NDJSON: по строке на событие, чтобы карточка показывала
 * живую картину по источникам, а не ждала конца проверки.
 *   { type: 'start', address, privateHouse }   — адрес разобран, поиск начат
 *   { type: 'source', source }                 — источник проверен (отчёт)
 *   { type: 'done', ok, canApprove, saved }    — снимок сохранён, итог
 *   { type: 'error', error }                   — проверка прервалась
 * Первые три события обрабатываются потоком, поэтому строка «В источнике
 * ГИС ЖКХ не найдено. Выполняется поиск по другим источникам» на экране
 * означает ровно то, что написано: реестр дом не нашёл, проверка других
 * источников идёт прямо сейчас. Ошибки до старта проверки (нет доступа, не
 * указан объект) уходят обычным JSON со своим кодом ответа.
 *
 * GET ?objectId=… — последний сохранённый снимок (карточка открывается без
 * повторного прогона).
 *
 * Внутренний маршрут CRM: данные о доме — общие характеристики дома из
 * открытых источников, поэтому их получает любой сотрудник (агент и
 * администратор) по любому объекту, независимо от того, какой агент ведёт
 * объект. Кадастровые сведения снимка (номер участка по реестру) видит
 * только администратор — остальным сотрудникам они не отдаются.
 */

/** События потока проверки дома */
type HouseDataEvent =
  | { type: 'start'; address: ReturnType<typeof normalizeHouseAddress>; privateHouse: boolean }
  | { type: 'source'; source: HouseSourceReport }
  | { type: 'done'; ok: true; canApprove: boolean; saved: SavedHouseInfo }
  | { type: 'error'; error: string }

/**
 * Может ли сотрудник подтверждать характеристики этого объекта: администратор
 * — у любого объекта, агент — только у своего (см. house-data/manage). Ответ
 * уходит в UI флагом canApprove: у чужого объекта блок подтверждения просто
 * не показывается, а не остаётся кнопкой, которая вернёт «Объект ведёт другой
 * агент» (просмотр характеристик при этом доступен всем сотрудникам).
 */
async function canApproveHouse(
  payload: Payload,
  user: { id: number; role: string },
  objectId: number,
): Promise<boolean> {
  if (user.role === 'admin') return true
  const mine = await myObjectIds(payload, user.id)
  return mine.has(objectId)
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as { objectId?: number | string } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    const obj = doc as unknown as {
      category?: string | null
      address?: Record<string, unknown>
      cadastralNumber?: string | null
      /** Номер участка частного дома — для сверки с паспортом дома */
      plotCadastralNumber?: string | null
    }
    const address = obj.address || {}
    const query = {
      city: typeof address.city === 'string' ? address.city : null,
      locality: typeof address.locality === 'string' ? address.locality : null,
      street: typeof address.street === 'string' ? address.street : null,
      house: typeof address.house === 'string' ? address.house : null,
      // Корпус хранится отдельным полем, а в реестр адрес уходит строкой —
      // разбор дома и корпуса делает normalizeHouseAddress (см. src/lib/house-info)
      corpus: typeof address.corpus === 'string' ? address.corpus : null,
      snt: typeof address.snt === 'string' ? address.snt : null,
    }
    const normalized = normalizeHouseAddress(query)
    // Частный дом или участок: карточки такого дома в ГИС ЖКХ обычно нет,
    // порядок поиска другой (см. house-info-service)
    const privateHouse = obj.category === 'house' || obj.category === 'land'
    const isAdmin = user.role === 'admin'
    const canApprove = await canApproveHouse(payload, user, objectId)

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: HouseDataEvent) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        try {
          send({ type: 'start', address: normalized, privateHouse })
          const result = await lookupHouseInfo(
            {
              address: query,
              cadastralNumber: obj.cadastralNumber || null,
              // Номер участка — отдельное поле карточки дома (см. Objects):
              // в паспорте дома реестр указывает именно номер участка
              plotCadastralNumber: obj.plotCadastralNumber || null,
              category: obj.category || null,
            },
            // Источник проверен — сразу отдаём отчёт в карточку: агент видит,
            // где дом найден, где нет и что сейчас проверяется
            { onSource: (source) => send({ type: 'source', source }) },
          )
          // Снимок сохраняем best-effort: если запись не прошла, свежий
          // результат всё равно уходит агенту в ответе (persistHouseInfo
          // вернёт его как снимок)
          const saved = await persistHouseInfo(payload, objectId, result, { name: user.name })
          send({ type: 'done', ok: true, canApprove, saved: houseInfoForStaff(saved, isAdmin) })
        } catch (error) {
          console.error('House data error:', error)
          send({ type: 'error', error: `Проверка прервалась: ${String(error)}` })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('House data error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const objectId = Number(new URL(req.url).searchParams.get('objectId'))
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const doc = await payload.findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    if (!doc) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })

    const canApprove = await canApproveHouse(payload, user, objectId)

    return NextResponse.json({
      ok: true,
      canApprove,
      saved: houseInfoForStaff(savedHouseInfo(doc), user.role === 'admin'),
    })
  } catch (error) {
    console.error('House data (saved) error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { agentProfileIds, isOwnObjectDoc } from '@/lib/object-access'
import {
  duplicateMatches,
  duplicateStrength,
  duplicateView,
  findIntersectingObject,
  hasSignals,
  normalizeSignals,
  type DuplicateSignals,
} from '@/lib/object-duplicates'

/**
 * Просмотр пересекающегося объекта — кнопка «Посмотреть пересекающийся объект»
 * в уведомлении о дублях (см. CrmObjects.tsx).
 *
 * Маршрут только читает и намеренно не повторяет REST-чтение коллекции
 * Objects: агент не получает доступа к чужой карточке вообще (в REST его
 * чтение ограничено своими объектами, см. access коллекции). Вместо этого:
 *
 * 1. доступ — только сотрудникам CRM (агент и администратор);
 * 2. объект отдаётся лишь тогда, когда он ДЕЙСТВИТЕЛЬНО пересекается
 *    с проверяемой карточкой — признаки приходят в запросе и сверяются
 *    теми же правилами, что и в проверке дублей (/api/objects/check-duplicate,
 *    см. src/lib/object-duplicates.ts). Прямой запрос по произвольному id
 *    пересечения не даёт, то есть просмотр открывается только из уведомления;
 * 3. поля — белый список (тип, фото, адрес, площадь, цена, описание, статус,
 *    ответственный агент): данных собственника, кадастровых номеров,
 *    внутренних комментариев, комиссии и служебных полей в ответе нет.
 *
 * Правок маршрут не делает вовсе: изменить или удалить чужой объект через
 * него нельзя (правку чужого не пропускает и access.update коллекции Objects).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const isAdmin = user.role === 'admin'

    const body = (await req.json()) as DuplicateSignals & { id?: number; excludeId?: number }
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const signals = normalizeSignals(body, isAdmin)
    if (!hasSignals(signals)) {
      return NextResponse.json(
        { error: 'Не переданы признаки проверяемой карточки' },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config })
    const doc = await findIntersectingObject(payload, id, signals, body.excludeId)
    if (!doc) {
      // Либо объекта нет, либо он не совпадает с проверяемой карточкой:
      // из уведомления о пересечении такой запрос прийти не может
      return NextResponse.json(
        { error: 'Объект не совпадает с проверяемой карточкой' },
        { status: 403 },
      )
    }

    const matches = duplicateMatches(doc, signals)
    const mine = isOwnObjectDoc(doc, user, await agentProfileIds(payload, user.id))
    return NextResponse.json({
      object: duplicateView(doc),
      matches,
      strength: duplicateStrength(matches),
      // Объект за этим же сотрудником — по этому признаку интерфейс решает,
      // открывать ли ему карточку на правку (см. «Это мой объект»)
      mine,
    })
  } catch (error) {
    console.error('Duplicate view error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

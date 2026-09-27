import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  duplicateMatches,
  duplicateStrength,
  hasSignals,
  normalizeSignals,
  type DuplicateAddress,
  type DuplicateSignals,
} from '@/lib/object-duplicates'

interface Duplicate {
  id: number
  title?: string
  price?: number | null
  address?: DuplicateAddress | null
  ownerName?: string | null
  ownerPhone?: string | null
  cadastralNumber?: string | null
  matches: string[]
  strength: 'strong' | 'weak'
}

// Проверка дублей объекта перед сохранением: телефон и кадастровый — жёсткие
// признаки, адрес — сильный, имя — слабый (только имя не блокирует).
// Нормализация признаков и сравнение — общие с просмотром пересекающегося
// объекта, см. src/lib/object-duplicates.ts
//
// Маршрут внутренний: доступен только сотрудникам CRM (агент и администратор).
// Данные собственника и кадастровый номер объекта — закрытые сведения, поэтому
// и в запросе, и в ответе они участвуют только у администратора: остальным
// сотрудникам дубли ищутся по адресу, а поля собственника не отдаются вовсе.
// Так маршрут нельзя использовать и как справочник персональных данных снаружи.
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const isAdmin = user.role === 'admin'

    const body = await req.json()
    const { excludeId } = body as DuplicateSignals & { excludeId?: number }
    // Нормализуем признаки один раз: и поиск в базе, и сравнение идут по ним
    const signals = normalizeSignals(body as DuplicateSignals, isAdmin)

    const payload = await getPayload({ config })

    // 1. Жёсткие признаки — поиск в БД по нормализованным значениям
    const or: Where[] = []
    if (signals.phone) or.push({ ownerPhone: { equals: signals.phone } })
    if (signals.cadastral) or.push({ cadastralNumber: { equals: signals.cadastral } })

    let candidates: Record<string, unknown>[] = []
    if (or.length) {
      const where: Where = excludeId ? { and: [{ or }, { id: { not_equals: excludeId } }] } : { or }
      const { docs } = await payload.find({
        collection: 'objects',
        where,
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
      candidates = docs as Record<string, unknown>[]
    } else if (hasSignals(signals)) {
      // 2. Нет жёстких признаков — берём свежие объекты и фильтруем в JS
      const { docs } = await payload.find({
        collection: 'objects',
        limit: 200,
        depth: 0,
        overrideAccess: true,
        sort: '-updatedAt',
      })
      candidates = docs as Record<string, unknown>[]
    }

    const duplicates: Duplicate[] = []
    for (const o of candidates) {
      if (excludeId && o.id === excludeId) continue
      const matches = duplicateMatches(o, signals)
      if (matches.length) {
        duplicates.push({
          id: o.id as number,
          title: o.title as string | undefined,
          price: o.price as number | null | undefined,
          address: o.address as Duplicate['address'],
          // Данные собственника и кадастровый номер — только администратору
          ownerName: isAdmin ? (o.ownerName as string | null | undefined) : null,
          ownerPhone: isAdmin ? (o.ownerPhone as string | null | undefined) : null,
          cadastralNumber: isAdmin ? (o.cadastralNumber as string | null | undefined) : null,
          matches,
          strength: duplicateStrength(matches),
        })
      }
    }

    return NextResponse.json({ duplicates })
  } catch (error) {
    console.error('Check duplicate error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

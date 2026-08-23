import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

const normPhone = (v?: string) => (v || '').replace(/[^\d+]/g, '')
const normCadastral = (v?: string) => (v || '').toLowerCase().replace(/\s+/g, '')
const normName = (v?: string) => (v || '').trim().toLowerCase()
const normAddress = (a?: { city?: string; street?: string; house?: string; apartment?: string } | null) =>
  `${a?.city || ''}${a?.street || ''}${a?.house || ''}${a?.apartment || ''}`
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/g, '')

interface Duplicate {
  id: number
  title?: string
  price?: number | null
  address?: { city?: string; street?: string; house?: string; apartment?: string } | null
  ownerName?: string | null
  ownerPhone?: string | null
  cadastralNumber?: string | null
  matches: string[]
  strength: 'strong' | 'weak'
}

// Проверка дублей объекта перед сохранением: телефон и кадастровый — жёсткие
// признаки, адрес — сильный, имя — слабый (только имя не блокирует).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ownerName, ownerPhone, address, cadastralNumber, excludeId } = body as {
      ownerName?: string
      ownerPhone?: string
      address?: { city?: string; street?: string; house?: string; apartment?: string }
      cadastralNumber?: string
      excludeId?: number
    }

    const phone = normPhone(ownerPhone)
    const cad = normCadastral(cadastralNumber)
    const addr = normAddress(address)
    const name = normName(ownerName)

    const payload = await getPayload({ config })

    // 1. Жёсткие признаки — поиск в БД по нормализованным значениям
    const or: Where[] = []
    if (phone) or.push({ ownerPhone: { equals: phone } })
    if (cad) or.push({ cadastralNumber: { equals: cad } })

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
    } else if (addr || name) {
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
      const oAddr = normAddress(o.address as { city?: string; street?: string; house?: string; apartment?: string } | null)
      const oName = normName(o.ownerName as string | undefined)
      const matches: string[] = []
      if (phone && normPhone(o.ownerPhone as string | undefined) === phone) matches.push('phone')
      if (cad && normCadastral(o.cadastralNumber as string | undefined) === cad) matches.push('cadastral')
      if (addr && oAddr === addr) matches.push('address')
      if (name && oName === name) matches.push('name')
      if (matches.length) {
        duplicates.push({
          id: o.id as number,
          title: o.title as string | undefined,
          price: o.price as number | null | undefined,
          address: o.address as Duplicate['address'],
          ownerName: o.ownerName as string | null | undefined,
          ownerPhone: o.ownerPhone as string | null | undefined,
          cadastralNumber: o.cadastralNumber as string | null | undefined,
          matches,
          // Только имя — слабое совпадение, не блокирует сохранение
          strength: matches.some((m) => m !== 'name') ? 'strong' : 'weak',
        })
      }
    }

    return NextResponse.json({ duplicates })
  } catch (error) {
    console.error('Check duplicate error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { evaluateMarketValuation, type MarketListingLike } from '@/lib/market-valuation'
import { paramsFromDoc, type ValuationDocLike } from '@/lib/valuation'

// «Провести оценку по рынку»: кнопка в карточке объекта CRM (только
// администратор). Маршрут собирает параметры объекта, фактические объявления
// из «Парсера рынка» (market-listings) и прогоняет движок
// src/lib/market-valuation.ts: диапазон цены, найденные аналоги, дата расчёта
// и предупреждение, что это предварительная оценка, а не отчёт об оценке.
//
// Готовый отчёт сохраняется в самом объекте (valuation.marketRun) — карточка
// показывает последний расчёт, не пересчитывая его на каждый просмотр.
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    // Оценка по рынку — администраторский инструмент карточки
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Оценка по рынку доступна только администратору' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as { objectId?: number | string } | null
    const objectId = Number(body?.objectId)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const objectDoc = (await payload
      .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as (ValuationDocLike & { id: number; title?: string; type?: string }) | null
    if (!objectDoc) {
      return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })
    }

    // Фактические объявления рынка (до 300 свежих записей — база парсера
    // небольшая, автосбора нет). Снятые объявления в расчёт не берём.
    const listingsRes = await payload.find({
      collection: 'market-listings',
      where: { status: { not_equals: 'removed' } },
      sort: '-lastSeenAt',
      limit: 300,
      depth: 0,
      overrideAccess: true,
    })
    const listings = listingsRes.docs as unknown as MarketListingLike[]

    const report = evaluateMarketValuation(paramsFromDoc(objectDoc), listings, {
      objectId,
      objectTitle: objectDoc.title || '',
      dealType: objectDoc.type || 'sale',
      checkedBy: user.name,
    })

    // Отчёт — снимок расчёта: хук оценки объекта (recalcValuationHook) его
    // переносит, системная оценка и ручная правка агента не затрагиваются
    await payload.update({
      collection: 'objects',
      id: objectId,
      data: { valuation: { marketRun: report } },
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, report })
  } catch (error) {
    console.error('Market valuation POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

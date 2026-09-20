#!/usr/bin/env node
/**
 * Тестовые проверки фильтра «Город» каталога (регионы → населённые пункты) и
 * привязки объектов к региону, городу и населённому пункту.
 *
 * Запуск: node scripts/check-city-filter.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-city-filter.mjs http://localhost:3011
 *
 * Скрипт только читает публичный API Payload (тот же, что читает каталог), и
 * ничего не меняет. Проверяет:
 *
 * 1. Справочник регионов: строки фильтра из CITY_FILTER_REGIONS
 *    (src/lib/city-filter.ts) на месте, и у каждой есть населённые пункты —
 *    фильтру есть что показать.
 * 2. Москва и Московская область — подгруппы одного региона справочника
 *    «Москва и Московская область»: в фильтре это две отдельные строки.
 * 3. Привязка объектов: у каждого опубликованного объекта адрес разбирается в
 *    регион — город из справочника, либо Осетия (Владикавказ, район
 *    республики или сельский населённый пункт). Объект, который не
 *    привязывается, теряется в фильтре: это ошибка адреса или пробел
 *    в справочнике.
 * 4. Сколько объектов находит каждая строка фильтра. Объекты есть только в
 *    Осетии; у пустых регионов в каталоге вместо списка объектов должно
 *    показываться сообщение «Объекты в этом регионе пока подбираются…»
 *    (см. nothingInRegion в src/i18n/dictionaries.ts) — счётчик строки об
 *    этом и сигналит.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (они помечены ✗).
 */

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')

/** Ключ сравнения названий — тот же cityKey, что в src/lib/interregional.ts:
 *  регистр, «ё» и лишние пробелы не мешают (адреса объектов вводят руками) */
const cityKey = (v) => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

/** Районы Северной Осетии — как DISTRICT_OPTIONS в src/lib/districts.ts */
const OSSETIA_DISTRICTS = [
  'Владикавказский городской округ',
  'Алагирский район',
  'Ардонский район',
  'Дигорский район',
  'Ирафский район',
  'Кировский район',
  'Моздокский район',
  'Правобережный район',
  'Пригородный район',
]

/** Город осетинских адресов — OSSETIA_CITY в src/lib/city-filter.ts */
const OSSETIA_CITY = 'Владикавказ'

/** Регион справочника, распадающийся на две строки фильтра */
const MOSCOW_REGION = 'Москва и Московская область'

/** Строки фильтра для проверки — как CITY_FILTER_REGIONS (src/lib/city-filter.ts) */
const FILTER_ROWS = [
  { label: 'Северная Осетия — Алания', ossetian: true },
  { label: 'Москва', crmRegion: MOSCOW_REGION, group: 'Москва' },
  { label: 'Московская область', crmRegion: MOSCOW_REGION, group: 'Московская область' },
  { label: 'Краснодарский край', crmRegion: 'Краснодарский край' },
  { label: 'Ставропольский край', crmRegion: 'Ставропольский край' },
  { label: 'Республика Адыгея', crmRegion: 'Республика Адыгея' },
  { label: 'Санкт-Петербург и Ленинградская область', crmRegion: 'Санкт-Петербург и Ленинградская область' },
  { label: 'Республика Крым', crmRegion: 'Республика Крым' },
]

/** Склонение счётчика: 1 объект, 2 объекта, 5 объектов */
const plural = (n, [one, few, many]) => {
  const mod100 = Math.abs(n) % 100
  const mod10 = Math.abs(n) % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
const objectsWord = (n) => `${n} ${plural(n, ['объект', 'объекта', 'объектов'])}`
const placesWord = (n) => `${n} ${plural(n, ['населённый пункт', 'населённых пункта', 'населённых пунктов'])}`

async function api(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`)
  return res.json()
}

/** Записи справочника и опубликованные объекты — то же, что читает каталог */
async function loadData() {
  const [regions, settlements, objects] = await Promise.all([
    api('/api/regions?limit=200&depth=0&sort=order'),
    // Справочник с Крымом — больше тысячи населённых пунктов: предел выборки
    // не должен срезать хвост списка
    api('/api/settlements?limit=5000&depth=0&sort=order'),
    api(`/api/objects?limit=1000&depth=0&where=${encodeURIComponent(JSON.stringify({ status: { equals: 'published' } }))}`),
  ])
  return {
    regions: regions.docs ?? [],
    settlements: settlements.docs ?? [],
    objects: (objects.docs ?? []).filter((o) => o.status === 'published'),
  }
}

/** Регион населённого пункта: связь приходит id-ом (depth=0) */
const regionIdOf = (settlement) => Number(
  typeof settlement.region === 'object' && settlement.region !== null ? settlement.region.id : settlement.region,
)

function main({ regions, settlements, objects }) {
  const failed = []
  const ok = (title, details = '') => console.log(`  ✓ ${title}${details ? ` — ${details}` : ''}`)
  const bad = (title, details = '') => { failed.push(title); console.log(`  ✗ ${title}${details ? ` — ${details}` : ''}`) }

  console.log(`Проверка фильтра «Город»: ${BASE}`)
  console.log(`Справочник: регионов ${regions.length}, ${placesWord(settlements.length)}; опубликованных ${objectsWord(objects.length)}\n`)

  // Город справочника → строки фильтра: одноимённые населённые пункты разных
  // регионов (например Красногвардейское в Адыгее и в Ставропольском крае)
  // дают объекту сразу несколько регионов — так же считает и фильтр
  const rowsByCity = new Map()
  const addRow = (key, row) => rowsByCity.set(key, [...(rowsByCity.get(key) ?? []), row])
  const ownSettlements = (row) => {
    const crm = regions.find((r) => r.title === row.crmRegion)
    if (!crm) return []
    return settlements.filter((s) => regionIdOf(s) === Number(crm.id) && (!row.group || s.group === row.group))
  }
  for (const row of FILTER_ROWS) {
    if (row.ossetian) continue
    const own = ownSettlements(row)
    for (const s of own) addRow(cityKey(s.city || s.name), row)
  }

  /** Регионы объекта: город из справочника либо Осетия по адресу республики */
  const regionOfObject = (address) => {
    const city = String(address?.city ?? '')
    const locality = String(address?.locality ?? '')
    const district = String(address?.district ?? '')
    const found = new Set(rowsByCity.get(cityKey(city)) ?? [])
    if (cityKey(city) === cityKey(OSSETIA_CITY)) found.add(FILTER_ROWS[0])
    if (OSSETIA_DISTRICTS.includes(district)) found.add(FILTER_ROWS[0])
    // Сельский адрес без города: в Осетии населённый пункт лежит в
    // address.locality, района может и не быть (см. city-filter.ts)
    if (!found.size && !city && locality && !rowsByCity.has(cityKey(locality))) found.add(FILTER_ROWS[0])
    return { rows: [...found], city, locality, district }
  }

  console.log('Строки фильтра (регионы):')
  const counts = new Map()
  for (const row of FILTER_ROWS) {
    const own = row.ossetian ? [] : ownSettlements(row)
    const withObjects = []
    let count = 0
    for (const object of objects) {
      const { rows } = regionOfObject(object.address)
      if (!rows.includes(row)) continue
      count += 1
      const place = String(object.address?.locality || object.address?.city || '').trim()
      if (place && !withObjects.includes(place)) withObjects.push(place)
    }
    counts.set(row.label, count)
    const dir = row.ossetian
      ? 'населённые пункты республики — из справочника сайта'
      : `${placesWord(own.length)} по справочнику`
    if (!row.ossetian && !own.length) bad(`«${row.label}»: в справочнике нет населённых пунктов`, 'фильтру нечего показать')
    else ok(`«${row.label}»: ${objectsWord(count)}`, `${dir}${count ? `, с объектами: ${withObjects.join(', ')}` : ', объектов пока нет — каталог покажет «Объекты в этом регионе пока подбираются…»'}`)
  }

  // Москва и Московская область — две строки одного региона справочника:
  // подгруппы должны быть у обеих, иначе строка фильтра пустая
  const moscow = regions.find((r) => r.title === MOSCOW_REGION)
  if (!moscow) bad(`Регион справочника «${MOSCOW_REGION}» не найден`, 'строки «Москва» и «Московская область» пропадут из фильтра')
  else {
    const groups = new Set(settlements.filter((s) => regionIdOf(s) === Number(moscow.id)).map((s) => s.group))
    for (const group of ['Москва', 'Московская область']) {
      if (groups.has(group)) ok(`«${MOSCOW_REGION}»: подгруппа «${group}» на месте`)
      else bad(`«${MOSCOW_REGION}»: нет подгруппы «${group}»`, 'строка фильтра останется без населённых пунктов')
    }
  }

  console.log('\nПривязка объектов к региону, городу и населённому пункту:')
  const unbound = []
  const cityless = []
  for (const object of objects) {
    const { rows, city, locality, district } = regionOfObject(object.address)
    if (!rows.length) {
      unbound.push(object)
      console.log(`  ✗ #${object.id} «${object.title}»: регион не определён (город «${city}», пункт «${locality}», район «${district}»)`)
      continue
    }
    if (!city) cityless.push(`#${object.id} «${object.title}» (${locality || 'без населённого пункта'})`)
  }
  if (!unbound.length) ok(`все ${objectsWord(objects.length)} привязаны к региону`)
  else bad(`без региона: ${unbound.length} из ${objectsWord(objects.length)}`, 'в фильтре они попадут в «Другие регионы» — адрес или справочник нужно поправить')
  // Город не заполнен, а объект найден по району/пункту — адрес неполный,
  // но не потерян: сообщаем, ошибкой не считаем (так записаны адреса сёл)
  if (cityless.length) console.log(`  • адреса без города — ${objectsWord(cityless.length)} (найдены по району или пункту): ${cityless.join('; ')}`)

  const ossetia = counts.get('Северная Осетия — Алания') ?? 0
  const empty = FILTER_ROWS.filter((r) => !r.ossetian && (counts.get(r.label) ?? 0) === 0).map((r) => r.label)
  console.log(`\nИтого: Осетия — ${objectsWord(ossetia)}, пустые регионы (${empty.length}): ${empty.join(', ') || '—'}`)
  console.log(failed.length ? `\n✗ Ошибок: ${failed.length}` : '\n✓ Все проверки пройдены')
  return failed.length ? 1 : 0
}

loadData()
  .then((data) => { process.exitCode = main(data) })
  .catch((error) => {
    console.error(`Не удалось прочитать данные ${BASE}: ${error.message}`)
    process.exitCode = 1
  })

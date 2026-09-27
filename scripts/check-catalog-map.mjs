#!/usr/bin/env node
/**
 * Проверки режима «На карте» каталога — маршрута /api/objects/map, который
 * отдаёт области для встроенной карты (src/components/objects/CatalogMap.tsx).
 *
 * Запуск: node scripts/check-catalog-map.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-catalog-map.mjs http://localhost:3011
 *
 * Скрипт только читает публичный API (тот же, что читает каталог), и ничего
 * не меняет. Проверяет:
 *
 * 1. Маршрут отвечает и отдаёт области: у каждой есть ключ клетки, центр,
 *    радиус и объекты. Сломанная или пустая область на карте не рисуется.
 * 2. Центры областей стоят на сетке примерных областей, а не на координатах
 *    домов: точка объекта на публичной карте не показывается, вместо неё —
 *    клетка, в которой объект находится (src/lib/object-approx-point.ts).
 * 3. Все опубликованные объекты с адресом или координатами попадают на карту
 *    (в какую-нибудь область). Точку без координат сервер определяет
 *    геокодером по адресу и делает это в фоне (см. pending в ответе),
 *    поэтому скрипт ждёт, пока сервер доопределит адреса.
 * 4. Объект показывается ровно в одной области и не повторяется: дубликат
 *    означал бы два круга на один объект.
 * 5. Подпись области — район, город или населённый пункт, без улицы и дома
 *    (src/lib/object-public-address.ts): улицу клиент узнаёт у агента.
 * 6. В ответе нет точных данных объекта: у объектов в областях только id,
 *    название, тип, категория, цена и обложка — ни координат, ни адреса
 *    строкой. Гость сайта не должен получить из маршрута ни то, ни другое.
 * 7. Условия выдачи из запроса проверяются по белому списку полей
 *    (src/lib/objects-where.ts): закрытое поле и битый JSON → 400, обычный
 *    фильтр → области только из отфильтрованной выдачи.
 *
 * Точная точка объекта внутри круга проверкой снаружи не подтверждается:
 * координат объекта у гостя нет (поле закрыто), а гарантия держится
 * конструкцией — радиус круга равен половине диагонали клетки, и объект из
 * своей клетки не выходит. Точную карту и полный адрес видят только агент и
 * администратор в CRM.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (они помечены ✗).
 */

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')

/** Сколько ждём, пока сервер определит адреса объектов (см. pending) */
const PENDING_TIMEOUT_MS = 40_000
const PENDING_PAUSE_MS = 3_000

/** Потолок объектов в ответе маршрута (MAX_OBJECTS в его коде) */
const MAX_OBJECTS = 300

/** Клетка примерной области и её радиус — как в src/lib/object-approx-point.ts */
const APPROX_CELL_M = 700
const APPROX_RADIUS_M = Math.ceil(APPROX_CELL_M * Math.SQRT1_2) + 1
/** Метров в градусе широты — как в том же модуле */
const METERS_PER_DEGREE = 111_320

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function api(path) {
  const res = await fetch(`${BASE}${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/** Адрес для геокодера — как mapGeocodeText в src/lib/object-map-point.ts */
const geocodeText = (address) => {
  const text = (v) => (typeof v === 'string' ? v.trim() : '')
  const street = [text(address?.street), text(address?.house)].filter(Boolean).join(' ')
  return [text(address?.fullAddress), text(address?.city), text(address?.locality), text(address?.snt), street]
    .filter(Boolean)
    .join(', ')
}

/** Координаты объекта пригодны для карты — как validCoordinates в том же модуле */
const coordsOf = (coordinates) => {
  const lat = Number(coordinates?.lat)
  const lng = Number(coordinates?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

/** Подпись области — как mapAreaLabel/publicAreaText в тех же модулях */
const areaLabel = (address) => {
  const text = (v) => (typeof v === 'string' ? v.trim() : '')
  const city = text(address?.city)
  const locality = text(address?.locality)
  const cityDistrict = text(address?.cityDistrict)
  return [
    city || locality,
    city && locality && locality !== city ? locality : '',
    cityDistrict ? `${cityDistrict} район` : text(address?.district),
  ].filter(Boolean).join(', ')
}

/**
 * Стоит ли центр области на сетке: у клетки это её середина, то есть дробная
 * часть номера клетки равна 0,5 — как в approximatePoint. Долгота считается
 * через масштаб по широте центра клетки, иначе проверка разошлась бы с картой.
 */
const onGrid = (lat, lng, tolerance = 1e-6) => {
  const row = (lat * METERS_PER_DEGREE) / APPROX_CELL_M
  if (Math.abs(row % 1 - 0.5) > tolerance) return false
  const centerLat = (Math.floor(row) + 0.5) * (APPROX_CELL_M / METERS_PER_DEGREE)
  const lngScale = METERS_PER_DEGREE * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2)
  const col = (lng * lngScale) / APPROX_CELL_M
  return Math.abs(col % 1 - 0.5) <= tolerance
}

/** Области карты: ждём, пока сервер определит адреса (pending), и повторяем */
async function loadAreas(where) {
  const query = where ? `?where=${encodeURIComponent(JSON.stringify(where))}` : ''
  let last = null
  const deadline = Date.now() + PENDING_TIMEOUT_MS
  for (;;) {
    last = await api(`/api/objects/map${query}`)
    if (last.status !== 200) return last
    const pending = Number(last.body?.pending ?? 0)
    if (!pending || Date.now() > deadline) return last
    await sleep(PENDING_PAUSE_MS)
  }
}

/** Поля объекта в области: ничего, кроме карточки для облачка, в ответе быть не должно */
const POINT_KEYS = ['id', 'title', 'type', 'category', 'price', 'image']

async function main() {
  const failed = []
  const ok = (title, details = '') => console.log(`  ✓ ${title}${details ? ` — ${details}` : ''}`)
  const bad = (title, details = '') => {
    failed.push(title)
    console.log(`  ✗ ${title}${details ? ` — ${details}` : ''}`)
  }

  console.log(`Проверка карты каталога: ${BASE}\n`)

  const objects = await api(
    `/api/objects?limit=1000&depth=0&where=${encodeURIComponent(JSON.stringify({ status: { equals: 'published' } }))}`,
  )
  if (objects.status !== 200) {
    console.log(`  ✗ публичный API объектов недоступен — HTTP ${objects.status}`)
    console.log('\n✗ Ошибок: 1')
    process.exit(1)
  }
  const published = (objects.body?.docs ?? []).filter((o) => o.status === 'published')
  const byId = new Map(published.map((o) => [Number(o.id), o]))

  // Кого карта обязана показать — из того, что видит гость: координаты объекта
  // полевой проверкой закрыты и в публичной выдаче пусты, поэтому признак
  // «есть адрес» здесь без дома и полного адреса. Обратное неверно: объект,
  // у которого гостю видна только улица, карта покажет — его в проверке
  // полноты просто не учитываем
  const expected = new Map()
  for (const object of published) {
    const coords = coordsOf(object.coordinates)
    const address = geocodeText(object.address)
    if (coords || address) expected.set(Number(object.id), { object, coords, address })
  }

  console.log(`Опубликованных объектов: ${objectsWord(published.length)}, из них с адресом или координатами: ${objectsWord(expected.size)}\n`)

  const map = await loadAreas(null)
  if (map.status !== 200) {
    console.log(`  ✗ маршрут /api/objects/map недоступен — HTTP ${map.status}`)
    console.log('\n✗ Ошибок: 1')
    process.exit(1)
  }
  const areas = map.body?.areas ?? []
  const pending = Number(map.body?.pending ?? 0)
  const shown = areas.flatMap((area) => (Array.isArray(area?.points) ? area.points : []))

  console.log('Области на карте:')
  if (areas.length && shown.length) {
    ok(`маршрут отдал ${objectsWord(shown.length)}`, `в ${areas.length} ${plural(areas.length, ['области', 'областях', 'областях'])}${map.body?.truncated ? `, показаны первые ${MAX_OBJECTS}` : ''}`)
  } else if (published.length) {
    bad('маршрут не отдал ни одной области', 'карта покажет пустой блок')
  } else {
    console.log('  • опубликованных объектов нет — проверять нечего')
  }
  if (pending) console.log(`  • сервер ещё определял адреса: ${objectsWord(pending)} (не дождались за ${PENDING_TIMEOUT_MS / 1000} с)`)

  // 1. Области и их геометрия
  const brokenAreas = []
  const offGrid = []
  const badRadius = []
  const repeatedKeys = []
  const keys = new Set()
  for (const area of areas) {
    const lat = Number(area?.lat)
    const lng = Number(area?.lng)
    const radius = Number(area?.radius)
    const key = String(area?.key ?? '')
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      brokenAreas.push(`#${key || '?'}: ${lat}, ${lng}`)
      continue
    }
    if (radius !== APPROX_RADIUS_M) badRadius.push(`#${key}: ${radius}`)
    if (!onGrid(lat, lng)) offGrid.push(`#${key}: ${lat}, ${lng}`)
    if (keys.has(key)) repeatedKeys.push(key)
    keys.add(key)
    if (!Array.isArray(area.points) || !area.points.length) brokenAreas.push(`#${key}: без объектов`)
  }
  if (brokenAreas.length) bad(`областей с негодными данными: ${brokenAreas.length}`, brokenAreas.join('; '))
  else if (areas.length) ok('у каждой области есть ключ, центр в допустимых пределах и объекты')
  if (badRadius.length) bad(`радиус области не ${APPROX_RADIUS_M} м: ${badRadius.join(', ')}`, 'радиус — половина диагонали клетки, внутри круга должна быть вся клетка')
  else if (areas.length) ok(`радиус областей — ${APPROX_RADIUS_M} м`)
  if (repeatedKeys.length) bad(`повторяющиеся области: ${repeatedKeys.join(', ')}`, 'объекты одной клетки должны быть в одной области')
  else if (areas.length) ok('области не повторяются')
  if (offGrid.length) bad(`центры областей не на сетке: ${offGrid.length}`, `${offGrid.slice(0, 3).join('; ')} — центр должен быть центром клетки ${APPROX_CELL_M} м, а не координатами объекта`)
  else if (areas.length) ok(`центры областей стоят на сетке ${APPROX_CELL_M} м — точных координат объекта в них нет`)

  // 2. Объекты: без дублей, по порядку, в одной области
  const duplicates = []
  const seen = new Map()
  let unsorted = null
  for (const area of areas) {
    let previous = null
    for (const point of Array.isArray(area.points) ? area.points : []) {
      const id = Number(point?.id)
      if (Number.isInteger(id) && previous !== null && id < previous) unsorted = `${previous} → ${id}`
      previous = Number.isInteger(id) ? id : previous
      if (seen.has(id)) duplicates.push(id)
      seen.set(id, area)
    }
  }
  if (duplicates.length) bad(`объект показан дважды: ${duplicates.join(', ')}`, 'на карте было бы два круга одного объекта')
  else if (shown.length) ok('каждый объект показан один раз')
  if (unsorted) bad(`объекты в области не по порядку id (${unsorted})`, 'набор объектов должен быть предсказуемым')
  else if (shown.length) ok('объекты идут по возрастанию id')

  // 3. Полнота
  const missing = []
  for (const [id, { object, coords, address }] of expected) {
    if (seen.has(id)) continue
    missing.push(`#${id} «${object.title}» (${coords ? 'координаты' : address})`)
  }
  if (missing.length) {
    bad(`на карту не попали: ${missing.length} из ${objectsWord(expected.size)}`, missing.join('; '))
  } else if (expected.size) {
    ok(`все ${objectsWord(expected.size)} с адресом или координатами — на карте`)
  }
  if (expected.size > MAX_OBJECTS) console.log(`  • выдача больше потолка объектов (${MAX_OBJECTS}) — часть объектов карта не покажет`)

  // 4. Подпись области: район, город или населённый пункт
  const badLabels = []
  for (const area of areas) {
    const first = (Array.isArray(area.points) ? area.points : [])[0]
    const object = first ? byId.get(Number(first.id)) : null
    if (!object) continue
    const want = areaLabel(object.address)
    const got = typeof area.label === 'string' ? area.label : ''
    if (got !== want) badLabels.push(`#${area.key}: «${got}» вместо «${want}»`)
  }
  if (badLabels.length) bad(`подпись области разошлась с адресом: ${badLabels.length}`, badLabels.slice(0, 3).join('; '))
  else if (areas.length) ok('подпись области — район, город или населённый пункт (без улицы и дома)')

  // 5. В объектах области — только карточка для облачка
  const extraFields = []
  for (const point of shown) {
    const extra = Object.keys(point ?? {}).filter((key) => !POINT_KEYS.includes(key))
    if (extra.length) extraFields.push(`#${point?.id}: ${extra.join(', ')}`)
  }
  if (extraFields.length) bad(`в объектах областей лишние поля: ${extraFields.length}`, extraFields.slice(0, 3).join('; '))
  else if (shown.length) ok('в объектах областей нет координат и адреса — только карточка для облачка')
  if (shown.some((point) => !point?.title)) bad('объект без названия — облачко будет пустым')

  // 6. Условия выдачи: закрытые поля и битый JSON не должны приниматься
  console.log('\nУсловия выдачи (белый список полей):')
  const privateField = await api(`/api/objects/map?where=${encodeURIComponent('{"cadastralNumber":{"equals":"15:07:0030021:123"}}')}`)
  if (privateField.status === 400) ok('условие по закрытому полю отклонено (400)')
  else bad(`условие по закрытому полю принято (HTTP ${privateField.status})`, 'маршрут читает базу в обход полевой проверки — закрытые поля утекли бы наружу')

  const malformed = await api('/api/objects/map?where=%7Bnot-json')
  if (malformed.status === 400) ok('битые условия отклонены (400)')
  else bad(`битые условия приняты (HTTP ${malformed.status})`, 'вместо ошибки нужен отказ')

  // Фильтр соблюдается: области аренды — из выдачи аренды
  const rent = await loadAreas({ type: { equals: 'rent' } })
  if (rent.status !== 200) {
    bad(`фильтрованная выдача недоступна (HTTP ${rent.status})`)
  } else {
    const rentIds = new Set(published.filter((o) => o.type === 'rent').map((o) => Number(o.id)))
    const rentPoints = (rent.body?.areas ?? []).flatMap((area) => area?.points ?? [])
    const stray = rentPoints.filter((p) => !rentIds.has(Number(p.id))).map((p) => `#${p.id}`)
    const expectedRent = [...rentIds].filter((id) => expected.has(id))
    if (stray.length) bad(`в выдаче «аренда» чужие объекты: ${stray.join(', ')}`)
    else if (expectedRent.length && !rentPoints.length) bad('выдача «аренда» без областей', 'объекты аренды не попадают на карту')
    else ok(`фильтр соблюдается: аренда — ${objectsWord(rentPoints.length)}`)
  }

  console.log(failed.length ? `\n✗ Ошибок: ${failed.length}` : '\n✓ Все проверки пройдены')
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(`\n✗ Проверка не выполнена: ${error?.message || error}`)
  process.exit(1)
})

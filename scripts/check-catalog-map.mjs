#!/usr/bin/env node
/**
 * Проверки режима «На карте» каталога — маршрута /api/objects/map, который
 * отдаёт точки для встроенной карты (src/components/objects/CatalogMap.tsx).
 *
 * Запуск: node scripts/check-catalog-map.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-catalog-map.mjs http://localhost:3011
 *
 * Скрипт только читает публичный API (тот же, что читает каталог), и ничего
 * не меняет. Проверяет:
 *
 * 1. Маршрут отвечает и отдаёт точки с координатами в допустимых пределах:
 *    сломанная или пустая точка на карте не показывается, а объект теряется.
 * 2. Все опубликованные объекты с адресом или координатами попадают на карту.
 *    Точку без координат сервер определяет геокодером по адресу и делает это
 *    в фоне (см. pending в ответе), поэтому скрипт ждёт, пока сервер
 *    доопределит адреса.
 * 3. Точки не повторяются и идут по возрастанию id — карта переставляет метки
 *    набором, дубликат нарисовал бы две метки на одном объекте.
 * 4. Ручные координаты объекта в приоритете: объект с отмеченной точкой стоит
 *    там, где его поставили, и не помечен как определённый по адресу.
 * 5. Условия выдачи из запроса проверяются по белому списку полей
 *    (src/lib/objects-where.ts): закрытое поле и битый JSON → 400, обычный
 *    фильтр → точки только из отфильтрованной выдачи.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (они помечены ✗).
 */

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')

/** Сколько ждём, пока сервер определит адреса объектов (см. pending) */
const PENDING_TIMEOUT_MS = 40_000
const PENDING_PAUSE_MS = 3_000

/** Потолок точек в ответе маршрута (MAX_POINTS в его коде) */
const MAX_POINTS = 300

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

/** Точки карты: ждём, пока сервер определит адреса (pending), и повторяем */
async function loadPoints(where) {
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

  // Кого карта обязана показать: объект с координатами или с адресом
  const expected = new Map()
  for (const object of published) {
    const coords = coordsOf(object.coordinates)
    const address = geocodeText(object.address)
    if (coords || address) expected.set(Number(object.id), { object, coords, address })
  }

  console.log(`Опубликованных объектов: ${objectsWord(published.length)}, из них с координатами или адресом: ${objectsWord(expected.size)}\n`)

  const map = await loadPoints(null)
  if (map.status !== 200) {
    console.log(`  ✗ маршрут /api/objects/map недоступен — HTTP ${map.status}`)
    console.log('\n✗ Ошибок: 1')
    process.exit(1)
  }
  const points = map.body?.points ?? []
  const total = Number(map.body?.total ?? 0)
  const pending = Number(map.body?.pending ?? 0)

  console.log('Точки на карте:')
  if (points.length) ok(`маршрут отдал ${objectsWord(points.length)}`, `всего по условиям — ${total}${map.body?.truncated ? `, показаны первые ${MAX_POINTS}` : ''}`)
  else if (published.length) bad('маршрут не отдал ни одной точки', 'карта покажет пустой блок')
  else console.log('  • опубликованных объектов нет — проверять нечего')
  if (pending) console.log(`  • сервер ещё определял адреса: ${objectsWord(pending)} (не дождались за ${PENDING_TIMEOUT_MS / 1000} с)`)

  const broken = []
  const byId = new Map()
  const duplicates = []
  let unsorted = null
  points.forEach((point, index) => {
    const lat = Number(point?.lat)
    const lng = Number(point?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      broken.push(`#${point?.id}: ${lat}, ${lng}`)
    }
    if (!point?.title) broken.push(`#${point?.id}: без названия — облачко метки будет пустым`)
    const id = Number(point?.id)
    if (byId.has(id)) duplicates.push(id)
    byId.set(id, point)
    if (index && Number(points[index - 1]?.id) > id) unsorted = `${points[index - 1]?.id} → ${id}`
  })
  if (broken.length) bad(`точек с негодными данными: ${broken.length}`, broken.join('; '))
  else if (points.length) ok('у всех точек координаты в допустимых пределах и есть название')
  if (duplicates.length) bad(`повторяющиеся точки: ${duplicates.join(', ')}`, 'на карте будет две метки одного объекта')
  else if (points.length) ok('точки не повторяются')
  if (unsorted) bad(`точки не по порядку id (${unsorted})`, 'набор меток на карте должен быть предсказуемым')
  else if (points.length) ok('точки идут по возрастанию id')

  // Полнота: у каждого объекта с адресом или координатами должна быть точка
  const missing = []
  for (const [id, { object, coords, address }] of expected) {
    if (byId.has(id)) continue
    missing.push(`#${id} «${object.title}» (${coords ? 'координаты' : address})`)
  }
  if (missing.length) {
    bad(`на карту не попали: ${missing.length} из ${objectsWord(expected.size)}`, missing.join('; '))
  } else if (expected.size) {
    ok(`все ${objectsWord(expected.size)} с адресом или координатами — на карте`)
  }
  if (expected.size > MAX_POINTS) console.log(`  • выдача больше потолка точек (${MAX_POINTS}) — часть объектов карта не покажет`)

  // Ручные координаты в приоритете: объект стоит там, где его поставили
  const moved = []
  for (const [id, { coords, address }] of expected) {
    if (!coords) continue
    const point = byId.get(id)
    if (!point) continue
    const dx = Math.abs(Number(point.lat) - coords.lat)
    const dy = Math.abs(Number(point.lng) - coords.lng)
    if (dx > 0.0001 || dy > 0.0001) moved.push(`#${id}: координаты ${coords.lat}, ${coords.lng} → точка ${point.lat}, ${point.lng}`)
    else if (point.byAddress) moved.push(`#${id}: точка помечена как определённая по адресу, хотя координаты отмечены (${address})`)
  }
  if (moved.length) bad(`объекты стоят не на своих координатах: ${moved.length}`, moved.join('; '))
  else if (points.length) ok('объекты с отмеченными координатами стоят на них и без пометки «определено по адресу»')

  // Условия выдачи: закрытые поля и битый JSON не должны приниматься
  console.log('\nУсловия выдачи (белый список полей):')
  const privateField = await api(`/api/objects/map?where=${encodeURIComponent('{"cadastralNumber":{"equals":"15:07:0030021:123"}}')}`)
  if (privateField.status === 400) ok('условие по закрытому полю отклонено (400)')
  else bad(`условие по закрытому полю принято (HTTP ${privateField.status})`, 'маршрут читает базу в обход полевой проверки — закрытые поля утекли бы наружу')

  const malformed = await api('/api/objects/map?where=%7Bnot-json')
  if (malformed.status === 400) ok('битые условия отклонены (400)')
  else bad(`битые условия приняты (HTTP ${malformed.status})`, 'вместо ошибки нужен отказ')

  // Фильтр соблюдается: точки аренды — из выдачи аренды
  const rent = await loadPoints({ type: { equals: 'rent' } })
  if (rent.status !== 200) {
    bad(`фильтрованная выдача недоступна (HTTP ${rent.status})`)
  } else {
    const rentIds = new Set(published.filter((o) => o.type === 'rent').map((o) => Number(o.id)))
    const stray = (rent.body?.points ?? []).filter((p) => !rentIds.has(Number(p.id))).map((p) => `#${p.id}`)
    const expectedRent = [...rentIds].filter((id) => expected.has(id))
    if (stray.length) bad(`в выдаче «аренда» чужие точки: ${stray.join(', ')}`)
    else if (expectedRent.length && !(rent.body?.points ?? []).length) bad('выдача «аренда» без точек', 'объекты аренды не попадают на карту')
    else ok(`фильтр соблюдается: аренда — ${objectsWord((rent.body?.points ?? []).length)}`)
  }

  console.log(failed.length ? `\n✗ Ошибок: ${failed.length}` : '\n✓ Все проверки пройдены')
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(`\n✗ Проверка не выполнена: ${error?.message || error}`)
  process.exit(1)
})

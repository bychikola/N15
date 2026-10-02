#!/usr/bin/env node
/**
 * Проверка утечки внутренних данных объекта в публичную часть сайта.
 *
 * Запуск: node scripts/check-object-privacy.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-object-privacy.mjs http://localhost:3011
 *
 * Скрипт только читает публичные адреса (никаких учётных данных) и ничего не
 * меняет. Проверяет, что гостю сайта не достаются закрытые сведения объекта:
 *
 * 1. Публичный API каталога (/api/objects — его читает каталог) и карточка
 *    объекта по id: в ответе нет полей собственника (имя, телефон),
 *    кадастровых номеров, точного адреса и координат, внутренних сведений
 *    агентства (происхождение origin, комиссия, партнёрские условия,
 *    внутренний комментарий) и служебных групп (valuation, placements,
 *    publishing, archive, houseInfo, createdBy).
 * 2. Карта (/api/objects/map) — маршрут читает объекты с overrideAccess и
 *    обязан отдавать только области и карточки для облачка: ни одного
 *    закрытого ключа в ответе быть не должно.
 * 3. Страница объекта в исходном HTML — в разметке (включая данные React
 *    Server Components, которые приезжают браузеру вместе с HTML) нет
 *    ключей закрытых полей.
 *
 * Правила доступа живут в коллекции objects (полевой access, см.
 * privateFieldsAccess / internalGroupsAccess в Objects.ts); публичная
 * страница и каталог собирают карточку по белому списку (object-list-item.ts,
 * object-public-address.ts). Скрипт проверяет результат снаружи — так же,
 * как его увидел бы гость.
 *
 * Код возврата: 0 — утечек нет, 1 — есть (они помечены ✗).
 */

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')

/**
 * Ключи, которых у гостя быть не должно. Для ответов API проверяются как
 * ключи JSON (на любом уровне вложенности), для HTML — как `"ключ"` в
 * разметке и данных React Server Components.
 */
const FORBIDDEN_KEYS = [
  // Данные собственника и партнёров
  'ownerName',
  'ownerPhone',
  // Кадастровые номера и сведения участка
  'cadastralNumber',
  'plotCadastralNumber',
  'plotLandCategory',
  'plotPermittedUse',
  'plotPurpose',
  // Внутренние сведения агентства (см. поля origin/commission/
  // partnerTerms/internalComment в Objects.ts)
  'origin',
  'commission',
  'partnerTerms',
  'internalComment',
  // Внутренние расчёты и служебные группы
  'valuation',
  'marketRun',
  'manualNote',
  'placements',
  'publishing',
  'archive',
  'houseInfo',
  'createdBy',
  // Точный адрес и координаты точки
  'coordinates',
  'house',
  'corpus',
  'apartment',
  'fullAddress',
]

/** Все ключи объекта JSON на любом уровне вложенности */
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.add(key)
      collectKeys(item, out)
    }
  }
  return out
}

/** Закрытые ключи, найденные в JSON-ответе */
function leaksInJson(body, where) {
  const keys = collectKeys(body)
  return FORBIDDEN_KEYS.filter((key) => keys.has(key)).map((key) => `${where}: поле «${key}»`)
}

/** Закрытые ключи, найденные в HTML (в том числе в данных RSC) */
function leaksInHtml(html, where) {
  return FORBIDDEN_KEYS.filter((key) => html.includes(`"${key}"`)).map((key) => `${where}: поле «${key}»`)
}

async function json(path) {
  const res = await fetch(`${BASE}${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function main() {
  const failed = []
  const ok = (title, details = '') => console.log(`  ✓ ${title}${details ? ` — ${details}` : ''}`)
  const bad = (title, details = '') => {
    failed.push(title)
    console.log(`  ✗ ${title}${details ? ` — ${details}` : ''}`)
  }

  console.log(`Проверка закрытых данных объекта: ${BASE}\n`)

  // 1. Выдача каталога: то же, что видит гость на сайте
  const list = await json('/api/objects?limit=20&depth=2')
  if (list.status !== 200 || !Array.isArray(list.body?.docs)) {
    console.log(`  ✗ публичный API объектов недоступен — HTTP ${list.status}`)
    console.log('\n✗ Ошибок: 1')
    process.exit(1)
  }
  const docs = list.body.docs

  console.log('Публичный API каталога:')
  if (!docs.length) {
    console.log('  • опубликованных объектов нет — проверять нечего')
  } else {
    const leaks = docs.flatMap((doc) => leaksInJson(doc, `#${doc?.id ?? '?'}`))
    if (leaks.length) bad(`в выдаче каталога закрытые поля: ${leaks.length}`, leaks.slice(0, 5).join('; '))
    else ok(`в выдаче ${docs.length} карточек закрытых полей нет`)
  }

  // 2. Карточка объекта по id — тот же публичный API
  const sample = docs[0]
  if (sample?.id != null) {
    const one = await json(`/api/objects/${encodeURIComponent(String(sample.id))}?depth=2`)
    console.log('\nКарточка объекта по id:')
    if (one.status !== 200 || !one.body?.id) {
      bad(`объект #${sample.id} не читается публично — HTTP ${one.status}`)
    } else {
      const leaks = leaksInJson(one.body, `#${sample.id}`)
      if (leaks.length) bad(`в карточке закрытые поля: ${leaks.length}`, leaks.slice(0, 5).join('; '))
      else ok(`карточка #${sample.id} отдаётся без закрытых полей`)
    }
  }

  // 3. Карта: маршрут читает объекты с overrideAccess и обязан чистить выдачу
  const map = await json('/api/objects/map')
  console.log('\nКарта объектов:')
  if (map.status !== 200) {
    bad(`маршрут /api/objects/map недоступен — HTTP ${map.status}`)
  } else {
    const leaks = leaksInJson(map.body, 'map')
    if (leaks.length) bad(`в ответе карты закрытые поля: ${leaks.length}`, leaks.slice(0, 5).join('; '))
    else ok('в ответе карты только области и карточки для облачка')
  }

  // 4. Исходный HTML страницы объекта: разметка и данные RSC
  if (sample?.slug || sample?.id != null) {
    const path = `/ru/catalog/${encodeURIComponent(String(sample.slug || sample.id))}`
    const res = await fetch(`${BASE}${path}`)
    const html = await res.text()
    console.log('\nСтраница объекта (HTML):')
    if (!res.ok) {
      bad(`страница ${path} не открывается — HTTP ${res.status}`)
    } else {
      // «origin» и «archive» — обычные слова и в текстах встречаться могут,
      // ключом они становятся только в кавычках (данные RSC): их и ищем
      const leaks = leaksInHtml(html, path)
      if (leaks.length) bad(`в HTML закрытые поля: ${leaks.length}`, leaks.slice(0, 5).join('; '))
      else ok('в исходном HTML закрытых полей нет')
    }
  }

  if (failed.length) {
    console.log(`\n✗ Утечек: ${failed.length}`)
    process.exit(1)
  }
  console.log('\n✓ Проверка пройдена: закрытые сведения объекта публично не отдаются')
}

main().catch((error) => {
  console.error('Проверка не выполнена:', error)
  process.exit(1)
})

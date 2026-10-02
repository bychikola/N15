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
 * 4. Публичный адрес объекта: числовой /ru/catalog/<id> гостю не отдаётся
 *    (404), человекочитаемый открывается.
 * 5. Заявки собственников: коллекции и служебные маршруты закрыты для гостя,
 *    форма на /sell не содержит закрытых полей объекта. Проверки без
 *    побочных эффектов: заявки не создаются, коды не запрашиваются.
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

  // 5. Публичный адрес объекта: номер в адресе гостю больше не служит —
  //    перебор объектов по порядковым номерам закрыт. Гость получает 404
  //    на /ru/catalog/<id>, сотрудник CRM — редирект на человекочитаемый
  //    адрес вида /ru/catalog/kvartira-vesennyaya-40m2-a1b2c3
  //    (см. src/lib/object-slug.ts, catalog/[slug]/page.tsx).
  if (sample?.id != null) {
    console.log('\nПубличные адреса объектов:')
    const numeric = await fetch(`${BASE}/ru/catalog/${encodeURIComponent(String(sample.id))}`, { redirect: 'manual' })
    if (numeric.status === 404) ok(`числовой адрес /ru/catalog/${sample.id} гостю не отдаётся (404)`)
    else if (numeric.status >= 300 && numeric.status < 400) bad(`числовой адрес /ru/catalog/${sample.id} отвечает редиректом — гостю он не должен служить`)
    else bad(`числовой адрес /ru/catalog/${sample.id} открыт гостю — HTTP ${numeric.status}`)

    if (sample.slug) {
      const slugRes = await fetch(`${BASE}/ru/catalog/${encodeURIComponent(String(sample.slug))}`)
      if (slugRes.ok) ok(`человекочитаемый адрес /ru/catalog/${sample.slug} открывается`)
      else bad(`человекочитаемый адрес /ru/catalog/${sample.slug} не открывается — HTTP ${slugRes.status}`)
    }
  }

  // 6. Заявки собственников: коллекции закрыты, служебные маршруты гостю
  //    не отвечают данными, а форма на /sell не содержит закрытых ключей.
  //    Проверки без побочных эффектов: заявки не создаются, коды не
  //    запрашиваются (проверка не должна тратить чужие попытки ввода).
  console.log('\nЗаявки собственников:')
  const ownerList = await fetch(`${BASE}/api/owner-applications?limit=1`)
  if (ownerList.status === 200) {
    const body = await ownerList.json().catch(() => null)
    if (Array.isArray(body?.docs) && body.docs.length) bad('REST коллекции owner-applications отдаёт заявки гостю')
    else ok('REST коллекции owner-applications гостю ничего не отдаёт')
  } else {
    ok(`REST коллекции owner-applications закрыт (HTTP ${ownerList.status})`)
  }
  // Гость не может завести заявку в обход формы через REST коллекции
  const ownerRestCreate = await fetch(`${BASE}/api/owner-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerName: 'Проверка', ownerPhone: '+7 (900) 000-00-00' }),
  })
  if (ownerRestCreate.status === 403) ok('REST-создание заявки гостю запрещено (403)')
  else bad(`REST-создание заявки доступно гостю — HTTP ${ownerRestCreate.status}`)

  const ownerMats = await fetch(`${BASE}/api/owner-materials?limit=1`)
  if (ownerMats.status === 200) {
    const body = await ownerMats.json().catch(() => null)
    if (Array.isArray(body?.docs) && body.docs.length) bad('REST коллекции owner-materials отдаёт файлы заявок гостю')
    else ok('REST коллекции owner-materials гостю ничего не отдаёт')
  } else {
    ok(`REST коллекции owner-materials закрыт (HTTP ${ownerMats.status})`)
  }

  // Проверка кода по заведомо несуществующей заявке: 404 и никаких данных
  const verify = await fetch(`${BASE}/api/owner-applications/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 2147483647, code: '00000' }),
  })
  const verifyBody = await verify.json().catch(() => null)
  if (verify.status === 404) ok('проверка кода по несуществующей заявке отвечает 404')
  else bad(`проверка кода по несуществующей заявке — HTTP ${verify.status}`)
  if (verifyBody && collectKeys(verifyBody).size > 1) bad('ответ проверки кода содержит лишние данные')
  else ok('в ответе проверки кода только сообщение')

  // Гостевая форма заявки: пустой POST не создаёт заявку
  const submit = await fetch(`${BASE}/api/owner-applications/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (submit.status >= 400) ok(`пустая заявка с сайта отклоняется (HTTP ${submit.status})`)
  else bad(`пустая заявка с сайта принимается — HTTP ${submit.status}`)

  // CRM-раздел заявок закрыт для гостя
  const crm = await fetch(`${BASE}/crm/owner-applications`, { redirect: 'manual' })
  if (crm.status >= 300 && crm.status < 400) ok('раздел CRM /crm/owner-applications гостя перенаправляет на вход')
  else bad(`раздел CRM /crm/owner-applications открыт гостю — HTTP ${crm.status}`)
  const crmAction = await fetch(`${BASE}/api/crm/owner-applications/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (crmAction.status === 403) ok('действия по заявкам гостю запрещены (403)')
  else bad(`действия по заявкам доступны гостю — HTTP ${crmAction.status}`)

  // Страница /sell: в разметке формы нет закрытых полей объекта. «house»,
  // «apartment» и прочие слова-имена полей формы из общего списка исключаем:
  // в форме это подписи полей, а не данные объекта
  const sellRes = await fetch(`${BASE}/ru/sell`)
  const sellHtml = await sellRes.text()
  const SELL_FORBIDDEN = ['ownerPhone', 'ownerName', 'cadastralNumber', 'internalComment', 'commission', 'partnerTerms', 'plotCadastralNumber']
  const sellLeaks = SELL_FORBIDDEN.filter((key) => sellHtml.includes(`"${key}"`))
  if (!sellRes.ok) bad(`страница /ru/sell не открывается — HTTP ${sellRes.status}`)
  else if (sellLeaks.length) bad(`в HTML формы заявки закрытые поля: ${sellLeaks.join(', ')}`)
  else ok('в HTML формы /ru/sell закрытых полей нет')

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

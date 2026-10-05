#!/usr/bin/env node
/**
 * Проверки «Источников объектов» (src/lib/object-sources.ts).
 *
 * Запуск: node --experimental-strip-types scripts/check-object-sources.mjs
 * (или npm run check:object-sources)
 *
 * Подключены два канала: «Заявки собственников» (читает открытые заявки из
 * своей базы, owner-applications) и «Партнёрские агентства» (читает
 * согласованный JSON-фид по договору). Оба кладут объекты кандидатами, а
 * очередь — со статусом «Ждёт решения». Проверяем без базы: заявки — на
 * фиктивном клиенте данных, фид — на подменённом fetch; API, XML и NMarket
 * не подключаются.
 *
 * 1. Каналы owner и partner реализованы (fetch не null), остальные источники —
 *    нет; запрещённые по-прежнему нельзя включить.
 * 2. Забор заявок спрашивает именно открытые заявки без объекта: фильтр по
 *    статусам (не отклонённые и не дубли) и по отсутствию связанного объекта.
 * 3. Заявка → кандидат: заголовок, адрес, цена, площадь, комнаты и ключ
 *    дедупликации; ПД собственника (имя, телефон) в очередь не попадают.
 * 4. Партнёрский фид → кандидат: все нужные поля, ключ дедупликации стабилен,
 *    ссылка и комиссия переносятся закрыто, а сбой источника честно
 *    сообщается без выдуманных данных.
 * 5. Забор ничего не публикует: публикация возможна только по решению
 *    сотрудника (статус pending), автоматического переноса в каталог нет.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (помечены ✗).
 */

import {
  OBJECT_SOURCE_SPECS,
  SOURCE_CANDIDATE_STATUS_LABELS,
  canImportFromObjectSource,
  objectSourceBySlug,
} from '../src/lib/object-sources.ts'

let failed = 0
let passed = 0

/** Условие с человекочитаемым отчётом. */
function check(description, condition) {
  if (condition) {
    passed++
    console.log(`  ✓ ${description}`)
  } else {
    failed++
    console.error(`  ✗ ${description}`)
  }
}

console.log('«Источники объектов»: подключённые каналы\n')

// --- 1. Реестр: подключены owner и partner, прочие — нет --------------------------
const owner = objectSourceBySlug('owner')
check('источник «Заявки собственников» есть в реестре', !!owner)
check('у «Заявок собственников» канал забора реализован', !!owner?.fetch)
check('источник «Заявки собственников» разрешён правилами', owner?.policy === 'allowed')

const partner = objectSourceBySlug('partner')
check('источник «Партнёрские агентства» есть в реестре', !!partner)
check('у «Партнёрских агентств» канал JSON-фида реализован', !!partner?.fetch)
check('партнёрский источник подключается только по договору', partner?.policy === 'needsAgreement')

for (const spec of OBJECT_SOURCE_SPECS) {
  if (spec.slug === 'owner' || spec.slug === 'partner') continue
  check(`«${spec.name}»: канал ещё не реализован (fetch: null)`, spec.fetch === null)
}

const forbidden = OBJECT_SOURCE_SPECS.filter((s) => s.policy === 'forbidden')
check('запрещённые источники остались в реестре', forbidden.length > 0)
for (const spec of forbidden) {
  check(
    `«${spec.name}» включить нельзя`,
    !canImportFromObjectSource(spec, {}, { enabled: true }).ok,
  )
}

// --- 2. Забор: какой запрос уходит в базу -----------------------------------------
let sawArgs = null
const sampleDocs = [
  {
    id: 42,
    status: 'checking',
    source: 'site',
    type: 'sale',
    category: 'house',
    price: 7800000,
    area: 180,
    rooms: 5,
    cadastralNumber: '15:07:0030021:123',
    receivedAt: '2026-09-30T10:00:00.000Z',
    address: {
      city: 'Владикавказ',
      district: 'Пригородный',
      locality: 'Даргавс',
      street: 'Садовая',
      house: '7',
    },
    // ПД: в очередь переноситься не должны
    ownerName: 'Аслан Тестов',
    ownerPhone: '+7 (918) 000-00-00',
  },
]

const fakeClient = {
  async find(args) {
    sawArgs = args
    return { docs: sampleDocs }
  },
}

const result = await owner.fetch({ creds: {}, client: fakeClient })
check('забор отчитывается как реализованный', result.implemented === true)
check('забор читает коллекцию owner-applications', sawArgs?.collection === 'owner-applications')
check('забор спрашивает открытые заявки', JSON.stringify(sawArgs?.where || {}).includes('rejected'))
check(
  'забор исключает заявки, из которых уже заведён объект',
  JSON.stringify(sawArgs?.where || {}).includes('exists'),
)
check('забор ведёт доступ с overrideAccess', sawArgs?.overrideAccess === true)

// --- 3. Заявка → кандидат ----------------------------------------------------------
const candidate = result.candidates[0]
check('кандидат один', result.candidates.length === 1)
check('ключ дедупликации — номер заявки', candidate?.externalId === 'owner:42')
check('заголовок собран из категории и места', candidate?.title === 'Дом, Даргавс')
check('адрес собран строкой', candidate?.address === 'Владикавказ, Пригородный, Даргавс, Садовая, 7')
check('цена перенесена', candidate?.price === 7800000)
check('площадь перенесена', candidate?.area === 180)
check('комнаты перенесены', candidate?.rooms === 5)

const rawText = JSON.stringify(candidate?.raw || {})
check('в разборе есть ссылка на заявку', candidate?.raw?.applicationId === 42)
check('в разборе нет имени собственника', !rawText.includes('ownerName'))
check('в разборе нет телефона собственника', !rawText.includes('ownerPhone') && !rawText.includes('918'))
check('фото закрытого хранилища в очередь не отдаются', Array.isArray(candidate?.photos) && candidate.photos.length === 0)

// --- 4. Партнёрский JSON-фид -------------------------------------------------------
// Подменяем глобальный fetch: сеть в проверке не нужна, а разбор ответа
// источника и защита от сбоев — как в бою
const realFetch = globalThis.fetch
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sampleFeed = {
  items: [
    {
      id: 'A-1024',
      title: 'Двухкомнатная квартира, ул. Кирова',
      region: 'Иристонский',
      address: { city: 'Владикавказ', street: 'Кирова', house: '12' },
      price: '4 500 000',
      area: '54,5',
      rooms: 2,
      description: 'Светлая квартира с ремонтом',
      url: 'https://partner.example/objects/A-1024',
      commission: '3 %',
      actualAt: '2026-10-01T09:00:00.000Z',
      photos: [
        'https://partner.example/photos/1.jpg',
        { url: 'https://partner.example/photos/2.jpg' },
        'javascript:alert(1)',
      ],
      // ПД собственника партнёр не должен передавать, и в разбор оно не попадает
      ownerPhone: '+7 (918) 000-00-00',
    },
    // Запись без id, названия и адреса бесполезна — в кандидаты не идёт
    { foo: 'bar' },
  ],
}

let seenUrl = ''
let seenInit = null
globalThis.fetch = async (url, init) => {
  seenUrl = String(url)
  seenInit = init
  return jsonResponse(sampleFeed)
}
const partnerResult = await partner.fetch({
  creds: { feedUrl: 'https://partner.example/feed.json', token: 'secret-token' },
  client: {},
})
globalThis.fetch = realFetch

check('фид отчитывается как реализованный', partnerResult.implemented === true)
check('фид берётся с адреса из доступов', seenUrl === 'https://partner.example/feed.json')
check('токен уходит заголовком Authorization', seenInit?.headers?.Authorization === 'Bearer secret-token')
check('мусорная запись отброшена', partnerResult.candidates.length === 1)

const pc = partnerResult.candidates[0]
check('ключ дедупликации — id записи', pc?.externalId === 'A-1024')
check('название перенесено', pc?.title === 'Двухкомнатная квартира, ул. Кирова')
check('регион перенесён', pc?.region === 'Иристонский')
check('адрес собран из частей', pc?.address === 'Владикавказ, Кирова, 12')
check('цена из строки разобрана', pc?.price === 4500000)
check('площадь с запятой разобрана', pc?.area === 54.5)
check('комнаты перенесены', pc?.rooms === 2)
check('описание перенесено', pc?.description === 'Светлая квартира с ремонтом')
check('ссылка источника перенесена', pc?.url === 'https://partner.example/objects/A-1024')
check('комиссия перенесена закрытым полем', pc?.commission === '3 %')
check('дата актуальности перенесена', pc?.actualAt === '2026-10-01T09:00:00.000Z')
check(
  'фото только http/https',
  JSON.stringify(pc?.photos) ===
    JSON.stringify(['https://partner.example/photos/1.jpg', 'https://partner.example/photos/2.jpg']),
)
check('в разборе нет ПД собственника', !JSON.stringify(pc?.raw || {}).includes('ownerPhone'))

// Повторный забор той же выдачи даёт тот же ключ — сервис обновит кандидата
globalThis.fetch = async () => jsonResponse(sampleFeed)
const partnerAgain = await partner.fetch({ creds: { feedUrl: 'https://partner.example/feed.json' }, client: {} })
globalThis.fetch = realFetch
check('повторный забор даёт тот же ключ (обновит, а не задвоит)', partnerAgain.candidates[0]?.externalId === pc?.externalId)

// Сбои не выдаются за успех: кандидатов нет, сообщение честное
const noUrl = await partner.fetch({ creds: {}, client: {} })
check('без адреса фида объекты не забираются', noUrl.candidates.length === 0 && noUrl.implemented === true)

globalThis.fetch = async () => new Response('<html>не json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
const badJson = await partner.fetch({ creds: { feedUrl: 'https://partner.example/feed' }, client: {} })
globalThis.fetch = realFetch
check('не-JSON ответ не выдаётся за объекты', badJson.candidates.length === 0 && /не является JSON/.test(badJson.message))

globalThis.fetch = async () => new Response('nope', { status: 403 })
const denied = await partner.fetch({ creds: { feedUrl: 'https://partner.example/feed' }, client: {} })
globalThis.fetch = realFetch
check('отказ источника честно сообщается', denied.candidates.length === 0 && /403/.test(denied.message))

// --- 5. Публикации нет -------------------------------------------------------------
check('забор не создаёт объект каталога', !('publishedObject' in (candidate || {})))
check('статус очереди по умолчанию — «Ждёт решения»', SOURCE_CANDIDATE_STATUS_LABELS.pending === 'Ждёт решения')
check('партнёрский источник по умолчанию выключен', partner?.enabledByDefault === false)

// --- 6. Готовность источника к забору ----------------------------------------------
const ownerGate = canImportFromObjectSource(owner, {}, { enabled: true })
check('включённые «Заявки собственников» можно забирать', ownerGate.ok === true)
check(
  'выключенный источник забор не запускает',
  canImportFromObjectSource(owner, {}, { enabled: false }).ok === false,
)
check(
  'включённый партнёрский фид с адресом можно забирать',
  canImportFromObjectSource(partner, { feedUrl: 'https://partner.example/feed' }, { enabled: true }).ok === true,
)
check(
  'без адреса выгрузки партнёрский забор не запускается',
  canImportFromObjectSource(partner, {}, { enabled: true }).ok === false,
)

console.log(`\nИтог: пройдено ${passed}, ошибок ${failed}`)
process.exit(failed === 0 ? 0 : 1)

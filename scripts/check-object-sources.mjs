#!/usr/bin/env node
/**
 * Проверки «Источников объектов» (src/lib/object-sources.ts).
 *
 * Запуск: node --experimental-strip-types scripts/check-object-sources.mjs
 * (или npm run check:object-sources)
 *
 * Подключены три канала: «Заявки собственников» (читает открытые заявки из
 * своей базы, owner-applications), «ГИС Торги» (публичный JSON-API портала
 * torgi.gov.ru) и «Партнёрские агентства» (читает согласованный JSON-фид по
 * договору). Все кладут объекты кандидатами, а очередь — со статусом «Ждёт
 * решения». Проверяем без базы: заявки — на фиктивном клиенте данных, ГИС
 * Торги и фид — на подменённом fetch; API, XML и NMarket не подключаются.
 *
 * 1. Каналы owner и partner реализованы (fetch не null), остальные источники —
 *    нет; запрещённые по-прежнему нельзя включить.
 * 2. Забор заявок спрашивает именно открытые заявки без объекта: фильтр по
 *    статусам (не отклонённые и не дубли) и по отсутствию связанного объекта.
 * 3. Заявка → кандидат: заголовок, адрес, цена, площадь, комнаты и ключ
 *    дедупликации; ПД собственника (имя, телефон) в очередь не попадают.
 * 4. Партнёрский фид → кандидат: все нужные поля, тип объекта и вид сделки
 *    сходятся к коду каталога, ключ дедупликации стабилен, ссылка и комиссия
 *    переносятся закрыто, а сбой источника честно сообщается без выдуманных данных.
 * 5. Тип объекта и вид сделки: синонимы источников сходятся к кодам справочника,
 *    неизвестное значение не выдумывается, а у первого внешнего источника
 *    потолок забора — не больше 5 объектов (без массовой загрузки).
 * 6. Забор ничего не публикует: публикация возможна только по решению
 *    сотрудника (статус pending), автоматического переноса в каталог нет.
 * 7. Независимость источников: сбой помечается видом (сеть, формат, доступ,
 *    код ответа), смена формата и серия сетевых сбоев останавливают забор
 *    автоматически, успех сбрасывает серию, а остановка одного источника не
 *    мешает другим. Данные при этом не удаляются — их просто не трогают.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (помечены ✗).
 */

import {
  OBJECT_SOURCE_SPECS,
  SOURCE_CANDIDATE_STATUS_LABELS,
  SOURCE_FAILURES_BEFORE_PAUSE,
  SOURCE_PAUSE_IMMEDIATE_FAILURES,
  canImportFromObjectSource,
  emptySourceHealth,
  nextSourceHealth,
  objectSourceBySlug,
  sourceDealType,
  sourceObjectType,
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

const torgi = objectSourceBySlug('gis-torgi')
check('источник «ГИС Торги» есть в реестре', !!torgi)
check('у «ГИС Торги» канал государственного API реализован', !!torgi?.fetch)
check('«ГИС Торги» разрешён правилами (открытые данные портала)', torgi?.policy === 'allowed')
check('доступы «ГИС Торги» не требуются (публичный API)', (torgi?.credentials || []).length === 0)

for (const spec of OBJECT_SOURCE_SPECS) {
  if (spec.slug === 'owner' || spec.slug === 'partner' || spec.slug === 'gis-torgi') continue
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
check('тип объекта заявки — кодом справочника', candidate?.objectType === 'house')
check('вид сделки заявки — кодом каталога', candidate?.dealType === 'sale')

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
      category: 'Квартира',
      deal: 'Продажа',
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
check('тип объекта распознан из фида', pc?.objectType === 'apartment')
check('вид сделки распознан из фида', pc?.dealType === 'sale')
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
check('не-JSON ответ помечен как смена формата', badJson.outcome === 'failed' && badJson.failureKind === 'format')
check('отказ 403 помечен как сбой доступа', denied.outcome === 'failed' && denied.failureKind === 'auth')

// Смена формата фида: JSON пришёл, но массива объектов в известном поле нет —
// это сбой, а не пустая выдача, иначе источник можно было бы не заметить
globalThis.fetch = async () => jsonResponse({ result: [], total: 0 })
const partnerFormat = await partner.fetch({ creds: { feedUrl: 'https://partner.example/feed' }, client: {} })
globalThis.fetch = realFetch
check(
  'смена формата фида — сбой, а не пустая выдача',
  partnerFormat.outcome === 'failed' && partnerFormat.failureKind === 'format',
)

// Пустая, но распознанная выдача — не сбой: партнёр просто ничего не прислал
globalThis.fetch = async () => jsonResponse({ items: [] })
const partnerEmpty = await partner.fetch({ creds: { feedUrl: 'https://partner.example/feed' }, client: {} })
globalThis.fetch = realFetch
check('пустой, но распознанный фид — не сбой', partnerEmpty.outcome === 'empty' && partnerEmpty.candidates.length === 0)

// --- 4б. Канал «ГИС Торги» (государственный портал) --------------------------------
// Сеть в проверке не нужна: подменяем fetch, а разбор ответа портала и защита
// от ПД — как в бою. Форма ответа взята по фактическому API портала
// (/new/api/public/lotcards/search и /new/api/public/lotcards/{id}).
const searchResponse = (items) => jsonResponse({ content: items, totalElements: items.length })

const apartment = {
  id: '77000000000000000001_1',
  noticeNumber: '77000000000000000001',
  lotNumber: 1,
  lotStatus: 'APPLICATIONS_SUBMISSION',
  biddType: { code: 'A', name: 'Аукцион' },
  biddForm: { code: 'EA', name: 'Электронный аукцион' },
  lotName: 'Квартира, назначение: жилое, площадь 54,5 кв.м, адрес: г. Москва, ул. Тверская, д. 12, кв. 5',
  lotDescription: 'Квартира с ремонтом',
  priceMin: 8900000,
  biddEndTime: '2026-11-01T20:59:00.000+00:00',
  lotImages: ['img-1', 'img-2'],
  characteristics: [
    { code: 'CadastralNumber', name: 'Кадастровый номер', characteristicValue: '77:01:0001001:1234' },
    { code: 'Square', name: 'Площадь', characteristicValue: '54.5' },
    { code: 'RoomsCount', name: 'Количество комнат', characteristicValue: '2' },
  ],
  // ПД организатора торгов: в разбор попадать не должно
  attributes: [{ code: 'ContactPerson', fullName: 'Контактное лицо', value: 'Иванов Иван Иванович, тел. +7 999 000-00-00' }],
  subjectRFCode: 77,
  category: { code: '9', name: 'Жилые помещения' },
  typeTransaction: 'sale',
  noticeFirstVersionPublicationDate: '2026-10-01T09:00:00.000+00:00',
  createDate: '2026-10-01T09:00:00.000+00:00',
}
const apartment2 = { ...apartment, id: '77000000000000000001_2', noticeNumber: '77000000000000000002', lotName: 'Квартира, площадь 40 кв.м, адрес: г. Москва, ул. Арбат, д. 1' }
const house = { ...apartment, id: '50000000000000000002_1', noticeNumber: '50000000000000000002', lotName: 'Жилой дом, площадь 120 кв.м, адрес: Московская область, г. Химки, ул. Ленина, д. 3', subjectRFCode: 50, category: { code: '8', name: 'Здания' }, characteristics: [{ code: 'CadastralNumber', name: 'Кадастровый номер', characteristicValue: '50:10:0010101:55' }, { code: 'Square', name: 'Площадь', characteristicValue: '120' }] }
const house2 = { ...house, id: '78000000000000000003_1', noticeNumber: '78000000000000000003', subjectRFCode: 78, lotName: 'Жилой дом, площадь 95 кв.м, адрес: г. Санкт-Петербург, ул. Невский проспект, д. 10' }
const commercial = { ...apartment, id: '23000000000000000004_1', noticeNumber: '23000000000000000004', lotName: 'Нежилое помещение, площадь 80 кв.м, адрес: г. Краснодар, ул. Красная, д. 1', subjectRFCode: 23, category: { code: '11', name: 'Нежилые помещения' }, typeTransaction: 'rent', characteristics: [{ code: 'Square', name: 'Площадь', characteristicValue: '80' }] }
const land = { ...apartment, id: '10000000000000000005_1', noticeNumber: '10000000000000000005', lotName: 'Земельный участок площадью 580 кв.м, местоположением: Республика Адыгея, г. Майкоп, ул. Садовая', subjectRFCode: 1, category: { code: '2', name: 'Земельные участки' }, typeTransaction: 'rent', characteristics: [{ code: 'CadastralNumber', name: 'Кадастровый номер земельного участка', characteristicValue: '01:08:0512001:7' }, { code: 'SquareZU', name: 'Площадь земельного участка', characteristicValue: '580.0' }] }

const DETAILS = {
  [apartment.id]: { priceMin: 8900000, deposit: 445000, priceStep: 89000, biddStartTime: '2026-10-05T09:00:00.000+00:00', auctionStartDate: '2026-11-05T09:00:00.000+00:00', etpUrl: 'https://etp.example/torgi/1', lotAttachments: [{ fileName: 'Извещение.pdf', fileId: 'file-1' }], characteristics: apartment.characteristics },
  [house.id]: { priceMin: 12500000, deposit: 625000, lotAttachments: [{ fileName: 'Проект договора.pdf', fileId: 'file-2' }] },
  [commercial.id]: { priceMin: 65000, deposit: 13000 },
  [land.id]: { priceMin: 0, deposit: 5000, lotAttachments: [{ fileName: 'Схема.pdf', fileId: 'file-3' }] },
}

const SEARCHES = {
  9: [apartment, apartment2],
  8: [house, house2],
  11: [commercial],
  2: [land],
}

let seenSearchUrls = []
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/lotcards/search')) {
    seenSearchUrls.push(u)
    const cat = new URL(u).searchParams.get('catCode')
    return searchResponse(SEARCHES[cat] || [])
  }
  const id = decodeURIComponent((u.match(/\/lotcards\/([^/?]+)/) || [])[1] || '')
  return jsonResponse(DETAILS[id] || {})
}
const torgiResult = await torgi.fetch({ creds: {}, client: {} })
globalThis.fetch = realFetch

check('ГИС Торги отчитывается как реализованный', torgiResult.implemented === true)
check('берётся не больше потолка за забор', torgiResult.candidates.length === 5)
check(
  'приоритет категорий: квартиры, дома, коммерция',
  JSON.stringify(torgiResult.candidates.map((c) => c.objectType)) ===
    JSON.stringify(['apartment', 'apartment', 'house', 'house', 'commercial']),
)
const firstSearch = new URL(seenSearchUrls[0] || 'https://x/')
check('первой опрашивается категория квартир (9)', firstSearch.searchParams.get('catCode') === '9')
check(
  'поиск ограничен нашими регионами',
  (firstSearch.searchParams.get('dynSubjRF') || '').split(',').join('|') === '77|50|78|23|26|1|15',
)
check('поиск берёт только актуальные статусы', /APPLICATIONS_SUBMISSION/.test(firstSearch.searchParams.get('lotStatus') || ''))
check('поиск сортирует по свежести', /firstVersionPublicationDate/.test(firstSearch.searchParams.get('sort') || ''))

const tc = torgiResult.candidates[0]
check('ключ дедупликации — номер лота портала', tc?.externalId === '77000000000000000001_1')
check('регион лота переведён в название', tc?.region === 'г. Москва')
check('адрес разобран из карточки лота', tc?.address === 'г. Москва, ул. Тверская, д. 12, кв. 5')
check('начальная цена перенесена', tc?.price === 8900000)
check('площадь перенесена', tc?.area === 54.5)
check('комнаты перенесены', tc?.rooms === 2)
check('вид сделки перенесён', tc?.dealType === 'sale')
check('ссылка на лот портала сохранена', tc?.url === 'https://torgi.gov.ru/new/public/lots/lot/77000000000000000001_1')
check('фото портала — публичные ссылки', tc?.photos[0] === 'https://torgi.gov.ru/new/file-store/v1/img-1?disposition=inline')
check('кадастровый номер в разборе', tc?.raw?.torgi?.cadastralNumber === '77:01:0001001:1234')
check('статус торгов переведён в подпись', tc?.raw?.torgi?.statusLabel === 'Приём заявок')
check('задаток и шаг аукциона в разборе', tc?.raw?.torgi?.deposit === 445000 && tc?.raw?.torgi?.priceStep === 89000)
check('документы лота сохранены', tc?.raw?.torgi?.documents?.[0]?.name === 'Извещение.pdf')
const torgiRawText = JSON.stringify(tc?.raw || {})
check('в разборе нет ФИО организатора', !/Иванов/.test(torgiRawText))
check('в разборе нет телефона организатора', !/999/.test(torgiRawText))
check('комиссия у гос. торгов не выдумывается', tc?.commission === null)

// Отдельный прогон: участок Адыгеи ложится в очередь как «участок»
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/lotcards/search')) {
    const cat = new URL(u).searchParams.get('catCode')
    return searchResponse(cat === '2' ? [land] : [])
  }
  const id = decodeURIComponent((u.match(/\/lotcards\/([^/?]+)/) || [])[1] || '')
  return jsonResponse(DETAILS[id] || {})
}
const landResult = await torgi.fetch({ creds: {}, client: {} })
globalThis.fetch = realFetch
check('участок распознан как участок', landResult.candidates[0]?.objectType === 'land')
check('регион «Республика Адыгея» переведён', landResult.candidates[0]?.region === 'Республика Адыгея')

// Сбой портала не выдаётся за успех: кандидатов нет, сообщение честное
globalThis.fetch = async () => new Response('nope', { status: 503 })
const torgiDown = await torgi.fetch({ creds: {}, client: {} })
globalThis.fetch = realFetch
check('отказ портала честно сообщается', torgiDown.candidates.length === 0 && /ГИС Торги/.test(torgiDown.message) && /503/.test(torgiDown.message))
check('отказ 5xx помечен как ошибка источника', torgiDown.outcome === 'failed' && torgiDown.failureKind === 'http')

// Ответ 200, но списка content нет: у портала сменился формат поиска
globalThis.fetch = async () => jsonResponse({ data: [], totalElements: 0 })
const torgiFormat = await torgi.fetch({ creds: {}, client: {} })
globalThis.fetch = realFetch
check(
  'смена формата API портала — сбой, а не «объектов нет»',
  torgiFormat.outcome === 'failed' && torgiFormat.failureKind === 'format',
)

globalThis.fetch = async () => {
  throw new Error('network down')
}
const torgiNoNet = await torgi.fetch({ creds: {}, client: {} })
globalThis.fetch = realFetch
check('нет связи — объекты не выдумываются', torgiNoNet.candidates.length === 0 && torgiNoNet.implemented === true)
check('нет связи помечено как сетевой сбой', torgiNoNet.outcome === 'failed' && torgiNoNet.failureKind === 'network')

// --- 5. Тип объекта и потолок первого забора ---------------------------------------
check(
  'синонимы типа объекта сходятся к коду каталога',
  sourceObjectType('кв.') === 'apartment' &&
    sourceObjectType('Земельный участок') === 'land' &&
    sourceObjectType('Часть дома') === 'part_house',
)
check('неизвестный тип объекта не выдумывается', sourceObjectType('что-то своё') === null)
check('синонимы вида сделки сходятся к коду', sourceDealType('Аренда') === 'rent' && sourceDealType('продам') === 'sale')
check('у партнёрского источника потолок первого забора — 5 объектов', partner?.importLimit === 5)
check('у «ГИС Торги» потолок первого забора — 5 объектов', torgi?.importLimit === 5)
check('у прочих источников потолка нет', owner?.importLimit === undefined)

// --- 6. Публикации нет -------------------------------------------------------------
check('забор не создаёт объект каталога', !('publishedObject' in (candidate || {})))
check('статус очереди по умолчанию — «Ждёт решения»', SOURCE_CANDIDATE_STATUS_LABELS.pending === 'Ждёт решения')
check('партнёрский источник по умолчанию выключен', partner?.enabledByDefault === false)
check('«ГИС Торги» по умолчанию выключен (тестовый источник)', torgi?.enabledByDefault === false)

// --- 7. Готовность источника к забору ----------------------------------------------
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

// --- 8. Независимость источников: сбои и автоостановка -------------------------------
const h0 = emptySourceHealth('partner')
const failNet = (prev, at) =>
  nextSourceHealth(prev, { status: 'failed', kind: 'network', message: 'нет связи с источником', at })

check('у источника без истории нет сбоев и автоостановки', h0.failCount === 0 && h0.autoPaused === false)
check('порог автоостановки — не меньше двух сбоев', SOURCE_FAILURES_BEFORE_PAUSE >= 2)
check(
  'смена формата и отказ в доступе останавливают сразу',
  SOURCE_PAUSE_IMMEDIATE_FAILURES.includes('format') && SOURCE_PAUSE_IMMEDIATE_FAILURES.includes('auth'),
)

const afterOne = failNet(h0, 't1')
check('единичный сетевой сбой не останавливает забор', afterOne.failCount === 1 && afterOne.autoPaused === false)
check(
  'сбой сохраняет вид и причину для администратора',
  afterOne.lastFailureKind === 'network' && afterOne.lastOutcome === 'failed' && /нет связи/.test(afterOne.lastError || ''),
)

let afterMany = h0
for (let i = 0; i < SOURCE_FAILURES_BEFORE_PAUSE; i++) afterMany = failNet(afterMany, `t${i + 1}`)
check(
  'серия сетевых сбоев останавливает забор',
  afterMany.autoPaused === true && afterMany.failCount === SOURCE_FAILURES_BEFORE_PAUSE,
)
check(
  'у автоостановки есть причина и время',
  !!afterMany.autoPauseReason && afterMany.autoPausedAt === `t${SOURCE_FAILURES_BEFORE_PAUSE}`,
)

const afterFormat = nextSourceHealth(h0, { status: 'failed', kind: 'format', message: 'формат ответа изменился', at: 't1' })
check('смена формата останавливает забор сразу', afterFormat.autoPaused === true)

const recovered = nextSourceHealth(afterOne, { status: 'ok', kind: null, message: 'получено объектов — 3', at: 't2' })
check(
  'успешный забор сбрасывает серию сбоев',
  recovered.failCount === 0 && recovered.autoPaused === false && recovered.lastOutcome === 'ok',
)
check('успех сохраняет итог последнего забора', recovered.lastMessage === 'получено объектов — 3')

// Автоостановка запрещает забор только сбойного канала: другие источники
// работают как обычно, а данные сбойного никто не удаляет
const pausedGate = canImportFromObjectSource(owner, {}, { enabled: true, paused: true, pauseReason: 'источник не отвечает' })
check('остановленный источник забор не запускает', pausedGate.ok === false)
check('причина остановки отдаётся администратору', pausedGate.reason === 'источник не отвечает')
check(
  'остановка одного источника не трогает другие',
  canImportFromObjectSource(partner, { feedUrl: 'https://partner.example/feed' }, { enabled: true }).ok === true,
)

console.log(`\nИтог: пройдено ${passed}, ошибок ${failed}`)
process.exit(failed === 0 ? 0 : 1)

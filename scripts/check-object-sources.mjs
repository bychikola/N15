#!/usr/bin/env node
/**
 * Проверки «Источников объектов» (src/lib/object-sources.ts).
 *
 * Запуск: node --experimental-strip-types scripts/check-object-sources.mjs
 * (или npm run check:object-sources)
 *
 * Первый реальный канал — «Заявки собственников»: он читает открытые заявки из
 * своей базы (owner-applications) и отдаёт их кандидатами, а очередь кладётся
 * со статусом «Ждёт решения». Проверяем без базы, на фиктивном клиенте данных:
 *
 * 1. Канал «Заявки собственников» реализован (fetch не null), остальные
 *    источники — нет; запрещённые по-прежнему нельзя включить.
 * 2. Забор спрашивает именно открытые заявки без объекта: фильтр по статусам
 *    (не отклонённые и не дубли) и по отсутствию связанного объекта.
 * 3. Заявка → кандидат: заголовок, адрес, цена, площадь, комнаты и ключ
 *    дедупликации; ПД собственника (имя, телефон) в очередь не попадают.
 * 4. Забор ничего не публикует: у кандидата нет переноса в каталог, а
 *    публикация возможна только по решению сотрудника (статус pending).
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

console.log('«Источники объектов»: первый реальный канал\n')

// --- 1. Реестр: подключён ровно один канал ----------------------------------------
const owner = objectSourceBySlug('owner')
check('источник «Заявки собственников» есть в реестре', !!owner)
check('у «Заявок собственников» канал забора реализован', !!owner?.fetch)
check('источник «Заявки собственников» разрешён правилами', owner?.policy === 'allowed')

for (const spec of OBJECT_SOURCE_SPECS) {
  if (spec.slug === 'owner') continue
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

// --- 4. Публикации нет -------------------------------------------------------------
check('забор не создаёт объект каталога', !('publishedObject' in (candidate || {})))
check('статус очереди по умолчанию — «Ждёт решения»', SOURCE_CANDIDATE_STATUS_LABELS.pending === 'Ждёт решения')

// --- 5. Включённый источник можно запускать ----------------------------------------
const ownerGate = canImportFromObjectSource(owner, {}, { enabled: true })
check('включённые «Заявки собственников» можно забирать', ownerGate.ok === true)
check(
  'выключенный источник забор не запускает',
  canImportFromObjectSource(owner, {}, { enabled: false }).ok === false,
)

console.log(`\nИтог: пройдено ${passed}, ошибок ${failed}`)
process.exit(failed === 0 ? 0 : 1)

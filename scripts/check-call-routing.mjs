#!/usr/bin/env node
/**
 * Проверки маршрутизации звонков по ответственному агенту объекта.
 *
 * Запуск: node scripts/check-call-routing.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-call-routing.mjs http://localhost:3011
 *
 * Скрипт только читает публичный API сайта (то же, что читает каталог) и
 * ничего не меняет. Проверяет:
 *
 * 1. Общий номер агентства — по tel:-ссылкам главной страницы. Он один на
 *    весь сайт: звонок без ответственного агента уходит именно на него.
 * 2. Объект с ответственным агентом: /api/agents/contact?object=<id> отвечает
 *    этим агентом (source=agent) — так звонок из карточки попадает к нему,
 *    а не ко всей команде.
 * 3. Объект без ответственного агента: маршрут уходит на общий номер
 *    (source=reserve) — в АТС это резервный агент (Лана).
 * 4. Личные номера агентов в ответе не появляются. Если задан DATABASE_URI
 *    и доступен модуль pg, номера сверяются с базой (телефоны и WhatsApp
 *    всех агентов); без доступа к базе проверка пропускается с пометкой.
 * 5. Объекты без ответственного агента — список для назначения в CRM:
 *    это не ошибка маршрута (звонок по ним не теряется), но карточки стоит
 *    закрепить за агентами.
 * 6. Ссылки кнопок: «Позвонить» — обычный звонок (tel:), «WhatsApp» — wa.me.
 *    Кнопки не перепутаны и не ведут по одной и той же ссылке.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (они помечены ✗).
 */

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')

/** Цифры номера: общий номер сравниваем без оформления («+7 (958) 116-15-15») */
const digits = (v) => String(v ?? '').replace(/\D/g, '')

/** Российский номер к виду 7XXXXXXXXXX — иначе «8…» и «+7…» не совпадут */
const ruDigits = (v) => {
  const d = digits(v)
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return `7${d.slice(1)}`
  if (d.length === 10) return `7${d}`
  return d
}

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

async function api(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`)
  return res.json()
}

/** Код ответа маршрута — для проверок отказов (тело не нужно) */
async function apiStatus(path) {
  const res = await fetch(`${BASE}${path}`)
  return res.status
}

/**
 * Ответ маршрута для проверки: ошибка HTTP не роняет весь прогон — проверка
 * должна сказать, какой именно объект/агент не ответил, и пойти дальше.
 * Возвращает null, когда запрос не удался.
 */
async function routeOf(path) {
  try {
    return await api(path)
  } catch {
    return null
  }
}

/**
 * Как маршрут видит АТС: по ответу API (kind) — понятной фразой. Поле ats
 * приходит только у адресного маршрута, поэтому когда его нет, смотрим на
 * источник: у агента без номера в АТС звонок идёт на общий номер, без агента —
 * это резервный маршрут.
 */
const atsWord = (kind, source) =>
  ({
    extension: 'общий номер + добавочный агента',
    direct: 'прямой номер агента в АТС',
    common: 'общий номер (номер в АТС не задан)',
  })[kind] ?? (source === 'agent'
    ? 'номер в АТС не задан — звонок на общий номер, с агентом соединяет АТС'
    : 'резервный маршрут — общий номер')

/** Общий номер агентства из tel:-ссылок главной страницы */
async function commonNumbers() {
  const html = await (await fetch(`${BASE}/ru`)).text()
  const found = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => ruDigits(m[1]))
  return [...new Set(found.filter(Boolean))]
}

/** Опубликованные объекты с ответственным агентом (depth=1 — имя агента) */
async function loadObjects() {
  const where = encodeURIComponent(JSON.stringify({ status: { equals: 'published' } }))
  const data = await api(`/api/objects?limit=1000&depth=1&where=${where}`)
  return (data.docs ?? []).filter((o) => o.status === 'published')
}

/** id ответственного агента объекта (связь приходит объектом или id) */
const agentIdOf = (object) => {
  const rel = object.agent
  const id = typeof rel === 'object' && rel !== null ? rel.id : rel
  return Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null
}

/**
 * Личные номера агентов из базы — для проверки, что маршрут их не отдаёт.
 * Нет DATABASE_URI или модуля pg — проверка пропускается (не ошибка).
 * Путь к модулю можно задать в N15_PG_MODULE (на сервере pg лежит вне сайта).
 */
async function loadPersonalNumbers() {
  const uri = process.env.DATABASE_URI
  if (!uri) return { skipped: 'не задан DATABASE_URI' }
  let pg
  try {
    pg = await import(process.env.N15_PG_MODULE || 'pg')
  } catch {
    return { skipped: 'не найден модуль pg' }
  }
  const { Client } = pg.default ?? pg
  const client = new Client({ connectionString: uri })
  try {
    await client.connect()
    const { rows } = await client.query('select id, name, phone, whatsapp from agents order by id')
    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Личный номер — и телефон, и WhatsApp: в звонке не должно быть обоих
        numbers: [...new Set([ruDigits(r.phone), ruDigits(r.whatsapp)].filter((d) => d.length >= 10))],
      })),
    }
  } catch (error) {
    return { skipped: `не удалось прочитать базу: ${error.message}` }
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  const failed = []
  const ok = (title, details = '') => console.log(`  ✓ ${title}${details ? ` — ${details}` : ''}`)
  const bad = (title, details = '') => { failed.push(title); console.log(`  ✗ ${title}${details ? ` — ${details}` : ''}`) }

  const [common, objects, personal] = await Promise.all([commonNumbers(), loadObjects(), loadPersonalNumbers()])
  console.log(`Проверка маршрутизации звонков: ${BASE}`)
  console.log(`Опубликованных ${objectsWord(objects.length)}\n`)

  // 1. Общий номер агентства: он один, и звонок без агента идёт на него
  console.log('Общий номер агентства (резервный маршрут):')
  if (!common.length) bad('на главной нет ни одной tel:-ссылки', 'некуда направлять звонок без ответственного агента')
  else {
    if (common.length > 1) bad(`на главной ${common.length} разных номеров`, `звонки уйдут на разные номера: ${common.join(', ')}`)
    else ok(`общий номер ${common[0]}`, 'кнопка «Позвонить нам» и резервный маршрут совпадают')
  }
  const commonDigits = common[0] ?? ''

  // 2–3. Маршрут по объекту: агент объекта или резерв
  console.log('\nМаршрут по объекту (ответственный агент / резерв):')
  // Собранные ответы — для проверки ссылок кнопок (пункт 6)
  const links = []
  const withAgent = objects.filter((o) => agentIdOf(o) !== null)
  const withoutAgent = objects.filter((o) => agentIdOf(o) === null)

  // По одному объекту на каждого агента: так проверка ловит и «объект за Яной»,
  // и «объект за Анной», а не только первый найденный
  const byAgent = new Map()
  for (const object of withAgent) {
    const id = agentIdOf(object)
    if (!byAgent.has(id)) byAgent.set(id, object)
  }

  for (const [agentId, object] of byAgent) {
    const route = await routeOf(`/api/agents/contact?object=${object.id}`)
    const name = typeof object.agent === 'object' ? object.agent?.name ?? `агент #${agentId}` : `агент #${agentId}`
    if (!route) bad(`#${object.id} «${object.title}» (${name}): маршрут не ответил`, 'ожидается 200 с маршрутом звонка')
    else if (route.source !== 'agent') bad(`#${object.id} «${object.title}» (${name}): звонок ушёл в резерв`, 'ответственный агент не попал в маршрут')
    else if (Number(route.agentId) !== agentId) bad(`#${object.id} «${object.title}»: маршрут на агента #${route.agentId}, а ответственный #${agentId}`, 'звонок придёт не тому агенту')
    else ok(`#${object.id} «${object.title}» → ${name}`, atsWord(route.ats, route.source))
    if (route) links.push({ label: `#${object.id} «${object.title}»`, route })
  }
  if (!byAgent.size) console.log('  • опубликованных объектов с ответственным агентом нет — проверять нечего')

  // Запрос без объекта и без агента маршрута не строит: 400
  const noObjectStatus = await apiStatus('/api/agents/contact')
  if (noObjectStatus !== 400) bad(`запрос без объекта и агента отвечает ${noObjectStatus}`, 'ожидается 400: маршрут строится только по объекту или агенту')

  const reserveProbe = withoutAgent[0] ?? { id: 999999999, title: 'несуществующий объект' }
  const reserve = await routeOf(`/api/agents/contact?object=${reserveProbe.id}`)
  if (!reserve) bad(`#${reserveProbe.id} (${reserveProbe.title}): маршрут не ответил`, 'ожидается 200 с резервным маршрутом')
  else if (reserve.source !== 'reserve') bad(`#${reserveProbe.id} без ответственного агента: source=${reserve.source}`, 'ожидается reserve — звонок должен уйти на общий номер')
  else if (ruDigits(reserve.tel) !== commonDigits) bad(`#${reserveProbe.id}: резервный звонок идёт на ${reserve.tel}`, `ожидался общий номер ${commonDigits}`)
  else ok(`#${reserveProbe.id} «${reserveProbe.title}» без ответственного → общий номер ${commonDigits}`, 'в АТС это резервный агент (Лана)')
  // Настоящий объект без агента — в проверку ссылок; выдуманный id для этого
  // не годится (у него нет карточки на сайте)
  if (reserve && withoutAgent.length) links.push({ label: `#${reserveProbe.id} «${reserveProbe.title}» (без агента)`, route: reserve })

  // 4. Личные номера в ответе: сверка с базой, если она доступна
  console.log('\nЛичные номера агентов в маршруте:')
  if (personal.skipped) console.log(`  • сверка с базой пропущена — ${personal.skipped}`)
  else {
    const leaked = []
    for (const agent of personal.rows) {
      const route = await api(`/api/agents/contact?id=${agent.id}`).catch(() => null)
      if (!route) continue
      // Проверяем только звонок: WhatsApp — отдельный канал мимо АТС,
      // у него номер агента свой (wa.me), и это не утечка маршрута
      for (const number of agent.numbers) {
        if (digits(route.tel).includes(number)) leaked.push(`${agent.name} — ${number} в звонке #${agent.id}`)
      }
      links.push({ label: `агент #${agent.id} ${String(agent.name).trim()}`, route })
    }
    if (leaked.length) bad('личный номер попал в маршрут звонка', leaked.join('; '))
    else ok(`проверено агентов: ${personal.rows.length}`, 'ни один личный номер не набирается кнопкой «Позвонить» (WhatsApp — отдельный канал, у него свой номер)')
  }

  // 5. Объекты без ответственного агента — их назначают в CRM
  console.log('\nОбъекты без ответственного агента (назначить в CRM):')
  if (!withoutAgent.length) ok('таких объектов нет', 'у всех опубликованных карточек есть ответственный агент')
  else {
    for (const object of withoutAgent.slice(0, 20)) {
      console.log(`  • #${object.id} «${object.title}»`)
    }
    if (withoutAgent.length > 20) console.log(`  • …и ещё ${withoutAgent.length - 20}`)
    console.log(`  Всего ${objectsWord(withoutAgent.length)}: их звонки идут на общий (резервный) номер, пока не выбран агент`)
  }

  // 6. Ссылки кнопок: «Позвонить» — звонок (tel:), «WhatsApp» — wa.me.
  // Кнопки не перепутаны и не ведут по одной и той же ссылке: у звонка схема
  // tel: (набор номера), у WhatsApp — https://wa.me/<цифры>.
  console.log('\nСсылки кнопок («Позвонить» и «WhatsApp»):')
  const linkFails = []
  for (const { label, route } of links) {
    // tel: — цифры, у адресного маршрута ещё добавочный через паузу (,101)
    if (!/^tel:\+\d{10,}(,+\d+)?$/.test(route.tel ?? '')) {
      linkFails.push(`${label}: «Позвонить» ведёт не на звонок (${route.tel ?? 'ссылки нет'})`)
    }
    if (route.wa && !/^https:\/\/wa\.me\/\d{10,15}$/.test(route.wa)) {
      linkFails.push(`${label}: «WhatsApp» ведёт не в WhatsApp (${route.wa})`)
    }
    if (route.wa && route.wa === route.tel) {
      linkFails.push(`${label}: обе кнопки ведут по одной и той же ссылке`)
    }
  }
  if (linkFails.length) linkFails.forEach((problem) => bad(problem))
  else if (!links.length) bad('маршрутов для проверки ссылок нет', 'ни один ответ API не получен')
  else {
    const waCount = links.filter((l) => l.route.wa).length
    ok(`проверено маршрутов: ${links.length}`, `«Позвонить» — tel:, WhatsApp — wa.me (номер WhatsApp есть у ${waCount}); одна ссылка на две кнопки не подставляется`)
  }

  console.log(failed.length ? `\n✗ Ошибок: ${failed.length}` : '\n✓ Все проверки пройдены')
  return failed.length ? 1 : 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((error) => {
    console.error(`Не удалось проверить маршрутизацию ${BASE}: ${error.message}`)
    process.exitCode = 1
  })

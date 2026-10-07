#!/usr/bin/env node
/**
 * Проверки контактов ответственного агента в карточке объекта.
 *
 * Запуск: node scripts/check-call-routing.mjs [адрес сайта]
 *   По умолчанию — боевой https://n15-realty.ru, локальную сборку можно
 *   проверить так: node scripts/check-call-routing.mjs http://localhost:3011
 *
 * Скрипт только читает публичный API сайта (то же, что читают карточки) и
 * ничего не меняет. Проверяет:
 *
 * 1. Общий номер агентства — по tel:-ссылкам главной страницы. Он один на
 *    весь сайт и остаётся отдельным каналом: звонок без ответственного
 *    агента уходит именно на него.
 * 2. Объект с ответственным агентом: /api/agents/contact?object=<id> отвечает
 *    этим агентом (source=agent), «Позвонить» ведёт на его личный рабочий
 *    мобильный, «WhatsApp» — на его WhatsApp. Клиент не попадает чужому
 *    агенту: номер в ответе принадлежит именно ответственному агенту объекта.
 * 3. Объект без ответственного агента: маршрут уходит на общий номер
 *    (source=reserve) — это отдельный канал, а не подмена личного номера.
 *    Сюда же относятся объекты офиса Н15 (ownership=office): у них личного
 *    агента нет по замыслу, и обе кнопки — «Позвонить» и «WhatsApp» — ведут
 *    на основной контакт офиса (см. src/lib/object-ownership.ts).
 * 4. Контакты каждого активного агента (?id=<agentId>): телефон из профиля
 *    (phone) и WhatsApp (whatsapp, при пустоте — тот же телефон). Сверка идёт
 *    с базой, если задан DATABASE_URI и доступен модуль pg; без доступа к базе
 *    проверка номеров пропускается с пометкой.
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

/** Номер для wa.me: «восьмёрка» не годится, нужен код страны (как в src/lib/call-routing.ts) */
const waDigits = (v) => {
  const d = digits(v)
  return d.length === 11 && d.startsWith('8') ? `7${d.slice(1)}` : d
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
const agentsWord = (n) => `${n} ${plural(n, ['агент', 'агента', 'агентов'])}`

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
 * Контакты агентов из базы — для сверки с ответом маршрута. Нет DATABASE_URI
 * или модуля pg — проверка пропускается (не ошибка). Путь к модулю можно
 * задать в N15_PG_MODULE (на сервере pg лежит вне сайта).
 */
async function loadAgents() {
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
    const { rows } = await client.query('select id, name, phone, whatsapp, is_active from agents order by id')
    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Личный рабочий мобильный — номер кнопки «Позвонить»
        phone: ruDigits(r.phone),
        // WhatsApp: поле whatsapp, при пустоте — тот же телефон (как waHref)
        wa: waDigits(r.whatsapp) || waDigits(r.phone),
        active: r.is_active !== false,
      })),
    }
  } catch (error) {
    return { skipped: `не удалось прочитать базу: ${error.message}` }
  } finally {
    await client.end().catch(() => {})
  }
}

/** Карта «id агента → контакты» и множество личных номеров всех агентов */
function agentIndex(agents) {
  const byId = new Map()
  const phones = new Map()
  for (const agent of agents) {
    byId.set(agent.id, agent)
    if (agent.phone.length >= 10) {
      const owners = phones.get(agent.phone) ?? []
      owners.push(agent.id)
      phones.set(agent.phone, owners)
    }
  }
  return { byId, phones }
}

/** Ожидаемый набор кнопки «Позвонить»: личный мобильный или общий номер */
const expectedDial = (agent, commonDigits) =>
  agent && agent.phone.length >= 10 ? agent.phone : commonDigits

/** Ожидаемая ссылка WhatsApp агента (пусто — если номера нет) */
const expectedWa = (agent) => (agent && agent.wa.length >= 10 ? `https://wa.me/${agent.wa}` : '')

async function main() {
  const failed = []
  const ok = (title, details = '') => console.log(`  ✓ ${title}${details ? ` — ${details}` : ''}`)
  const bad = (title, details = '') => { failed.push(title); console.log(`  ✗ ${title}${details ? ` — ${details}` : ''}`) }

  const [common, objects, agents] = await Promise.all([commonNumbers(), loadObjects(), loadAgents()])
  const { byId, phones } = agents.skipped ? { byId: new Map(), phones: new Map() } : agentIndex(agents.rows)

  console.log(`Проверка контактов агентов: ${BASE}`)
  console.log(`Опубликованных ${objectsWord(objects.length)}\n`)

  // 1. Общий номер агентства: он один, и звонок без агента идёт на него
  console.log('Общий номер агентства (отдельный канал, резервный маршрут):')
  if (!common.length) bad('на главной нет ни одной tel:-ссылки', 'некуда направлять звонок без ответственного агента')
  else {
    if (common.length > 1) bad(`на главной ${common.length} разных номеров`, `звонки уйдут на разные номера: ${common.join(', ')}`)
    else ok(`общий номер ${common[0]}`, 'кнопка «Позвонить нам» и резервный маршрут совпадают')
  }
  const commonDigits = common[0] ?? ''

  // 2. Маршрут по объекту: личный контакт ответственного агента
  console.log('\nМаршрут по объекту (личный контакт ответственного агента):')
  const links = []
  const withAgent = objects.filter((o) => agentIdOf(o) !== null)
  // Объекты делим надвое: объекты офиса Н15 (ownership=office) агента не имеют
  // по замыслу — звонок и WhatsApp у них всегда на контакт офиса, даже если в
  // старых данных остался прежний ответственный; остальные карточки без
  // личного агента стоит назначить (см. src/lib/object-ownership.ts)
  const officeObjects = objects.filter((o) => o.ownership === 'office')
  const withoutAgent = objects.filter((o) => agentIdOf(o) === null && o.ownership !== 'office')

  // По одному объекту на каждого агента: так проверка ловит и «объект за Яной»,
  // и «объект за Анной», а не только первый найденный
  const byAgent = new Map()
  for (const object of withAgent) {
    const id = agentIdOf(object)
    if (!byAgent.has(id)) byAgent.set(id, object)
  }

  for (const [responsibleId, object] of byAgent) {
    const route = await routeOf(`/api/agents/contact?object=${object.id}`)
    const name = typeof object.agent === 'object' ? object.agent?.name ?? `агент #${responsibleId}` : `агент #${responsibleId}`
    const agent = byId.get(responsibleId)
    if (!route) { bad(`#${object.id} «${object.title}» (${name}): маршрут не ответил`, 'ожидается 200 с маршрутом звонка'); continue }

    const got = digits(route.tel)
    if (route.source === 'agent' && Number(route.agentId) !== responsibleId) {
      bad(`#${object.id} «${object.title}»: маршрут на агента #${route.agentId}, а ответственный #${responsibleId}`, 'звонок придёт не тому агенту')
    } else if (route.source === 'agent' && agent && !agent.active) {
      // Ответственный агент отключён — endpoint вернёт резерв, это не ошибка
      if (got !== commonDigits) bad(`#${object.id} «${object.title}» (${name}, отключён): маршрут ведёт на ${route.tel}`, `ожидался общий номер ${commonDigits}`)
      else ok(`#${object.id} «${object.title}» → ${name} отключён, звонок на общий номер`, 'адресный маршрут не строится')
    } else if (route.source !== 'agent') {
      bad(`#${object.id} «${object.title}» (${name}): звонок ушёл в резерв`, 'ответственный агент не попал в маршрут')
    } else if (!agent) {
      // База недоступна — номер сверить не с чем, проверяем только адресацию
      ok(`#${object.id} «${object.title}» → ${name}`, 'личный номер не сверялся с базой')
    } else {
      const want = expectedDial(agent, commonDigits)
      if (got !== want) bad(`#${object.id} «${object.title}» (${name}): «Позвонить» ведёт на ${route.tel ?? 'ничего'}`, `ожидался личный номер ${want}`)
      else {
        // Номер не должен принадлежать другому агенту — проверка «не чужому»
        const foreign = (phones.get(got) ?? []).filter((id) => id !== responsibleId)
        if (foreign.length) bad(`#${object.id} «${object.title}»: номер ${got} принадлежит агенту #${foreign[0]}`, `ответственный — #${responsibleId}`)
        else ok(`#${object.id} «${object.title}» → ${name}`, got === commonDigits ? 'телефон не заполнен, звонок на общий номер' : `личный номер ${got}`)
      }
    }
    if (route) links.push({ label: `#${object.id} «${object.title}»`, route })
  }
  if (!byAgent.size) console.log('  • опубликованных объектов с ответственным агентом нет — проверять нечего')
  else if (byAgent.size >= 5) ok(`объектов разных агентов проверено: ${byAgent.size}`, 'по одному объекту на агента')
  else console.log(`  • объектов разных агентов меньше пяти (${byAgent.size}) — проверены все доступные`)

  // Запрос без объекта и без агента маршрута не строит: 400
  const noObjectStatus = await apiStatus('/api/agents/contact')
  if (noObjectStatus !== 400) bad(`запрос без объекта и агента отвечает ${noObjectStatus}`, 'ожидается 400: маршрут строится только по объекту или агенту')

  const reserveProbe = withoutAgent[0] ?? { id: 999999999, title: 'несуществующий объект' }
  const reserve = await routeOf(`/api/agents/contact?object=${reserveProbe.id}`)
  if (!reserve) bad(`#${reserveProbe.id} (${reserveProbe.title}): маршрут не ответил`, 'ожидается 200 с резервным маршрутом')
  else if (reserve.source !== 'reserve') bad(`#${reserveProbe.id} без ответственного агента: source=${reserve.source}`, 'ожидается reserve — звонок должен уйти на общий номер')
  else if (digits(reserve.tel) !== commonDigits) bad(`#${reserveProbe.id}: резервный звонок идёт на ${reserve.tel}`, `ожидался общий номер ${commonDigits}`)
  else ok(`#${reserveProbe.id} «${reserveProbe.title}» без ответственного → общий номер ${commonDigits}`, 'отдельный канал, не личный номер агента')
  // Настоящий объект без агента — в проверку ссылок; выдуманный id для этого
  // не годится (у него нет карточки на сайте)
  if (reserve && withoutAgent.length) links.push({ label: `#${reserveProbe.id} «${reserveProbe.title}» (без агента)`, route: reserve })

  // 3б. Объекты офиса Н15: личного агента нет, обе кнопки — на контакт офиса
  console.log('\nОбъекты офиса Н15 (звонок и WhatsApp — на основной контакт офиса):')
  if (!officeObjects.length) console.log('  • объектов офиса Н15 среди опубликованных нет')
  else {
    let officeFails = 0
    for (const object of officeObjects) {
      const route = await routeOf(`/api/agents/contact?object=${object.id}`)
      if (!route) {
        bad(`#${object.id} «${object.title}» (офис Н15): маршрут не ответил`, 'ожидается 200 с контактом офиса')
        officeFails += 1
      } else if (digits(route.tel) !== commonDigits) {
        bad(`#${object.id} «${object.title}» (офис Н15): «Позвонить» ведёт на ${route.tel ?? 'ничего'}`, `ожидался общий номер офиса ${commonDigits}`)
        officeFails += 1
      } else if (route.wa && digits(route.wa) !== commonDigits) {
        bad(`#${object.id} «${object.title}» (офис Н15): «WhatsApp» ведёт на ${route.wa}`, `ожидался общий номер офиса ${commonDigits}`)
        officeFails += 1
      } else {
        ok(`#${object.id} «${object.title}» → офис Н15`, 'обе кнопки ведут на общий контакт агентства')
      }
      links.push({ label: `#${object.id} «${object.title}» (офис Н15)`, route })
    }
    if (!officeFails) console.log(`  • объектов офиса Н15 проверено: ${officeObjects.length}`)
  }

  // 4. Контакты каждого активного агента: сверка с базой, если она доступна
  console.log('\nКонтакты агентов («Позвонить» — личный мобильный, «WhatsApp» — его WhatsApp):')
  if (agents.skipped) console.log(`  • сверка с базой пропущена — ${agents.skipped}`)
  else {
    const active = agents.rows.filter((a) => a.active)
    let wrongTel = 0
    let wrongWa = 0
    let noWa = 0
    for (const agent of active) {
      const who = `агент #${agent.id} ${String(agent.name).trim()}`
      const route = await api(`/api/agents/contact?id=${agent.id}`).catch(() => null)
      if (!route) {
        bad(`${who}: маршрут не ответил`, 'ожидается 200 с маршрутом звонка')
        continue
      }
      const wantTel = `tel:+${expectedDial(agent, commonDigits)}`
      const wantWa = expectedWa(agent)
      if (route.source !== 'agent' || Number(route.agentId) !== agent.id) {
        bad(`${who}: маршрут не на этого агента`, `source=${route.source}, agentId=${route.agentId}`)
      } else if (route.tel !== wantTel) {
        bad(`${who}: «Позвонить» ведёт на ${route.tel ?? 'ничего'}`, `ожидался ${wantTel}`)
        wrongTel += 1
      }
      // WhatsApp: у агента без номера кнопки нет — это норма, не ошибка
      if (wantWa && route.wa !== wantWa) {
        bad(`${who}: «WhatsApp» ведёт на ${route.wa ?? 'ничего'}`, `ожидался ${wantWa}`)
        wrongWa += 1
      }
      if (!wantWa) noWa += 1
      links.push({ label: who, route })
    }
    if (wrongTel) bad(`неверный номер «Позвонить» у агентов: ${wrongTel}`, 'личный номер агента не совпал с профилем CRM')
    if (wrongWa) bad(`неверный номер «WhatsApp» у агентов: ${wrongWa}`, 'номер WhatsApp не совпал с профилем CRM')
    if (!wrongTel && !wrongWa) {
      ok(`проверено агентов: ${active.length}`, `«Позвонить» — личный мобильный из профиля, «WhatsApp» — его номер${noWa ? ` (без WhatsApp: ${noWa})` : ''}`)
    }
    const inactive = agents.rows.length - active.length
    if (inactive) console.log(`  • отключённых агентов: ${inactive} — их контакты не публикуются, звонок идёт на общий номер`)
  }

  // 5. Объекты без ответственного агента — их назначают в CRM. Объекты офиса
  // Н15 сюда не попадают: агент им не нужен, звонки идут на контакт офиса
  console.log('\nОбъекты без ответственного агента (назначить в CRM):')
  if (officeObjects.length) {
    console.log(`  • объекты офиса Н15 (агент не требуется): ${officeObjects.length}`)
  }
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
    if (!/^tel:\+\d{10,}$/.test(route.tel ?? '')) {
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
    console.error(`Не удалось проверить контакты ${BASE}: ${error.message}`)
    process.exitCode = 1
  })

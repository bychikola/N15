// ---------------------------------------------------------------------------
// «Данные о доме» — серверная обвязка движка src/lib/house-info.ts: запросы к
// открытым источникам, кэш, сохранение снимка в карточку объекта,
// подтверждение значений агентом и публикация подтверждённых характеристик.
//
// Источники и порядок работы:
//   1) официальный реестр АИС ППК «ФРТ» (рабочий канал к сведениям ГИС ЖКХ) —
//      поиск дома по адресу, затем паспорт дома, раздел «Управление» и
//      карточка капитального ремонта; к порталу уходит не больше четырёх
//      запросов на проверку, с паузой между ними и честным User-Agent;
//   2) официальные порталы (ГИС ЖКХ, НСПД, публичная кадастровая карта),
//      муниципальные базы, сайт управляющей организации и площадки
//      недвижимости: система проверяет доступность источника и отдаёт агенту
//      ссылку на ручную проверку — автоматический разбор и сбор данных там,
//      где это запрещено правилами площадок, не делается;
//   3) отчёт по каждому источнику (найден дом, не найден, недоступен,
//      проверяется по ссылке) уходит в интерфейс и сохраняется в снимок —
//      один не ответивший источник не превращается в «данных нет».
//
// Результат проверки кэшируется на 30 минут: повторное нажатие кнопки не
// дёргает порталы заново. Доступность внешних источников проверяется
// отдельно и кэшируется на 6 часов — блокировка сети не меняется каждую
// минуту, а агент не ждёт таймаутов на каждой проверке.
// ---------------------------------------------------------------------------

import type { Payload } from 'payload'
import {
  ADDRESS_MATCH_SHORT,
  HOUSE_REGISTRY,
  HOUSE_SOURCE_DEFS,
  approvedItems,
  buildFields,
  cardPatchFromApproved,
  descriptionParagraph,
  houseSourceDef,
  isConfirmedMatch,
  matchAddress,
  normalizeHouseAddress,
  overhaulFieldValues,
  parseManagement,
  parseOverhaul,
  parsePassport,
  parseSearchResults,
  passportFieldValues,
  paragraphNode,
  realtySearchUrl,
  stubFields,
  type AddressMatch,
  type HouseFieldKey,
  type HouseFieldSource,
  type HouseInfoField,
  type HouseInfoResult,
  type HouseManagement,
  type HousePassport,
  type HousePublicItem,
  type HouseQueryAddress,
  type HouseResultStatus,
  type HouseSearchHit,
  type NormalizedAddress,
  type OverhaulCard,
  type HouseSourceReport,
  type HouseSourceStatus,
} from './house-info'

/** Таймаут одного запроса к порталу */
const FETCH_TIMEOUT_MS = 15_000
/** Таймаут проверки доступности внешнего источника (блокировка — быстрый отказ) */
const PROBE_TIMEOUT_MS = 6_000
/**
 * Источники, у которых проверяется только доступность: карточки отдаются
 * клиентским приложением либо подгружаются скриптом, поэтому агенту уходит
 * ссылка на ручную проверку, а не попытка разбора
 */
const PROBE_CODES = ['giszkh', 'nspd', 'pkk'] as const
/** Пауза между запросами к реестру: портал официальный, вести себя надо скромно */
const PAUSE_BETWEEN_REQUESTS_MS = 400
/** Кэш результатов: повторное нажатие кнопки не дёргает порталы заново */
const CACHE_TTL_MS = 30 * 60 * 1000
/** Кэш доступности источников: сетевые блокировки не меняются каждую минуту */
const PROBE_TTL_MS = 6 * 60 * 60 * 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface CacheEntry {
  at: number
  result: HouseInfoResult
}

const cache = new Map<string, CacheEntry>()

/** Кадастровый номер в сравнимый вид */
const normCadastral = (v: string | null | undefined): string =>
  (v || '').toLowerCase().replace(/[^0-9:]/g, '')

const joinParts = (parts: (string | null | undefined)[], sep = ', '): string =>
  parts.map((p) => (p || '').trim()).filter(Boolean).join(sep)

// --- Сеть -------------------------------------------------------------------

type FetchResult = { ok: true; body: string } | { ok: false; reason: string; status: number | null }

/** Запрос открытой страницы реестра: таймаут, честный User-Agent, редиректы */
async function fetchRegistryPage(path: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${HOUSE_REGISTRY.origin}${path}`, {
      headers: {
        'User-Agent': HOUSE_REGISTRY.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, reason: `реестр ответил кодом ${res.status}`, status: res.status }
    return { ok: true, body: await res.text() }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reason: timeout ? 'реестр не ответил за 15 секунд' : `нет связи с реестром (${message})`,
      status: null,
    }
  }
}

interface ProbeResult {
  reachable: boolean
  reason: string
  at: number
}

const probeCache = new Map<string, ProbeResult>()

/**
 * Доступность внешнего источника: спрашиваем его страницу и честно
 * фиксируем результат. Источник, до которого сервер не дотягивается
 * (сетевая блокировка), дальше проверяется по ссылке вручную.
 */
async function probeSource(url: string): Promise<ProbeResult> {
  const cached = probeCache.get(url)
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached
  let result: ProbeResult
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': HOUSE_REGISTRY.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    })
    result = {
      reachable: true,
      reason: res.ok
        ? 'источник отвечает'
        : `источник отвечает кодом ${res.status} (автоматический разбор не поддерживается)`,
      at: Date.now(),
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    const message = error instanceof Error ? error.message : String(error)
    result = {
      reachable: false,
      reason: timeout
        ? `сервер не может связаться с источником: нет ответа за ${PROBE_TIMEOUT_MS / 1000} секунд`
        : `сервер не может связаться с источником (${message})`,
      at: Date.now(),
    }
  }
  probeCache.set(url, result)
  return result
}

// --- Отчёты по источникам ----------------------------------------------------

const sourceDef = (code: string) => {
  const def = houseSourceDef(code)
  if (!def) throw new Error(`Неизвестный источник данных о доме: ${code}`)
  return def
}

/** Отчёт по источнику с общими полями */
function sourceReport(
  code: string,
  input: {
    status: HouseSourceStatus
    url?: string | null
    urlLabel?: string | null
    cardAddress?: string | null
    match?: AddressMatch | null
    checkedAt?: string | null
    note?: string | null
    valuesCount?: number
  },
): HouseSourceReport {
  const def = sourceDef(code)
  return {
    code,
    name: def.name,
    kind: def.kind,
    operator: def.operator,
    status: input.status,
    // url: null означает «ссылки нет» — на сайт источника не откатываемся
    url: input.url === null ? null : input.url || def.site || null,
    urlLabel: input.urlLabel ?? null,
    cardAddress: input.cardAddress ?? null,
    match: input.match ?? null,
    checkedAt: input.checkedAt ?? null,
    note: input.note ?? null,
    valuesCount: input.valuesCount ?? 0,
  }
}

/** Отчёт по разделу реестра ФРТ: проверен, дом найден / не найден / недоступен */
function registryReport(
  code: string,
  input: {
    checkedAt: string
    /** Поисковый запрос — из него собирается ссылка на поиск по адресу */
    query: string
    hit?: HouseSearchHit | null
    match?: AddressMatch | null
    reason?: string | null
    /** Рядом найденные дома той же улицы — для пояснения */
    nearby?: { hit: HouseSearchHit; match: AddressMatch }[]
    valuesCount?: number
    note?: string | null
    /** Ссылка для «не найдено»: по умолчанию — поиск по адресу в реестре */
    url?: string | null
    urlLabel?: string | null
  },
): HouseSourceReport {
  const def = sourceDef(code)
  const checkedAt = input.checkedAt
  const searchUrl =
    input.url === null
      ? null
      : input.url || `${HOUSE_REGISTRY.displayOrigin}/search/houses?query=${encodeURIComponent(input.query)}`
  if (input.hit) {
    const match = input.match || null
    return sourceReport(code, {
      status: 'found',
      url: input.hit.url,
      urlLabel: 'карточка дома в реестре',
      cardAddress: input.hit.address,
      match,
      checkedAt,
      valuesCount: input.valuesCount ?? 0,
      note:
        input.note ||
        `Раздел «${input.hit.section}». Адрес карточки: ${input.hit.address}. Совпадение адреса: ${
          match ? match.note : '—'
        }`,
    })
  }
  if (input.reason) {
    return sourceReport(code, {
      status: 'unavailable',
      checkedAt,
      note: input.reason,
    })
  }
  const nearby = input.nearby || []
  return sourceReport(code, {
    status: 'notFound',
    url: searchUrl,
    urlLabel: input.urlLabel || 'поиск в реестре',
    checkedAt,
    note: nearby.length
      ? `${def.name}: дома с таким адресом нет. По этой улице в реестре есть другие дома: ${nearby
          .slice(0, 3)
          .map((n) => `${n.hit.address} (совпадение адреса ${ADDRESS_MATCH_SHORT[n.match.level]})`)
          .join('; ')}${nearby.length > 3 ? ` и ещё ${nearby.length - 3}` : ''}`
      : input.note || `${def.name}: дома с таким адресом не найдено`,
  })
}

// --- Проверка ---------------------------------------------------------------

/** Снимок без значений: источникам нечего было ответить */
function emptyResult(input: {
  status: HouseResultStatus
  reason: string
  address: NormalizedAddress
  checkedAt: string
  sources: HouseSourceReport[]
  fields: HouseInfoField[]
  privateHouse: boolean
}): HouseInfoResult {
  return {
    status: input.status,
    reason: input.reason,
    query: input.address.query,
    matchedBy: null,
    house: null,
    fields: input.fields,
    checkedAt: input.checkedAt,
    address: input.address,
    sources: input.sources,
    privateHouse: input.privateHouse,
  }
}

/** Выбор лучшей карточки среди результатов поиска по разделу реестра */
function pickBest(
  hits: HouseSearchHit[],
  address: NormalizedAddress,
): { best: { hit: HouseSearchHit; match: AddressMatch } | null; ties: number; nearby: { hit: HouseSearchHit; match: AddressMatch }[] } {
  const scored = hits
    .map((hit) => ({ hit, match: matchAddress(hit.address, address) }))
    .filter((s) => s.match.level !== 'none')
    .sort((a, b) => b.match.score - a.match.score)
  const nearby = hits
    .map((hit) => ({ hit, match: matchAddress(hit.address, address) }))
    .filter((s) => s.match.level === 'partial')
  if (!scored.length) return { best: null, ties: 0, nearby }
  const best = scored[0]
  const ties = scored.filter((s) => s.match.level === best.match.level).length
  return { best, ties, nearby }
}

export interface HouseLookupInput {
  address: HouseQueryAddress
  /** Кадастровый номер объекта — для перекрёстной сверки с реестром */
  cadastralNumber?: string | null
  /** Вид объекта: apartment, house, land, commercial — влияет на порядок поиска */
  category?: string | null
  /** Момент проверки (ISO); по умолчанию — сейчас */
  now?: string
}

export interface HouseLookupHooks {
  /** Источник проверен — отдаём отчёт сразу (живой прогресс в карточке) */
  onSource?: (report: HouseSourceReport) => void
}

/**
 * Проверка дома по открытым источникам. Адрес разбирается на части (город,
 * улица, дом, корпус, строение), по ним ищется дом в реестре жилищного фонда
 * и в программе капитального ремонта; параллельно проверяется доступность
 * официальных порталов. Отчёт по каждому источнику идёт в результат — агент
 * видит, где дом найден, где нет и куда не достучались.
 */
export async function lookupHouseInfo(
  input: HouseLookupInput,
  hooks?: HouseLookupHooks,
): Promise<HouseInfoResult> {
  const checkedAt = input.now || new Date().toISOString()
  const address = normalizeHouseAddress(input.address)
  // Карточки частного дома в ГИС ЖКХ обычно нет — для дома и участка поиск
  // идёт по другим источникам (см. privateHouse в результате)
  const privateHouse = input.category === 'house' || input.category === 'land'
  const emit = (report: HouseSourceReport) => hooks?.onSource?.(report)

  // Доступность официальных порталов проверяем параллельно с реестром:
  // агент не ждёт таймаута каждого источника по очереди
  const probes = new Map<string, Promise<ProbeResult>>()
  for (const code of PROBE_CODES) {
    const def = sourceDef(code)
    probes.set(code, probeSource(def.site))
  }

  if (!address.query) {
    const reason = privateHouse
      ? 'В карточке не заполнены улица и дом: для частного дома поиск идёт по адресу, кадастровому номеру или названию товарищества'
      : 'В карточке не заполнены город, улица и дом — поиск по реестру идёт по адресу, кадастровый номер используется лишь для сверки уже найденного дома'
    return emptyResult({
      status: 'noAddress',
      reason,
      address,
      checkedAt,
      sources: [],
      fields: stubFields({ status: 'unavailable', checkedAt, note: reason }),
      privateHouse,
    })
  }

  const cacheKey = `${address.key}|${privateHouse ? 'private' : 'common'}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    // Снимок из кэша отдаём с текущей датой проверки: агент видит, когда
    // система обращалась к источникам в последний раз
    const result = { ...cached.result, checkedAt }
    for (const source of result.sources) emit({ ...source, checkedAt: source.checkedAt || checkedAt })
    return result
  }

  const sources: HouseSourceReport[] = []

  // 1. Поиск дома по адресу в реестре жилищного фонда
  const search = await fetchRegistryPage(`/search/houses?query=${encodeURIComponent(address.query)}`)
  let hits: HouseSearchHit[] = search.ok ? parseSearchResults(search.body) : []
  const searchReason = search.ok ? null : search.reason
  // Точный запрос с корпусом или строением может не найтись (реестр пишет
  // адрес иначе) — тогда повторяем без них, чтобы показать дома рядом
  if (search.ok && !hits.length && (address.corpus || address.building)) {
    await sleep(PAUSE_BETWEEN_REQUESTS_MS)
    const wide = await fetchRegistryPage(`/search/houses?query=${encodeURIComponent(address.baseQuery)}`)
    if (wide.ok) hits = parseSearchResults(wide.body)
  }

  const query = { query: address.query, checkedAt }
  const sectionHits = (kind: HouseSearchHit['sectionKind']) => hits.filter((h) => h.sectionKind === kind)
  const mkd = pickBest(sectionHits('mkd'), address)
  const overhaul = pickBest(sectionHits('overhaul'), address)

  // Паспорт дома: найден, не найден или реестр недоступен
  let passport: HousePassport | null = null
  let management: HouseManagement | null = null
  let mkdReport: HouseSourceReport
  let matchedBy: HouseInfoResult['matchedBy'] = null

  if (searchReason) {
    mkdReport = registryReport('frt-mkd', { ...query, reason: `реестр недоступен: ${searchReason}` })
  } else if (mkd.best && mkd.ties === 1) {
    await sleep(PAUSE_BETWEEN_REQUESTS_MS)
    const page = await fetchRegistryPage(`/myhouse/profile/passport/${mkd.best.hit.id}`)
    if (!page.ok) {
      mkdReport = registryReport('frt-mkd', {
        ...query,
        reason:
          page.status === 404
            ? 'дом найден поиском, но карточка дома в реестре не открылась (реестр ответил 404)'
            : `карточка дома в реестре не открылась: ${page.reason}`,
      })
    } else {
      passport = parsePassport(page.body)
      const plotCadastral =
        passport.rows.find((r) => /^кадастровый номер земельного участка/i.test(r.label))?.value || null
      let match = mkd.best.match
      if (!isConfirmedMatch(match) && input.cadastralNumber && plotCadastral &&
        normCadastral(input.cadastralNumber) === normCadastral(plotCadastral)) {
        // Кадастровый номер участка совпал с номером объекта — адрес
        // подтверждён документально
        match = matchAddress(mkd.best.hit.address, address, { cadastralConfirmed: true })
        matchedBy = 'cadastral'
      }
      mkdReport = registryReport('frt-mkd', {
        ...query,
        hit: mkd.best.hit,
        match,
        valuesCount: Object.values(passportFieldValues(passport)).flat().length,
        note: `Раздел «${mkd.best.hit.section}». ${match.note || ''}`.trim(),
      })
      if (!matchedBy && isConfirmedMatch(match)) matchedBy = 'address'

      // Раздел «Управление» — отдельная страница того же дома
      await sleep(PAUSE_BETWEEN_REQUESTS_MS)
      const managementPage = await fetchRegistryPage(`/myhouse/profile/management/${mkd.best.hit.id}`)
      if (managementPage.ok) management = parseManagement(managementPage.body)
    }
  } else if (mkd.best && mkd.ties > 1) {
    mkdReport = sourceReport('frt-mkd', {
      status: 'notFound',
      checkedAt,
      url: `${HOUSE_REGISTRY.displayOrigin}/search/houses?query=${encodeURIComponent(address.query)}`,
      urlLabel: 'поиск в реестре',
      note: `По адресу найдено несколько домов (${mkd.ties}) — уточните корпус и строение: ${sectionHits('mkd')
        .slice(0, 4)
        .map((h) => h.address)
        .join('; ')}`,
    })
  } else {
    mkdReport = registryReport('frt-mkd', { ...query, nearby: mkd.nearby })
  }
  sources.push(mkdReport)
  emit(mkdReport)

  // 2. Карточка капитального ремонта — второй официальный источник значений.
  // Раздел ведёт региональные программы капремонта: карточка есть только у
  // домов, включённых в программу субъекта РФ, поэтому поиск здесь идёт по
  // нему же, а «карточки нет» — это не «источник недоступен»
  const overhaulSectionUrl = `${HOUSE_REGISTRY.displayOrigin}/overhaul/overhaul`
  let overhaulCard: OverhaulCard | null = null
  let overhaulReport: HouseSourceReport
  if (searchReason) {
    overhaulReport = registryReport('frt-overhaul', { ...query, reason: `реестр недоступен: ${searchReason}` })
  } else if (overhaul.best && overhaul.ties === 1) {
    await sleep(PAUSE_BETWEEN_REQUESTS_MS)
    const page = await fetchRegistryPage(`/overhaul/overhaul/view/${overhaul.best.hit.id}`)
    if (!page.ok && page.status === 404) {
      overhaulReport = registryReport('frt-overhaul', {
        ...query,
        url: overhaulSectionUrl,
        urlLabel: 'раздел «Капитальный ремонт МКД»',
        note: `Карточка дома в разделе «Капитальный ремонт МКД» не открылась (реестр ответил 404): дом не включён в региональную программу капитального ремонта либо сведения по нему не раскрыты`,
      })
    } else if (!page.ok) {
      overhaulReport = registryReport('frt-overhaul', {
        ...query,
        reason: `карточка капитального ремонта не открылась: ${page.reason}`,
      })
    } else {
      overhaulCard = parseOverhaul(page.body)
      overhaulReport = registryReport('frt-overhaul', {
        ...query,
        hit: overhaul.best.hit,
        match: overhaul.best.match,
        valuesCount: Object.values(overhaulFieldValues(overhaulCard)).flat().length,
        note: `Раздел «${overhaul.best.hit.section}»: ${overhaul.best.match.note}${
          overhaulCard.worksUrl ? '. Выполненные работы — на карточке ремонта' : ''
        }`,
      })
    }
  } else if (overhaul.best && overhaul.ties > 1) {
    overhaulReport = sourceReport('frt-overhaul', {
      status: 'notFound',
      checkedAt,
      url: `${HOUSE_REGISTRY.displayOrigin}/search/houses?query=${encodeURIComponent(address.query)}`,
      urlLabel: 'поиск в реестре',
      note: `В разделе «Капитальный ремонт МКД» найдено несколько домов по адресу — уточните корпус и строение: ${sectionHits(
        'overhaul',
      )
        .slice(0, 4)
        .map((h) => h.address)
        .join('; ')}`,
    })
  } else {
    overhaulReport = registryReport('frt-overhaul', {
      ...query,
      url: overhaulSectionUrl,
      urlLabel: 'раздел «Капитальный ремонт МКД»',
      note: `${sourceDef('frt-overhaul').name}: по этому адресу карточки нет — дом не включён в региональную программу капитального ремонта либо сведения по нему не раскрыты`,
      nearby: overhaul.nearby,
    })
  }
  sources.push(overhaulReport)
  emit(overhaulReport)

  // 3. Управление домом: раскрывается только у найденного дома
  const managementValues: HouseFieldSource['values'] = {}
  const managementUrl = mkdReport.status === 'found' ? mkdReport.url : null
  if (management?.organization) {
    managementValues.managementOrg = [
      {
        value: management.organization,
        note: management.since
          ? `Управляет с ${management.since}${management.basis ? `, основание: ${management.basis}` : ''}`
          : 'Управляющая организация по данным реестра',
      },
    ]
  }
  const managementMatch: AddressMatch =
    mkdReport.match || { score: 0, level: 'none', note: 'Дом в реестре не найден' }
  const managementReport = management?.organization
    ? sourceReport('frt-management', {
        status: 'found',
        url: managementUrl,
        urlLabel: 'карточка дома в реестре',
        cardAddress: mkdReport.cardAddress,
        match: managementMatch,
        checkedAt,
        valuesCount: 1,
        note: `Раздел «Управление». ${management.since ? `Управляет с ${management.since}. ` : ''}${
          management.basis ? `Основание: ${management.basis}.` : ''
        }`.trim(),
      })
    : sourceReport('frt-management', {
        status: mkdReport.status === 'unavailable' ? 'unavailable' : 'notFound',
        url: managementUrl,
        urlLabel: managementUrl ? 'карточка дома в реестре' : null,
        checkedAt,
        note:
          mkdReport.status === 'unavailable'
            ? mkdReport.note
            : 'В разделе «Управление» управляющая организация дома не раскрыта',
      })
  sources.push(managementReport)
  emit(managementReport)

  // 4. Официальные порталы: проверяем доступность и отдаём ссылку на ручную
  // проверку — карточки этих порталов автоматически не разбираются
  for (const code of PROBE_CODES) {
    const def = sourceDef(code)
    const probe = await (probes.get(code) ?? probeSource(def.site))
    const note =
      code === 'giszkh'
        ? `${
            probe.reachable
              ? 'Портал ГИС ЖКХ открыт, но карточки домов отдаются клиентским приложением — проверьте дом по ссылке.'
              : `Портал ГИС ЖКХ недоступен с сервера (${probe.reason}). Сведения ГИС ЖКХ раскрываются на портале АИС ППК «ФРТ» — см. источник «паспорт дома».`
          }`
        : `Кадастровые сведения проверяются по ссылке вручную${
            probe.reachable ? '' : `: ${probe.reason}`
          }`
    const report = sourceReport(code, {
      status: probe.reachable ? 'manual' : 'unavailable',
      checkedAt,
      urlLabel: 'открыть источник',
      match: null,
      note,
    })
    sources.push(report)
    emit(report)
  }

  // 5. Муниципальная база города
  const municipal = MUNICIPAL_BASES.find((b) => b.city === (address.city || address.locality).toLowerCase())
  const municipalReport = municipal
    ? sourceReport('municipal', {
        status: 'manual',
        url: municipal.site,
        urlLabel: 'открыть базу города',
        checkedAt,
        note: `${municipal.name}: открытой машиночитаемой базы домов нет — проверьте дом поиском по адресу на сайте города`,
      })
    : sourceReport('municipal', {
        status: 'notApplicable',
        url: null,
        checkedAt,
        note: 'Открытая муниципальная база для этого города не найдена — уточните сведения в администрации города',
      })
  sources.push(municipalReport)
  emit(municipalReport)

  // 6. Сайт управляющей организации
  const org = management?.organization || null
  const ukReport = org
    ? sourceReport('uk', {
        status: 'manual',
        url: `https://yandex.ru/search/?text=${encodeURIComponent(`${org} официальный сайт`)}`,
        urlLabel: 'найти сайт УК',
        checkedAt,
        note: `Сайт управляющей организации «${org}»: сверьте паспорт дома и работы по ссылке`,
      })
    : sourceReport('uk', {
        status: 'notApplicable',
        url: null,
        checkedAt,
        note: 'Управляющая организация дома не определена — сайт УК не ищется',
      })
  sources.push(ukReport)
  emit(ukReport)

  // 7. Карточки домов на площадках недвижимости: автоматический сбор их
  // правила запрещают, поэтому агенту даётся ссылка на поиск по адресу
  const searchText = joinParts(
    [
      address.city || address.locality,
      address.street,
      address.house,
      address.corpus ? `к. ${address.corpus}` : '',
      address.building ? `стр. ${address.building}` : '',
    ],
    ' ',
  )
  for (const def of HOUSE_SOURCE_DEFS.filter((s) => s.code.startsWith('realty-'))) {
    const report = sourceReport(def.code, {
      status: 'manual',
      url: realtySearchUrl(def.code, searchText),
      urlLabel: 'поиск по адресу',
      checkedAt,
      note: privateHouse
        ? 'Для частного дома открытая карточка на площадке часто единственный источник: сверьте адрес, площадь и год постройки вручную'
        : 'Автоматический сбор данных площадки запрещён её правилами — откройте поиск по адресу и сверьте карточку дома вручную',
    })
    sources.push(report)
    emit(report)
  }

  // 8. Сборка характеристик из значений всех источников
  const fieldSources: HouseFieldSource[] = []
  if (passport && mkdReport.match) {
    fieldSources.push({
      code: 'frt-mkd',
      name: sourceDef('frt-mkd').name,
      url: mkdReport.url,
      checkedAt,
      match: mkdReport.match,
      values: passportFieldValues(passport),
    })
  }
  if (overhaulCard && overhaulReport.match) {
    fieldSources.push({
      code: 'frt-overhaul',
      name: sourceDef('frt-overhaul').name,
      url: overhaulReport.url,
      checkedAt,
      match: overhaulReport.match,
      values: overhaulFieldValues(overhaulCard),
    })
  }
  if (Object.keys(managementValues).length) {
    fieldSources.push({
      code: 'frt-management',
      name: sourceDef('frt-management').name,
      url: managementUrl,
      checkedAt,
      match: managementMatch,
      values: managementValues,
    })
  }

  const houseFound = mkdReport.status === 'found' || overhaulReport.status === 'found'
  const fields = buildFields({ sources: fieldSources, checkedAt })

  // 9. Итог: «дом не найден» — только когда так ответили все проверенные
  // источники; если часть источников недоступна или ждёт ручной проверки,
  // это не «данных нет», а продолжающийся поиск
  const unavailable = sources.filter((s) => s.status === 'unavailable').length
  const pendingManual = sources.filter((s) => s.status === 'manual').length
  const notFoundCount = sources.filter((s) => s.status === 'notFound').length
  const allAutomatedFailed = unavailable > 0 && notFoundCount > 0 && !houseFound

  let status: HouseResultStatus
  if (houseFound) status = 'found'
  else if (mkd.best && mkd.ties > 1) status = 'ambiguous'
  else if (allAutomatedFailed && pendingManual === 0) status = 'unavailable'
  else status = 'checkingOthers'

  const summary = `Проверено источников: ${sources.length}; нашли дом: ${sources.filter((s) => s.status === 'found').length}; не нашли: ${notFoundCount}; недоступны: ${unavailable}; проверяются по ссылке: ${pendingManual}`
  const reasonParts = [summary]
  if (privateHouse) {
    reasonParts.unshift(
      mkdReport.status === 'found'
        ? 'Объект — частный дом или участок: карточка в ГИС ЖКХ найдена, но для частных домов там обычно раскрыты только общие сведения'
        : 'Объект — частный дом или участок: карточки частного дома в ГИС ЖКХ обычно нет, поэтому сведения ищутся по кадастровым источникам, муниципальным базам и открытым карточкам площадок',
    )
  }
  if (!houseFound && status === 'checkingOthers') {
    const notFoundNames = sources.filter((s) => s.status === 'notFound' && s.kind !== 'realty').map((s) => s.name)
    if (notFoundNames.length) {
      reasonParts.push(`Дом не найден: ${notFoundNames.slice(0, 3).join('; ')}`)
    }
    const unavailableNames = sources
      .filter((s) => s.status === 'unavailable')
      .map((s) => `${s.name} — ${s.note || 'недоступен'}`)
    if (unavailableNames.length) reasonParts.push(`Недоступны: ${unavailableNames.join('; ')}`)
  }

  const result: HouseInfoResult = {
    status,
    reason: reasonParts.join('. '),
    query: address.query,
    matchedBy,
    house: mkdReport.status === 'found' && passport
      ? {
          id: mkd.best?.hit.id || '',
          address: passport.address || mkdReport.cardAddress || '',
          url: mkdReport.url || '',
          updatedAt: passport.updatedAt,
          plotCadastral:
            passport.rows.find((r) => /^кадастровый номер земельного участка/i.test(r.label))?.value || null,
        }
      : null,
    fields,
    checkedAt,
    address,
    sources,
    privateHouse,
  }

  cache.set(cacheKey, { at: Date.now(), result })
  return result
}

/** Открытые муниципальные базы городов: у остальных городов их нет */
export const MUNICIPAL_BASES = [
  {
    city: 'владикавказ',
    name: 'Администрация города Владикавказа',
    site: 'https://vladikavkaz-osetia.ru/',
  },
  {
    city: 'москва',
    name: 'Портал «Дома Москвы» (dom.mos.ru)',
    site: 'https://dom.mos.ru/',
  },
]

// --- Хранение снимка в карточке объекта --------------------------------------

/** Группа houseInfo в документе objects */
export interface HouseInfoGroup {
  status?: string | null
  checkedAt?: string | null
  registry?: string | null
  registryUrl?: string | null
  houseId?: string | null
  houseAddress?: string | null
  registryUpdatedAt?: string | null
  plotCadastral?: string | null
  query?: string | null
  matchedBy?: string | null
  fields?: unknown
  /** Отчёт по источникам: где дом найден, где нет, что недоступно */
  sources?: unknown
  /** Адрес объекта, разобранный на части */
  addressParts?: unknown
  /** Частный дом или участок */
  privateHouse?: boolean | null
  note?: string | null
  approved?: unknown
  approvedAt?: string | null
  approvedBy?: string | null
  log?: { at?: string | null; event?: string | null; message?: string | null; by?: string | null }[]
}

/** Публичная группа housePublic: только подтверждённые характеристики */
export interface HousePublicGroup {
  items?: unknown
  confirmedAt?: string | null
}

/** Снимок проверки, прочитанный из карточки */
export interface SavedHouseInfo {
  status: HouseResultStatus
  reason: string | null
  query: string
  matchedBy: 'address' | 'cadastral' | null
  house: HouseInfoResult['house']
  fields: HouseInfoField[]
  sources: HouseSourceReport[]
  address: NormalizedAddress | null
  privateHouse: boolean
  checkedAt: string | null
  approved: Record<string, boolean>
  approvedAt: string | null
  approvedBy: string | null
  log: { at: string; event: string; message: string; by: string }[]
}

/** Что сохраняем в группу houseInfo */
export function groupFromResult(
  result: HouseInfoResult,
  previous: HouseInfoGroup | null,
  entry: { message: string; by: string },
): HouseInfoGroup {
  const log = [...(previous?.log || [])].slice(-19)
  log.push({ at: result.checkedAt, event: 'check', message: entry.message, by: entry.by })
  return {
    status: result.status,
    checkedAt: result.checkedAt,
    registry: HOUSE_REGISTRY.name,
    registryUrl: result.house?.url || null,
    houseId: result.house?.id || null,
    houseAddress: result.house?.address || null,
    registryUpdatedAt: result.house?.updatedAt || null,
    plotCadastral: result.house?.plotCadastral || null,
    query: result.query,
    matchedBy: result.matchedBy,
    fields: result.fields,
    sources: result.sources,
    addressParts: result.address,
    privateHouse: result.privateHouse,
    note: result.reason,
    approved: (previous?.approved as Record<string, boolean>) || {},
    approvedAt: previous?.approvedAt || null,
    approvedBy: previous?.approvedBy || null,
    log,
  }
}

/**
 * Сохранить снимок проверки в карточку объекта. Возвращает снимок в том же
 * виде, что и чтение из карточки, — ответ агенту не зависит от того, легла
 * ли запись в базу.
 */
export async function persistHouseInfo(
  payload: Payload,
  objectId: number,
  result: HouseInfoResult,
  actor: { name: string },
): Promise<SavedHouseInfo> {
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const previous = ((doc as unknown as { houseInfo?: HouseInfoGroup } | null)?.houseInfo || null) as HouseInfoGroup | null
  const group = groupFromResult(result, previous, { message: result.reason || 'Проверено', by: actor.name })
  try {
    const updated = await payload.update({
      collection: 'objects',
      id: objectId,
      depth: 0,
      overrideAccess: true,
      data: { houseInfo: group },
    })
    return savedHouseInfo(updated)
  } catch (error) {
    // Запись не прошла — свежий результат проверки всё равно показываем
    console.error('Persist house info error:', error)
    return savedHouseInfo({ houseInfo: group })
  }
}

/**
 * Снимок «Данных о доме» для ответа сотруднику: кадастровые сведения
 * (номер земельного участка дома по реестру) видит только администратор —
 * остальным сотрудникам поля нет в ответе вовсе (см. access поля в
 * коллекции Objects и маршруты /api/objects/house-data).
 */
export function houseInfoForStaff(saved: SavedHouseInfo, isAdmin: boolean): SavedHouseInfo {
  if (isAdmin || !saved.house?.plotCadastral) return saved
  return { ...saved, house: { ...saved.house, plotCadastral: null } }
}

/** Массив полей снимка из карточки */
const fieldsFromGroup = (group: HouseInfoGroup | null): HouseInfoField[] =>
  Array.isArray(group?.fields) ? (group.fields as HouseInfoField[]) : []

/** Массив отчётов по источникам из карточки */
const sourcesFromGroup = (group: HouseInfoGroup | null): HouseSourceReport[] =>
  Array.isArray(group?.sources) ? (group.sources as HouseSourceReport[]) : []

/** Разобранный адрес из карточки */
const addressFromGroup = (group: HouseInfoGroup | null): NormalizedAddress | null => {
  const value = group?.addressParts
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const addr = value as NormalizedAddress
  return addr.query ? addr : null
}

/** Карта подтверждений из карточки */
export const approvedFromGroup = (group: HouseInfoGroup | null): Record<string, boolean> => {
  const value = group?.approved
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, boolean> = {}
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    if (flag === true) out[key] = true
  }
  return out
}

/** Прочитать снимок «Данных о доме» из документа объекта */
export function savedHouseInfo(doc: unknown): SavedHouseInfo {
  const group = ((doc as { houseInfo?: HouseInfoGroup } | null)?.houseInfo || null) as HouseInfoGroup | null
  return {
    status: (group?.status as HouseResultStatus) || 'unavailable',
    reason: group?.note || null,
    query: group?.query || '',
    matchedBy: (group?.matchedBy as 'address' | 'cadastral' | null) || null,
    house: group?.registryUrl
      ? {
          id: group.houseId || '',
          address: group.houseAddress || '',
          url: group.registryUrl,
          updatedAt: group.registryUpdatedAt || null,
          plotCadastral: group.plotCadastral || null,
        }
      : null,
    fields: fieldsFromGroup(group),
    sources: sourcesFromGroup(group),
    address: addressFromGroup(group),
    privateHouse: Boolean(group?.privateHouse),
    checkedAt: group?.checkedAt || null,
    approved: approvedFromGroup(group),
    approvedAt: group?.approvedAt || null,
    approvedBy: group?.approvedBy || null,
    log: (group?.log || []).map((e) => ({
      at: e.at || '',
      event: e.event || '',
      message: e.message || '',
      by: e.by || '',
    })),
  }
}

// --- Подтверждение агентом ----------------------------------------------------

export interface ApproveInput {
  /** Какие характеристики агент подтвердил */
  keys: HouseFieldKey[]
  /** Перенести подтверждённое в поля карточки (год, этажность, материал стен) */
  applyToCard: boolean
  /** Добавить подтверждённые характеристики в описание объекта */
  toDescription: boolean
  actor: { name: string }
  now?: string
}

export interface ApproveResult {
  ok: boolean
  error?: string
  saved?: SavedHouseInfo
  /** Что ушло клиенту */
  items?: HousePublicItem[]
  /** Какие поля карточки изменены */
  patch?: { builtYear?: number; totalFloors?: number; buildingType?: string }
  /** Добавленный абзац описания */
  paragraph?: string
}

/**
 * Подтверждение характеристик агентом. Единая точка правды: только после
 * этого значения попадают в публичную группу housePublic (её видит клиент).
 * Значения без подтверждённого совпадения адреса («Требует проверки»)
 * подтвердить нельзя.
 */
export async function approveHouseInfo(
  payload: Payload,
  objectId: number,
  input: ApproveInput,
): Promise<ApproveResult> {
  const now = input.now || new Date().toISOString()
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return { ok: false, error: 'Объект не найден' }

  const saved = savedHouseInfo(doc)
  if (!saved.fields.length) return { ok: false, error: 'Сначала получите данные о доме' }

  // Подтвердить можно только найденные значения: «не найдено» и «требует
  // проверки» подтверждению не подлежат
  const keys = new Set(input.keys)
  const approved: Record<string, boolean> = {}
  for (const field of saved.fields) {
    if (keys.has(field.key) && field.status === 'confirmed') approved[field.key] = true
  }
  if (!Object.keys(approved).length) {
    return { ok: false, error: 'Не выбрано ни одного подтверждённого значения' }
  }

  const items = approvedItems(saved.fields, approved, now)
  const patch = input.applyToCard ? cardPatchFromApproved(saved.fields, approved) : {}
  const paragraph = input.toDescription ? descriptionParagraph(items) : ''

  const previousGroup = ((doc as { houseInfo?: HouseInfoGroup }).houseInfo || null) as HouseInfoGroup | null
  const log = [...(previousGroup?.log || [])].slice(-19)
  const eventMessage = [
    `Подтверждено: ${items.map((i) => i.label.toLowerCase()).join(', ')}`,
    Object.keys(patch).length ? 'перенесено в карточку' : '',
    paragraph ? 'добавлено в описание' : '',
  ]
    .filter(Boolean)
    .join('; ')
  log.push({ at: now, event: 'approve', message: eventMessage, by: input.actor.name })

  const data: Record<string, unknown> = {
    houseInfo: {
      ...(previousGroup || {}),
      approved,
      approvedAt: now,
      approvedBy: input.actor.name,
      log,
    },
    housePublic: {
      items,
      confirmedAt: now,
    },
    ...patch,
  }

  if (paragraph) {
    data.description = appendParagraph(doc, paragraph)
  }

  await payload.update({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true, data })
  const updated = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)

  return {
    ok: true,
    saved: updated ? savedHouseInfo(updated) : undefined,
    items,
    patch,
    paragraph,
  }
}

/**
 * Абзац в конец описания объекта. Описание — richText (lexical): новые
 * абзацы добавляем к существующим, ничего не перезаписывая.
 */
export function appendParagraph(doc: unknown, text: string): unknown {
  const paragraph = paragraphNode(text) as { root: { children: unknown[] } }
  const current = (doc as { description?: { root?: { children?: unknown[] } } } | null)?.description
  const children = Array.isArray(current?.root?.children) ? current!.root!.children!.slice() : []
  // Пустой абзац перед характеристиками — текст не слипается с описанием
  return {
    root: {
      children: [
        ...children,
        { children: [{ text: '', type: 'text', version: 1 }], type: 'paragraph', version: 1 },
        ...paragraph.root.children,
      ],
      type: 'root',
      version: 1,
    },
  }
}

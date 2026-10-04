/**
 * Защита от передачи персональных данных во внешние ИИ-сервисы.
 *
 * Единственный канал обращения к внешнему ИИ в проекте — задачи ИИ-агента:
 * CRM кладёт текст в очередь `agent-tasks`, воркер (tools/agent-worker) читает
 * её и запускает Claude Code CLI, а тот ходит в модель — DeepSeek
 * (`api.deepseek.com`) или ChatGPT через локальный прокси claudex (порт 4000,
 * дальше — chatgpt.com). Значит, всё, что попадает в `agent-tasks.prompt`,
 * уходит за пределы сервера, поэтому текст задачи проверяем ДО постановки в
 * очередь.
 *
 * Правило проекта: запрос с персональными данными наружу не отправляется.
 * Модуль ищет ФИО, телефоны, email, адреса, паспортные данные, СНИЛС, ИНН,
 * дату рождения, банковские реквизиты и данные личных документов; при
 * совпадении задача блокируется — см. вызовы в
 * `src/app/api/agent/tasks/route.ts` (маршрут CRM) и в хуке коллекции
 * `src/payload/collections/AgentTasks.ts` (Payload REST и админка). Обе точки
 * серверные, поэтому ограничение нельзя обойти запросом из браузера.
 *
 * Разрешённый запрос дополнительно проходит обезличивание (`anonymizePrompt`):
 * совпадения заменяются подписями вида «[телефон скрыто]». Это второй слой —
 * если проверка что-то не отнесла к блокирующим, идентификатор всё равно не
 * уйдёт в очередь в открытом виде.
 *
 * Модуль чистый (без импортов и серверных API) — используется и в маршруте,
 * и в хуке Payload.
 */

export type PiiCategory =
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'passport'
  | 'snils'
  | 'inn'
  | 'birthdate'
  | 'bank'
  | 'document'

/** Человекочитаемые названия категорий — для сообщения об ошибке и отчёта. */
export const PII_CATEGORY_LABELS: Record<PiiCategory, string> = {
  name: 'ФИО',
  phone: 'телефон',
  email: 'электронная почта',
  address: 'адрес',
  passport: 'паспортные данные',
  snils: 'СНИЛС',
  inn: 'ИНН',
  birthdate: 'дата рождения',
  bank: 'банковские реквизиты',
  document: 'личные документы',
}

export interface PiiCheckResult {
  /** true — персональных данных не нашли, запрос можно ставить в очередь. */
  safe: boolean
  /** Найденные категории (без повторов, в порядке проверки). */
  categories: PiiCategory[]
}

/** Совпадение в тексте: позиция, длина и сам фрагмент (для маскировки). */
interface Span {
  start: number
  end: number
  text: string
}

/**
 * Все совпадения регулярного выражения с позициями. Флаги всегда добавляются
 * `g`, поэтому состояние lastIndex не перетекает между вызовами.
 */
function spansFromRegex(text: string, source: string, flags = 'gi'): Span[] {
  const re = new RegExp(source, flags.includes('g') ? flags : `${flags}g`)
  const spans: Span[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (!match[0]) {
      re.lastIndex++ // пустое совпадение — иначе цикл зациклится
      continue
    }
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] })
  }
  return spans
}

/** Совпадения фразы целиком (без учёта регистра) — для составных терминов. */
function phraseSpans(text: string, phrases: string[]): Span[] {
  const spans: Span[] = []
  const lower = text.toLowerCase()
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase()
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      spans.push({ start: at, end: at + needle.length, text: text.slice(at, at + needle.length) })
      from = at + needle.length
    }
  }
  return spans
}

/**
 * Совпадения отдельных слов по границам (кириллица+латиница). Обычный `\b` для
 * кириллицы не работает, поэтому границы заданы явно: «инн» не должен ловиться
 * внутри «инновация», «снилс» — внутри произвольного слова.
 */
function wordSpans(text: string, words: string[]): Span[] {
  const sources = words.map((w) => `(?<![а-яёa-z])${w}(?![а-яёa-z])`).join('|')
  return spansFromRegex(text, sources)
}

// --- Телефоны ---------------------------------------------------------------

const PHONE_SOURCES = [
  // РФ: +7/8/7 и одиннадцать цифр с любыми разделителями: +7 988 123-45-67
  String.raw`(?<!\d)(?:\+7|8|7)[\s\-().]*\(?\d{3}\)?[\s\-().]*\d{3}[\s\-().]*\d{2}[\s\-().]*\d{2}(?!\d)`,
  // Международный: «+» и 8–15 цифр (номера других стран)
  String.raw`(?<!\d)\+\d[\d\s\-().]{6,17}\d(?!\d)`,
]

function findPhones(text: string): Span[] {
  return PHONE_SOURCES.flatMap((source) => spansFromRegex(text, source))
}

// --- Email ------------------------------------------------------------------

const EMAIL_SOURCE =
  String.raw`[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+`

function findEmails(text: string): Span[] {
  return spansFromRegex(text, EMAIL_SOURCE)
}

// --- Паспорт ----------------------------------------------------------------

function findPassport(text: string): Span[] {
  const spans: Span[] = []
  // «серия 45 06», «45 06 № 123456» — реквизиты без слова «паспорт»
  spans.push(...spansFromRegex(text, String.raw`(?:серия|серии)\s*:?\s*\d{2}\s?\d{2}(?!\d)`))
  spans.push(...spansFromRegex(text, String.raw`(?<!\d)\d{2}\s?\d{2}\s?№\s?\d{6}(?!\d)`))
  // Слово «паспорт» в личном смысле. Техпаспорт недвижимости («паспорт дома»,
  // «технический паспорт», «паспорт объекта», «паспорт БТИ») — не персональные
  // данные объекта, а характеристика дома, поэтому его пропускаем.
  for (const span of wordSpans(text, ['паспорт', 'паспорта', 'паспорте', 'паспортные', 'загранпаспорт'])) {
    const before = text.slice(Math.max(0, span.start - 24), span.start).toLowerCase()
    const after = text.slice(span.end, span.end + 24).toLowerCase()
    if (before.includes('техническ')) continue
    if (/(?:дома|объекта|бти|квартиры)/.test(after)) continue
    spans.push(span)
  }
  // Реквизиты, которые не пишут без паспорта
  spans.push(...phraseSpans(text, ['кем выдан', 'код подразделения']))
  return spans
}

// --- СНИЛС и ИНН ------------------------------------------------------------

function findSnils(text: string): Span[] {
  // Формат 123-456-789 00 (одиннадцать цифр, разделители обязательны — иначе
  // это может быть любой длинный номер, а не СНИЛС)
  return [
    ...wordSpans(text, ['снилс', 'снилса']),
    ...spansFromRegex(text, String.raw`(?<!\d)\d{3}[-\s]\d{3}[-\s]\d{3}[-\s]\d{2}(?!\d)`),
  ]
}

function findInn(text: string): Span[] {
  // ИНН без значения (название поля) не блокируем — блокируем реквизит:
  // слово «ИНН» и рядом 10 (юрлицо) или 12 (физлицо) цифр
  return spansFromRegex(text, String.raw`(?<![а-яёa-z])инн(?![а-яёa-z])[^\d\n]{0,25}?\d{10,12}(?!\d)`)
}

// --- Дата и место рождения --------------------------------------------------

function findBirthdate(text: string): Span[] {
  return [
    // Падежи: «дата/дату/дате рождения», «день/дня рождения», «место рождения»
    ...spansFromRegex(text, String.raw`(?:дат[ауеы]|дн[яю]|мест[аеоу]|год[ауе]?)\s+рождени[яею]`),
    ...wordSpans(text, ['родился', 'родилась']),
  ]
}

// --- Банковские реквизиты ---------------------------------------------------

/** Контрольная сумма Луна — отсекает произвольные 16-значные числа. */
function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48
    if (double) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    double = !double
  }
  return sum % 10 === 0
}

function findBank(text: string): Span[] {
  const spans = phraseSpans(text, [
    'номер карты',
    'номер банковской карты',
    'банковская карта',
    'банковской карты',
    'банковские реквизиты',
    'расчётный счёт',
    'расчетный счет',
    'лицевой счёт',
    'лицевой счет',
    'корр. счёт',
    'корр счет',
    'cvv',
    'cvc',
    'пин-код',
    'pin-код',
  ])
  spans.push(...wordSpans(text, ['бик']))
  // Номер карты: 16 цифр (с разделителями), прошедшие проверку Луна
  for (const span of spansFromRegex(text, String.raw`(?<!\d)(?:\d[ \-]?){15}\d(?!\d)`)) {
    const digits = span.text.replace(/\D/g, '')
    if (digits.length === 16 && luhnValid(digits)) spans.push(span)
  }
  return spans
}

// --- Адрес ------------------------------------------------------------------

const ADDRESS_SOURCES = [
  // Улица с названием: «ул. Ленина», «проспект Мира», «шоссе Дружбы»
  String.raw`(?:^|[\s,;(])(?:ул|улица|проспект|пр-т|просп|переулок|пер|бульвар|бул|шоссе|проезд|набережная|наб|площадь|пл|микрорайон|мкр)\.?\s+[А-ЯЁ][а-яё]`,
  // Дом/квартира/строение с номером: «д. 5», «кв. 12», «корпус 3»
  String.raw`(?:^|[\s,;(])(?:дом|д|квартира|кв|корпус|корп|строение|владение|влд|помещение|офис)\.?\s*№?\s*\d`,
  // Город: «г. Владикавказ»
  String.raw`(?:^|[\s,;(])г\.\s*[А-ЯЁ][а-яё]`,
  // Почтовый индекс рядом со словом
  String.raw`индекс[^\n]{0,15}?\d{6}`,
]

function findAddress(text: string): Span[] {
  return [
    ...ADDRESS_SOURCES.flatMap((source) => spansFromRegex(text, source)),
    ...phraseSpans(text, [
      'адрес регистрации',
      'адрес прописки',
      'по месту жительства',
      'место жительства',
      'зарегистрирован по адресу',
      'зарегистрирована по адресу',
    ]),
    ...wordSpans(text, ['прописан', 'прописана', 'прописка']),
  ]
}

// --- Личные документы -------------------------------------------------------

const DOCUMENT_PHRASES = [
  'свидетельство о рождении',
  'свидетельство о браке',
  'водительское удостоверение',
  'военный билет',
  'полис омс',
  'медицинский полис',
  'страховое свидетельство',
  'выписка из егрн',
  'выписка егрн',
]

function findDocuments(text: string): Span[] {
  return phraseSpans(text, DOCUMENT_PHRASES)
}

// --- ФИО --------------------------------------------------------------------

// Распространённые русские имена: помогают отличить ФИО от прочих заглавных
// слов («Иванов Иван», «Анна Петрова»). Список не претендует на полноту —
// отчество и сочетание «фамилия + инициалы» ловятся отдельно.
const FIRST_NAMES = new Set([
  'Александр', 'Александра', 'Алексей', 'Алина', 'Алиса', 'Алла', 'Анастасия',
  'Анатолий', 'Ангелина', 'Андрей', 'Анна', 'Антон', 'Антонина', 'Аркадий',
  'Арсений', 'Артём', 'Артем', 'Артур', 'Аслан', 'Алан', 'Азамат', 'Борис',
  'Вадим', 'Валентин', 'Валентина', 'Валерий', 'Валерия', 'Варвара', 'Василий',
  'Вера', 'Вероника', 'Виктор', 'Виктория', 'Виталий', 'Владимир', 'Владислав',
  'Вячеслав', 'Галина', 'Геннадий', 'Георгий', 'Глеб', 'Григорий', 'Давид',
  'Даниил', 'Данил', 'Дарья', 'Денис', 'Диана', 'Дмитрий', 'Ева', 'Евгений',
  'Евгения', 'Егор', 'Екатерина', 'Елена', 'Елизавета', 'Жанна', 'Заур',
  'Зарина', 'Зинаида', 'Ибрагим', 'Иван', 'Игорь', 'Илья', 'Инна', 'Ирина',
  'Карина', 'Кирилл', 'Константин', 'Кристина', 'Ксения', 'Лариса', 'Лев',
  'Леонид', 'Лидия', 'Любовь', 'Людмила', 'Магомед', 'Мадина', 'Максим',
  'Маргарита', 'Марина', 'Мария', 'Марк', 'Матвей', 'Милана', 'Михаил',
  'Мурат', 'Надежда', 'Наталия', 'Наталья', 'Никита', 'Николай', 'Нина',
  'Оксана', 'Олег', 'Ольга', 'Павел', 'Пётр', 'Петр', 'Полина', 'Раиса',
  'Регина', 'Римма', 'Роман', 'Руслан', 'Светлана', 'Сергей', 'Сослан',
  'София', 'Софья', 'Станислав', 'Степан', 'Таймураз', 'Тамара', 'Татьяна',
  'Тимофей', 'Тимур', 'Ульяна', 'Фатима', 'Фёдор', 'Федор', 'Хетаг', 'Эдуард',
  'Эльдар', 'Эрик', 'Юлия', 'Юрий', 'Яна', 'Ярослав',
])

const NAME_TOKEN = /[А-ЯЁ][а-яё-]{1,}/g
// Отчество с учётом падежей: «Иванович», «Ивановича», «Ивановной»
const PATRONYMIC_RE = /(?:ович|евич)(?:а|у|е|ем)?$|(?:овн|евн|ичн|иничн)(?:а|ы|е|у|ой)$/
// Типичная фамилия с учётом падежей: «Петров», «Петрова», «Петровой», «Гаглоев».
// Список окончаний приблизительный — этого достаточно, чтобы отличить фамилию
// («Клиент Иванов») от обычного слова с большой буквы.
const SURNAME_RE =
  /(?:ов|ев|ёв|ин|ын|ский|ская|цкий|цкая|их|ых|енко|дзе|швили|ук|юк|ко|ти|ты)(?:[а-яё]{1,3})?$/
// «Иванов И.», «Иванов И.О.»
const SURNAME_INITIALS = String.raw`[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ]\.(?:\s?[А-ЯЁ]\.)?`

// Основы имён без последней гласной: «Анна» → «анн», чтобы ловить падежи
// («Анне», «Анну»). Сравниваем целую основу, а не префикс, поэтому «Европа»
// не притворяется «Евой», а «Ромашка» — «Романом».
const FIRST_STEMS = [...FIRST_NAMES].map((name) => {
  const lower = name.toLowerCase()
  return 'аеёиоуыэюяйь'.includes(lower[lower.length - 1]) ? lower.slice(0, -1) : lower
})

function isFirstName(token: string): boolean {
  const lower = token.toLowerCase()
  return FIRST_STEMS.some(
    (stem) => lower === stem || (stem.length >= 3 && lower.startsWith(stem) && lower.length - stem.length <= 3),
  )
}

function findNames(text: string): Span[] {
  const spans = spansFromRegex(text, SURNAME_INITIALS)
  const tokens = [...text.matchAll(NAME_TOKEN)].map((match) => ({
    value: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
  const kind = tokens.map((token) =>
    PATRONYMIC_RE.test(token.value)
      ? 'patronymic'
      : SURNAME_RE.test(token.value)
        ? 'surname'
        : isFirstName(token.value)
          ? 'first'
          : 'other',
  )
  // Соседство считаем только через ровно один пробел: перенос строки не склеивает
  const areAdjacent = (a: number, b: number) => text.slice(tokens[a].end, tokens[b].start) === ' '

  for (let i = 0; i < tokens.length; i++) {
    if (kind[i] === 'other') continue
    if (kind[i] === 'patronymic') {
      // Отчество редко стоит в одиночку: тянем соседние имя и фамилию, чтобы в
      // запросе не осталось открытой фамилии
      let start = i
      let end = i
      for (let back = 0; back < 2 && start > 0 && areAdjacent(start - 1, start) && kind[start - 1] !== 'other'; back++) {
        start--
      }
      if (end + 1 < tokens.length && areAdjacent(end, end + 1) && kind[end + 1] !== 'other') end++
      spans.push({
        start: tokens[start].start,
        end: tokens[end].end,
        text: text.slice(tokens[start].start, tokens[end].end),
      })
      continue
    }
    // Пара «имя + фамилия» в любом порядке: «Иванов Иван», «Анна Петрова»
    const next = i + 1
    if (next < tokens.length && kind[next] !== 'other' && areAdjacent(i, next)) {
      const pair =
        (kind[i] === 'first' && kind[next] === 'surname') ||
        (kind[i] === 'surname' && kind[next] === 'first')
      if (pair) {
        spans.push({
          start: tokens[i].start,
          end: tokens[next].end,
          text: text.slice(tokens[i].start, tokens[next].end),
        })
        i++ // второе слово уже вошло в совпадение
      }
    }
  }
  return spans
}

// --- Свод правил ------------------------------------------------------------

const RULES: Array<{ category: PiiCategory; find: (text: string) => Span[] }> = [
  { category: 'phone', find: findPhones },
  { category: 'email', find: findEmails },
  { category: 'passport', find: findPassport },
  { category: 'snils', find: findSnils },
  { category: 'inn', find: findInn },
  { category: 'birthdate', find: findBirthdate },
  { category: 'bank', find: findBank },
  { category: 'address', find: findAddress },
  { category: 'document', find: findDocuments },
  { category: 'name', find: findNames },
]

/**
 * Проверка запроса перед постановкой в очередь ИИ-агента. Пустой или
 * нестроковый текст считается безопасным (отсекается обычной валидацией).
 */
export function checkPromptForPii(text: string): PiiCheckResult {
  const source = typeof text === 'string' ? text : ''
  const categories: PiiCategory[] = []
  for (const rule of RULES) {
    if (!categories.includes(rule.category) && rule.find(source).length > 0) {
      categories.push(rule.category)
    }
  }
  return { safe: categories.length === 0, categories }
}

/**
 * Обезличивание: заменяет найденные персональные данные подписями
 * («[телефон скрыто]»). Второй слой защиты — применяется к разрешённому
 * запросу перед записью в очередь. Функция идемпотентна: подписи повторно
 * не распознаются как ПД.
 */
export function anonymizePrompt(text: string): string {
  const source = typeof text === 'string' ? text : ''
  const spans: Array<Span & { category: PiiCategory }> = []
  for (const rule of RULES) {
    for (const span of rule.find(source)) spans.push({ ...span, category: rule.category })
  }
  if (spans.length === 0) return source
  // Слева направо; при пересечении выигрывает то, что началось раньше
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const parts: string[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    parts.push(source.slice(cursor, span.start), `[${PII_CATEGORY_LABELS[span.category]} скрыто]`)
    cursor = span.end
  }
  parts.push(source.slice(cursor))
  return parts.join('')
}

/**
 * Единый текст отказа для маршрута и хука: перечисляет категории, но никогда
 * не повторяет сами данные — чтобы ПД не осели в ответе, логах или журнале.
 */
export function piiBlockMessage(categories: PiiCategory[]): string {
  const labels = categories.map((category) => PII_CATEGORY_LABELS[category]).join(', ')
  return (
    `Запрос не отправлен: обнаружены персональные данные (${labels}). ` +
    'По правилам безопасности внешний ИИ-сервис получает только запросы без ПД — ' +
    'уберите эти данные и отправьте снова.'
  )
}

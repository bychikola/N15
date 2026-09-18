/**
 * Площадь участков: единицы измерения «м²», «сотки» и «гектары».
 *
 * В БД площадь ВСЕГДА хранится в м² (поля area и plotArea) — так считают и
 * фильтр каталога, и движок рыночной оценки (ставки участков — за сотку,
 * см. src/lib/valuation.ts). Единица, в которой агент вводил площадь,
 * хранится отдельно (areaUnit у участка, plotAreaUnit у участка дома) и
 * нужна лишь для показа: «6 соток» или «1,2 га», а не «12000 м²».
 *
 * Дробные значения — норма (5,5 сотки; 1,2 га): поля ввода принимают и
 * «5,5», и «5.5» (см. parseAreaNumber), а конверсия округляет м² до сотых.
 *
 * Файл самодостаточен (без импортов) — используется и на сервере,
 * и в браузере, и в быстрых проверках node --experimental-strip-types.
 */

export type AreaUnit = 'sqm' | 'are' | 'ha'

/** 1 сотка = 100 м² */
export const SQM_PER_ARE = 100
/** 1 гектар = 10 000 м² = 100 соток */
export const SQM_PER_HA = 10_000

/** Сколько м² в единице — хранение и фильтры всегда в м² */
export const SQM_PER_UNIT: Record<AreaUnit, number> = { sqm: 1, are: SQM_PER_ARE, ha: SQM_PER_HA }

/** Единица площади из значения: неизвестное/пустое (старые объекты) — м² */
export const areaUnitOf = (v: unknown): AreaUnit => (v === 'are' || v === 'ha' ? v : 'sqm')

/** Число в единицах → м²: 5,5 сотки → 550; 1,2 га → 12000 */
export const unitToSqm = (v: number, unit: AreaUnit): number =>
  Math.round(v * SQM_PER_UNIT[unit] * 100) / 100

/** м² → число в единицах: 12000 м² → 1,2 га; 600 м² → 6 соток */
export const sqmToUnit = (v: number, unit: AreaUnit): number =>
  unit === 'sqm' ? v : v / SQM_PER_UNIT[unit]

/** Перевод площади из м² в сотки и обратно */
export const sqmToAre = (v: number): number => sqmToUnit(v, 'are')
export const areToSqm = (v: number): number => unitToSqm(v, 'are')

/** Перевод площади из м² в гектары и обратно */
export const sqmToHa = (v: number): number => sqmToUnit(v, 'ha')
export const haToSqm = (v: number): number => unitToSqm(v, 'ha')

/** Парсинг числа из текстового поля: принимает и «11,5», и «11.5» */
export const parseAreaNumber = (v: string): number | null => {
  const s = v.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Число для текстового поля: без хвостовых нулей и ошибок двоичной арифметики */
export const areaNumberText = (v: number): string => {
  if (!Number.isFinite(v)) return ''
  const r = Math.round(v * 1e6) / 1e6
  return String(r)
}

/**
 * Индекс формы слова по числу — для словарных форм { one, few, many }
 * (русские правила, они же у «сотки», «гектара» и «населённого пункта»):
 *   1 → one («1 сотка»), 2–4 → few («3 сотки»), 5–20 → many («6 соток»),
 *   дробные → few, родительный единственного: «5,5 сотки», «1,2 гектара»
 *   (кроме 11–14 в целой части: «11,5 соток»).
 */
export function pluralIndex(n: number): 0 | 1 | 2 {
  const abs = Math.abs(n)
  const int = Math.floor(abs)
  const mod100 = int % 100
  if (mod100 >= 11 && mod100 <= 14) return 2
  // Дробные значения («5,5 сотки», «1,2 га») — как «полтора/пять с половиной»:
  // существительное в родительном единственного, то есть форма few
  if (abs !== int) return 1
  const last = int % 10
  if (last === 1) return 0
  if (last >= 2 && last <= 4) return 1
  return 2
}

/** Форма слова «сотка» по числу — частный случай pluralIndex */
export const arePluralIndex = pluralIndex

/** Формы слова единицы площади для показа (см. словари: catalog.areaUnits) */
export interface AreaUnitWords {
  one: string
  few: string
  many: string
}

/**
 * Формы слов «сотка» и «гектар» — в словаре catalog как areaUnits и
 * hectareUnits. У «м²» склонять нечего, поэтому пары для неё нет.
 */
export interface AreaUnitForms {
  are: AreaUnitWords
  ha: AreaUnitWords
}

/** Формы слова для единицы: у «м²» — null (слово не нужно) */
export const unitWordsFor = (unit: AreaUnit, forms: AreaUnitForms): AreaUnitWords | null =>
  unit === 'are' ? forms.are : unit === 'ha' ? forms.ha : null

/** Слово единицы в нужной форме для числа (6 соток, 1,2 гектара) */
export const unitWord = (value: number, words: AreaUnitWords): string =>
  [words.one, words.few, words.many][pluralIndex(value)]

/** Слово «сотка» в нужной форме для числа соток */
export const areUnitWord = (sotki: number, words: AreaUnitWords): string => unitWord(sotki, words)

/**
 * Площадь одной строкой для показа на сайте: м² — как есть (без разделителей
 * разрядов, как показывали раньше), участки, сохранённые в сотках или
 * гектарах, — «6 соток» / «1,2 га» (как ввёл агент). numFmt — форматирование
 * числа (например, ru-RU с запятой); null — если площади нет.
 */
export function areaHuman(
  areaM2: number | null | undefined,
  unit: AreaUnit | undefined,
  forms: AreaUnitForms,
  numFmt: (n: number) => string = String,
): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null
  const u = areaUnitOf(unit)
  if (u === 'sqm') return `${areaM2} м²`
  const value = sqmToUnit(areaM2, u)
  const words = unitWordsFor(u, forms)
  return words ? `${numFmt(value)} ${unitWord(value, words)}` : `${areaM2} м²`
}

/**
 * Площадь участков: единицы измерения «м²» и «сотки».
 *
 * В БД площадь ВСЕГДА хранится в м² (поле area) — так считают и фильтр
 * каталога, и движок рыночной оценки (ставки участков — за сотку,
 * см. src/lib/valuation.ts). Единица, в которой агент вводил площадь,
 * хранится отдельно (areaUnit, только для категории «земельный участок»)
 * и нужна лишь для показа: «6 соток», а не «600 м²».
 *
 * Файл самодостаточен (без импортов) — используется и на сервере,
 * и в браузере, и в быстрых проверках node --experimental-strip-types.
 */

export type AreaUnit = 'sqm' | 'are'

/** 1 сотка = 100 м² */
export const SQM_PER_ARE = 100

/** Перевод площади из м² в сотки и обратно */
export const sqmToAre = (v: number): number => v / SQM_PER_ARE
export const areToSqm = (v: number): number => v * SQM_PER_ARE

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
 * Индекс формы слова «сотка» по числу — для словарных форм { one, few, many }:
 *   1 → one («1 сотка»), 2–4 → few («3 сотки»), 5–20 → many («6 соток»),
 *   дробные: «1,5 сотки», «2,5 сотки», «11,5 соток».
 */
export function arePluralIndex(n: number): 0 | 1 | 2 {
  const abs = Math.abs(n)
  const fractional = abs !== Math.floor(abs)
  const int = Math.floor(abs)
  const mod100 = int % 100
  if (mod100 >= 11 && mod100 <= 14) return 2
  const last = int % 10
  if (last === 1) return fractional ? 1 : 0
  if (last >= 2 && last <= 4) return 1
  return 2
}

/** Формы слова «сотка» для показа (см. словари: catalog.areaUnits) */
export interface AreaUnitWords {
  one: string
  few: string
  many: string
}

/** Слово «сотка» в нужной форме для числа соток */
export const areUnitWord = (sotki: number, words: AreaUnitWords): string =>
  [words.one, words.few, words.many][arePluralIndex(sotki)]

/**
 * Площадь одной строкой для показа на сайте: м² — как есть (без разделителей
 * разрядов, как показывали раньше), участки, сохранённые в сотках, —
 * «6 соток» / «11,5 соток» (как ввёл агент). numFmt — форматирование числа
 * соток (например, ru-RU с запятой); null — если площади нет.
 */
export function areaHuman(
  areaM2: number | null | undefined,
  unit: AreaUnit | undefined,
  words: AreaUnitWords,
  numFmt: (n: number) => string = String,
): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null
  if (unit === 'are') {
    const sotki = areaM2 / SQM_PER_ARE
    return `${numFmt(sotki)} ${areUnitWord(sotki, words)}`
  }
  return `${areaM2} м²`
}

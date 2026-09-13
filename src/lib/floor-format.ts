/**
 * Этажность дома для показа: «1 этаж», «2 этажа», «5 этажей».
 *
 * Само число этажей живёт в поле объекта totalFloors (в форме CRM у дома и
 * таунхауса это выпадающий список «1/2/3 этажа» + своё значение), поэтажные
 * описания помещений — в floorDescriptions (см. src/payload/collections/
 * Objects.ts). Файл самодостаточен (кроме правила склонения) — используется
 * и на сервере, и в браузере.
 */

import { arePluralIndex } from './area-format'

/** Формы слова «этаж» для показа (см. словари: object.floorUnits) */
export interface FloorWords {
  one: string
  few: string
  many: string
}

/** Слово «этаж» в нужной форме для числа этажей */
export const floorUnitWord = (floors: number, words: FloorWords): string =>
  [words.one, words.few, words.many][arePluralIndex(floors)]

/**
 * Этажность одной строкой: «2 этажа», «5 этажей». numFmt — форматирование
 * числа (например, ru-RU с разделителями разрядов); null — если этажность
 * не указана.
 */
export function floorHuman(
  floors: number | null | undefined,
  words: FloorWords,
  numFmt: (n: number) => string = String,
): string | null {
  if (floors == null || !Number.isFinite(floors) || floors <= 0) return null
  return `${numFmt(floors)} ${floorUnitWord(floors, words)}`
}

/**
 * Подпись отдельного этажа в описании помещений: «1 этаж», «2 этаж»
 * (шаблон словаря — «%d этаж»).
 */
export const floorLabel = (n: number, tpl: string): string => tpl.replace(/%d/, String(n))

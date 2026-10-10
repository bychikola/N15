/**
 * Рынок жилья объекта — вторичное жильё или новостройка (поле market
 * коллекции objects). Общий справочник для формы CRM и схемы коллекции:
 * список и порядок значений в форме совпадают со значениями в базе.
 *
 * Пометка имеет смысл только для квартир: у остальных категорий значение
 * снимает сервер (см. нормализацию в Objects.ts), у объектов, заведённых до
 * появления поля, оно пустое — «не указано». Новостройкой может быть и уже
 * сданный дом: готовность дома на пометку не влияет, поэтому отдельного
 * признака «сдан/строится» здесь нет.
 *
 * От застройщика и ЖК пометка независима: связь developer/complex у объекта
 * необязательна, и форма показывает её по рынку (см. developerBlockApplies).
 */

export const OBJECT_MARKETS = [
  { value: 'secondary', label: 'Вторичное жильё' },
  { value: 'new', label: 'Новостройка' },
] as const

export type ObjectMarket = (typeof OBJECT_MARKETS)[number]['value']

/** Все коды рынка — сверка значений из запросов и справочника формы */
export const OBJECT_MARKET_VALUES: readonly string[] = OBJECT_MARKETS.map((m) => m.value)

export const isObjectMarket = (value: unknown): value is ObjectMarket =>
  typeof value === 'string' && OBJECT_MARKET_VALUES.includes(value)

/** Подпись рынка по коду: неизвестный код показываем как есть */
export const marketLabel = (value: string): string =>
  OBJECT_MARKETS.find((m) => m.value === value)?.label || value

/**
 * Нужен ли объекту блок «Застройщик и жилой комплекс».
 *
 * Выбор рынка меняет только квартиры: у вторичного жилья застройщика и ЖК не
 * бывает, поэтому у квартиры блок показываем, когда выбрана «Новостройка».
 * Сохранённую связь показываем независимо от пометки — иначе у карточки,
 * заведённой до появления выбора, застройщик пропал бы из формы.
 *
 * У остальных категорий блок остаётся как был: объектам новостройки в составе
 * ЖК (машино-места и коммерческие помещения, см. src/lib/complex-units.ts) и
 * прочим карточкам с застройщиком он по-прежнему нужен.
 */
export const developerBlockApplies = (
  category: string,
  market: string,
  hasRelationship: boolean,
): boolean => category !== 'apartment' || market === 'new' || hasRelationship

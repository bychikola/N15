/**
 * Варианты покупки объекта — множественный выбор в карточке CRM
 * (Objects.purchaseOptions), значки на обложке карточки каталога и фильтр
 * каталога.
 *
 * Агент отмечает, какие программы действуют по объекту. Список один на всё:
 * форма CRM, каталог, страница объекта и фильтры берут коды и правила отсюда,
 * подписи — из словаря (t.object.purchaseOptions и t.object.purchaseBadges).
 *
 * Семейная и военная ипотека — отдельные варианты, а не пометки к «Ипотеке»:
 * у каждой программы свои условия, банк и документы.
 */

/** Вариант покупки: код в базе и подпись для CRM (админка и форма работают
 *  по-русски; сайт переводит подписи сам — см. purchaseOptions в словаре) */
export const PURCHASE_OPTIONS = [
  { value: 'mortgage', label: 'Гражданская ипотека' },
  { value: 'familyMortgage', label: 'Семейная ипотека' },
  { value: 'militaryMortgage', label: 'Военная ипотека' },
  { value: 'installment', label: 'Рассрочка' },
  { value: 'maternityCapital', label: 'Материнский капитал' },
  { value: 'noDownPayment', label: 'Без первоначального взноса' },
] as const

export type PurchaseOption = (typeof PURCHASE_OPTIONS)[number]['value']

/** Все коды вариантов — сверка значений из URL и запросов (мусорные
 *  отбрасываем, как у прочих select-фильтров каталога) */
export const PURCHASE_OPTION_VALUES: readonly string[] = PURCHASE_OPTIONS.map((o) => o.value)

export const isPurchaseOption = (v: unknown): v is PurchaseOption =>
  typeof v === 'string' && PURCHASE_OPTION_VALUES.includes(v)

/**
 * Категории, к которым применимы варианты покупки: квартиры (новостройки —
 * тоже квартиры, отдельной категории у них нет), дома, таунхаусы и коммерция.
 */
const PURCHASE_CATEGORIES = ['apartment', 'house', 'townhouse', 'commercial']

/**
 * Есть ли у объекта блок «Варианты покупки». Блок только у продажи жилья и
 * коммерции: у аренды программ покупки не бывает, по земельным участкам
 * ипотечных программ агентство не ведёт (у участка в карточке только тип
 * сделки и цена).
 */
export const purchaseOptionsApply = (type?: string | null, category?: string | null): boolean =>
  type === 'sale' && PURCHASE_CATEGORIES.includes(category ?? '')

/** Ипотечные варианты: на обложке сворачиваются в общий значок «Ипотека» */
const MORTGAGE_OPTIONS: readonly PurchaseOption[] = ['mortgage', 'familyMortgage', 'militaryMortgage']

/**
 * Варианты, у которых есть значок на обложке: код подписи в словаре
 * (t.object.purchaseBadges). Материнского капитала и покупки без взноса
 * здесь нет: на обложке они не значатся, их видно в списке вариантов на
 * странице объекта (обложка не перегружается).
 */
export type PurchaseBadge = 'mortgage' | 'familyMortgage' | 'militaryMortgage' | 'installment'

const COVER_BADGE: Partial<Record<PurchaseOption, PurchaseBadge>> = {
  mortgage: 'mortgage',
  familyMortgage: 'familyMortgage',
  militaryMortgage: 'militaryMortgage',
  installment: 'installment',
}

/**
 * Значки вариантов покупки для обложки карточки.
 *
 * До двух вариантов значки точные: «Семейная ипотека» и «Военная ипотека» —
 * каждый сам за себя. От трёх вариантов обложка не перегружается: точные
 * ипотечные значки сворачиваются в обобщённые «Ипотека» и «Рассрочка», а
 * полный список доступных вариантов показывается внутри карточки объекта.
 */
export function purchaseBadges(options: readonly unknown[] | undefined | null): PurchaseBadge[] {
  const selected = (options ?? []).filter(isPurchaseOption)
  if (!selected.length) return []
  if (selected.length > 2) {
    return [
      selected.some((o) => MORTGAGE_OPTIONS.includes(o)) && 'mortgage',
      selected.includes('installment') && 'installment',
    ].filter((v): v is PurchaseBadge => !!v)
  }
  return selected.map((o) => COVER_BADGE[o]).filter((v): v is PurchaseBadge => !!v)
}

/**
 * Видимость направлений в публичной части сайта.
 *
 * Пока направление в списке скрытых, посетители его не видят: пунктов нет в
 * меню шапки и мобильном меню, карточках главной и раздела «Услуги», ссылках
 * каталога и выдаче поиска; прямые ссылки на страницу отдают 404. Сами
 * страницы, тексты в словаре, данные и настройки в CRM остаются на месте —
 * чтобы вернуть направление, достаточно убрать его ключ из списка.
 *
 * Ключи совпадают с адресами страниц: design и build — направления
 * /[lang]/services, foreign — /[lang]/foreign.
 */
export const PUBLIC_HIDDEN_DIRECTIONS = ['design', 'build', 'foreign'] as const

export type PublicDirectionKey = (typeof PUBLIC_HIDDEN_DIRECTIONS)[number]

/** Скрыто ли направление от посетителей (см. PUBLIC_HIDDEN_DIRECTIONS) */
export const isPublicDirectionHidden = (key: string): boolean =>
  (PUBLIC_HIDDEN_DIRECTIONS as readonly string[]).includes(key)

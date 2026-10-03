import type { Payload } from 'payload'

/**
 * Публичное чтение настроек сайта (глобал site-settings).
 *
 * Глобал содержит и витринные поля (телефоны, почта, адрес, соцсети, контент
 * «Об агентстве»), и служебные/административные. Чтобы новое административное
 * поле не утекло на публичные страницы само собой, здесь зафиксирован
 * whitelist: каждый вызов выбирает только нужные ему поля явным `select`,
 * а всё остальное в выборку не попадает.
 *
 * Чтение идёт через Local API с `overrideAccess: true` — публичный REST глобала
 * закрыт (access.read в SiteSettings), витрину отдают только серверные
 * компоненты и сервисы. `select` при этом всё равно ограничивает результат
 * ровно теми полями, что разрешены этим whitelist.
 */

/** Телефон из настроек сайта */
export interface PublicPhone {
  phone?: string | null
  label?: string | null
}

/** Ссылка на соцсеть из настроек сайта */
export interface PublicSocialLink {
  platform?: string | null
  url?: string | null
}

/** Контент страницы «Об агентстве» */
export interface AboutPageSettings {
  heroTitle?: string | null
  heroDescription?: string | null
  stats?: { value?: string | null; label?: string | null }[] | null
  teamTitle?: string | null
  teamDescription?: string | null
}

/** Публичный DTO настроек: только поля, которые показываются посетителю */
export interface PublicSiteSettings {
  phones?: PublicPhone[] | null
  email?: string | null
  address?: string | null
  socialLinks?: PublicSocialLink[] | null
  aboutPage?: AboutPageSettings | null
}

/**
 * Whitelist витринных полей. Добавлять сюда поле — осознанное решение открыть
 * его публичным страницам. Вызывающий код всё равно обязан перечислить нужные
 * ему поля явно.
 */
export const PUBLIC_SITE_SETTINGS_FIELDS = [
  'phones',
  'email',
  'address',
  'socialLinks',
  'aboutPage',
] as const

export type PublicSiteSettingsField = (typeof PUBLIC_SITE_SETTINGS_FIELDS)[number]

/**
 * Читает только запрошенные витринные поля настроек сайта.
 *
 * @param fields Поля из PUBLIC_SITE_SETTINGS_FIELDS, которые реально нужны
 *   странице или функции.
 * @param payload Экземпляр Payload. Передаётся вызывающим явно, чтобы helper
 *   не тянул @payload-config: его импортируют и модули, которые сам конфиг
 *   подключает через коллекции, — это дало бы циклический импорт.
 */
export async function getPublicSiteSettings<K extends PublicSiteSettingsField>(
  fields: readonly K[],
  payload: Payload,
): Promise<Pick<PublicSiteSettings, K>> {
  const select = Object.fromEntries(fields.map((field) => [field, true])) as Record<string, true>
  const settings = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
    select,
  })
  return settings as unknown as Pick<PublicSiteSettings, K>
}

/**
 * Номер счётчика Яндекс.Метрики — служебное поле с доступом только админу.
 * Серверу он нужен, чтобы подключить счётчик, поэтому читаем его отдельно,
 * с `overrideAccess` и выбором одного поля: ничего, кроме metrikaId,
 * компонент Метрики получить не может.
 */
export async function getSiteMetrikaId(payload: Payload): Promise<string | null> {
  const settings = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
    select: { metrikaId: true },
  })
  return ((settings as unknown as { metrikaId?: string | null }).metrikaId || null)
}

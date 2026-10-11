/**
 * Подпись ответственного зависит от раздела CRM, хотя аккаунт один.
 *
 * Владелец просил не заводить отдельную учётную запись администратора: в
 * «Заявках собственников» ответственный — администратор Н15, он же ведёт
 * объекты каталога как агент. Поэтому один и тот же профиль агента
 * показывается по-разному: в заявках собственников — «Администратор Н15»
 * (строка crm.ownAdminName), в каталоге объектов — своим именем агента
 * («Лана»). Права доступа и маршрутизация звонков не меняются: это только
 * подпись, связь в поле agent остаётся прежней.
 *
 * Почта связывает профиль агента с учётной записью пользователя. Тот же
 * аккаунт указан в legal-check.ts (LEGAL_OFFICER_EMAIL) как ответственный
 * за ручные юридические проверки.
 *
 * В карточке объекта подпись хранится ещё и отдельным полем Objects.agentRole:
 * одна и та же связь agent (id 1) в списке ответственных значит и «Лана
 * Козырева», и «Администратор Н15», и по одной связи повторно открытая карточка
 * не поймёт, какую подпись выбрали. Поле agentRole это запоминает, а связь agent
 * остаётся связью — права доступа и маршрутизация звонков не меняются.
 */
export const N15_ADMIN_EMAIL = 'svetkozyr@gmail.com'

/**
 * Обозначение ответственного в карточке объекта. 'agent' — личный агент
 * (показывается своим именем, для профиля администратора — «Лана Козырева»),
 * 'admin' — тот же профиль, но под подписью «Администратор Н15»
 * (строка crm.ownAdminName).
 */
export type ResponsibleRole = 'agent' | 'admin'

/** Значения поля Objects.agentRole — совпадают с вариантами select в коллекции */
export const RESPONSIBLE_ROLE_AGENT: ResponsibleRole = 'agent'
export const RESPONSIBLE_ROLE_ADMIN: ResponsibleRole = 'admin'

/** Проверка значения поля agentRole: неизвестное/пустое читаем как «Агент» */
export const isResponsibleRole = (value: unknown): value is ResponsibleRole =>
  value === RESPONSIBLE_ROLE_AGENT || value === RESPONSIBLE_ROLE_ADMIN

const normEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

/** Профиль агента, который в «Заявках собственников» подписан «Администратор Н15» */
export const isN15AdminAccount = (email: unknown): boolean => normEmail(email) === N15_ADMIN_EMAIL

/**
 * id профиля агента администратора Н15 в списке ответственных — по почте
 * учётной записи. null — профиля с такой почтой в списке нет: подписи
 * «Администратор Н15» тогда взяться неоткуда, и вариант не показываем.
 *
 * Список приходит из /api/agents: поле email сервер отдаёт только сотруднику
 * CRM (см. access поля в коллекции Agents), поэтому проверка имеет смысл
 * именно там, где список собирает администратор.
 */
export const n15AdminAgentId = (
  agents: { id: number; email?: unknown }[],
): number | null => {
  const found = agents.find((agent) => isN15AdminAccount(agent.email))
  return found ? found.id : null
}

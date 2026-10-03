/**
 * Журнал авторизаций: успешные и неуспешные входы пишутся в лог сервера
 * (docker logs) одной строкой с префиксом `[auth]` — по нему удобно искать
 * и разбирать инциденты.
 *
 * В журнал НЕ попадают пароли, токены, cookie и заголовки целиком. Только
 * коллекция, идентификатор/логин вошедшего (для успешного входа), IP клиента
 * и причина отказа (для неуспешного). Так запись годится для аудита и не
 * создаёт утечки секретов.
 *
 * Хуки, которые это вызывают, живут в коллекции Users (afterLogin/afterError):
 * через них проходят и вход в CRM, и вход в админку Payload.
 */
import { clientIp } from './rate-limit'

/** IP клиента по заголовкам запроса; unknown — если адреса нет */
function ipOf(headers?: Headers | null): string {
  try {
    return headers ? clientIp(headers) : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Успешный вход: коллекция, id и логин пользователя, IP */
export function logAuthSuccess(
  collection: string,
  user: { id?: unknown; email?: unknown; username?: unknown },
  headers?: Headers | null,
): void {
  const id = String(user?.id ?? '?')
  // Логин обрезаем: поле приходит из документа, но лог не должен расти бесконечно
  const login = String(user?.email || user?.username || '').slice(0, 120)
  console.log(`[auth] вход: ${collection} id=${id} login=${login || '—'} ip=${ipOf(headers)}`)
}

/**
 * Неуспешный вход или отказ в доступе: коллекция, IP и короткая причина.
 * Причина — только статус/имя ошибки Payload, без текста пароля и данных формы.
 */
export function logAuthFailure(
  collection: string,
  reason: string,
  headers?: Headers | null,
): void {
  console.warn(`[auth] отказ: ${collection} ip=${ipOf(headers)} причина=${reason}`)
}

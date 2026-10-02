/**
 * Код подтверждения телефона собственника: выпуск, хранение и проверка.
 *
 * Код — случайные пять цифр; в базе лежит только его необратимый хеш с
 * секретом сайта (как пароли), сам код — в SMS и в консоли сервера при
 * разработке. Так утечка дампа базы не даёт подтвердить чужой номер.
 *
 * Ограничения: код живёт 15 минут, вводить его можно 5 раз (дальше выпуск
 * нового), повторная отправка — не чаще раза в минуту и не больше пяти раз
 * в сутки на заявку. Лимиты считает и маршрут (по IP), но основные —
 * здесь: они привязаны к заявке, а не к адресу отправителя.
 */
import { createHash, randomInt } from 'node:crypto'

/** Сколько живёт код */
export const CODE_TTL_MS = 15 * 60_000
/** Сколько раз можно ошибиться, прежде чем код перестанет приниматься */
export const CODE_MAX_ATTEMPTS = 5
/** Пауза между отправками кода на один номер */
export const CODE_RESEND_COOLDOWN_MS = 60_000
/** Сколько раз в сутки можно выпускать код на одну заявку */
export const CODE_RESEND_MAX_PER_DAY = 5

/** Пять цифр кода: первая не ноль, чтобы код читался как «01523», а не числом */
export function generateOwnerCode(): string {
  const first = randomInt(1, 10)
  let rest = ''
  for (let i = 0; i < 4; i++) rest += String(randomInt(0, 10))
  return `${first}${rest}`
}

/** Хеш кода с секретом сайта: в базе хранится только он */
export function hashOwnerCode(code: string): string {
  const secret = process.env.PAYLOAD_SECRET || 'n15-dev-secret-change-in-production'
  return createHash('sha256').update(`n15-owner-code|${secret}|${code}`).digest('hex')
}

/** Совпадает ли введённый код с сохранённым хешем (сравнение постоянного времени) */
export function ownerCodeMatches(storedHash: string | null | undefined, code: string): boolean {
  if (!storedHash || !/^\d{5}$/.test(code)) return false
  const a = Buffer.from(storedHash, 'hex')
  const b = Buffer.from(hashOwnerCode(code), 'hex')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Истёк ли срок действия кода (нет даты отправки — считаем истёкшим) */
export function ownerCodeExpired(sentAt?: string | null, now: Date = new Date()): boolean {
  if (!sentAt) return true
  const sent = new Date(sentAt).getTime()
  if (Number.isNaN(sent)) return true
  return now.getTime() - sent > CODE_TTL_MS
}

/** Сколько секунд осталось до следующей отправки (0 — можно отправлять) */
export function resendWaitSeconds(sentAt?: string | null, now: number = Date.now()): number {
  if (!sentAt) return 0
  const sent = new Date(sentAt).getTime()
  if (Number.isNaN(sent)) return 0
  const left = CODE_RESEND_COOLDOWN_MS - (now - sent)
  return left > 0 ? Math.ceil(left / 1000) : 0
}

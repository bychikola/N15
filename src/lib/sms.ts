/**
 * Отправка SMS с кодом подтверждения телефона.
 *
 * Провайдер — sms.ru: у него простой HTTP-интерфейс, поэтому отдельная
 * библиотека не нужна (fetch есть в Node). Ключ кабинета читается из
 * переменной окружения SMS_RU_API_ID; пока её нет, приложение работает
 * как обычно — код не уходит, заявка остаётся «Новой», и администратор
 * видит её в CRM: номер он подтверждает вручную (см. owner-service.ts).
 * Это осознанный выбор: подтверждение собственника не должно зависеть
 * от наличия договора с оператором связи.
 *
 * В разработке (NODE_ENV не production) код печатается в консоль сервера —
 * так поток можно пройти целиком без ключа. В ответе маршрута код не
 * возвращается никогда, в браузер он не попадает.
 */

const SMS_RU_ENDPOINT = 'https://sms.ru/sms/send'

/** Настроен ли провайдер: без ключа отправка отключена */
export const smsConfigured = (): boolean => Boolean(process.env.SMS_RU_API_ID)

export interface SmsResult {
  /** Сообщение принято провайдером */
  ok: boolean
  /** Провайдер не настроен — код можно показать только в консоли сервера */
  skipped?: boolean
  /** Причина отказа (для журнала сервера, наружу не уходит) */
  reason?: string
}

/**
 * Отправить SMS. Ошибки не выбрасываем: недоставленное сообщение не должно
 * ронять заявку — она останется в CRM, и администратор подтвердит номер сам.
 */
export async function sendSms(phone: string, text: string): Promise<SmsResult> {
  const apiId = process.env.SMS_RU_API_ID
  const digits = (phone || '').replace(/\D/g, '')
  if (!apiId) {
    // Разработка: ключа нет — код печатаем в консоль сервера (в ответ
    // маршрута он не попадает), чтобы поток подтверждения можно было пройти
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[sms] SMS_RU_API_ID не задан, сообщение для ${digits}: ${text}`)
    }
    return { ok: false, skipped: true, reason: 'SMS-провайдер не настроен' }
  }
  if (digits.length < 11) return { ok: false, reason: 'Некорректный номер телефона' }

  try {
    const params = new URLSearchParams({ api_id: apiId, to: digits, msg: text, json: '1' })
    const res = await fetch(`${SMS_RU_ENDPOINT}?${params.toString()}`, { cache: 'no-store' })
    const data = (await res.json().catch(() => null)) as
      | { status?: string; status_code?: number; sms?: Record<string, { status?: string; status_code?: number }> }
      | null
    if (data?.status !== 'OK') {
      return { ok: false, reason: `sms.ru: ${data?.status || 'нет ответа'} (${data?.status_code ?? '—'})` }
    }
    const sent = data.sms?.[digits]
    if (sent && sent.status !== 'OK') {
      return { ok: false, reason: `sms.ru: ${sent.status} (${sent.status_code ?? '—'})` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

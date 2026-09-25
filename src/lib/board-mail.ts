/**
 * Письма авторам объявлений доски: публикация, уточнения, отказ, напоминание
 * о конце срока и снятие по сроку.
 *
 * Письма — вспомогательный канал: автор видит всё то же самое в личном
 * кабинете (см. /lk/board), поэтому неудачная отправка никогда не ломает
 * действие модератора. Отправляем через те же настройки SMTP, что и остальная
 * почта сайта (глобал mail-settings), и кладём копию в коллекцию emails —
 * в «Отправленные», как это делает отправка договора в рекламе
 * (см. src/lib/advertising-service.ts).
 *
 * Почты у автора может не быть: поле необязательное (частное лицо его часто
 * не заполняет) — тогда письмо просто не отправляется, и это не ошибка.
 */
import nodemailer from 'nodemailer'
import type { Payload } from 'payload'

/** Что случилось с объявлением — от этого зависит текст письма */
export type BoardMailKind = 'published' | 'clarification' | 'rejected' | 'expiring' | 'expired'

interface BoardMailInput {
  kind: BoardMailKind
  adId: number
  title: string
  /** Замечание модератора — попадает в письмо про уточнения и отказ */
  note?: string
  /** Сколько дней осталось — для напоминания о конце срока */
  daysLeft?: number
}

const SITE = 'n15-realty.ru'

const subjectOf = (input: BoardMailInput): string => {
  switch (input.kind) {
    case 'published':
      return `Объявление «${input.title}» опубликовано`
    case 'clarification':
      return `Объявление «${input.title}»: нужны уточнения`
    case 'rejected':
      return `Объявление «${input.title}» отклонено`
    case 'expiring':
      return `Объявление «${input.title}» скоро снимется с доски`
    case 'expired':
      return `Объявление «${input.title}» снято с доски`
  }
}

const textOf = (input: BoardMailInput): string => {
  const cabinet = `Личный кабинет: https://${SITE}/ru/lk/board`
  const note = input.note ? `\n\nЗамечание модератора:\n${input.note}` : ''
  switch (input.kind) {
    case 'published':
      return [
        `Объявление «${input.title}» прошло проверку и опубликовано на доске.`,
        '',
        'Покупатели могут позвонить вам по кнопке «Показать телефон» и написать в переписке — ответы приходят в личный кабинет.',
        '',
        cabinet,
      ].join('\n')
    case 'clarification':
      return [
        `Объявление «${input.title}» вернулось на уточнение.${note}`,
        '',
        'Исправьте то, о чём написал модератор, и отправьте объявление снова — оно вернётся на проверку.',
        '',
        cabinet,
      ].join('\n')
    case 'rejected':
      return [
        `Объявление «${input.title}» отклонено.${note}`,
        '',
        'После исправлений его можно подать заново — проверка будет новой.',
        '',
        cabinet,
      ].join('\n')
    case 'expiring':
      return [
        `Объявление «${input.title}» снимется с доски через ${input.daysLeft ?? 3} дн.`,
        '',
        'Если объект ещё продаётся, продлите объявление в личном кабинете — это бесплатно и сразу на 30 дней.',
        '',
        cabinet,
      ].join('\n')
    case 'expired':
      return [
        `Срок размещения объявления «${input.title}» истёк — оно снято с доски.`,
        '',
        'Объявление осталось в личном кабинете: его можно продлить или подать заново.',
        '',
        cabinet,
      ].join('\n')
  }
}

/**
 * Отправить письмо автору. Возвращает результат, но НИКОГДА не бросает:
 * письмо — не повод отменять действие модератора.
 */
export async function sendBoardMail(
  payload: Payload,
  to: string,
  input: BoardMailInput,
): Promise<{ ok: boolean; error?: string }> {
  const email = String(to || '').trim().toLowerCase()
  // Одна почта, без списков: иначе в поле «кому» можно было бы подставить
  // несколько адресов и разослать письмо посторонним
  if (!email || email.includes(',') || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: 'Почта автора не указана или указана неверно' }
  }

  const subject = subjectOf(input)
  const text = textOf(input)

  try {
    const settings = (await payload.findGlobal({ slug: 'mail-settings', overrideAccess: true })) as unknown as {
      enabled?: boolean
      username?: string
      password?: string
      smtpHost?: string
      smtpPort?: number | string
      senderName?: string
    }
    if (!settings?.enabled || !settings.username || !settings.password) {
      return { ok: false, error: 'Почта не подключена' }
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost || 'smtp.mail.ru',
      port: Number(settings.smtpPort) || 465,
      secure: true,
      auth: { user: settings.username, pass: settings.password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    })
    const fromName = String(settings.senderName || '').trim().replace(/"/g, '')
    const from = fromName ? `"${fromName}" <${settings.username}>` : settings.username

    await transporter.sendMail({ from, to: email, subject, text })
    transporter.close()

    // Копия в «Отправленные» — только после того, как сервер принял письмо
    await payload
      .create({
        collection: 'emails',
        data: {
          folder: 'sent',
          toEmail: email,
          subject,
          text,
          receivedAt: new Date().toISOString(),
          read: true,
        },
        overrideAccess: true,
      })
      .catch(() => null)

    return { ok: true }
  } catch (error) {
    console.error('Board mail error:', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

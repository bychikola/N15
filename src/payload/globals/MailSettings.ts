import type { FieldHook, GlobalConfig } from 'payload'

// Настройки подключения почтового ящика (VK WorkSpace / Mail.ru).
// Заполняются админом; поллер и отправка используют эти значения.
//
// Пароль ящика — секрет: наружу его не отдаём (access.read: false), иначе он
// утекал бы открытым текстом в ответе /api/globals/mail-settings, в браузер
// администратора, историю и логи. Сервер читает пароль через Local API с
// overrideAccess (board-mail.ts, advertising-service.ts, /api/mail/send) —
// там поле по-прежнему доступно. Читать и менять глобал может только админ.
const secretRead = (): false => false

// Админка не показывает прежний пароль, поэтому при сохранении других полей
// поле пароля приходит пустым. Пустое значение не должно затирать рабочий
// пароль — оставляем значение из базы (originalDoc в update-операции читается
// с overrideAccess, поэтому реальный пароль здесь есть).
const keepPasswordIfEmpty: FieldHook = ({ value, originalDoc }) => {
  if (typeof value === 'string' && value.trim() !== '') return value
  const current = (originalDoc as { password?: string } | undefined)?.password
  return current || value
}

export const MailSettings: GlobalConfig = {
  slug: 'mail-settings',
  label: 'Почта (подключение)',
  admin: {
    group: 'Система',
  },
  access: {
    // В глобале лежит пароль ящика — доступ только администратору
    read: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Почта подключена',
      defaultValue: false,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'imapHost',
          type: 'text',
          label: 'IMAP-сервер',
          defaultValue: 'imap.mail.ru',
        },
        {
          name: 'imapPort',
          type: 'number',
          label: 'IMAP-порт',
          defaultValue: 993,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'smtpHost',
          type: 'text',
          label: 'SMTP-сервер',
          defaultValue: 'smtp.mail.ru',
        },
        {
          name: 'smtpPort',
          type: 'number',
          label: 'SMTP-порт',
          defaultValue: 465,
        },
      ],
    },
    {
      name: 'username',
      type: 'text',
      label: 'Логин (адрес ящика)',
      admin: {
        description: 'Например: info@n15-realty.ru',
      },
    },
    {
      name: 'password',
      type: 'text',
      label: 'Пароль приложения',
      access: {
        // Пароль не возвращается клиенту даже администратору
        read: secretRead,
      },
      hooks: {
        beforeChange: [keepPasswordIfEmpty],
      },
      admin: {
        autoComplete: 'new-password',
        description:
          'Пароль для внешних приложений (не основной пароль ящика). Не показывается и не возвращается через API: чтобы не менять пароль, оставьте поле пустым.',
      },
    },
    {
      name: 'senderName',
      type: 'text',
      label: 'Имя отправителя',
      admin: {
        description: 'Как будет подписан отправитель, например: Агентство Н15',
      },
    },
  ],
}

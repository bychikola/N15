import type { GlobalConfig } from 'payload'

// Настройки подключения почтового ящика (VK WorkSpace / Mail.ru).
// Заполняются админом; поллер и отправка используют эти значения.
export const MailSettings: GlobalConfig = {
  slug: 'mail-settings',
  label: 'Почта (подключение)',
  admin: {
    group: 'Система',
  },
  access: {
    read: ({ req: { user } }) => !!user && (user.role === 'admin' || user.role === 'agent'),
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
      admin: {
        description: 'Пароль для внешних приложений (не основной пароль ящика)',
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

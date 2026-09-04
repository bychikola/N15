import type { CollectionConfig } from 'payload'

export const Emails: CollectionConfig = {
  slug: 'emails',
  labels: { singular: 'Письмо', plural: 'Письма' },
  admin: {
    useAsTitle: 'subject',
    group: 'Агентство',
    defaultColumns: ['fromEmail', 'subject', 'folder', 'read', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'folder',
      type: 'select',
      label: 'Папка',
      options: [
        { label: 'Входящие', value: 'inbox' },
        { label: 'Отправленные', value: 'sent' },
      ],
      required: true,
      defaultValue: 'inbox',
    },
    {
      name: 'messageId',
      type: 'text',
      label: 'Message-ID',
      admin: {
        description: 'Уникальный ID письма с почтового сервера — защита от дублей при заборе',
      },
    },
    {
      name: 'fromName',
      type: 'text',
      label: 'От (имя)',
    },
    {
      name: 'fromEmail',
      type: 'text',
      label: 'От (эл. почта)',
    },
    {
      name: 'toEmail',
      type: 'text',
      label: 'Кому (эл. почта)',
    },
    {
      name: 'subject',
      type: 'text',
      label: 'Тема',
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Текст письма',
    },
    {
      name: 'receivedAt',
      type: 'date',
      label: 'Дата письма',
    },
    {
      name: 'read',
      type: 'checkbox',
      label: 'Прочитано',
      defaultValue: false,
    },
    {
      name: 'application',
      type: 'relationship',
      label: 'Заявка',
      relationTo: 'applications',
      admin: {
        description: 'Привязка письма к заявке (по эл. почте клиента)',
      },
    },
    {
      name: 'customer',
      type: 'relationship',
      label: 'Клиент',
      relationTo: 'customers',
    },
  ],
}

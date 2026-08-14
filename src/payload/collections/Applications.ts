import type { CollectionConfig, Where } from 'payload'

export const Applications: CollectionConfig = {
  slug: 'applications',
  admin: {
    useAsTitle: 'clientName',
    group: 'Агентство',
    defaultColumns: ['clientName', 'type', 'status', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      const where: Where = {
        or: [
          { user: { equals: user.id } },
          { 'agent.user': { equals: user.id } },
        ],
      }
      return where
    },
    create: () => true, // форма на сайте — любой, в т.ч. аноним
    update: ({ req: { user } }) => !!user && (user.role === 'admin' || user.role === 'agent'),
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      label: 'Тип заявки',
      options: [
        { label: 'Просмотр', value: 'viewing' },
        { label: 'Обратный звонок', value: 'callback' },
        { label: 'Ипотека', value: 'mortgage' },
        { label: 'Консультация', value: 'consultation' },
      ],
      required: true,
    },
    {
      name: 'object',
      type: 'relationship',
      label: 'Объект',
      relationTo: 'objects',
    },
    {
      name: 'clientName',
      type: 'text',
      label: 'Имя клиента',
      required: true,
    },
    {
      name: 'clientPhone',
      type: 'text',
      label: 'Телефон',
      required: true,
    },
    {
      name: 'clientEmail',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Сообщение',
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Новая', value: 'new' },
        { label: 'В обработке', value: 'processing' },
        { label: 'Завершена', value: 'completed' },
        { label: 'Отменена', value: 'cancelled' },
      ],
      defaultValue: 'new',
      required: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Назначенный агент',
      relationTo: 'agents',
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Пользователь (владелец заявки)',
      relationTo: 'users',
      admin: {
        description: 'Заполняется автоматически, если заявка отправлена авторизованным пользователем',
      },
    },
  ],
}

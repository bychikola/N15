import type { CollectionConfig } from 'payload'

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: {
    useAsTitle: 'name',
    group: 'Агентство',
    defaultColumns: ['name', 'phone', 'email', 'company'],
  },
  access: {
    read: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'ФИО',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
      admin: {
        description: 'По номеру заявки с сайта автоматически привязываются к клиенту',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'company',
      type: 'text',
      label: 'Компания',
    },
    {
      name: 'position',
      type: 'text',
      label: 'Должность',
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [
        { name: 'tag', type: 'text', label: 'Тег' },
      ],
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Ответственный',
      relationTo: 'agents',
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Примечание',
    },
  ],
}

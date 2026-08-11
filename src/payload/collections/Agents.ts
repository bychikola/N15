import type { CollectionConfig } from 'payload'

export const Agents: CollectionConfig = {
  slug: 'agents',
  admin: {
    useAsTitle: 'name',
    group: 'Агентство',
    defaultColumns: ['name', 'position', 'phone', 'isActive'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Имя',
      required: true,
    },
    {
      name: 'photo',
      type: 'upload',
      label: 'Фото',
      relationTo: 'media',
    },
    {
      name: 'position',
      type: 'text',
      label: 'Должность',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'telegram',
      type: 'text',
      label: 'Telegram',
      admin: {
        description: 'Ссылка или юзернейм: https://t.me/username или @username. Оставьте пустым, чтобы скрыть кнопку.',
      },
    },
    {
      name: 'whatsapp',
      type: 'text',
      label: 'WhatsApp',
      admin: {
        description: 'Номер или ссылка: https://wa.me/79281112233. Если пусто — возьмётся номер из «Телефон».',
      },
    },
    {
      name: 'bio',
      type: 'richText',
      label: 'Биография',
    },
    {
      name: 'objectsSold',
      type: 'number',
      label: 'Сделок проведено',
    },
    {
      name: 'experience',
      type: 'number',
      label: 'Опыт (лет)',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: 'Активен',
      defaultValue: true,
    },
    {
      name: 'sortOrder',
      type: 'number',
      label: 'Порядок сортировки',
    },
  ],
}

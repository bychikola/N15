import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    group: 'Система',
  },
  access: {
    create: () => true,       // Anyone can register
    read: ({ req: { user } }) => !!user,  // Only logged-in users can read
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
      name: 'phone',
      type: 'text',
      label: 'Телефон',
    },
    {
      name: 'role',
      type: 'select',
      label: 'Роль',
      options: [
        { label: 'Клиент', value: 'user' },
        { label: 'Агент', value: 'agent' },
        { label: 'Администратор', value: 'admin' },
      ],
      defaultValue: 'user',
      required: true,
    },
    {
      name: 'favorites',
      type: 'relationship',
      label: 'Избранное',
      relationTo: 'objects',
      hasMany: true,
    },
  ],
}

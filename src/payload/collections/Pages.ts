import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Страница', plural: 'Страницы' },
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
  },
  access: {
    // Страницы витрины открыты всем: черновиков у коллекции нет, каждая
    // запись — опубликованная страница. Закрываем только запись.
    read: () => true,
    // Создавать и править страницы может администратор или сотрудник с
    // разрешением canManageContent (см. Users.ts). Клиент и агент без галочки
    // — не могут: раньше страницу менял любой вошедший.
    create: ({ req: { user } }) => user?.role === 'admin' || user?.canManageContent === true,
    update: ({ req: { user } }) => user?.role === 'admin' || user?.canManageContent === true,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Заголовок',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL-путь',
      required: true,
      unique: true,
    },
    {
      name: 'metaTitle',
      type: 'text',
      label: 'SEO: Заголовок',
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      label: 'SEO: Описание',
    },
    {
      name: 'ogImage',
      type: 'upload',
      label: 'SEO: Изображение',
      relationTo: 'media',
    },
  ],
}

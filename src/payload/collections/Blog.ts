import type { CollectionConfig } from 'payload'

export const Blog: CollectionConfig = {
  slug: 'blog',
  labels: { singular: 'Статья', plural: 'Статьи' },
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
    defaultColumns: ['title', 'category', 'publishedAt', 'isFeatured'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
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
      name: 'excerpt',
      type: 'textarea',
      label: 'Краткое описание',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Содержание',
      required: true,
    },
    {
      name: 'coverImage',
      type: 'upload',
      label: 'Обложка',
      relationTo: 'media',
    },
    {
      name: 'category',
      type: 'text',
      label: 'Категория',
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
      name: 'author',
      type: 'relationship',
      label: 'Автор',
      relationTo: 'agents',
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата публикации',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'isFeatured',
      type: 'checkbox',
      label: 'Избранная статья',
      defaultValue: false,
    },
    // Новости с официальных источников (см. src/lib/news.ts) приходят
    // в блог вместе со ссылкой на первоисточник — на странице статьи
    // выводится «Источник: …».
    {
      name: 'sourceName',
      type: 'text',
      label: 'Источник (название)',
      admin: {
        description: 'Название официального источника новости, например «Банк России»',
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'Источник (прямая ссылка)',
      admin: {
        description: 'Ссылка на первоисточник — показывается в публикации вместе с названием',
      },
    },
  ],
}

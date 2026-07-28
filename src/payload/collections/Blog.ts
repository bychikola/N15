import type { CollectionConfig } from 'payload'

export const Blog: CollectionConfig = {
  slug: 'blog',
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
  ],
}

import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
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

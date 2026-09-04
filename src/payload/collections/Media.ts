import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Медиафайл', plural: 'Медиафайлы' },
  admin: {
    group: 'Система',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  upload: {
    staticDir: 'media',
    // Кроп + фокальная точка при загрузке (можно выбрать, какую часть фото брать)
    crop: true,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'card',
        width: 800,
        height: 600,
        position: 'centre',
      },
      {
        name: 'hero',
        width: 1920,
        height: 1080,
        position: 'centre',
      },
    ],
    adminThumbnail: 'thumbnail',
    mimeTypes: ['image/*'],
    // Размеры (thumbnail/card/hero) генерируются в WebP: весит на 30–40%
    // меньше JPEG при том же визуальном качестве (quality 86 ≈ jpeg 92).
    // Оригинал хранится как загружен — не пережимается.
    formatOptions: {
      format: 'webp',
      options: { quality: 86 },
    },
  },
  hooks: {
    beforeChange: [
      // Alt необязателен: при массовой загрузке фото не блокируем,
      // а автозаполняем именем файла (a11y не страдает)
      ({ data }) => {
        if (data && !data.alt && data.filename) {
          data.alt = String(data.filename).replace(/\.[^.]+$/, '')
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt-текст',
      required: false,
    },
  ],
}

import type { CollectionConfig } from 'payload'
import { PHOTO_MIME_TYPES } from '@/lib/photo-rules'

/**
 * «Фотографии заявок собственников» — снимки, приложенные владельцем к заявке
 * на продажу или сдачу объекта (форма /sell, коллекция owner-applications).
 *
 * Отдельная коллекция, а не общая media, по делу: файлы с публичной формы
 * ещё не проверены, поэтому чтение закрыто — их видит только администратор,
 * который ведёт заявку. Файлы лежат в подпапке хранилища media
 * (staticDir media/owner-materials) — подпапка внутри media выбрана не
 * случайно: в docker-compose тому media смонтирован как единственный
 * постоянный том, и своя папка вне него терялась бы при обновлении контейнера.
 * Публично файлы не отдаются: Payload отдаёт их только через свой маршрут
 * и с проверкой доступа, а Caddy на входе ничего из папок не раздаёт.
 *
 * На сайт фотографии попадают копиями в media — они создаются при одобрении
 * заявки и заведении объекта (см. createObjectFromApplication в
 * src/lib/owner-service.ts), поэтому непроверенные файлы никогда не
 * оказываются публичными.
 *
 * Публичного создания через REST нет: файлы пишет серверный маршрут
 * /api/owner-applications/submit (overrideAccess) после проверки формата
 * и размера.
 */
export const OwnerMaterials: CollectionConfig = {
  slug: 'owner-materials',
  labels: { singular: 'Фото заявки собственника', plural: 'Фото заявок собственников' },
  admin: {
    group: 'Заявки собственников',
    description:
      'Фотографии из заявок собственников до проверки. Закрытое хранилище — по прямой ссылке на сайт файлы не отдаются',
  },
  access: {
    // Заявками занимается администратор: заявка содержит персональные данные
    // собственника, и посторонним — включая агентов — фотографии не видны
    read: ({ req: { user } }) => user?.role === 'admin',
    create: () => false,
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  upload: {
    staticDir: 'media/owner-materials',
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
    // Только форматы, которые читает sharp и показывает любой браузер
    // (см. src/lib/photo-rules.ts): HEIC с телефона не принимаем
    mimeTypes: [...PHOTO_MIME_TYPES],
    formatOptions: {
      format: 'webp',
      options: { quality: 86 },
    },
  },
  hooks: {
    beforeChange: [
      // Alt необязателен: автозаполняем именем файла, как в media
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
    },
  ],
}

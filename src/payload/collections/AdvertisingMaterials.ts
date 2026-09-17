import type { CollectionConfig } from 'payload'
import { PHOTO_MIME_TYPES } from '@/lib/photo-rules'

/**
 * «Материалы заявок» — фотографии, приложенные посетителем к заявке
 * «Ваша реклама» (форма платного размещения, страница /advertising),
 * и сформированные договоры (PDF).
 *
 * Отдельная коллекция, а не общая media, по делу: файлы с публичной формы
 * ещё не проверены модератором, поэтому чтение открыто только команде Н15,
 * а файлы лежат в подпапке хранилища media (staticDir media/ad-materials).
 * Подпапка внутри media выбрана не случайно: в docker-compose тому media
 * смонтирован как единственный постоянный том — своя папка вне него
 * терялась бы при каждом обновлении контейнера. Публично файлы всё равно
 * не отдаются: Payload отдаёт их только через свой маршрут и с проверкой
 * доступа, а Caddy на входе ничего из папок не раздаёт.
 *
 * На сайт фотографии попадают копиями в media — они создаются при
 * публикации заявки (см. publishAdRequest в src/lib/advertising-service.ts),
 * поэтому непроверенные файлы никогда не оказываются публичными.
 *
 * Публичного создания через REST нет: файлы пишет серверный маршрут
 * /api/advertising/request (overrideAccess) после проверки формата и размера.
 * Видео в хранилище не принимается — в заявке оно указывается ссылкой
 * на внешний сервис (см. правила размещения, раздел 4).
 */
export const AdvertisingMaterials: CollectionConfig = {
  slug: 'advertising-materials',
  labels: { singular: 'Материал заявки', plural: 'Материалы заявок' },
  admin: {
    group: 'Реклама',
    description:
      'Фотографии заявок и сформированные договоры. Закрытое хранилище — файлы не отдаются по прямой ссылке на сайт',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: () => false,
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  upload: {
    staticDir: 'media/ad-materials',
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
    // Только форматы, которые читает sharp и показывает любой браузер
    // (см. src/lib/photo-rules.ts): HEIC с телефона не принимаем
    mimeTypes: [...PHOTO_MIME_TYPES, 'application/pdf'],
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
    {
      name: 'note',
      type: 'text',
      label: 'Заметка',
      admin: { description: 'Например: «фото из заявки №3» или «договор от 18.09»' },
    },
  ],
}

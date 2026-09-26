import type { CollectionConfig } from 'payload'
import { PHOTO_MIME_TYPES } from '@/lib/photo-rules'
import { mediaAfterChange, mediaFocalChange } from '@/lib/media-marking'

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
    // Разрешены только форматы, которые читает sharp и показывает любой
    // браузер: JPG, PNG и WEBP (см. src/lib/photo-rules.ts). Раньше стояло
    // image/*, и HEIC с iPhone попадал в хранилище нечитаемым файлом.
    mimeTypes: [...PHOTO_MIME_TYPES],
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
      // Смену фокусной точки кадра помечаем как «фото ждёт разметки»: Payload
      // пересобирает размеры из размеченного оригинала, и знак в новом кропе
      // может остаться за кадром — фоновая разметка соберёт размеры заново из
      // чистого кадра (см. src/lib/media-marking.ts)
      mediaFocalChange,
    ],
    // Разметка фотографии сразу после загрузки: знак «Н15» ложится и на
    // оригинал, и на каждый размер, чистый кадр уходит в закрытую папку
    // (см. src/lib/media-marking.ts). Хук общий для всех путей загрузки —
    // карточка CRM, старая форма /admin-add, админка Payload
    afterChange: [mediaAfterChange],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt-текст',
      required: false,
    },
    {
      // Какой водяной знак уже вшит в файл (см. src/lib/watermark.ts).
      // Нужен массовому обновлению знака: по нему видно, какие фото ещё не
      // размечены, и знак не ложится вторым слоем поверх первого.
      name: 'wm',
      type: 'number',
      label: 'Версия водяного знака',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          '0 — ждёт разметки, 1 — портрет сотрудника (знака нет), 2 — прежний знак «Н15» с подписью «НЕДВИЖИМОСТЬ», 3 — знак «Н15» с адресом сайта (текущий), -1 — знак нужно переложить заново.',
      },
    },
  ],
}

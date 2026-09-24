import type { CollectionConfig } from 'payload'
import { PHOTO_MIME_TYPES } from '@/lib/photo-rules'

/**
 * «Фотографии объявлений» — снимки, приложенные к объявлению на доске
 * (страница /board/new) до того, как модератор его проверил.
 *
 * Отдельная коллекция, а не общая media, по делу: файлы с публичной формы
 * ещё не проверены, поэтому чтение закрыто — команда Н15 видит все, автор
 * только свои, посетитель не видит ничего. Файлы лежат в подпапке хранилища
 * media (staticDir media/board-materials) — подпапка внутри media выбрана не
 * случайно: в docker-compose тому media смонтирован как единственный
 * постоянный том, и своя папка вне него терялась бы при обновлении контейнера.
 *
 * На сайт фотографии попадают копиями в media — они создаются при публикации
 * объявления (см. publishBoardAd в src/lib/board-service.ts), поэтому
 * непроверенные файлы никогда не оказываются публичными.
 *
 * Публичного создания через REST нет: файлы пишет серверный маршрут
 * /api/board/ads (overrideAccess) после проверки формата и размера.
 *
 * ПРО ПАПКУ ВНУТРИ media (частый вопрос при проверке безопасности): файлы
 * лежат в media/board-materials, то есть внутри каталога публичной коллекции.
 * Это не делает их публичными — папку не раздаёт никто, кроме Payload,
 * а он отдаёт файлы только своим маршрутом /api/board-materials/file/*,
 * где проверяет доступ (см. checkFileAccess в payload: объект-условие доступа
 * становится условием выборки, поэтому чужой автор получает 403). Проверено
 * на живом сервере: /media/board-materials/<файл> → 404 (папку никто не
 * раздаёт), /api/media/file/board-materials/<файл> → 404 (через публичный
 * маршрут чужого хранилища не достать), файл чужого автора под пользователем
 * role=user → 403. Подпапка внутри media выбрана намеренно: тому media —
 * единственный постоянный том (docker-compose), папка вне него терялась бы
 * при каждом обновлении контейнера. Так же устроено хранилище рекламы
 * (см. AdvertisingMaterials.ts).
 */
export const BoardMaterials: CollectionConfig = {
  slug: 'board-materials',
  labels: { singular: 'Фото объявления', plural: 'Фотографии объявлений' },
  admin: {
    group: 'Доска объявлений',
    description:
      'Фотографии объявлений до модерации. Закрытое хранилище — по прямой ссылке на сайт файлы не отдаются',
  },
  access: {
    // Автор видит свои фото в личном кабинете и в форме правки; команда — все
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'agent' || user.role === 'admin') return true
      return { author: { equals: user.id } }
    },
    // Создают: команда (объявления агентства заводят из админки и CRM)
    // и серверный маршрут подачи с overrideAccess. Публичного REST-создания
    // нет: файл от частного лица попадает сюда только после проверки формата
    // и размера в маршруте
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  upload: {
    staticDir: 'media/board-materials',
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
    // Только форматы, которые читает sharp и показывает любой браузер
    // (см. src/lib/photo-rules.ts) — HEIC с телефона не принимаем
    mimeTypes: [...PHOTO_MIME_TYPES],
    formatOptions: {
      format: 'webp',
      options: { quality: 86 },
    },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt-текст',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто загрузил',
      admin: { readOnly: true, description: 'Заполняется автоматически при загрузке через сайт' },
      index: true,
    },
  ],
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
}

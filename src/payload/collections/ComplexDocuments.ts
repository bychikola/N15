import type { CollectionConfig } from 'payload'

/**
 * Документы жилых комплексов — PDF-презентации ЖК (поле presentation коллекции
 * complexes) и PDF-планировки (поле plannings). Отдельная коллекция, а не
 * общая media, по двум причинам:
 *
 * 1) media принимает только форматы изображений и размечает каждый файл знаком
 *    «Н15» (см. src/lib/media-marking.ts) — PDF через sharp не проходит, знак
 *    на документ не ложится;
 * 2) файл лежит в подпапке хранилища media (staticDir media/complex-documents):
 *    в docker-compose тому media смонтирован единственным постоянным томом, и
 *    папка вне него терялась бы при обновлении контейнера.
 *
 * Презентация показывается публично (кнопка «Смотреть презентацию» на странице
 * ЖК), поэтому чтение открыто; загружают и правят документы сотрудники CRM под
 * своей сессией — маршрут /api/crm/documents/upload, админка Payload.
 */
export const ComplexDocuments: CollectionConfig = {
  slug: 'complex-documents',
  labels: { singular: 'Документ ЖК', plural: 'Документы ЖК' },
  admin: {
    group: 'Недвижимость',
    description: 'PDF-презентации и планировки жилых комплексов',
  },
  access: {
    // Файл открыт на сайте: презентация ЖК отдаётся по прямой ссылке
    read: () => true,
    // Загружают сотрудники: маршрут /api/crm/documents/upload либо админка
    create: ({ req: { user } }) =>
      user?.role === 'agent' || user?.role === 'admin' || user?.canManageContent === true,
    update: ({ req: { user } }) =>
      user?.role === 'agent' || user?.role === 'admin' || user?.canManageContent === true,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  upload: {
    staticDir: 'media/complex-documents',
    // Только PDF: презентации и планировки в других форматах не принимаем
    mimeTypes: ['application/pdf'],
  },
  hooks: {
    beforeChange: [
      // Название необязательно — автозаполняем именем файла без расширения,
      // как alt у изображений (чтобы строка списка не была пустой)
      ({ data }) => {
        if (data && !data.title && data.filename) {
          data.title = String(data.filename).replace(/\.[^.]+$/, '')
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название документа',
      admin: { description: 'Например: «Презентация ЖК Весенний, 2026»' },
    },
  ],
}

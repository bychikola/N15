import type { CollectionConfig } from 'payload'
// Разрешённые источники — общий закрытый реестр (см. src/lib/object-sources.ts):
// варианты поля совпадают с реестром, запрещённые каналы сюда не попадают
import { allowedObjectSources } from '@/lib/object-sources'

/**
 * «Источники объектов» — очередь кандидатов из разрешённых источников.
 *
 * Объект, полученный из источника, не попадает в каталог автоматически:
 * кандидат кладётся сюда со статусом «Ждёт решения», и только явное решение
 * сотрудника (одобрено / отклонено) определяет его судьбу. Это и есть
 * выборочная публикация — правило SOURCE_PUBLICATION_RULE в object-sources.ts.
 *
 * Первым работает канал «Заявки собственников»: забор читает открытые заявки
 * из owner-applications и кладёт их сюда со статусом «Ждёт решения» (записи
 * пишет сервис, src/lib/object-source-service.ts). У остальных источников
 * канал пока не реализован (fetch: null), поэтому их кандидатов здесь нет.
 *
 * В каталог кандидат переносится следующим шагом модуля: поле publishedObject
 * и статус «Опубликован» для этого уже заведены, но перенос пока не выполняется.
 */
export const SourceObjects: CollectionConfig = {
  slug: 'source-objects',
  labels: { singular: 'Объект из источника', plural: 'Источники объектов — очередь' },
  admin: {
    useAsTitle: 'title',
    group: 'Источники объектов',
    defaultColumns: ['source', 'title', 'address', 'price', 'status', 'importedAt'],
    description: 'Кандидаты из разрешённых источников: публикуются только после решения сотрудника',
  },
  access: {
    // Очередь внутренняя: читают сотрудники, решения принимает администратор.
    // Забор и запись ведёт сервер с overrideAccess.
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      label: 'Источник',
      required: true,
      options: allowedObjectSources().map((s) => ({ label: s.name, value: s.slug })),
      admin: {
        description: 'Канал, из которого пришёл кандидат (только разрешённые источники)',
      },
    },
    {
      name: 'externalId',
      type: 'text',
      label: 'Идентификатор на источнике',
      admin: {
        description: 'Номер объекта на стороне источника — для поиска дублей при повторном заборе',
      },
    },
    {
      name: 'title',
      type: 'text',
      label: 'Название',
    },
    {
      name: 'address',
      type: 'text',
      label: 'Адрес из источника',
      admin: { description: 'Адрес, как его отдал источник, — до проверки сотрудником' },
    },
    { name: 'price', type: 'number', label: 'Цена, ₽' },
    { name: 'area', type: 'number', label: 'Площадь, м²' },
    { name: 'rooms', type: 'number', label: 'Комнат', min: 0, max: 20 },
    { name: 'url', type: 'text', label: 'Ссылка на объект у источника' },
    {
      name: 'photos',
      type: 'array',
      label: 'Фотографии из источника',
      labels: { singular: 'Фото', plural: 'Фотографии' },
      admin: {
        description: 'Прямые ссылки на фото — только когда источник официально отдаёт их. В каталог переносятся отдельным шагом, после проверки',
      },
      fields: [{ name: 'url', type: 'text', label: 'Ссылка на фото' }],
    },
    {
      name: 'status',
      type: 'select',
      label: 'Решение',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Ждёт решения', value: 'pending' },
        { label: 'Одобрен к публикации', value: 'approved' },
        { label: 'Отклонён', value: 'rejected' },
        { label: 'Опубликован', value: 'published' },
      ],
      admin: {
        description: 'Объект публикуется только после явного одобрения — автоматической публикации нет',
      },
    },
    {
      name: 'raw',
      type: 'json',
      label: 'Исходные данные источника',
      admin: {
        readOnly: true,
        description: 'Ответ источника как есть — для разбора. Посетителю не показывается',
      },
    },
    { name: 'importedAt', type: 'date', label: 'Когда получен', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'decidedAt', type: 'date', label: 'Когда решено', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'decidedBy', type: 'relationship', relationTo: 'users', label: 'Кто решил' },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка',
      admin: { description: 'Что решили по кандидату (почему отклонили, что уточнить у источника…)' },
    },
    {
      name: 'publishedObject',
      type: 'relationship',
      relationTo: 'objects',
      label: 'Объект каталога',
      admin: {
        readOnly: true,
        description: 'Заполняется, когда кандидат перенесён в каталог (следующий шаг модуля — пока не выполняется)',
      },
    },
  ],
}

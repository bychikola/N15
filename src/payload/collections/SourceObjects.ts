import type { CollectionConfig, FieldAccess } from 'payload'
// Разрешённые источники — общий закрытый реестр (см. src/lib/object-sources.ts):
// варианты поля совпадают с реестром, запрещённые каналы сюда не попадают
import { allowedObjectSources } from '@/lib/object-sources'

/**
 * Доступ к закрытым полям кандидата — ссылке на источник, партнёрской
 * комиссии и исходным данным. Их видит и правит только администратор: агент
 * работает с очередью, но технические условия партнёра ему не нужны, а
 * посетитель сайта не может прочитать коллекцию вовсе (см. access коллекции).
 */
const sourcePrivateAccess: FieldAccess = ({ req: { user } }) => user?.role === 'admin'

/**
 * «Источники объектов» — очередь кандидатов из разрешённых источников.
 *
 * Объект, полученный из источника, не попадает в каталог автоматически:
 * кандидат кладётся сюда со статусом «Ждёт решения», и только явное решение
 * сотрудника (одобрено / отклонено) определяет его судьбу. Это и есть
 * выборочная публикация — правило SOURCE_PUBLICATION_RULE в object-sources.ts.
 *
 * Работают два канала: «Заявки собственников» (читает открытые заявки из
 * owner-applications) и «Партнёрские агентства» (читает согласованный
 * JSON-фид по договору). Оба кладут кандидатов сюда со статусом «Ждёт
 * решения» (записи пишет сервис, src/lib/object-source-service.ts).
 * У остальных источников канал не реализован (fetch: null) — API, XML и
 * NMarket в этом этапе не подключаются.
 *
 * Повторный забор не задваивает кандидата: запись ищется по паре
 * «источник + externalId» и обновляется. Одобренного кандидата администратор
 * переносит в каталог отдельным действием — объект заводится черновиком,
 * кандидат получает статус «Опубликован» и остаётся связанным с карточкой
 * (publishedObject); автоматической публикации нет.
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
      name: 'region',
      type: 'text',
      label: 'Регион',
      admin: { description: 'Регион или район, как его назвал источник' },
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
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание из источника',
      admin: { description: 'Описание объекта от источника — переносится в карточку каталога при переносе' },
    },
    {
      name: 'url',
      type: 'text',
      label: 'Ссылка на объект у источника',
      // Техническая ссылка партнёра — закрытые данные: видит только администратор
      access: { read: sourcePrivateAccess },
      admin: { description: 'Внутренняя ссылка на карточку у источника. Клиенту сайта не показывается' },
    },
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
      name: 'commission',
      type: 'text',
      label: 'Партнёрская комиссия',
      // Закрытое условие сделки: видит только администратор, клиенту не показывается
      access: { read: sourcePrivateAccess },
      admin: { description: 'Вознаграждение по договору с источником (например: 3 % или 50 000 ₽). Внутренние данные' },
    },
    {
      name: 'actualAt',
      type: 'date',
      label: 'Актуально на',
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Дата актуальности данных на стороне источника' },
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
      // Разбор ответа источника — технические данные: только администратор
      access: { read: sourcePrivateAccess },
      admin: {
        readOnly: true,
        description: 'Ответ источника как есть — для разбора. Клиенту не показывается',
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
        description: 'Заполняется, когда одобренный кандидат перенесён в каталог — объект заводится черновиком',
      },
    },
  ],
}

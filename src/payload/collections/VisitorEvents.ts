import type { CollectionConfig } from 'payload'

// События посетителя: что человек делал на сайте, кроме открытия страниц.
// Просмотры страниц лежат в site-visits (там же визиты и сессии), а здесь —
// действия, из которых собираются «Интерес к объектам» и блок «Активность на
// сайте» в карточке обращения: открытие карточки объекта, фильтры каталога,
// избранное, нажатия «Позвонить»/WhatsApp/«Написать», отправка заявки,
// подача объявления на доску.
//
// Персональных данных здесь нет: только обезличенный идентификатор посетителя
// (см. Visitors), вид события, адрес страницы и номер объекта. Пишет события
// сервер (маячок /api/visit и хуки коллекций) — снаружи через REST коллекция
// не заполняется и не правится.
export const VisitorEvents: CollectionConfig = {
  slug: 'visitor-events',
  labels: { singular: 'Событие посетителя', plural: 'События посетителей' },
  admin: {
    useAsTitle: 'kind',
    group: 'Аналитика',
    defaultColumns: ['createdAt', 'kind', 'objectId', 'path', 'visitor'],
    description: 'Действия посетителей сайта для отчётов CRM. Просмотры страниц — в «Посещениях сайта»',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'visitor',
      type: 'text',
      label: 'Посетитель (обезличенный идентификатор)',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'kind',
      type: 'select',
      label: 'Событие',
      required: true,
      index: true,
      options: [
        { label: 'Открыл карточку объекта', value: 'object_view' },
        { label: 'Применил фильтр каталога', value: 'filter_use' },
        { label: 'Добавил в избранное', value: 'favorite_add' },
        { label: 'Убрал из избранного', value: 'favorite_remove' },
        { label: 'Нажал «Позвонить»', value: 'call_click' },
        { label: 'Нажал WhatsApp', value: 'whatsapp_click' },
        { label: 'Нажал «Написать»', value: 'write_click' },
        { label: 'Отправил заявку', value: 'lead_submit' },
        { label: 'Начал подачу объявления', value: 'board_started' },
        { label: 'Отправил объявление на доску', value: 'board_published' },
      ],
    },
    {
      name: 'path',
      type: 'text',
      label: 'Страница',
      admin: { readOnly: true },
    },
    {
      name: 'objectId',
      type: 'number',
      label: 'Объект (номер)',
      index: true,
      admin: { readOnly: true, description: 'Номер карточки объекта, если событие связано с объектом' },
    },
    {
      name: 'detail',
      type: 'text',
      label: 'Подробность',
      admin: {
        readOnly: true,
        description: 'Например, выбранные фильтры каталога в понятном виде',
      },
    },
  ],
}

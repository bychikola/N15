import type { CollectionConfig } from 'payload'

// Журнал доступа к аналитике посетителей. Требование ст. 19 152-ФЗ:
// доступ к данным посетителей ограничен администратором, и сам доступ
// журналируется — в журнале видно, кто и когда открывал раздел «Посетители»
// или «Интерес к объектам». Записи делает сервер при открытии раздела
// (см. src/lib/analytics-access.ts); снаружи журнал только читается и никому,
// кроме администратора, не показывается.
//
// Сам журнал персональных данных не содержит: фамилия сотрудника берётся из
// его учётной записи, IP посетителя сюда не попадает.
export const AnalyticsAccess: CollectionConfig = {
  slug: 'analytics-access',
  labels: { singular: 'Доступ к аналитике', plural: 'Журнал доступа к аналитике' },
  admin: {
    useAsTitle: 'section',
    group: 'Аналитика',
    defaultColumns: ['createdAt', 'section', 'userName', 'user'],
    description: 'Кто и когда открывал отчёты по посетителям сайта',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'section',
      type: 'text',
      label: 'Раздел',
      required: true,
      admin: {
        readOnly: true,
        description: 'Например, «Аналитика → Посетители»',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Сотрудник',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      // Имя дублируем в записи: учётную запись сотрудника могут переименовать
      // или закрыть, а в журнале должно остаться, кто именно смотрел отчёт
      // в тот момент
      name: 'userName',
      type: 'text',
      label: 'Сотрудник (имя)',
      admin: { readOnly: true },
    },
    {
      name: 'note',
      type: 'text',
      label: 'Примечание',
      admin: { readOnly: true, description: 'Что именно открыли: отчёт за период, карточка посетителя' },
    },
  ],
}

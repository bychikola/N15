import type { CollectionConfig } from 'payload'

/**
 * «Новости на проверку» — отдельный раздел админки для реестра официальных
 * документов и сообщений (законы, постановления, разъяснения ведомств),
 * сгруппированных по статусу документа.
 *
 * Это НЕ существующая коллекция `news` (src/payload/collections/News.ts):
 * та — очередь RSS-новостей с автосбором и публикацией в блог. Здесь же
 * ручной реестр: сотрудник сам заводит запись, указывает официальный
 * источник и номер документа, отмечает статус документа и дату вступления
 * в силу. Автосбор, публикация в блог и публичная часть сайта к этой
 * коллекции не подключены — она живёт только в админке.
 *
 * Значения статуса документа — из брифа: «На рассмотрении», «Принят, но не
 * вступил в силу», «Вступил в силу», «Официальное разъяснение», «Требует
 * проверки».
 */
export const NewsReviews: CollectionConfig = {
  slug: 'news-reviews',
  labels: { singular: 'Новость на проверку', plural: 'Новости на проверку' },
  admin: {
    useAsTitle: 'title',
    // Отдельная группа-раздел в навигации админки, чтобы не смешивать
    // реестр документов с обычными новостями и блогом («Контент»).
    group: 'Новости на проверку',
    defaultColumns: ['docStatus', 'title', 'sourceName', 'category', 'publishedAt'],
    description: 'Реестр официальных документов и сообщений: статус документа, номер и дата вступления в силу',
  },
  access: {
    // Раздел внутренний: читают и ведут его агенты и администраторы,
    // удаляют — только администраторы. Публичного доступа нет.
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Заголовок',
      required: true,
    },
    {
      name: 'sourceName',
      type: 'text',
      label: 'Источник',
      admin: {
        description: 'Название официального источника: Банк России, Росреестр, Минстрой, Правительство России, ФНС и т. п.',
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'Ссылка на официальный источник',
      admin: {
        description: 'Прямая ссылка на документ или публикацию ведомства (http/https)',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Дата публикации документа или сообщения у источника',
      },
    },
    {
      name: 'category',
      type: 'text',
      label: 'Категория',
      admin: {
        description: 'Тема документа: ипотека, налоги, регистрация прав, строительство, земельные участки и т. п.',
      },
    },
    {
      name: 'docStatus',
      type: 'select',
      label: 'Статус документа',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'На рассмотрении', value: 'pending' },
        { label: 'Принят, но не вступил в силу', value: 'adopted' },
        { label: 'Вступил в силу', value: 'in_force' },
        { label: 'Официальное разъяснение', value: 'clarification' },
        { label: 'Требует проверки', value: 'needs_check' },
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
      label: 'Краткое описание',
      admin: {
        description: 'Короткое содержание документа своими словами — полный текст не копируется',
      },
    },
    {
      name: 'docNumber',
      type: 'text',
      label: 'Номер документа',
      admin: {
        description: 'Номер и вид акта, например «Федеральный закон № 123-ФЗ» или «Постановление № 456»',
      },
    },
    {
      name: 'effectiveAt',
      type: 'date',
      label: 'Дата вступления в силу',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Заполняется, когда документ принят; для «На рассмотрении» и «Официальное разъяснение» может быть пустым',
      },
    },
  ],
}

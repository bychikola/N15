import type { CollectionConfig } from 'payload'

/**
 * «Заявки на рекламу» — обращения с формы «Обсудить размещение рекламы»
 * на странице /advertising (имя, компания, телефон, почта, сообщение).
 *
 * Заявка приходит только серверным маршрутом /api/advertising/request:
 * публичного создания через REST нет (create запрещён, маршрут валидирует
 * поля и пишет согласие на обработку персональных данных). Согласие
 * обязательно — без него заявка не принимается.
 */
export const AdvertisingRequests: CollectionConfig = {
  slug: 'advertising-requests',
  labels: { singular: 'Заявка на рекламу', plural: 'Заявки на рекламу' },
  admin: {
    useAsTitle: 'name',
    group: 'Реклама',
    defaultColumns: ['name', 'company', 'phone', 'email', 'status', 'createdAt'],
    description: 'Обращения с формы «Обсудить размещение рекламы» на странице /advertising',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    // Заявки принимает только серверный маршрут формы (overrideAccess)
    create: () => false,
    update: ({ req: { user } }) => user?.role === 'admin' || user?.role === 'agent',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (!data.consent) {
          throw new Error('Без согласия на обработку персональных данных заявка не принимается')
        }
        return data
      },
    ],
    beforeChange: [
      ({ data, operation }) => {
        if (!data) return data
        // Фиксируем момент согласия — это юридически значимое действие
        if (operation === 'create' && data.consent) {
          data.consentAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Имя',
      required: true,
    },
    {
      name: 'company',
      type: 'text',
      label: 'Компания',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Электронная почта',
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Сообщение',
    },
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Согласие на обработку персональных данных',
      required: true,
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Отметка посетителя на форме. Без согласия заявка не принимается',
      },
    },
    {
      name: 'consentAt',
      type: 'date',
      label: 'Когда дано согласие',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Новая', value: 'new' },
        { label: 'В работе', value: 'inWork' },
        { label: 'Размещено', value: 'done' },
        { label: 'Отказ', value: 'rejected' },
      ],
      defaultValue: 'new',
      index: true,
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка',
      admin: { description: 'Что обсудили, какие условия предложили' },
    },
  ],
}

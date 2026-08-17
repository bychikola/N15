import type { CollectionConfig, Where } from 'payload'

export const Applications: CollectionConfig = {
  slug: 'applications',
  admin: {
    useAsTitle: 'clientName',
    group: 'Агентство',
    defaultColumns: ['clientName', 'type', 'status', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role === 'agent') {
        // Агент видит свои заявки + общий «Неразобранное»
        const where: Where = {
          or: [
            { user: { equals: user.id } },
            { 'agent.user': { equals: user.id } },
            { status: { equals: 'unsorted' } },
          ],
        }
        return where
      }
      return { user: { equals: user.id } }
    },
    create: () => true, // форма на сайте — любой, в т.ч. аноним
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role === 'agent') {
        // Агент правит назначенные ему заявки + любые из «Неразобранного»
        const where: Where = {
          or: [
            { 'agent.user': { equals: user.id } },
            { status: { equals: 'unsorted' } },
          ],
        }
        return where
      }
      return false
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      // Автопривязка заявки к клиенту по нормализованному номеру телефона.
      // Работает для всех создателей (гости и клиенты не имеют доступа
      // к коллекции customers через REST, поэтому привязка — на сервере).
      async ({ data, req }) => {
        if (!data.customer && data.clientPhone) {
          const norm = String(data.clientPhone).replace(/[^\d+]/g, '')
          if (norm) {
            const { docs } = await req.payload.find({
              collection: 'customers',
              where: { phone: { equals: norm } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            const customer = docs[0] as { id: number } | undefined
            if (customer) {
              data.customer = customer.id
            }
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      label: 'Тип заявки',
      options: [
        { label: 'Просмотр', value: 'viewing' },
        { label: 'Обратный звонок', value: 'callback' },
        { label: 'Ипотека', value: 'mortgage' },
        { label: 'Консультация', value: 'consultation' },
      ],
      required: true,
    },
    {
      name: 'object',
      type: 'relationship',
      label: 'Объект',
      relationTo: 'objects',
    },
    {
      name: 'clientName',
      type: 'text',
      label: 'Имя клиента',
      required: true,
    },
    {
      name: 'clientPhone',
      type: 'text',
      label: 'Телефон',
      admin: {
        description: 'Можно не указывать при ручном создании',
      },
    },
    {
      name: 'clientEmail',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Сообщение',
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Неразобранное', value: 'unsorted' },
        { label: 'Новая', value: 'new' },
        { label: 'Звонок', value: 'call' },
        { label: 'Показ', value: 'showing' },
        { label: 'Переговоры', value: 'negotiation' },
        { label: 'Сделка', value: 'deal' },
        { label: 'Закрыто', value: 'closed' },
        { label: 'Отказ', value: 'rejected' },
      ],
      defaultValue: 'unsorted',
      required: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Назначенный агент',
      relationTo: 'agents',
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [
        { name: 'tag', type: 'text', label: 'Тег' },
      ],
    },
    {
      name: 'lossReason',
      type: 'text',
      label: 'Причина отказа',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'budget',
      type: 'number',
      label: 'Бюджет (₽)',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'source',
      type: 'text',
      label: 'Источник',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Пользователь (владелец заявки)',
      relationTo: 'users',
      admin: {
        description: 'Заполняется автоматически, если заявка отправлена авторизованным пользователем',
      },
    },
    {
      name: 'customer',
      type: 'relationship',
      label: 'Клиент',
      relationTo: 'customers',
    },
  ],
}

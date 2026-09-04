import type { CollectionConfig, Where } from 'payload'

// Общий конструктор where-условия «участник диалога»
function participantWhere(userId: number | string): Where {
  return {
    or: [
      { 'application.user': { equals: userId } },
      { 'application.agent.user': { equals: userId } },
    ],
  }
}

export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Сообщение', plural: 'Сообщения' },
  admin: {
    useAsTitle: 'text',
    group: 'Агентство',
    defaultColumns: ['application', 'sender', 'text', 'read', 'createdAt'],
  },
  access: {
    // Участники диалога: владелец заявки, назначенный агент (по учётке), admin
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return participantWhere(user.id)
    },
    create: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return participantWhere(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // только отметка прочтения участником
      return participantWhere(user.id)
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'application',
      type: 'relationship',
      label: 'Заявка',
      relationTo: 'applications',
      required: true,
    },
    {
      name: 'sender',
      type: 'relationship',
      label: 'Отправитель',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Текст',
      required: true,
    },
    {
      name: 'read',
      type: 'checkbox',
      label: 'Прочитано',
      defaultValue: false,
    },
  ],
}

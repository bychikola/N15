import type { CollectionConfig } from 'payload'

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'title',
    group: 'Агентство',
    defaultColumns: ['title', 'type', 'dueDate', 'done'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Агент видит только свои задачи
      return { assignedTo: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { assignedTo: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { assignedTo: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Текст задачи',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      label: 'Тип задачи',
      options: [
        { label: 'Звонок', value: 'call' },
        { label: 'Показ', value: 'showing' },
        { label: 'Встреча', value: 'meeting' },
        { label: 'Задача', value: 'task' },
      ],
      required: true,
      defaultValue: 'call',
    },
    {
      name: 'dueDate',
      type: 'date',
      label: 'Срок',
      required: true,
    },
    {
      name: 'done',
      type: 'checkbox',
      label: 'Выполнена',
      defaultValue: false,
    },
    {
      name: 'application',
      type: 'relationship',
      label: 'Заявка',
      relationTo: 'applications',
    },
    {
      name: 'assignedTo',
      type: 'relationship',
      label: 'Ответственный',
      relationTo: 'users',
      required: true,
    },
  ],
}

import type { CollectionConfig } from 'payload'

// Задачи для ИИ-агента: запрос → воркер на сервере правит код, коммитит,
// пушит и деплоит. Доступ — только администратор.
export const AgentTasks: CollectionConfig = {
  slug: 'agent-tasks',
  admin: {
    useAsTitle: 'prompt',
    group: 'Система',
    defaultColumns: ['status', 'prompt', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'prompt',
      type: 'textarea',
      label: 'Запрос агенту',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'В очереди', value: 'queued' },
        { label: 'Выполняется', value: 'running' },
        { label: 'Готово', value: 'done' },
        { label: 'Ошибка', value: 'failed' },
      ],
      defaultValue: 'queued',
      required: true,
    },
    {
      name: 'log',
      type: 'textarea',
      label: 'Журнал действий',
      admin: {
        description: 'Стрим-лог работы агента (обновляется воркером)',
      },
    },
    {
      name: 'result',
      type: 'textarea',
      label: 'Результат',
      admin: {
        description: 'Краткий итог выполнения (заполняет воркер)',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Автор',
      relationTo: 'users',
    },
  ],
}

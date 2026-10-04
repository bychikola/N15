import { APIError, type CollectionConfig } from 'payload'
import { anonymizePrompt, checkPromptForPii, piiBlockMessage } from '@/lib/pii-guard'

// Задачи для ИИ-агента: запрос → воркер на сервере правит код, коммитит,
// пушит и деплоит. Чтение — у кого есть доступ к ИИ-агенту (agentAccess),
// но только СВОИ задачи: в журнале видны пути, куски кода и данные задачи —
// чужие журналы не показываем. Администратор видит и отменяет все задачи.
// Изменение/удаление — только администратор (отмена задачи идёт через
// /api/agent/tasks/[id] с проверкой автор-или-админ в маршруте).
export const AgentTasks: CollectionConfig = {
  slug: 'agent-tasks',
  labels: { singular: 'Задача агента', plural: 'Задачи агента' },
  admin: {
    useAsTitle: 'prompt',
    group: 'Система',
    defaultColumns: ['status', 'prompt', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return user.agentAccess ? { user: { equals: user.id } } : false
    },
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    // Единая точка контроля: ни маршрут CRM, ни Payload REST/админка не могут
    // поставить в очередь запрос с персональными данными — воркер ходит с этим
    // текстом во внешний ИИ (DeepSeek/ChatGPT). Разрешённый запрос дополнительно
    // обезличивается перед записью (второй слой, см. src/lib/pii-guard.ts).
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
        if (!prompt) return data
        const pii = checkPromptForPii(prompt)
        if (!pii.safe) {
          // APIError, а не Error: причина должна дойти до человека текстом,
          // без самих данных в сообщении (см. piiBlockMessage)
          throw new APIError(piiBlockMessage(pii.categories), 400)
        }
        data.prompt = anonymizePrompt(prompt)
        return data
      },
    ],
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
        { label: 'Отменена', value: 'cancelled' },
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

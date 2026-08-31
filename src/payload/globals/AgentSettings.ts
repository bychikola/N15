import type { GlobalConfig } from 'payload'

// Конфигурация ИИ-агента (Claude Code CLI): переменные окружения, которые
// воркер применяет перед запуском CLI (провайдер DeepSeek, ключ, модель…).
// Редактируется админом из модалки настроек на странице «ИИ-агент».
export const AgentSettings: GlobalConfig = {
  slug: 'agent-settings',
  label: 'ИИ-агент (конфигурация)',
  admin: {
    group: 'Система',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'envJson',
      type: 'textarea',
      label: 'Переменные окружения (JSON)',
      admin: {
        description:
          'JSON-объект env для Claude Code CLI: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL и др. Воркер применяет его перед каждым запуском.',
      },
    },
  ],
}

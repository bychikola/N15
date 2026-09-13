import type { GlobalConfig } from 'payload'

// «Интеграции площадок»: доступы к официальным каналам Авито, ЦИАН, Домклика
// и наших каналов публикации (VK, Telegram), плюс результаты проверок
// соединения. Редактируется администратором из CRM (раздел «Интеграции
// площадок») — в админке Payload группа «Система». Значения полей доступа
// наружу не отдаются: сервис показывает только признак «заполнено» и хвост
// значения (см. src/lib/platform-integrations.ts).
//
// Секреты доступов закрыты на чтение (access.read: false) — иначе глобал
// отдавал бы их открытым текстом в ответе /api/globals/platform-settings, и
// ключи утекли бы в браузер администратора, историю и логи. Сервер читает их
// через Local API с overrideAccess (см. platform-integration-service.ts),
// подставить значения заново можно только в CRM-форме — она их не показывает.
const secretRead = (): false => false

export const PlatformSettings: GlobalConfig = {
  slug: 'platform-settings',
  label: 'Интеграции площадок',
  admin: {
    group: 'Система',
    description:
      'Официальные доступы площадок (ключи, токены). Подключение и проверка соединения — в CRM, раздел «Интеграции площадок»: там видно, что доступ задан, а сами ключи не показываются.',
  },
  access: {
    // В настройках лежат ключи площадок — читать и менять может только администратор
    read: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Доступы площадок',
          fields: [
            {
              name: 'avito',
              type: 'group',
              label: 'Авито',
              fields: [
                { name: 'clientId', type: 'text', label: 'client_id', access: { read: secretRead } },
                { name: 'clientSecret', type: 'text', label: 'client_secret', access: { read: secretRead } },
              ],
            },
            {
              name: 'cian',
              type: 'group',
              label: 'ЦИАН',
              fields: [{ name: 'token', type: 'text', label: 'Токен API ЦИАН', access: { read: secretRead } }],
            },
            {
              name: 'domclick',
              type: 'group',
              label: 'Домклик',
              fields: [
                { name: 'token', type: 'text', label: 'Токен Домклик', access: { read: secretRead } },
                { name: 'companyId', type: 'text', label: 'ID компании', access: { read: secretRead } },
              ],
            },
            {
              name: 'vk',
              type: 'group',
              label: 'VK',
              fields: [
                { name: 'token', type: 'text', label: 'Токен сообщества', access: { read: secretRead } },
                { name: 'groupId', type: 'text', label: 'ID группы', access: { read: secretRead } },
              ],
            },
            {
              name: 'telegram',
              type: 'group',
              label: 'Telegram',
              fields: [{ name: 'token', type: 'text', label: 'Токен бота', access: { read: secretRead } }],
            },
          ],
        },
        {
          label: 'Проверки соединения',
          fields: [
            {
              name: 'checks',
              type: 'array',
              label: 'Последние проверки площадок',
              admin: {
                description:
                  'Заполняется автоматически при нажатии «Проверить соединение» в CRM: статус и ответ площадки на реальный запрос.',
              },
              fields: [
                {
                  name: 'platform',
                  type: 'select',
                  label: 'Площадка',
                  required: true,
                  options: [
                    { label: 'Авито', value: 'avito' },
                    { label: 'ЦИАН', value: 'cian' },
                    { label: 'Домклик', value: 'domclick' },
                    { label: 'Яндекс Недвижимость', value: 'yandex' },
                    { label: 'VK', value: 'vk' },
                    { label: 'Telegram', value: 'telegram' },
                  ],
                },
                {
                  name: 'status',
                  type: 'select',
                  label: 'Статус',
                  options: [
                    { label: 'Подключена', value: 'connected' },
                    { label: 'Доступ отклонён', value: 'authError' },
                    { label: 'Доступы сохранены — проверьте соединение', value: 'notChecked' },
                    { label: 'Площадка не подключена', value: 'notConfigured' },
                    { label: 'Нужен доступ администратора', value: 'needsAdmin' },
                    { label: 'Площадка не отвечает', value: 'unreachable' },
                  ],
                },
                { name: 'message', type: 'textarea', label: 'Ответ площадки' },
                { name: 'httpStatus', type: 'number', label: 'HTTP-код' },
                { name: 'checkedAt', type: 'date', label: 'Дата проверки' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

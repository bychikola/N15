import type { GlobalConfig } from 'payload'

// Состояние автосбора новостей (см. src/lib/news.ts и news-service.ts):
// когда каналы проверялись в последний раз, когда проверятся снова и что
// ответил каждый источник. Заполняется движком, сотрудники только читают —
// поэтому все поля readOnly, а «Автосбор» выключается галочкой.
export const NewsSettings: GlobalConfig = {
  slug: 'news-settings',
  label: 'Новости (автосбор)',
  admin: {
    group: 'Контент',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Автосбор включён',
      defaultValue: true,
      admin: {
        description: 'Выключить — движок перестанет читать RSS-каналы (уже собранные новости останутся в очереди)',
      },
    },
    {
      name: 'lastSweepAt',
      type: 'date',
      label: 'Последняя проверка источников',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'nextSweepAt',
      type: 'date',
      label: 'Следующая проверка',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'lastReport',
      type: 'textarea',
      label: 'Отчёт последней проверки',
      admin: {
        readOnly: true,
        description: 'Построчно: источник — сколько записей найдено, добавлено, пропущено, недоступен',
      },
    },
  ],
}

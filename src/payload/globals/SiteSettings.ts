import type { GlobalConfig } from 'payload'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Настройки сайта',
  admin: {
    group: 'Система',
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      label: 'Название сайта',
      defaultValue: 'Н15',
    },
    {
      name: 'logo',
      type: 'upload',
      label: 'Логотип',
      relationTo: 'media',
    },
    {
      name: 'phones',
      type: 'array',
      label: 'Телефоны',
      fields: [
        { name: 'phone', type: 'text', label: 'Номер' },
        { name: 'label', type: 'text', label: 'Подпись' },
      ],
    },
    {
      name: 'email',
      type: 'email',
      label: 'Электронная почта',
    },
    {
      name: 'address',
      type: 'text',
      label: 'Адрес',
    },
    {
      name: 'socialLinks',
      type: 'array',
      label: 'Социальные сети',
      fields: [
        { name: 'platform', type: 'text', label: 'Платформа' },
        { name: 'url', type: 'text', label: 'Ссылка' },
      ],
    },
    {
      name: 'defaultMetaTitle',
      type: 'text',
      label: 'SEO: Заголовок по умолчанию',
      defaultValue: 'Н15 — Агентство недвижимости',
    },
    {
      name: 'defaultMetaDescription',
      type: 'textarea',
      label: 'SEO: Описание по умолчанию',
    },
    {
      name: 'footerText',
      type: 'textarea',
      label: 'Текст в футере',
    },
    {
      name: 'metrikaId',
      type: 'text',
      label: 'Аналитика: номер счётчика Яндекс.Метрики',
      validate: (value?: string | null) =>
        value == null || value === '' || /^\d+$/.test(value.trim())
          ? true
          : 'Номер счётчика — только цифры, например 12345678',
      admin: {
        description:
          'Номер счётчика из Яндекс.Метрики (только цифры). Код счётчика и цели подключаются на всех страницах сайта и в CRM автоматически. Пусто — аналитика не подключена',
      },
    },
    {
      name: 'aboutPage',
      type: 'group',
      label: 'Страница «Об агентстве»',
      admin: { description: 'Контент страницы /about' },
      fields: [
        {
          name: 'heroTitle',
          type: 'text',
          label: 'Заголовок',
          defaultValue: 'Об агентстве',
        },
        {
          name: 'heroDescription',
          type: 'textarea',
          label: 'Описание под заголовком',
          admin: { description: 'Перенос строки разделяет текст на абзацы' },
          defaultValue:
            'Н15 — новое агентство недвижимости с командой специалистов, которые более 10 лет работают на рынке недвижимости и знают особенности Северной Осетии.\n' +
            'Мы сопровождаем клиентов при покупке, продаже и аренде квартир, частных домов, земельных участков и коммерческой недвижимости.',
        },
        {
          name: 'stats',
          type: 'array',
          label: 'Цифры',
          fields: [
            { name: 'value', type: 'text', label: 'Значение' },
            { name: 'label', type: 'text', label: 'Подпись' },
          ],
          // Компактные факты под первым экраном: опыт команды (не срок работы
          // агентства — оно новое), имя и специализация. Цифр по сделкам нет
          defaultValue: [
            { value: '10+ лет', label: 'Опыт команды' },
            { value: 'Н15', label: 'Новое имя' },
            { value: 'Северная Осетия', label: 'Наша специализация' },
          ],
        },
        {
          name: 'teamTitle',
          type: 'text',
          label: 'Заголовок блока команды',
          defaultValue: 'Наша команда',
        },
        {
          name: 'teamDescription',
          type: 'textarea',
          label: 'Описание блока команды',
          defaultValue: 'Агенты, которые знают рынок и сопровождают сделку до завершения',
        },
      ],
    },
  ],
}

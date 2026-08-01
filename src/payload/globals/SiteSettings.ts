import type { GlobalConfig } from 'payload'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  admin: {
    group: 'Система',
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      label: 'Название сайта',
      defaultValue: 'N15',
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
      label: 'Email',
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
      defaultValue: 'N15 — Агентство недвижимости',
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
          defaultValue: 'N15 — это премиальное агентство недвижимости с осетинским характером. Мы работаем с 2014 года и за это время провели более 850 успешных сделок.',
        },
        {
          name: 'whyTitle',
          type: 'text',
          label: 'Заголовок блока «Почему выбирают»',
          defaultValue: 'Почему выбирают N15',
        },
        {
          name: 'whyItems',
          type: 'array',
          label: 'Причины',
          fields: [
            { name: 'title', type: 'text', label: 'Заголовок' },
            { name: 'description', type: 'textarea', label: 'Описание' },
          ],
          defaultValue: [
            { title: 'Экспертиза рынка', description: 'Знаем каждый район, каждую улицу. 12 лет на рынке недвижимости Северной Осетии.' },
            { title: 'Полное сопровождение', description: 'От поиска до подписания договора. Юридическая проверка, оценка, переговоры.' },
            { title: 'Премиум-сервис', description: 'Индивидуальный подход к каждому клиенту. Конфиденциальность и безупречный сервис.' },
          ],
        },
        {
          name: 'stats',
          type: 'array',
          label: 'Цифры',
          fields: [
            { name: 'value', type: 'text', label: 'Значение' },
            { name: 'label', type: 'text', label: 'Подпись' },
          ],
          defaultValue: [
            { value: '12', label: 'Лет на рынке' },
            { value: '850+', label: 'Сделок' },
            { value: '15', label: 'Экспертов' },
            { value: '98%', label: 'Довольных клиентов' },
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
          defaultValue: 'Эксперты с глубоким знанием рынка и индивидуальным подходом',
        },
      ],
    },
  ],
}

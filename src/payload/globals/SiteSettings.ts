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
  ],
}

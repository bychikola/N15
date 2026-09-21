import type { CollectionConfig } from 'payload'

// Посещения сайта — обезличенные данные счётчика (см. src/lib/site-stats.ts):
// визит = серия просмотров одного посетителя с перерывом меньше 30 минут.
// IP и User-Agent здесь не хранятся, только необратимый хеш посетителя.
//
// Записи создаёт и продлевает только серверный счётчик (маршрут /api/visit)
// через Local API: снаружи через REST коллекцию не записать и не поправить.
// Читать — только администратор: отчёт открывается в CRM → «Статистика сайта»
// (src/app/crm/site-stats), агентам и клиентам статистика не показывается.
export const SiteVisits: CollectionConfig = {
  slug: 'site-visits',
  labels: { singular: 'Посещение сайта', plural: 'Посещения сайта' },
  admin: {
    useAsTitle: 'landing',
    group: 'Система',
    defaultColumns: ['createdAt', 'landing', 'source', 'device', 'pageviews'],
    description: 'Технические данные счётчика посещений сайта. Отчёт — в CRM, раздел «Статистика сайта»',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    // Пишет только счётчик (Local API с overrideAccess): вручную из админки
    // и по REST визиты не создать и не изменить — статистика не подделывается
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'visitor',
      type: 'text',
      label: 'Посетитель (обезличенный хеш)',
      index: true,
      admin: {
        readOnly: true,
        description: 'HMAC от IP и браузера с секретом сайта. Ни IP, ни User-Agent не хранятся',
      },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Источник визита',
      options: [
        { label: 'Прямой заход', value: 'direct' },
        { label: 'Переход из поиска', value: 'search' },
        { label: 'Соцсети и мессенджеры', value: 'social' },
        { label: 'Переход с сайта', value: 'referral' },
      ],
    },
    {
      name: 'referrer',
      type: 'text',
      label: 'Сайт-источник',
      admin: { description: 'Только домен перехода, без адреса страницы и параметров' },
    },
    {
      name: 'device',
      type: 'select',
      label: 'Устройство',
      options: [
        { label: 'Компьютер', value: 'desktop' },
        { label: 'Телефон', value: 'mobile' },
        { label: 'Планшет', value: 'tablet' },
      ],
    },
    {
      name: 'landing',
      type: 'text',
      label: 'Страница входа',
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      label: 'Последняя активность',
      admin: { description: 'Пока перерыв меньше 30 минут, новые просмотры продолжают этот визит' },
    },
    {
      name: 'pageviews',
      type: 'number',
      label: 'Просмотров страниц',
    },
    {
      name: 'pages',
      type: 'array',
      label: 'Просмотренные страницы',
      admin: { description: 'Порядок просмотра внутри визита' },
      fields: [{ name: 'path', type: 'text', label: 'Адрес' }],
    },
  ],
}

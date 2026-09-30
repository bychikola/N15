import type { CollectionConfig } from 'payload'

// Посетители сайта — обезличенные карточки для отчётов CRM
// (см. src/lib/visitor-tracking.ts, раздел «Аналитика → Посетители»).
//
// Карточка заводится счётчиком (/api/visit) на первый заход и хранит только
// то, что нужно отчёту: номер для подписи «Посетитель #184», даты первого и
// последнего визита, число визитов и просмотров, устройство, источник и
// приблизительный регион. Ни IP, ни User-Agent, ни cookie здесь нет:
// идентификатор посетителя — необратимый хеш (см. visitorHash в site-stats).
//
// Связь с человеком появляется только тогда, когда он сам оставил контакты в
// форме: заявка привязывается к карточке (applications/user), и в CRM видно
// активность на сайте рядом с обращением. ФИО, телефон и почта в карточку
// посетителя не копируются — они остаются в заявке, к которой есть доступ
// по правилам коллекции applications.
export const Visitors: CollectionConfig = {
  slug: 'visitors',
  labels: { singular: 'Посетитель сайта', plural: 'Посетители сайта' },
  admin: {
    useAsTitle: 'title',
    group: 'Аналитика',
    defaultColumns: ['title', 'lastSeenAt', 'visitsCount', 'device', 'source', 'identified'],
    description:
      'Обезличенные карточки посетителей сайта. Отчёты — в CRM, разделы «Посетители» и «Интерес к объектам»',
  },
  access: {
    // Данные аналитики — только администратор: агентам и клиентам они не
    // показываются (та же проверка на страницах /crm/visitors и /crm/interest)
    read: ({ req: { user } }) => user?.role === 'admin',
    // Заводит и обновляет только счётчик (Local API с overrideAccess):
    // вручную из админки и по REST карточку не создать и не поправить
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название',
      admin: {
        readOnly: true,
        description: 'Подпись для отчётов: «Посетитель #184»',
      },
    },
    {
      name: 'number',
      type: 'number',
      label: 'Номер посетителя',
      index: true,
      admin: {
        readOnly: true,
        description: 'Сквозной номер карточки — по нему посетитель подписан в отчётах',
      },
    },
    {
      name: 'visitor',
      type: 'text',
      label: 'Обезличенный идентификатор',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'HMAC от IP и браузера с секретом сайта (соль — календарный месяц). Ни IP, ни User-Agent не хранятся',
      },
    },
    {
      name: 'firstSeenAt',
      type: 'date',
      label: 'Первый визит',
      admin: { readOnly: true },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      label: 'Последний визит',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'visitsCount',
      type: 'number',
      label: 'Визитов',
      admin: {
        readOnly: true,
        description: 'Визит — серия просмотров с перерывом меньше 30 минут',
      },
    },
    {
      name: 'pageviewsCount',
      type: 'number',
      label: 'Просмотров страниц',
      admin: { readOnly: true },
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
      admin: { readOnly: true },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Источник первого визита',
      options: [
        { label: 'Прямой заход', value: 'direct' },
        { label: 'Переход из поиска', value: 'search' },
        { label: 'Соцсети и мессенджеры', value: 'social' },
        { label: 'Переход с сайта', value: 'referral' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'referrer',
      type: 'text',
      label: 'Сайт-источник',
      admin: {
        readOnly: true,
        description: 'Только домен перехода, без адреса страницы и параметров',
      },
    },
    {
      name: 'lastPath',
      type: 'text',
      label: 'Последняя страница',
      admin: { readOnly: true },
    },
    {
      name: 'region',
      type: 'text',
      label: 'Регион (приблизительно)',
      admin: {
        readOnly: true,
        description:
          'Только то, что сообщает прокси или CDN в заголовке запроса. Пусто — регион не определён: по IP он не вычисляется, а сам IP не хранится',
      },
    },
    {
      name: 'identified',
      type: 'checkbox',
      label: 'Оставил обращение или зарегистрировался',
      admin: {
        readOnly: true,
        description:
          'Ставится, когда посетитель сам оставил контакты в форме или вошёл в аккаунт. Скрытой деанонимизации нет',
      },
    },
    {
      name: 'applications',
      type: 'relationship',
      label: 'Обращения',
      relationTo: 'applications',
      hasMany: true,
      admin: {
        readOnly: true,
        description: 'Заявки, отправленные с этого браузера (связь ставит сервер при отправке формы)',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Аккаунт',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'Заполняется, если посетитель вошёл в личный кабинет',
      },
    },
  ],
}

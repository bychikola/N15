import type { CollectionConfig } from 'payload'

/**
 * «Ссылки управления объявлениями собственников» — одноразово выдаваемые
 * защищённые ссылки, по которым собственник без личного кабинета попадает
 * к своему объявлению на доске.
 *
 * Зачем отдельная коллекция, а не поля в самом объявлении: объявление —
 * публичная сущность доски, а доступ к управлению — персональный секрет
 * владельца. Здесь лежит только НЕОБРАТИМЫЙ хеш токена с секретом сайта
 * (как у кодов подтверждения, см. src/lib/owner-verify.ts): утечка дампа
 * базы не даёт воспользоваться чужой ссылкой. Сам токен показывается
 * администратору один раз при выдаче и больше нигде не хранится.
 *
 * Ссылка привязана к конкретному объявлению (boardAd) — и только к нему:
 * проверка идёт по хешу токена, а не по номеру объявления, поэтому угадать
 * или подставить чужой номер нельзя. Живёт 24 часа (expiresAt), выданную
 * ранее ссылку перевыпуск гасит (revokedAt).
 *
 * Коллекция закрыта целиком: создаёт записи только сервер при выдаче
 * (overrideAccess), читать и удалять может администратор. Публичного REST
 * тут нет.
 */
export const OwnerManageLinks: CollectionConfig = {
  slug: 'owner-manage-links',
  labels: { singular: 'Ссылка управления', plural: 'Ссылки управления' },
  admin: {
    useAsTitle: 'boardAd',
    group: 'Заявки собственников',
    defaultColumns: ['boardAd', 'issuedAt', 'expiresAt', 'revokedAt'],
    description:
      'Защищённые ссылки для собственников: доступ к своему объявлению без личного кабинета. Хранится только хеш токена',
  },
  access: {
    // Ссылка — ключ доступа к персональному объявлению: видит только администратор
    read: ({ req: { user } }) => user?.role === 'admin',
    // Создание — только сервером при выдаче (overrideAccess), REST закрыт
    create: () => false,
    // Правок из админки нет: ссылку выдают и гасят серверные функции
    update: () => false,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      // В базе — только хеш: сам токен показывается администратору один раз
      // при выдаче и в записи не сохраняется
      name: 'tokenHash',
      type: 'text',
      label: 'Хеш токена',
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      // Привязка к объявлению: ссылка даёт доступ ровно к нему и ни к чему
      // другому. Номер объявления на сайте в ссылке не участвует
      name: 'boardAd',
      type: 'relationship',
      relationTo: 'board-ads',
      label: 'Объявление',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      // Заявка, из которой собрано объявление: по ней проверяется, что контакт
      // собственника подтверждён вручную, и восстанавливается traceability
      name: 'ownerApplication',
      type: 'relationship',
      relationTo: 'owner-applications',
      label: 'Заявка собственника',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'issuedAt',
      type: 'date',
      label: 'Выдана',
      required: true,
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      // Срок действия ссылки — 24 часа. Просроченная ссылка не работает даже
      // если запись осталась: право доступа проверяется по этой дате
      name: 'expiresAt',
      type: 'date',
      label: 'Действует до',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Ссылка живёт 24 часа с момента выдачи',
      },
    },
    {
      // Гашение при перевыпуске: активной считается только последняя ссылка
      // на объявление. Отозванная ссылка не работает раньше срока expiresAt
      name: 'revokedAt',
      type: 'date',
      label: 'Отозвана',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Ставится при перевыпуске: активной остаётся только последняя ссылка',
      },
    },
    {
      name: 'issuedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Выдал',
      admin: { readOnly: true, description: 'Администратор, который выдал ссылку' },
    },
  ],
}

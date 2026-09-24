import { APIError, type CollectionConfig, type Where } from 'payload'

/**
 * Сообщение — в диалоге по заявке (клиент ↔ агент) или по объявлению доски
 * (покупатель ↔ автор объявления).
 *
 * Диалоги разные, а хранение общее: у записи либо `application` (заявка), либо
 * `boardAd` (объявление доски). Второй вид появился вместе с доской объявлений:
 * покупатель пишет автору прямо со страницы объявления, автор отвечает
 * в личном кабинете. Публичный маршрут создания у доски свой
 * (/api/board/messages) — он проверяет, что объявление опубликовано, что автор
 * отвечает покупателю, а не наоборот, и что себе писать нельзя.
 *
 * `counterpart` — вторая сторона диалога доски. По ней видно, кто с кем
 * переписывается: пара «объявление + покупатель» и есть диалог (автор у
 * объявления один), поэтому переписка выбирается запросом по этим двум полям.
 */
// Общий конструктор where-условия «участник диалога»
function participantWhere(userId: number | string): Where {
  return {
    or: [
      { 'application.user': { equals: userId } },
      { 'application.agent.user': { equals: userId } },
      // Диалоги доски: участник — тот, кто написал, и тот, кому написали
      { sender: { equals: userId } },
      { counterpart: { equals: userId } },
    ],
  }
}

export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Сообщение', plural: 'Сообщения' },
  admin: {
    useAsTitle: 'text',
    group: 'Агентство',
    defaultColumns: ['application', 'sender', 'text', 'read', 'createdAt'],
  },
  access: {
    // Участники диалога: владелец заявки, назначенный агент (по учётке), admin
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return participantWhere(user.id)
    },
    create: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return participantWhere(user.id)
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // только отметка прочтения участником
      return participantWhere(user.id)
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'application',
      type: 'relationship',
      label: 'Заявка',
      relationTo: 'applications',
      // Не обязательна: у сообщений доски вместо заявки — объявление
      // (boardAd). Одно из двух полей заполнено всегда — проверяет
      // beforeValidate ниже
    },
    {
      name: 'boardAd',
      type: 'relationship',
      label: 'Объявление доски',
      relationTo: 'board-ads',
      index: true,
    },
    {
      name: 'counterpart',
      type: 'relationship',
      label: 'Собеседник',
      relationTo: 'users',
      index: true,
      admin: {
        description:
          'Вторая сторона диалога по объявлению доски — по ней переписка выбирается целиком',
      },
    },
    {
      name: 'sender',
      type: 'relationship',
      label: 'Отправитель',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Текст',
      required: true,
    },
    {
      name: 'read',
      type: 'checkbox',
      label: 'Прочитано',
      defaultValue: false,
    },
  ],
  hooks: {
    // Сообщение принадлежит либо заявке, либо объявлению доски: без одного
    // из этих полей запись не привязана ни к какому диалогу, и её никто
    // не увидит — это ошибка, а не «пустое поле»
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        // При обновлении приходит только изменённая часть (например, отметка
        // прочтения) — недостающее поле берём из прежней записи, иначе
        // сохранение прочитанного падало бы «сообщение ни к чему не относится»
        const prev = (originalDoc || {}) as Record<string, unknown>
        const application = data.application !== undefined ? data.application : prev.application
        const boardAd = data.boardAd !== undefined ? data.boardAd : prev.boardAd
        if (Boolean(application) === Boolean(boardAd)) {
          // APIError, а не Error: причина должна дойти до человека текстом,
          // а не превратиться в «Something went wrong» с кодом 500
          // (то же правило в коллекции объявлений, см. BoardAds.ts)
          throw new APIError(
            'Сообщение должно относиться либо к заявке, либо к объявлению доски — и только к одному из них',
            400,
          )
        }
        return data
      },
    ],
  },
}

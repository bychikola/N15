import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Пользователь', plural: 'Пользователи' },
  auth: {
    // Вход по номеру телефона (username) или email. Почта необязательна —
    // регистрация идёт по телефону, он и есть логин. requireUsername: false —
    // старые аккаунты (созданные только по почте) продолжают заходить по email.
    loginWithUsername: {
      allowEmailLogin: true,
      requireEmail: false,
      requireUsername: false,
    },
  },
  admin: {
    useAsTitle: 'email',
    group: 'Система',
  },
  access: {
    create: () => true,       // Anyone can register
    read: ({ req: { user } }) => !!user,  // Only logged-in users can read
    // Свой профиль — любому залогиненному, чужие аккаунты — только администратор
    update: ({ req: { user }, id }) => {
      if (!user) return false
      return user.role === 'admin' || id === user.id
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      // Первый созданный пользователь автоматически становится администратором,
      // иначе «Create First User» создаёт аккаунт с ролью 'user' и админка
      // отвечает «You are not allowed to perform this action».
      async ({ data, req }) => {
        // Привилегии (роль, доступ к ИИ-агенту) выставляет только администратор.
        // Не-админу роль не удаляем целиком: Payload валидирует данные ещё раз
        // после beforeChange, и отсутствие обязательной роли превратило бы
        // обычную регистрацию клиента (role=user) в ошибку «Роль: обязательно».
        // Убираем только заявку на привилегированную роль; явный user остаётся.
        if (req.user?.role !== 'admin' && data) {
          if (data.role && data.role !== 'user') {
            delete data.role
          }
          delete data.agentAccess
        }
        // Первый созданный пользователь автоматически становится администратором,
        // иначе «Create First User» создаёт аккаунт с ролью 'user' и админка
        // отвечает «You are not allowed to perform this action».
        if (data && !data.id) {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          if (totalDocs === 0) {
            data.role = 'admin'
          }
        }
        // username = нормализованный телефон (логин по номеру)
        if (data?.phone) {
          const norm = String(data.phone).replace(/[^\d+]/g, '')
          data.phone = norm
          if (!data.username) {
            data.username = norm
          }
        }
        return data
      },
    ],
    afterChange: [
      // Привязка «анонимных» заявок к только что зарегистрированному
      // пользователю по номеру телефона: в ЛК появятся его старые заявки
      // и чаты с агентами.
      async ({ doc, req }) => {
        if (!doc || !doc.id || !doc.phone) return
        const norm = String(doc.phone).replace(/[^\d+]/g, '')
        if (!norm) return
        const userId = doc.id as number
        // Откладываем привязку: хук выполняется внутри транзакции создания
        // пользователя, и Postgres ещё не видит нового юзера (FK падает).
        // Через 1.5с транзакция закоммичена — привязка проходит.
        setTimeout(() => {
          void (async () => {
            try {
              const { docs } = await req.payload.find({
                collection: 'applications',
                where: {
                  and: [
                    { clientPhone: { equals: norm } },
                    { user: { equals: null } },
                  ],
                },
                limit: 200,
                depth: 0,
                overrideAccess: true,
              })
              for (const app of docs) {
                await req.payload.update({
                  collection: 'applications',
                  id: app.id,
                  data: { user: userId },
                  overrideAccess: true,
                })
              }
            } catch (e) {
              // Привязка не должна ломать регистрацию
              console.error('attach applications failed:', e)
            }
          })()
        }, 1500)
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Имя',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон (логин)',
      admin: {
        description: 'Номер телефона — логин для входа. По нему подтягиваются ваши заявки.',
      },
    },
    {
      name: 'role',
      type: 'select',
      label: 'Роль',
      options: [
        { label: 'Клиент', value: 'user' },
        { label: 'Агент', value: 'agent' },
        { label: 'Администратор', value: 'admin' },
      ],
      defaultValue: 'user',
      required: true,
    },
    {
      name: 'agentAccess',
      type: 'checkbox',
      label: 'Доступ к ИИ-агенту',
      defaultValue: false,
      access: {
        // Выставлять при создании и менять может только администратор —
        // иначе юзер сам себе откроет доступ (регистрация открыта для всех)
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description: 'Открывает вкладку «ИИ-агент» в CRM: страница /crm/agent, задачи и настройки агента.',
      },
    },
    {
      name: 'favorites',
      type: 'relationship',
      label: 'Избранное',
      relationTo: 'objects',
      hasMany: true,
    },
  ],
}

import { APIError, type CollectionConfig } from 'payload'
// Редакция правовых документов, действующая на момент регистрации
// (см. src/lib/legal-docs.ts): сохраняется в аккаунте
import { LEGAL_VERSION } from '@/lib/legal-docs'

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
      async ({ data, req, operation }) => {
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
          delete data.canManageAgents
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
        // Согласие при регистрации с сайта. Дата и редакция документов
        // проставляются сервером — из формы приходит только сама отметка.
        // Без отметки аккаунт с сайта не заводим: регистрация собирает
        // персональные данные (имя, телефон, почту). Аккаунты из админки
        // (первый администратор при запуске, клиенты из CRM) не ограничиваем:
        // там галочки нет, а доступ и так только у вошедшей команды.
        if (operation === 'create' && !req.user && data?.consent !== true) {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          if (totalDocs > 0) {
            // APIError, а не Error: текст причины должен дойти до формы
            throw new APIError('Отметьте согласие с документами', 400)
          }
        }
        if (operation === 'create' && data?.consent === true) {
          data.consentAt = new Date().toISOString()
          data.legalVersion = LEGAL_VERSION
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
      name: 'canManageAgents',
      type: 'checkbox',
      label: 'Может добавлять и редактировать агентов',
      defaultValue: false,
      access: {
        // Как и доступ к ИИ-агенту: выставляет только администратор
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description:
          'Разрешает кнопки «Добавить агента» и «Редактировать» в CRM (раздел «Агенты»): профиль агента — имя, должность, контакты, фото, активность.',
      },
    },
    {
      name: 'favorites',
      type: 'relationship',
      label: 'Избранное',
      relationTo: 'objects',
      hasMany: true,
    },
    // Отметка согласия с формы регистрации (/register): аккаунт заводится на
    // персональных данных, поэтому без неё пользователя не создаём. Отметку
    // видно в карточке пользователя, дату и редакцию документов ставит сервер
    // (см. beforeChange) — из формы они не приходят
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Согласие на обработку данных (регистрация)',
      admin: {
        readOnly: true,
        description:
          'Отметка с формы регистрации: пользовательский договор /documents/user-agreement и согласие /documents/personal-data-consent',
      },
    },
    {
      name: 'consentAt',
      type: 'date',
      label: 'Согласие принято (дата)',
      admin: {
        readOnly: true,
        description: 'Проставляет сервер при регистрации',
      },
    },
    {
      name: 'legalVersion',
      type: 'text',
      label: 'Версия документов',
      admin: {
        readOnly: true,
        description: 'Редакция правовых документов, действовавшая при регистрации',
      },
    },
  ],
}

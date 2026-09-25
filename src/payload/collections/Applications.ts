import { APIError, type CollectionConfig, type Where } from 'payload'
// Категории объектов — общий справочник: тип недвижимости в заявке на подбор
// выбирается из тех же значений, что и категория объекта (см. object-categories)
import { OBJECT_CATEGORIES } from '@/lib/object-categories'
// Редакция правовых документов, действующая на момент отправки формы
// (см. src/lib/legal-docs.ts): сохраняется в заявке, чтобы принятые условия
// не менялись задним числом при обновлении текстов
import { LEGAL_VERSION } from '@/lib/legal-docs'

export const Applications: CollectionConfig = {
  slug: 'applications',
  labels: { singular: 'Заявка', plural: 'Заявки' },
  admin: {
    useAsTitle: 'clientName',
    group: 'Агентство',
    defaultColumns: ['clientName', 'type', 'status', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role === 'agent') {
        // Агент видит свои заявки + общий «Неразобранное»
        const where: Where = {
          or: [
            { user: { equals: user.id } },
            { 'agent.user': { equals: user.id } },
            { status: { equals: 'unsorted' } },
          ],
        }
        return where
      }
      return { user: { equals: user.id } }
    },
    create: () => true, // форма на сайте — любой, в т.ч. аноним
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (user.role === 'agent') {
        // Агент правит назначенные ему заявки + любые из «Неразобранного»
        const where: Where = {
          or: [
            { 'agent.user': { equals: user.id } },
            { status: { equals: 'unsorted' } },
          ],
        }
        return where
      }
      return false
    },
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      // Отметки согласий с форм сайта: из формы приходит только сама галочка
      // (consent, consentCallback, marketingConsent), а дату и редакцию
      // документов ставит сервер — клиент их не присылает и не может
      // подделать. Заявку без обязательной отметки сайт не принимает: галочка
      // в форме обязательна, и то же правило проверяется здесь — запрос в обход
      // формы получает отказ. Заявки, заведённые вручную из CRM (источник не
      // «site»), не ограничиваем: агенту галочку поставить негде.
      async ({ data, originalDoc, operation }) => {
        if (data.consent === true || data.consentCallback === true) {
          const prev = (originalDoc || {}) as Record<string, unknown>
          data.legalVersion = LEGAL_VERSION
          if (!prev.consentAt) data.consentAt = new Date().toISOString()
        }
        if (operation === 'create' && data.source === 'site' && data.consent !== true) {
          // APIError, а не Error: текст причины должен дойти до формы
          throw new APIError('Отметьте согласие на обработку персональных данных', 400)
        }
        return data
      },
      // Автопривязка заявки к клиенту (customers) и пользователю (users)
      // по нормализованному номеру телефона. Работает для всех создателей
      // (гости не имеют доступа к коллекциям через REST — привязка на сервере).
      async ({ data, req }) => {
        if (!data.customer && data.clientPhone) {
          const norm = String(data.clientPhone).replace(/[^\d+]/g, '')
          if (norm) {
            try {
              const [custRes, userRes] = await Promise.all([
                req.payload.find({
                  collection: 'customers',
                  where: { phone: { equals: norm } },
                  limit: 1,
                  depth: 0,
                  overrideAccess: true,
                }),
                req.payload.find({
                  collection: 'users',
                  where: { phone: { equals: norm } },
                  limit: 1,
                  depth: 0,
                  overrideAccess: true,
                }),
              ])
              const customer = custRes.docs[0] as { id: number } | undefined
              if (customer) {
                data.customer = customer.id
              }
              // Если такой пользователь уже зарегистрирован — заявка сразу
              // попадает в его личный кабинет и чат с агентом
              const user = userRes.docs[0] as { id: number } | undefined
              if (user && !data.user) {
                data.user = user.id
              }
            } catch (e) {
              // Привязка не должна ломать создание заявки
              console.error('attach user/customer failed:', e)
            }
          }
        }

        // Заявка с карточки объекта адресуется ответственному агенту этого
        // объекта — тому же, кому АТС направляет звонок по объекту (см.
        // src/lib/call-routing.ts). Ответственного назначает администратор,
        // и клиент, оставивший заявку на просмотр, должен попасть к нему,
        // а не в общую очередь. Заявку без объекта (подбор, оценка) не
        // трогаем: её разбирает дежурный по очереди «Неразобранные» — при
        // переводе в работу агент становится ответственным сам (см. LeadsList)
        if (data.object && !data.agent) {
          try {
            const objRes = await req.payload.find({
              collection: 'objects',
              where: { id: { equals: data.object } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            // Поле читаем с overrideAccess: у объекта без ответственного
            // агента оно пустое, и заявка остаётся нераспределённой
            const objAgent = (objRes.docs[0] as { agent?: number | { id: number } } | undefined)?.agent
            const agentId = typeof objAgent === 'object' && objAgent ? objAgent.id : objAgent
            if (typeof agentId === 'number') data.agent = agentId
          } catch (e) {
            // Поиск агента не должен ломать создание заявки
            console.error('attach object agent failed:', e)
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      label: 'Тип заявки',
      // Новые типы дописываются в конец списка: порядок значений совпадает
      // с порядком enum в базе (см. memory payload-schema-autopush)
      options: [
        { label: 'Просмотр', value: 'viewing' },
        { label: 'Обратный звонок', value: 'callback' },
        { label: 'Ипотека', value: 'mortgage' },
        { label: 'Консультация', value: 'consultation' },
        // Формы раздела «Услуги» и каталога (см. LeadForm)
        { label: 'Оценка объекта', value: 'valuation' },
        { label: 'Продажа объекта', value: 'sale' },
        { label: 'Подбор недвижимости', value: 'selection' },
        { label: 'Заявка на поиск', value: 'search' },
      ],
      required: true,
    },
    {
      name: 'object',
      type: 'relationship',
      label: 'Объект',
      relationTo: 'objects',
    },
    {
      name: 'clientName',
      type: 'text',
      label: 'Имя клиента',
      required: true,
    },
    {
      name: 'clientPhone',
      type: 'text',
      label: 'Телефон',
      admin: {
        description: 'Можно не указывать при ручном создании',
      },
    },
    {
      name: 'clientEmail',
      type: 'email',
      label: 'Электронная почта',
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Сообщение',
    },
    {
      name: 'marketingConsent',
      type: 'checkbox',
      label: 'Согласие на рекламные сообщения',
      admin: {
        description:
          'Отдельная необязательная галочка с формы на сайте: согласие на обработку персональных данных её не заменяет и наоборот',
      },
    },
    // Отметки согласий с формы: сохраняются вместе с заявкой, чтобы в CRM было
    // видно, на что человек согласился. Дата и редакция документов —
    // серверные (см. beforeChange), в форме их нет
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Согласие на обработку персональных данных',
      admin: {
        description:
          'Обязательная галочка формы на сайте. Подтверждает согласие на обработку персональных данных на условиях /documents/personal-data-consent и политики /privacy',
      },
    },
    {
      name: 'consentCallback',
      type: 'checkbox',
      label: 'Согласие на обратный звонок',
      admin: {
        description:
          'Форма «Напишите нам» на /contacts: согласие на обратный звонок и обработку номера телефона (/documents/callback-consent)',
      },
    },
    {
      name: 'consentAt',
      type: 'date',
      label: 'Согласия приняты (дата)',
      admin: {
        readOnly: true,
        description: 'Проставляет сервер при сохранении заявки с отметками согласий',
      },
    },
    {
      name: 'legalVersion',
      type: 'text',
      label: 'Версия документов',
      admin: {
        readOnly: true,
        description: 'Редакция правовых документов, действовавшая на момент отправки формы',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Неразобранное', value: 'unsorted' },
        { label: 'Новая заявка', value: 'new' },
        { label: 'Звонок', value: 'call' },
        { label: 'Показ', value: 'showing' },
        { label: 'Переговоры', value: 'negotiation' },
        { label: 'Сделка', value: 'deal' },
        { label: 'Завершено', value: 'closed' },
        { label: 'Отказ', value: 'rejected' },
      ],
      defaultValue: 'unsorted',
      required: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Назначенный агент',
      relationTo: 'agents',
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [
        { name: 'tag', type: 'text', label: 'Тег' },
      ],
    },
    {
      name: 'lossReason',
      type: 'text',
      label: 'Причина отказа',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'budget',
      type: 'number',
      label: 'Бюджет (₽)',
      admin: {
        position: 'sidebar',
      },
    },
    // Что ищет клиент в заявке на подбор (формы «Подбор недвижимости» и
    // «Заявка на поиск», см. LeadForm): тип недвижимости — из общего
    // справочника категорий, район или населённый пункт — свободным текстом
    // (клиент пишет и «Иристонский район», и «с. Октябрьское»)
    {
      name: 'propertyType',
      type: 'select',
      label: 'Тип недвижимости',
      options: OBJECT_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
    },
    {
      name: 'location',
      type: 'text',
      label: 'Район или населённый пункт',
    },
    {
      name: 'source',
      type: 'text',
      label: 'Источник',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Пользователь (владелец заявки)',
      relationTo: 'users',
      admin: {
        description: 'Заполняется автоматически, если заявка отправлена авторизованным пользователем',
      },
    },
    {
      name: 'customer',
      type: 'relationship',
      label: 'Клиент',
      relationTo: 'customers',
    },
  ],
}

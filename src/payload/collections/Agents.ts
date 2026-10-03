import type { CollectionConfig } from 'payload'
import { formatRuPhone } from '@/lib/phone'

export const Agents: CollectionConfig = {
  slug: 'agents',
  labels: { singular: 'Агент', plural: 'Агенты' },
  admin: {
    useAsTitle: 'name',
    group: 'Агентство',
    defaultColumns: ['name', 'position', 'phone', 'isActive'],
  },
  access: {
    // Витрина команды открыта всем: имя, должность, фото, опыт и сделки —
    // данные для клиента. Персональные и внутренние поля (телефон, почта,
    // Telegram, WhatsApp, номер в АТС, связь с учётной записью) срезает
    // полевая проверка ниже — публично уходит только то, что предназначено
    // клиенту, без правки остальных страниц.
    read: () => true,
    // Заводить и править карточки может только администратор или сотрудник
    // с явным разрешением canManageAgents (галочка «Может добавлять и
    // редактировать агентов» в Users.ts) — то же условие, что в маршруте
    // /api/agents/manage. Обычный агент чужой профиль не меняет: раньше
    // сюда проходил любой вошедший (в том числе клиент role=user).
    create: ({ req: { user } }) => user?.role === 'admin' || user?.canManageAgents === true,
    update: ({ req: { user } }) => user?.role === 'admin' || user?.canManageAgents === true,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    /**
     * Телефоны приводим к одному виду («+7 (918) 828-40-88») при сохранении.
     * Хук стоит на коллекции, а не в маршруте CRM: тогда одинаково
     * нормализуются и правка из админки, и запись из CRM, и запрос через API.
     *
     * WhatsApp хранит и ссылку wa.me: её formatRuPhone не трогает (значение
     * с буквами возвращается как есть), а номер приводит к тому же виду.
     */
    beforeChange: [
      ({ data }) => {
        if (typeof data?.phone === 'string') data.phone = formatRuPhone(data.phone)
        if (typeof data?.whatsapp === 'string') data.whatsapp = formatRuPhone(data.whatsapp)
        return data
      },
    ],
    /**
     * То же на чтении: записи, сохранённые до нормализации (например,
     * «+79188255353»), показываются ровным номером без разовой правки базы,
     * а после первого же сохранения карточки значение станет каноничным
     * уже в самой записи.
     */
    afterRead: [
      ({ doc }) => {
        if (typeof doc?.phone === 'string') doc.phone = formatRuPhone(doc.phone)
        if (typeof doc?.whatsapp === 'string') doc.whatsapp = formatRuPhone(doc.whatsapp)
        return doc
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
      name: 'photo',
      type: 'upload',
      label: 'Фото',
      relationTo: 'media',
    },
    {
      name: 'position',
      type: 'text',
      label: 'Должность',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
      // Номер агента — персональные данные: посетителям и клиентам сайта он
      // не показывается (поле исчезает из выдачи — и из SSR-разметки страниц,
      // и из REST-ответов каталога). Кнопки «Позвонить»/«WhatsApp» получают
      // номер по отдельному запросу в момент нажатия (см. /api/agents/contact).
      // Команда (role=agent) и администратор видят номера в CRM и админке.
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Электронная почта',
      // Личная почта агента — персональные данные: клиентам сайта она не
      // показывается (публичных кнопок «Написать на почту» у агента нет).
      // Поле нужно только форме правки профиля в CRM и админке — команде
      // (role=agent) и администратору.
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
    },
    {
      name: 'telegram',
      type: 'text',
      label: 'Telegram',
      // Юзернейм/ссылка Telegram — тоже личный контакт агента. Публичной
      // кнопки Telegram у карточек агента нет, поэтому наружу не отдаём:
      // поле читает только команда (role=agent) и администратор.
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
      admin: {
        description: 'Ссылка или юзернейм: https://t.me/username или @username. Оставьте пустым, чтобы скрыть кнопку.',
      },
    },
    {
      name: 'whatsapp',
      type: 'text',
      label: 'WhatsApp',
      // Номер WhatsApp — тоже телефон: скрыт от посетителей и клиентов,
      // виден команде (role=agent) и администратору (см. поле phone)
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
      admin: {
        description: 'Номер или ссылка: https://wa.me/79281112233. Если пусто — возьмётся номер из «Телефон».',
      },
    },
    {
      name: 'atsNumber',
      type: 'text',
      label: 'Номер в АТС',
      // Личный номер агента клиентам не набирается: кнопка «Позвонить» в
      // карточке объекта уходит в АТС Н15, а она соединяет с ответственным
      // агентом. Здесь хранится номер, по которому это делает АТС: прямой
      // номер из кабинета МегаФон или короткий добавочный (см. src/lib/call-routing.ts).
      // Как и phone — только для команды: посетителям не показывается.
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
      admin: {
        description: 'Прямой номер из АТС (+7 867 2xx-xx-xx) или добавочный (101). Личный номер сюда не вписывать. Пусто — звонок идёт на общий номер агентства',
      },
    },
    {
      name: 'bio',
      type: 'richText',
      label: 'Биография',
    },
    {
      name: 'objectsSold',
      type: 'number',
      label: 'Сделок проведено',
    },
    {
      name: 'experience',
      type: 'number',
      label: 'Опыт (лет)',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: 'Активен',
      defaultValue: true,
    },
    {
      name: 'sortOrder',
      type: 'number',
      label: 'Порядок сортировки',
    },
    {
      name: 'user',
      type: 'relationship',
      label: 'Учётная запись агента',
      relationTo: 'users',
      // Связь карточки с аккаунтом — внутреннее сведение (даже сам id
      // пользователя): клиентам и посетителям не отдаём. В CRM связь для
      // выборки «своих» объектов читается с overrideAccess (object-access.ts).
      access: {
        read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
      },
      admin: {
        description: 'Связь с аккаунтом на сайте (role=agent) — для чатов с клиентами',
      },
    },
  ],
}

import type { CollectionConfig } from 'payload'
import { cleanCadastral } from '@/lib/cadastral'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from '@/lib/districts'
import { OBJECT_CATEGORIES } from '@/lib/object-categories'
import {
  OWNER_APPLICATION_SOURCES,
  OWNER_APPLICATION_STATUSES,
  OWNER_CONFIRM_METHODS,
} from '@/lib/owner-applications'
import { formatRuPhone } from '@/lib/phone'
import { SNT_AREAS } from '@/components/home/landing-data'

/**
 * «Заявки собственников» — владелец предлагает объект: продать или сдать.
 * Заявка приходит с формы на сайте (/sell), из звонка, мессенджера или
 * из офиса, и до проверки администратором в каталог не попадает никак:
 * объекта в базе ещё нет, а фотографии лежат в закрытом хранилище
 * owner-materials.
 *
 * Путь заявки — по статусам (см. OWNER_APPLICATION_STATUSES):
 * Новая → Телефон подтверждён → На проверке → Подтверждён собственник →
 * Одобрено → Опубликовано, отдельно — Отклонено и Дубль. Телефон
 * подтверждается кодом из SMS, а если отправка недоступна — вручную
 * администратором (способ виден в поле «Способ подтверждения»).
 *
 * Дубли ищутся автоматически по телефону, кадастровому номеру, адресу и
 * совпадению характеристик с фотографиями (см. findOwnerDuplicates в
 * src/lib/owner-applications.ts). Если объект уже есть в базе, второй
 * автоматически не создаётся: администратор видит найденное совпадение и
 * либо помечает заявку «Дубль», либо заводит объект вручную.
 *
 * Публично эти данные не показываются вообще: телефон, точный адрес и
 * служебные сведения заявки живут только в CRM. Коллекция закрыта целиком —
 * чтение и правка только у администратора, создание идёт серверными
 * маршрутами с overrideAccess (публичного REST-создания нет).
 */
export const OwnerApplications: CollectionConfig = {
  slug: 'owner-applications',
  labels: { singular: 'Заявка собственника', plural: 'Заявки собственников' },
  admin: {
    group: 'Заявки собственников',
    useAsTitle: 'ownerName',
    defaultColumns: ['ownerName', 'ownerPhone', 'status', 'source', 'receivedAt'],
    description:
      'Предложения объектов от собственников. До подтверждения телефона и проверки администратором объект в каталог не попадает',
  },
  access: {
    // Заявка — персональные данные собственника и служебный процесс приёмки:
    // доступ только у администратора, который её ведёт
    read: ({ req: { user } }) => user?.role === 'admin',
    // Создание — только серверными маршрутами (overrideAccess), REST закрыт
    create: () => false,
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      // Данные собственника приводим к тому же виду, что в объектах:
      // телефон — «+7 (918) 828-40-88», кадастровый номер — без пробелов.
      // Так поиск дублей по телефону и кадастру не зависит от того, как
      // владелец или оператор записали номер.
      ({ data, operation }) => {
        if (operation === 'create' && !data.receivedAt) {
          data.receivedAt = new Date().toISOString()
        }
        if (typeof data.ownerPhone === 'string' && data.ownerPhone.trim()) {
          data.ownerPhone = formatRuPhone(data.ownerPhone) || data.ownerPhone.trim()
        }
        if (typeof data.cadastralNumber === 'string') {
          data.cadastralNumber = cleanCadastral(data.cadastralNumber)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      label: 'Статус заявки',
      options: OWNER_APPLICATION_STATUSES.map((s) => ({ label: s.label, value: s.value })),
      defaultValue: 'new',
      required: true,
      index: true,
      admin: {
        description:
          'Путь заявки: Новая → Телефон подтверждён → На проверке → Подтверждён собственник → Одобрено → Опубликовано. Отдельно — Отклонено и Дубль',
      },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Источник заявки',
      options: OWNER_APPLICATION_SOURCES.map((s) => ({ label: s.label, value: s.value })),
      defaultValue: 'site',
      required: true,
      admin: { description: 'Откуда владелец к нам пришёл: форма на сайте, звонок, мессенджер и т. д.' },
    },
    {
      name: 'receivedAt',
      type: 'date',
      label: 'Дата поступления',
      required: true,
      admin: { readOnly: true, description: 'Заполняется автоматически при создании заявки' },
    },
    {
      name: 'ownerName',
      type: 'text',
      label: 'Имя собственника',
      required: true,
      admin: { description: 'Как к владельцу обращаться. Публично не показывается' },
    },
    {
      name: 'ownerPhone',
      type: 'text',
      label: 'Телефон собственника',
      required: true,
      index: true,
      admin: {
        description:
          'Подтверждается кодом из SMS либо вручную администратором. Публично не показывается',
      },
    },
    {
      name: 'cadastralNumber',
      type: 'text',
      label: 'Кадастровый номер',
      admin: { description: 'Например: 15:07:0030021:123. Используется в поиске дублей' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'Тип сделки',
      options: [
        { label: 'Продажа', value: 'sale' },
        { label: 'Аренда', value: 'rent' },
      ],
      defaultValue: 'sale',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      label: 'Категория',
      options: OBJECT_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
      required: true,
    },
    {
      name: 'price',
      type: 'number',
      label: 'Цена (₽)',
      min: 0,
      admin: { description: 'Ожидания владельца: цена, которую он просит' },
    },
    {
      name: 'area',
      type: 'number',
      label: 'Площадь (м²)',
      admin: { description: 'Всегда в м² (у участков 6 соток = 600 м², 1,2 га = 12000 м²)' },
    },
    {
      name: 'areaUnit',
      type: 'select',
      label: 'Единица площади',
      options: [
        { label: 'м²', value: 'sqm' },
        { label: 'сотки', value: 'are' },
        { label: 'гектары', value: 'ha' },
      ],
      defaultValue: 'sqm',
      admin: {
        condition: (_data, siblingData) => (siblingData as { category?: string } | undefined)?.category === 'land',
        description: 'В каких единицах владелец назвал площадь: на сайте показывается «6 соток», в базе хранится м²',
      },
    },
    {
      name: 'plotArea',
      type: 'number',
      label: 'Земельный участок (м²)',
      admin: {
        condition: (_data, siblingData) => {
          const c = (siblingData as { category?: string } | undefined)?.category
          return c === 'house' || c === 'townhouse' || c === 'commercial' || c === 'cottage' || c === 'dacha' || c === 'part_house'
        },
      },
    },
    {
      name: 'plotAreaUnit',
      type: 'select',
      label: 'Единица площади участка',
      options: [
        { label: 'м²', value: 'sqm' },
        { label: 'сотки', value: 'are' },
        { label: 'гектары', value: 'ha' },
      ],
      defaultValue: 'sqm',
      admin: {
        condition: (_data, siblingData) => {
          const c = (siblingData as { category?: string } | undefined)?.category
          return c === 'house' || c === 'townhouse' || c === 'commercial' || c === 'cottage' || c === 'dacha' || c === 'part_house'
        },
      },
    },
    {
      name: 'rooms',
      type: 'number',
      label: 'Комнат',
      min: 0,
    },
    {
      name: 'floor',
      type: 'number',
      label: 'Этаж',
    },
    {
      name: 'totalFloors',
      type: 'number',
      label: 'Этажей в доме',
      min: 0,
    },
    {
      // Адрес заявки — служебные сведения: точный дом виден только
      // администратору и нужен для проверки дублей. На публичной части
      // сайта этих полей нет вовсе
      name: 'address',
      type: 'group',
      label: 'Адрес объекта',
      fields: [
        { name: 'city', type: 'text', label: 'Город', defaultValue: 'Владикавказ' },
        {
          name: 'district',
          type: 'select',
          label: 'Район',
          options: DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
        },
        {
          name: 'cityDistrict',
          type: 'select',
          label: 'Район города',
          options: CITY_DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
          admin: { isClearable: true },
        },
        { name: 'locality', type: 'text', label: 'Населённый пункт' },
        {
          name: 'snt',
          type: 'select',
          label: 'Садоводческое товарищество',
          options: SNT_AREAS.map((s) => ({ label: s, value: s })),
          admin: { isClearable: true },
        },
        { name: 'street', type: 'text', label: 'Улица' },
        { name: 'house', type: 'text', label: 'Дом' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание от собственника',
      maxLength: 4000,
      admin: { description: 'Как владелец описал объект. Из этого описания собирается карточка объекта' },
    },
    {
      name: 'photos',
      type: 'upload',
      label: 'Фотографии',
      relationTo: 'owner-materials',
      hasMany: true,
      admin: { description: 'Снимки из закрытого хранилища заявок: на сайт попадут копиями после одобрения' },
    },
    {
      // Подтверждение телефона кодом. В базе лежит только хеш кода —
      // сам код уходит в SMS и в ответе маршрута не возвращается
      name: 'verifyCodeHash',
      type: 'text',
      label: 'Хеш кода подтверждения',
      admin: { hidden: true },
    },
    {
      name: 'verifyCodeSentAt',
      type: 'date',
      label: 'Код отправлен',
      admin: { readOnly: true, description: 'Время последней отправки кода: код живёт 15 минут' },
    },
    {
      name: 'verifyAttempts',
      type: 'number',
      label: 'Ошибок ввода кода',
      defaultValue: 0,
      admin: { readOnly: true, description: 'После пяти ошибок нужен новый код' },
    },
    {
      name: 'verifySendsToday',
      type: 'number',
      label: 'Кодов отправлено за день',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'verifySendsDay',
      type: 'text',
      label: 'День отправки кодов',
      admin: { hidden: true },
    },
    {
      name: 'phoneConfirmedAt',
      type: 'date',
      label: 'Телефон подтверждён',
      admin: { readOnly: true },
    },
    {
      name: 'phoneConfirmMethod',
      type: 'select',
      label: 'Способ подтверждения',
      options: OWNER_CONFIRM_METHODS.map((m) => ({ label: m.label, value: m.value })),
      admin: {
        readOnly: true,
        description: 'Код из SMS или ручная отметка администратора',
      },
    },
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Согласие на обработку данных',
      admin: { readOnly: true },
    },
    {
      name: 'consentAt',
      type: 'date',
      label: 'Дата согласия',
      admin: { readOnly: true },
    },
    {
      name: 'legalVersion',
      type: 'text',
      label: 'Редакция документов',
      admin: { hidden: true },
    },
    {
      // Объект, заведённый из заявки: связь ставит сервер при одобрении
      // (см. createObjectFromApplication). Пока связи нет, заявка в каталоге
      // не отражена никак
      name: 'object',
      type: 'relationship',
      relationTo: 'objects',
      label: 'Объект в базе',
      index: true,
      admin: { description: 'Карточка, созданная из заявки. До её появления заявка в каталог не попадает' },
    },
    {
      // Найденное совпадение: объект, который уже есть в базе и похож на
      // предложенный. Второй объект автоматически не создаётся — решение
      // за администратором (см. действие «Дубль»)
      name: 'matchedObject',
      type: 'relationship',
      relationTo: 'objects',
      label: 'Найденное совпадение',
      index: true,
      admin: { description: 'Проверьте: возможно, объект уже есть в базе и вторую карточку заводить не нужно' },
    },
    {
      name: 'internalComment',
      type: 'textarea',
      label: 'Внутренний комментарий',
      maxLength: 4000,
      admin: { description: 'Заметки администратора по заявке. Публично не показываются' },
    },
    {
      name: 'history',
      type: 'array',
      label: 'История заявки',
      admin: { readOnly: true, description: 'Кто и когда менял статус заявки' },
      fields: [
        { name: 'at', type: 'date', label: 'Когда', required: true },
        { name: 'action', type: 'text', label: 'Действие', required: true },
        { name: 'note', type: 'textarea', label: 'Примечание' },
        { name: 'by', type: 'relationship', relationTo: 'users', label: 'Кто' },
      ],
    },
    {
      name: 'ip',
      type: 'text',
      label: 'IP при подаче',
      admin: { readOnly: true, description: 'Служебное поле: адрес, с которого пришла заявка' },
    },
  ],
}

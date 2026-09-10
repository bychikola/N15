import type { CollectionConfig } from 'payload'

/**
 * «Парсер рынка» — объявления других площадок, которые агенты Н15 находят и
 * сохраняют для анализа (похожие объекты, дубли наших объектов, история цены).
 * Модуль отдельный и не публикует ничего наружу (см. src/lib/market-parser.ts):
 * записи создаются вручную по ссылке агента либо официальным каналом площадки
 * (API/фид по договору) — автосбор чужих страниц исключён.
 *
 * Автор объявления (собственник/агент) определяется по достоверным маркерам
 * и по умолчанию неизвестен. Ссылка сохраняется как есть; совпадения с
 * объектами Н15 считаются движком и кладутся в matchedObject/matchPct.
 */
export const MarketListings: CollectionConfig = {
  slug: 'market-listings',
  labels: { singular: 'Объявление рынка', plural: 'Объявления рынка' },
  admin: {
    useAsTitle: 'url',
    group: 'Агентство',
    defaultColumns: ['platform', 'url', 'price', 'status', 'lastSeenAt'],
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'url',
      type: 'text',
      label: 'Ссылка на объявление',
      required: true,
      admin: {
        description: 'Оригинальная ссылка площадки, как она есть',
      },
    },
    {
      name: 'platform',
      type: 'text',
      label: 'Площадка',
      admin: {
        description: 'Определяется по ссылке (avito, cian, domclick, yandex, vk, telegram…). Менять вручную не нужно',
      },
    },
    {
      name: 'title',
      type: 'text',
      label: 'Заголовок объявления',
      admin: {
        description: 'Как написано у автора: «Продаю 2-к. квартиру», «Агентство …». Необязательно, но помогает определить автора',
      },
    },
    {
      name: 'address',
      type: 'text',
      label: 'Адрес из объявления',
      admin: {
        description: 'Полный адрес, как указан у автора (город, улица, дом, квартира/участок)',
      },
    },
    {
      name: 'price',
      type: 'number',
      label: 'Цена, ₽',
      admin: {
        description: 'Текущая цена в объявлении',
      },
    },
    {
      name: 'priceInitial',
      type: 'number',
      label: 'Первоначальная цена, ₽',
      admin: {
        description: 'Цена при первом сохранении объявления (для истории изменения цены)',
      },
    },
    {
      name: 'area',
      type: 'number',
      label: 'Площадь, м²',
      admin: {
        description: 'Из объявления. Необязательно',
      },
    },
    {
      name: 'rooms',
      type: 'number',
      label: 'Комнат',
      min: 0,
      max: 20,
      admin: {
        description: 'Из объявления. Необязательно',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата публикации объявления',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description: 'Дата размещения, если видна на площадке',
      },
    },
    {
      name: 'authorKind',
      type: 'select',
      label: 'Автор',
      options: [
        { label: 'Собственник', value: 'owner' },
        { label: 'Агент', value: 'agent' },
        { label: 'Не видно', value: 'unknown' },
      ],
      defaultValue: 'unknown',
      admin: {
        description: 'Собственник или агент — только когда это достоверно видно в объявлении; иначе «Не видно»',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Объявление активно', value: 'active' },
        { label: 'Объявление снято', value: 'removed' },
        { label: 'Требует проверки', value: 'needsCheck' },
      ],
      defaultValue: 'active',
    },
    {
      name: 'photoUrls',
      type: 'array',
      label: 'Фотографии из объявления',
      labels: { singular: 'Фото', plural: 'Фотографии' },
      admin: {
        description: 'Прямые ссылки на фото объявления — только когда площадка официально отдаёт их (фид/API). Вручную обычно не заполняется',
      },
      fields: [{ name: 'url', type: 'text', label: 'Ссылка на фото' }],
    },
    {
      name: 'priceHistory',
      type: 'array',
      label: 'История изменения цены',
      admin: {
        description: 'Записи добавляются автоматически при каждом новом значении цены',
      },
      fields: [
        { name: 'at', type: 'date', label: 'Когда зафиксировано' },
        { name: 'price', type: 'number', label: 'Цена, ₽' },
      ],
    },
    {
      name: 'matchedObject',
      type: 'relationship',
      relationTo: 'objects',
      label: 'Похожий объект Н15',
      admin: {
        description: 'Лучшее совпадение с объектами Н15 (≥45%), вычисляется автоматически',
      },
    },
    {
      name: 'matchPct',
      type: 'number',
      label: 'Степень совпадения, %',
      admin: {
        description: '0–100; ≥45 — вероятный дубль объекта Н15, ≥75 — уверенный',
      },
    },
    {
      name: 'matchParams',
      type: 'array',
      label: 'Совпавшие признаки',
      admin: {
        description: 'Например: адрес, цена, площадь (см. справочник listing-check)',
      },
      fields: [{ name: 'param', type: 'text', label: 'Признак' }],
    },
    {
      name: 'matchedAt',
      type: 'date',
      label: 'Когда найдено совпадение',
    },
    {
      name: 'firstSeenAt',
      type: 'date',
      label: 'Впервые сохранено',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      label: 'Проверено',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка',
      admin: {
        description: 'Что решили по этому объявлению (звонили автору, взяли в работу, это наш дубль…)',
      },
    },
  ],
}
